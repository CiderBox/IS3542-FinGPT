from __future__ import annotations

import logging
from pathlib import Path
import re
from typing import Tuple

import torch
from peft import PeftModel
from huggingface_hub import snapshot_download
from transformers import (
    AutoModel,
    AutoModelForCausalLM,
    AutoTokenizer,
    BitsAndBytesConfig,
    GenerationConfig,
)

from .config import Settings

logger = logging.getLogger(__name__)


def _resolve_model_location(settings: Settings) -> str:
    candidate_path = Path(settings.base_model_id)
    if candidate_path.exists():
        return str(candidate_path)

    download_target = settings.local_model_dir
    logger.info(
        "Local model not found at %s. Downloading %s to %s.",
        candidate_path,
        settings.base_model_id,
        download_target,
    )
    snapshot_download(
        repo_id=settings.base_model_id,
        local_dir=str(download_target),
        local_dir_use_symlinks=False,
        resume_download=True,
    )
    return str(download_target)


def _quantization_config(settings: Settings):
    if not settings.use_quantization or not torch.cuda.is_available():
        return None

    if settings.load_in_4bit:
        return BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_compute_dtype=torch.bfloat16,
            bnb_4bit_use_double_quant=True,
        )

    return BitsAndBytesConfig(
        load_in_8bit=True,
        llm_int8_threshold=6.0,
        llm_int8_has_fp16_weight=False,
    )


def load_llm(settings: Settings) -> Tuple[PeftModel, AutoTokenizer]:
    """Load base model + FinGPT LoRA adapter into memory once."""
    resolved_model = _resolve_model_location(settings)
    logger.info("Loading base model %s", resolved_model)
    tokenizer = AutoTokenizer.from_pretrained(
        resolved_model,
        use_fast=False,
        trust_remote_code=settings.trust_remote_code,
    )

    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    tokenizer.padding_side = "left"

    # Use the configured model id (not the resolved local path) to infer model family
    base_id_lower = settings.base_model_id.lower()
    is_chatglm = "chatglm" in base_id_lower
    has_built_in_quant = "int4" in base_id_lower or "int8" in base_id_lower

    quant_config = None if has_built_in_quant else _quantization_config(settings)
    torch_dtype = torch.bfloat16 if torch.cuda.is_available() else torch.float32
    device_map = "auto" if torch.cuda.is_available() else {"": "cpu"}

    model_loader = AutoModel if is_chatglm else AutoModelForCausalLM
    model_kwargs = {
        "torch_dtype": torch_dtype,
        "device_map": device_map,
        "trust_remote_code": settings.trust_remote_code,
    }
    if quant_config is not None:
        model_kwargs["quantization_config"] = quant_config

    try:
        base_model = model_loader.from_pretrained(resolved_model, **model_kwargs)
    except Exception as exc:  # pragma: no cover - defensive fallback
        logger.warning("Initial load failed (%s). Retrying on CPU fp32.", exc)
        base_model = model_loader.from_pretrained(
            resolved_model,
            torch_dtype=torch.float32,
            device_map={"": "cpu"},
            trust_remote_code=settings.trust_remote_code,
        )

    # Attach LoRA adapter if available; otherwise, fall back to base model
    if settings.lora_adapter_id:
        try:
    logger.info("Attaching LoRA adapter %s", settings.lora_adapter_id)
    peft_model = PeftModel.from_pretrained(base_model, settings.lora_adapter_id)
    peft_model.eval()
            model = peft_model
        except Exception as exc:
            logger.warning(
                "Failed to load LoRA adapter %s (%s). Falling back to base model only.",
                settings.lora_adapter_id,
                exc,
            )
            model = base_model
    else:
        logger.info("No LoRA adapter configured; using base model only.")
        model = base_model

    # Ensure generation config has a valid pad_token_id for decoder-only models (e.g. GPT2)
    if getattr(model.config, "pad_token_id", None) is None:
        if tokenizer.pad_token_id is not None:
            model.config.pad_token_id = tokenizer.pad_token_id
        elif tokenizer.eos_token_id is not None:
            model.config.pad_token_id = tokenizer.eos_token_id

    return model, tokenizer


def build_generation_config(settings: Settings) -> GenerationConfig:
    return GenerationConfig(
        max_new_tokens=settings.max_new_tokens,
        temperature=settings.temperature,
        top_p=settings.top_p,
        do_sample=True,
        repetition_penalty=1.05,
    )


def generate_text(
    model: PeftModel, tokenizer: AutoTokenizer, prompt: str, settings: Settings
) -> str:
    max_input_length = min(4096, getattr(tokenizer, "model_max_length", 4096))
    inputs = tokenizer(
        prompt,
        return_tensors="pt",
        truncation=True,
        padding=True,
        max_length=max_input_length,
    )
    device = next(model.parameters()).device
    inputs = {k: v.to(device) for k, v in inputs.items()}

    # For some chat models (including Qwen), the tokenizer may append an EOS
    # token at the end of the prompt. If we leave it there, the HF generate()
    # loop can treat the sequence as already finished and immediately return
    # the prompt without generating any new tokens. To avoid this, we strip a
    # single trailing EOS token (and its mask) if present.
    eos_id = tokenizer.eos_token_id
    if eos_id is not None and "input_ids" in inputs:
        input_ids = inputs["input_ids"]
        if input_ids.shape[1] > 0 and input_ids[0, -1].item() == eos_id:
            inputs["input_ids"] = input_ids[:, :-1]
            if "attention_mask" in inputs:
                inputs["attention_mask"] = inputs["attention_mask"][:, :-1]

    # Ensure we always ask for a reasonable amount of new tokens even if an
    # environment variable accidentally sets MAX_NEW_TOKENS too low.
    max_new_tokens = max(64, int(getattr(settings, "max_new_tokens", 256)))

    with torch.no_grad():
        outputs = model.generate(
            **inputs,
            max_new_tokens=max_new_tokens,
            temperature=settings.temperature,
            top_p=settings.top_p,
            do_sample=True,
            repetition_penalty=1.05,
            pad_token_id=getattr(model.config, "pad_token_id", tokenizer.eos_token_id),
        )

    text = tokenizer.decode(outputs[0], skip_special_tokens=True)

    # Try to remove the original prompt if model simply echoes it.
    # Only strip it when there is non-empty content after the prompt;
    # otherwise keep the raw text so we never end up returning an empty string.
    cleaned = text
    if prompt in text:
        candidate = text.split(prompt, maxsplit=1)[-1].strip()
        if candidate:
            cleaned = candidate

    cleaned = cleaned.strip()

    # If the model starts producing a long Chinese segment, truncate before it
    chinese_block = re.search(r"[\u4e00-\u9fff]{6,}", cleaned)
    if chinese_block:
        cleaned = cleaned[: chinese_block.start()].strip()

    return cleaned

