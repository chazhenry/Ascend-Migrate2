from fastapi import APIRouter

from app.core.errors import APIError
from app.schemas.llm import LLMConfigResponse, LLMPromptRequest, LLMPromptResponse
from app.services.ai import call_text_prompt, get_configured_llm_providers, get_default_llm_provider


router = APIRouter(prefix="/LLM", tags=["llm"])


@router.get("", response_model=LLMConfigResponse)
async def get_llm_config() -> LLMConfigResponse:
    return LLMConfigResponse(
        default_provider=get_default_llm_provider(),
        available_providers=["deepseek", "openai"],
        configured_providers=get_configured_llm_providers(),
    )


@router.post("/prompt", response_model=LLMPromptResponse)
async def prompt_llm(payload: LLMPromptRequest) -> LLMPromptResponse:
    try:
        result = await call_text_prompt(payload.prompt, payload.provider)
    except RuntimeError as exc:
        raise APIError(str(exc), "llm_request_failed", 400) from exc

    return LLMPromptResponse(
        provider=result["provider"],
        model=result["model"],
        prompt=payload.prompt,
        response=result["response"],
    )