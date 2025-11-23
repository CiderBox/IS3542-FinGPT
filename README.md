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

#### Windows (PowerShell)
1. **Create and activate virtual environment:**
   ```powershell
   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   ```
2. **Install dependencies:**
   ```powershell
   pip install -r requirements.txt
   ```
3. **Start Backend:**
   ```powershell
   .\start-backend.ps1
   ```

#### Mac / Linux (Bash)
1. **Run the auto-setup script:**
   ```bash
   chmod +x start-backend.sh
   ./start-backend.sh
   ```
   
   *Note for Mac Users (Apple Silicon):*
   - The script automatically detects `mps` (Metal Performance Shaders) support.
   - It will disable 4-bit/8-bit quantization (which relies on CUDA-only libraries) and run the model in `float16` mode for optimal performance on M1/M2/M3 chips.
   - Ensure you have Xcode command line tools installed.

### Model Configuration
- By default the backend will use the `remote_model_id` defined in `backend/config.py` (e.g. `Qwen/Qwen1.5-1.8B-Chat`).
- You can override the model via environment variables in the startup scripts:
  - `BASE_MODEL_ID` (takes highest priority)
  - `LORA_ADAPTER_ID="your/hf-repo-id"` (optional, disabled by default)

### Using the Frontend
1. Open `frontend/index.html` directly in a modern browser (Chrome/Edge/Safari recommended).
2. **Login Bypass**: For testing, click the small "Skip Login (Dev)" button at the bottom right of the login screen.
3. **Features to try**:
   - **AI Analysis**: Ask questions like "Analyze AAPL's latest earnings".
   - **Trading Sim**: View real-time simulated market data and place orders.
   - **Community Hub**: Use the "AI Enhance" button to auto-generate post content.
   - **Knowledge Base**: Click "Ask AI ✨" on any article to instantly query that topic.

### Extending the Data
- Add new CSV/JSON files under `data/` while keeping the expected columns, or extend the parsing logic in `backend/rag_pipeline.py`.
- Whenever the data files change, the FAISS cache is automatically invalidated and rebuilt.
- (Optional, synthetic data) To quickly generate a richer synthetic dataset for demonstration, you can run:

  ```bash
  python scripts/seed_data.py
  ```

- (Optional, real market data) To fetch recent real-world data for a handful of large-cap names
  (e.g., AAPL, TSLA, MSFT, AMZN, 0700.HK, 0939.HK) using public Yahoo Finance endpoints:

  ```bash
  python scripts/fetch_market_data.py
  ```

### Notes
- This repository is intended for coursework / research demonstrations only and does **not** constitute investment advice.
