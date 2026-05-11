import asyncio
import json
import logging
from pathlib import Path
from typing import Any
from urllib import error, request

from anthropic import AsyncAnthropic

from app.core.config import get_settings


logger = logging.getLogger(__name__)
settings = get_settings()
SUPPORTED_LLM_PROVIDERS = ("deepseek", "openai")


def get_default_llm_provider() -> str:
    return settings.default_llm_provider if settings.default_llm_provider in SUPPORTED_LLM_PROVIDERS else "deepseek"


def get_configured_llm_providers() -> dict[str, bool]:
    return {
        "deepseek": bool(settings.deepseek_api_key.strip()),
        "openai": bool(settings.openai_api_key.strip()),
    }


def _get_llm_provider_config(provider: str | None) -> dict[str, str]:
    provider_name = (provider or get_default_llm_provider()).lower()
    provider_configs = {
        "deepseek": {
            "provider": "deepseek",
            "api_key": settings.deepseek_api_key.strip(),
            "model": "deepseek-chat",
            "url": "https://api.deepseek.com/chat/completions",
        },
        "openai": {
            "provider": "openai",
            "api_key": settings.openai_api_key.strip(),
            "model": "gpt-4.1-mini",
            "url": "https://api.openai.com/v1/chat/completions",
        },
    }

    config = provider_configs.get(provider_name)
    if config is None:
        raise RuntimeError(f"Unsupported LLM provider: {provider_name}")
    if not config["api_key"]:
        raise RuntimeError(f"{provider_name.title()} API key is not configured")
    return config


def _extract_prompt_response(payload: dict[str, Any]) -> str:
    choices = payload.get("choices")
    if not isinstance(choices, list) or not choices:
        raise RuntimeError("LLM response did not include any choices")

    message = choices[0].get("message", {}) if isinstance(choices[0], dict) else {}
    content = message.get("content")
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        text_parts = [item.get("text", "") for item in content if isinstance(item, dict)]
        response_text = "".join(text_parts).strip()
        if response_text:
            return response_text
    raise RuntimeError("LLM response did not include text content")


def _post_llm_request(url: str, api_key: str, payload: dict[str, Any]) -> dict[str, Any]:
    http_request = request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with request.urlopen(http_request, timeout=60) as response:
            return json.loads(response.read().decode("utf-8"))
    except error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        logger.exception("LLM request failed with status %s", exc.code)
        raise RuntimeError(f"LLM request failed: {body}") from exc
    except error.URLError as exc:
        logger.exception("LLM request could not reach provider")
        raise RuntimeError(f"LLM request failed: {exc.reason}") from exc


async def call_text_prompt(prompt: str, provider: str | None = None) -> dict[str, str]:
    provider_config = _get_llm_provider_config(provider)
    payload = {
        "model": provider_config["model"],
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.2,
    }
    response_payload = await asyncio.to_thread(
        _post_llm_request,
        provider_config["url"],
        provider_config["api_key"],
        payload,
    )
    return {
        "provider": provider_config["provider"],
        "model": provider_config["model"],
        "response": _extract_prompt_response(response_payload),
    }


def load_prompt(filename: str) -> str:
    return (settings.prompt_dir / filename).read_text(encoding="utf-8")


async def call_json_prompt(prompt_name: str, user_payload: Any, max_tokens: int = 8000) -> Any:
    prompt = load_prompt(prompt_name)
    if not settings.anthropic_api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is not configured")

    client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    try:
        response = await client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=max_tokens,
            system=prompt,
            messages=[{"role": "user", "content": json.dumps(user_payload)}],
        )
        text_parts = [block.text for block in response.content if getattr(block, "type", None) == "text"]
        return json.loads("".join(text_parts))
    except Exception as exc:
        logger.exception("Anthropic request failed for %s", prompt_name)
        raise RuntimeError(f"Anthropic request failed: {exc}") from exc


def load_static_json(filename: str) -> Any:
    path = Path(settings.static_dir / filename)
    return json.loads(path.read_text(encoding="utf-8"))
