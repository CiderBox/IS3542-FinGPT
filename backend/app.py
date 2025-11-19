from __future__ import annotations

import asyncio
import logging
from typing import Dict, Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .config import settings
from .model_loader import generate_text, load_llm
from .rag_pipeline import RAGPipeline

logger = logging.getLogger(__name__)

app = FastAPI(title=settings.app_name, version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

model = None
tokenizer = None
rag_pipeline: RAGPipeline | None = None


TASK_TEMPLATES: Dict[str, str] = {
    "sentiment": (
        "You are FinGPT, a professional financial sentiment analyst. Using the retrieved context, "
        "classify the sentiment (positive, neutral, or negative) and provide a concise justification. "
        "Respond strictly in professional English only."
    ),
    "summary": (
        "You are FinGPT, an expert financial research assistant. Summarize the key insights "
        "from the retrieved documents, relate them to the user query, and highlight the most material points. "
        "Respond strictly in professional English only."
    ),
    "prediction": (
        "You are FinGPT, a market strategist. Identify trends or potential risks and opportunities "
        "using the retrieved data, and outline a reasoned forward-looking view. "
        "Respond strictly in professional English only."
    ),
}


class AnalyzeRequest(BaseModel):
    query: str = Field(..., min_length=10, max_length=2000)
    task: Literal["sentiment", "summary", "prediction"] = "summary"


class AnalyzeResponse(BaseModel):
    result: str
    sources: list[dict]


@app.on_event("startup")
async def startup_event():
    global model, tokenizer, rag_pipeline
    loop = asyncio.get_event_loop()
    model, tokenizer = await loop.run_in_executor(None, load_llm, settings)
    rag_pipeline = RAGPipeline(settings)
    logger.info(
        "FinGPT backend ready with %d indexed documents.", rag_pipeline.document_count
    )


@app.get("/health")
async def health_check():
    ready = model is not None and rag_pipeline is not None
    status = "ok" if ready else "initializing"
    documents = rag_pipeline.document_count if rag_pipeline else 0
    return {
        "status": status,
        "model": settings.lora_adapter_id,
        "documents_indexed": documents,
    }


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze(request: AnalyzeRequest):
    if model is None or tokenizer is None or rag_pipeline is None:
        raise HTTPException(status_code=503, detail="Model is still loading.")

    template = TASK_TEMPLATES.get(request.task)
    if not template:
        raise HTTPException(status_code=400, detail="Unsupported task.")

    retrieved = rag_pipeline.retrieve(request.query, settings.retrieval_k)
    if not retrieved:
        raise HTTPException(status_code=404, detail="No knowledge found for query.")

    context_blocks = []
    for item in retrieved:
        block = f"[{item.get('source', 'data')} - {item.get('id')}] {item.get('snippet')}"
        context_blocks.append(block)
    context = "\n\n".join(context_blocks)

    prompt = (
        f"{template}\n\nContext:\n{context}\n\nUser Query: {request.query}\n"
        "Deliver a concise, well-structured response in English only, using a professional financial tone. "
        "Do not include any non-English text."
    )

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None, generate_text, model, tokenizer, prompt, settings
    )

    return AnalyzeResponse(result=result, sources=retrieved)

