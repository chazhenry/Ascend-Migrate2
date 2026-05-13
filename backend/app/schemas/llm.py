from typing import Literal

from pydantic import BaseModel, Field


LLMProvider = Literal["deepseek", "openai"]


class LLMConfigResponse(BaseModel):
    default_provider: LLMProvider
    available_providers: list[LLMProvider]
    configured_providers: dict[LLMProvider, bool]


class LLMPromptRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=4000)
    provider: LLMProvider | None = None
    system_prompt: str | None = Field(default=None, max_length=8000)


class LLMPromptResponse(BaseModel):
    provider: LLMProvider
    model: str
    prompt: str
    response: str