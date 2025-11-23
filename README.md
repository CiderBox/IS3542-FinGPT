## FinGPT Pro Analyzer (Local Prototype)

This repository contains a local prototype of a FinGPT-style financial assistant. It combines a quantized instruction-tuned language model with a RAG (Retrieval-Augmented Generation) layer so that the system can answer questions over local stock data, news, and company reports without relying on any cloud services at runtime.

### Features
- **Fully local**: The model, vector index, and data all run on the local machine. No external APIs are used once the model and dependencies are downloaded.
- **FinGPT-style model**: By default the backend loads an instruction model (e.g. `Qwen/Qwen1.5-1.8B-Chat`) and can optionally attach a LoRA adapter if configured via environment variables.
- **RAG data layer**: Sample data is provided in the `data/` folder (stocks CSV, news CSV, reports JSON). A FAISS index is built and cached under `data/cache/`.
- **FastAPI backend**: Exposes a single `POST /analyze` analysis endpoint and `GET /health` for health and document-count checks.
- **High-end frontend UI**: Pure HTML/CSS/JS + Bootstrap 5 with a glassmorphism-inspired layout, loading indicator, and structured display of retrieved context.

### Project Structure
```
backend/        # FastAPI app, RAG pipeline, and model loading code
frontend/       # index.html + style.css + script.js
data/           # sample data files and FAISS cache
requirements.txt
README.md
info.md         # assignment / project specification (do not remove)
```

### Environment Setup
1. **Python**
   - Use Python 3.10+.

2. **Create and activate virtual environment (PowerShell example)**
   ```bash
   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   ```

3. **Model configuration**
   - By default the backend will use the `remote_model_id` defined in `backend/config.py` (e.g. `Qwen/Qwen1.5-1.8B-Chat`).
   - You can override the model via environment variables:
     - `BASE_MODEL_ID` (takes highest priority)
     - `REMOTE_MODEL_ID`
   - LoRA adapters are disabled by default. To enable one, set:
     - `LORA_ADAPTER_ID="your/hf-repo-id"`

### Running the Backend
From the project root:

```bash
uvicorn backend.app:app --host 0.0.0.0 --port 8000
```

On first run the backend will:
- Download/load the base model (and LoRA adapter if `LORA_ADAPTER_ID` is set and accessible).
- Read the files under `data/` and build a FAISS index, caching it under `data/cache/`.

You can inspect the backend status at:

```text
GET http://127.0.0.1:8000/health
```

### Using the Frontend
1. Open `frontend/index.html` directly in a modern browser (Chrome/Edge recommended).
2. Enter a financial question, choose a task type (Summary / Sentiment / Prediction), and click **Run Analysis**.
3. The page will call `http://127.0.0.1:8000/analyze` and display:
   - The model’s answer.
   - A structured “Analysis Snapshot” panel.
   - The retrieved context sources, grouped by data type.

### Extending the Data
- Add new CSV/JSON files under `data/` while keeping the expected columns, or extend the parsing logic in `backend/rag_pipeline.py`.
- Whenever the data files change, the FAISS cache is automatically invalidated and rebuilt.
- (Optional, synthetic data) To quickly generate a richer synthetic dataset for demonstration, you can run:

  ```bash
  python scripts/seed_data.py
  ```

  This script will append additional synthetic stocks, news, and report entries under `data/`.

- (Optional, real market data) To fetch recent real-world data for a handful of large-cap names
  (e.g., AAPL, TSLA, MSFT, AMZN, 0700.HK, 0939.HK) using public Yahoo Finance endpoints:

  ```bash
  python scripts/fetch_market_data.py
  ```

  This will overwrite `data/stocks.csv`, `data/news.csv`, and `data/reports.json` with data
  fetched at runtime. You will need an active internet connection the first time you run it.

### Notes
- This repository is intended for coursework / research demonstrations only and does **not** constitute investment advice.