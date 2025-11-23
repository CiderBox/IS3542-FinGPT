#!/bin/bash

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== FinGPT Backend Launcher (Mac/Linux) ===${NC}"

# 1. Check for virtual environment
if [ ! -d ".venv" ]; then
    echo -e "${YELLOW}Virtual environment not found. Creating one...${NC}"
    python3 -m venv .venv
fi

# 2. Activate venv
source .venv/bin/activate

# 3. Install dependencies if needed
if [ ! -f ".installed" ]; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    pip install --upgrade pip
    # Install torch first (Mac users might need specific instructions, but default usually works for CPU/MPS)
    pip install -r requirements.txt
    touch .installed
fi

# 4. Configure Environment
# Default to Qwen 1.5 1.8B Chat - efficient and powerful
export BASE_MODEL_ID="Qwen/Qwen1.5-1.8B-Chat"
# Disable LoRA by default for simpler setup
export LORA_ADAPTER_ID=""
# Enable 4-bit quantization (Linux/Windows CUDA only). 
# On Mac, bitsandbytes is not supported, code will auto-fallback to float16/float32.
export USE_QUANTIZATION="true"
export LOAD_IN_4BIT="true"

echo -e "${GREEN}Starting Uvicorn Server...${NC}"
echo -e "Model: ${BASE_MODEL_ID}"
echo -e "Access: http://localhost:8000"

# 5. Run Server
python -m uvicorn backend.app:app --host 0.0.0.0 --port 8000 --reload

