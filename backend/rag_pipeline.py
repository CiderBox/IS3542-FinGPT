from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List

import faiss
import numpy as np
import pandas as pd
from sentence_transformers import SentenceTransformer

from .config import Settings

logger = logging.getLogger(__name__)


@dataclass
class Document:
    doc_id: str
    source: str
    text: str
    metadata: Dict[str, str] = field(default_factory=dict)

    def payload(self) -> Dict[str, str]:
        payload = {"id": self.doc_id, "source": self.source, "snippet": self.text}
        payload.update(self.metadata)
        return payload


class RAGPipeline:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.embedder = SentenceTransformer(settings.embedding_model_id)
        self.documents: List[Document] = self._load_documents()
        if not self.documents:
            raise RuntimeError("No documents found for RAG pipeline.")

        self.cache_dir = settings.cache_dir
        self.index_path = self.cache_dir / "rag.index"
        self.meta_path = self.cache_dir / "rag_metadata.json"
        self._fingerprint = self._compute_fingerprint()

        self.metadata: List[Dict[str, str]] = [doc.payload() for doc in self.documents]
        self.index = self._load_or_build_index()

    @property
    def document_count(self) -> int:
        return len(self.documents)

    def retrieve(self, query: str, top_k: int | None = None) -> List[Dict[str, str]]:
        top_k = top_k or self.settings.retrieval_k
        query_vec = self.embedder.encode(
            [query], normalize_embeddings=True, convert_to_numpy=True
        ).astype("float32")
        k = max(1, min(top_k, self.index.ntotal))
        scores, indices = self.index.search(query_vec, k)
        raw_results: List[Dict[str, str]] = []
        for idx, score in zip(indices[0], scores[0]):
            if idx == -1:
                continue
            payload = self.metadata[idx].copy()
            payload["score"] = float(score)
            raw_results.append(payload)

        if not raw_results:
            return raw_results

        # Filter out clearly irrelevant documents by a relative score threshold
        max_score = max(item["score"] for item in raw_results)
        if max_score <= 0:
            return raw_results

        threshold = max_score * 0.6
        filtered = [item for item in raw_results if item["score"] >= threshold]
        return filtered or raw_results

    # Internal helpers -----------------------------------------------------
    def _compute_fingerprint(self) -> str:
        parts = []
        for file_path in (
            self.settings.news_file,
            self.settings.stocks_file,
            self.settings.reports_file,
        ):
            if file_path.exists():
                stat = file_path.stat()
                parts.append(f"{file_path.name}:{stat.st_mtime_ns}:{stat.st_size}")
        return "|".join(parts)

    def _load_or_build_index(self):
        if (
            self.index_path.exists()
            and self.meta_path.exists()
            and self._is_cache_valid()
        ):
            logger.info("Loading FAISS index from cache.")
            index = faiss.read_index(str(self.index_path))
            with self.meta_path.open("r", encoding="utf-8") as meta_file:
                meta_content = json.load(meta_file)
                self.metadata = meta_content["metadata"]
            return index

        logger.info("Building new FAISS index for %d documents.", len(self.documents))
        texts = [doc.text for doc in self.documents]
        embeddings = self.embedder.encode(
            texts,
            batch_size=16,
            show_progress_bar=False,
            convert_to_numpy=True,
            normalize_embeddings=True,
        ).astype("float32")
        index = faiss.IndexFlatIP(embeddings.shape[1])
        index.add(embeddings)
        faiss.write_index(index, str(self.index_path))
        with self.meta_path.open("w", encoding="utf-8") as meta_file:
            json.dump(
                {"fingerprint": self._fingerprint, "metadata": self.metadata},
                meta_file,
                ensure_ascii=False,
                indent=2,
            )
        return index

    def _is_cache_valid(self) -> bool:
        try:
            with self.meta_path.open("r", encoding="utf-8") as meta_file:
                meta_content = json.load(meta_file)
            return meta_content.get("fingerprint") == self._fingerprint
        except (json.JSONDecodeError, FileNotFoundError):
            return False

    def _load_documents(self) -> List[Document]:
        documents: List[Document] = []
        documents.extend(self._load_news_documents())
        documents.extend(self._load_stock_documents())
        documents.extend(self._load_report_documents())
        return documents

    def _load_news_documents(self) -> List[Document]:
        if not self.settings.news_file.exists():
            logger.warning("News file %s not found.", self.settings.news_file)
            return []
        df = pd.read_csv(self.settings.news_file)
        documents = []
        for idx, row in df.iterrows():
            text = (
                f"News ({row.get('date', 'N/A')}): {row.get('headline', '')}. "
                f"Body: {row.get('body', '')}. Reported sentiment: {row.get('sentiment', 'neutral')}."
            )
            documents.append(
                Document(
                    doc_id=f"news-{idx}",
                    source="news",
                    text=text,
                    metadata={
                        "headline": row.get("headline", ""),
                        "date": str(row.get("date", "")),
                        "sentiment": row.get("sentiment", "neutral"),
                    },
                )
            )
        return documents

    def _load_stock_documents(self) -> List[Document]:
        if not self.settings.stocks_file.exists():
            logger.warning("Stock file %s not found.", self.settings.stocks_file)
            return []
        df = pd.read_csv(self.settings.stocks_file)
        documents = []
        grouped = df.groupby("symbol")
        for symbol, subset in grouped:
            latest_rows = subset.tail(5)
            summary_rows = []
            for _, row in latest_rows.iterrows():
                summary_rows.append(
                    f"{row['date']}: open {row['open']}, high {row['high']}, low {row['low']}, close {row['close']}, volume {row['volume']}"
                )
            text = (
                f"Stock performance for {symbol}. Recent candles:\n"
                + "\n".join(summary_rows)
            )
            documents.append(
                Document(
                    doc_id=f"stock-{symbol}",
                    source="stocks",
                    text=text,
                    metadata={
                        "symbol": symbol,
                        "entries": latest_rows.shape[0],
                    },
                )
            )
        return documents

    def _load_report_documents(self) -> List[Document]:
        if not self.settings.reports_file.exists():
            logger.warning("Report file %s not found.", self.settings.reports_file)
            return []

        with self.settings.reports_file.open("r", encoding="utf-8") as report_file:
            reports = json.load(report_file)

        documents = []
        for idx, report in enumerate(reports):
            text = (
                f"Company: {report.get('company')}, Period: {report.get('period')}.\n"
                f"Revenue: {report.get('revenue')}, Net Income: {report.get('net_income')}.\n"
                f"Highlights: {report.get('highlights')}."
            )
            documents.append(
                Document(
                    doc_id=f"report-{idx}",
                    source="reports",
                    text=text,
                    metadata={
                        "company": report.get("company", ""),
                        "period": report.get("period", ""),
                    },
                )
            )
        return documents

