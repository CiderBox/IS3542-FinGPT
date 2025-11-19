from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parents[1]


@dataclass
class Settings:
    """Centralized configuration for the FinGPT local prototype."""

    app_name: str = "FinGPT Pro Analyzer"
    # Default base model; can be overridden via BASE_MODEL_ID/REMOTE_MODEL_ID environment variables
    remote_model_id: str = os.getenv("REMOTE_MODEL_ID", "Qwen/Qwen1.5-1.8B-Chat")
    # LoRA is disabled by default; set LORA_ADAPTER_ID explicitly to enable it
    lora_adapter_id: str = os.getenv("LORA_ADAPTER_ID", "")
    trust_remote_code: bool = os.getenv("TRUST_REMOTE_CODE", "true").lower() == "true"
    embedding_model_id: str = os.getenv(
        "EMBEDDING_MODEL_ID", "sentence-transformers/all-MiniLM-L6-v2"
    )
    retrieval_k: int = int(os.getenv("RETRIEVAL_K", 4))
    max_new_tokens: int = int(os.getenv("MAX_NEW_TOKENS", 512))
    temperature: float = float(os.getenv("TEMPERATURE", 0.2))
    top_p: float = float(os.getenv("TOP_P", 0.9))
    use_quantization: bool = os.getenv("USE_QUANTIZATION", "true").lower() == "true"
    load_in_4bit: bool = os.getenv("LOAD_IN_4BIT", "true").lower() == "true"
    data_dir: Path = field(default_factory=lambda: BASE_DIR / "data")
    cache_dir: Path = field(default_factory=lambda: BASE_DIR / "data" / "cache")
    local_model_dir: Path = field(
        default_factory=lambda: BASE_DIR / "models" / "chatglm2-6b-int4"
    )
    base_model_id: str = field(init=False)
    news_file: Path = field(init=False)
    stocks_file: Path = field(init=False)
    reports_file: Path = field(init=False)

    def __post_init__(self) -> None:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.local_model_dir.parent.mkdir(parents=True, exist_ok=True)

        env_model_id = os.getenv("BASE_MODEL_ID")
        if env_model_id:
            self.base_model_id = env_model_id
        elif self.local_model_dir.exists():
            self.base_model_id = str(self.local_model_dir)
        else:
            self.base_model_id = self.remote_model_id

        self.news_file = self.data_dir / "news.csv"
        self.stocks_file = self.data_dir / "stocks.csv"
        self.reports_file = self.data_dir / "reports.json"


settings = Settings()

