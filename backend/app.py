from __future__ import annotations

import asyncio
import logging
from functools import lru_cache
from typing import Dict, Literal, Optional

import pandas as pd
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


class AnalyzeRequest(BaseModel):
    query: str = Field(..., min_length=2, max_length=2000)
    # Task is now optional and largely ignored in favor of the dynamic prompt, 
    # but kept for backward compatibility if needed.
    task: Optional[str] = "general"
    # New field to capture user investment profile
    user_profile: Optional[str] = ""


class AnalyzeResponse(BaseModel):
    result: str
    sources: list[dict]


@lru_cache(maxsize=1)
def _market_overview() -> list[dict]:
    """Compute a simple market overview from the local stocks.csv file."""
    if not settings.stocks_file.exists():
        return []
        
    df = pd.read_csv(settings.stocks_file)
    if df.empty:
        return []

    rows: list[dict] = []
    for symbol, group in df.groupby("symbol"):
        group = group.sort_values("date")
        last = group.iloc[-1]
        prev = group.iloc[-2] if len(group) > 1 else None

        last_close = float(last["close"])
        prev_close = float(prev["close"]) if prev is not None else None
        pct_change = (
            (last_close - prev_close) / prev_close * 100 if prev_close else None
        )

        rows.append(
            {
                "symbol": symbol,
                "date": str(last["date"]),
                "last_close": last_close,
                "prev_close": prev_close,
                "pct_change": pct_change,
            }
        )
    return rows


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


@app.get("/market_overview")
async def market_overview():
    """Return a lightweight market snapshot derived from local stocks.csv."""
    try:
        symbols = _market_overview()
    except Exception as exc:
        # Graceful degradation if file is missing or bad
        return {"symbols": []}

    return {"symbols": symbols}


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze(request: AnalyzeRequest):
    if model is None or tokenizer is None or rag_pipeline is None:
        raise HTTPException(status_code=503, detail="Model is still loading.")

    # Retrieve context
    retrieved = rag_pipeline.retrieve(request.query, settings.retrieval_k)
    
    context_blocks = []
    if retrieved:
        for item in retrieved:
            block = f"[{item.get('source', 'data')} - {item.get('id')}] {item.get('snippet')}"
            context_blocks.append(block)
    else:
        # Even if no context is found, we still let the model try to answer 
        # based on its internal knowledge or state it doesn't know.
        context_blocks.append("No specific internal documents found.")
        
    context = "\n\n".join(context_blocks)

    # Construct a compact prompt to reduce the chance of the model simply echoing
    # the instructions instead of generating a fresh answer.
    system_role = (
        "You are FinGPT, a professional financial analyst. "
        "Always answer in concise, formal English."
    )

    profile_line = ""
    if request.user_profile:
        profile_line = f"User profile (goal / risk / horizon): {request.user_profile}."

    prompt = (
        f"{system_role}\n"
        f"{profile_line}\n\n"
        f"Context from local database:\n{context}\n\n"
        f"Question: {request.query}\n\n"
        "Provide a short, well-structured answer that directly addresses the question "
        "and, when useful, refers back to the context facts above.\n\n"
        "Answer:"
    )

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None, generate_text, model, tokenizer, prompt, settings
    )

    return AnalyzeResponse(result=result, sources=retrieved)
