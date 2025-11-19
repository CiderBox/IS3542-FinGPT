# Switch to project root directory
Set-Location -Path $PSScriptRoot

# Optional: activate virtual environment if it exists
if (Test-Path ".\.venv\Scripts\Activate.ps1") {
    . .\.venv\Scripts\Activate.ps1
}

# Optional: override base model / LoRA via environment variables if needed
# $env:BASE_MODEL_ID = "Qwen/Qwen1.5-1.8B-Chat"
# $env:LORA_ADAPTER_ID = "your/lora-repo-id"

# Start FastAPI backend
uvicorn backend.app:app --host 0.0.0.0 --port 8000