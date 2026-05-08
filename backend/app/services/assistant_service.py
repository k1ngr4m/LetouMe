from __future__ import annotations

import uuid
from typing import Any

from backend.app.lotteries import normalize_lottery_code
from backend.app.repositories.assistant_repository import AssistantRepository
from backend.core.model_config import ModelDefinition, load_model_registry
from backend.core.model_factory import ModelFactory


LOTTERY_LABELS = {
    "dlt": "大乐透",
    "pl3": "排列3",
    "pl5": "排列5",
    "qxc": "七星彩",
}
MAX_CONTEXT_MESSAGES = 20


class AssistantService:
    def __init__(self, repository: AssistantRepository | None = None) -> None:
        self.repository = repository or AssistantRepository()

    def list_models(self, *, lottery_code: str = "dlt") -> dict[str, Any]:
        normalized_code = normalize_lottery_code(lottery_code)
        registry = load_model_registry()
        models = [
            self._serialize_model(model_def)
            for model_def in registry.select()
            if model_def.is_active and not model_def.is_deleted and model_def.supports_lottery(normalized_code)
        ]
        return {"models": models}

    def list_conversations(self, *, user_id: int, lottery_code: str | None = None, limit: int = 30, offset: int = 0) -> dict[str, Any]:
        normalized_code = normalize_lottery_code(lottery_code) if lottery_code else None
        return self.repository.list_conversations(
            user_id=user_id,
            lottery_code=normalized_code,
            limit=limit,
            offset=offset,
        )

    def get_conversation_detail(self, *, user_id: int, conversation_id: str) -> dict[str, Any]:
        conversation = self.repository.get_conversation(user_id=user_id, conversation_id=conversation_id)
        if not conversation:
            raise KeyError(conversation_id)
        messages = self.repository.list_messages(conversation_db_id=int(conversation["id"]))
        return {"conversation": conversation, "messages": messages}

    def delete_conversation(self, *, user_id: int, conversation_id: str) -> None:
        if not self.repository.delete_conversation(user_id=user_id, conversation_id=conversation_id):
            raise KeyError(conversation_id)

    def chat(
        self,
        *,
        user_id: int,
        message: str,
        model_code: str,
        context: dict[str, Any] | None = None,
        conversation_id: str | None = None,
    ) -> dict[str, Any]:
        normalized_message = str(message or "").strip()
        if not normalized_message:
            raise ValueError("问题不能为空")
        if len(normalized_message) > 4000:
            raise ValueError("问题不能超过 4000 字")

        normalized_context = self._normalize_context(context or {})
        model_def = self._get_model_definition(model_code=model_code, lottery_code=normalized_context.get("lottery_code") or "dlt")
        context_summary = self._build_context_summary(normalized_context)
        conversation = self._resolve_conversation(
            user_id=user_id,
            conversation_id=conversation_id,
            model_def=model_def,
            context=normalized_context,
            context_summary=context_summary,
            first_message=normalized_message,
        )
        history = self.repository.list_messages(conversation_db_id=int(conversation["id"]), limit=MAX_CONTEXT_MESSAGES)
        self.repository.add_message(
            {
                "conversation_db_id": int(conversation["id"]),
                "role": "user",
                "content": normalized_message,
                "model_code": model_def.id,
                "context": normalized_context,
            }
        )
        try:
            answer = self._ask_model(model_def, normalized_message, normalized_context, history)
            self.repository.add_message(
                {
                    "conversation_db_id": int(conversation["id"]),
                    "role": "assistant",
                    "content": answer,
                    "model_code": model_def.id,
                    "context": normalized_context,
                    "status": "success",
                }
            )
        except Exception as exc:
            self.repository.add_message(
                {
                    "conversation_db_id": int(conversation["id"]),
                    "role": "assistant",
                    "content": "本次回答失败，可重试。",
                    "model_code": model_def.id,
                    "context": normalized_context,
                    "status": "error",
                    "error_message": str(exc),
                }
            )
            raise

        detail = self.get_conversation_detail(user_id=user_id, conversation_id=str(conversation["conversation_id"]))
        return {
            "conversation_id": str(conversation["conversation_id"]),
            "answer": answer,
            "context_summary": context_summary,
            "model_code": model_def.id,
            "messages": detail["messages"],
        }

    def _resolve_conversation(
        self,
        *,
        user_id: int,
        conversation_id: str | None,
        model_def: ModelDefinition,
        context: dict[str, Any],
        context_summary: str,
        first_message: str,
    ) -> dict[str, Any]:
        if conversation_id:
            conversation = self.repository.get_conversation(user_id=user_id, conversation_id=conversation_id)
            if not conversation:
                raise KeyError(conversation_id)
            if str(conversation.get("model_code") or "") != model_def.id:
                raise ValueError("当前对话模型与所选模型不一致，请开启新对话")
            self.repository.touch_conversation(
                conversation_db_id=int(conversation["id"]),
                context_summary=context_summary,
                context=context,
            )
            conversation["context_summary"] = context_summary
            conversation["context"] = context
            return conversation

        generated_id = f"asst-{uuid.uuid4().hex[:16]}"
        return self.repository.create_conversation(
            {
                "conversation_id": generated_id,
                "user_id": user_id,
                "model_code": model_def.id,
                "lottery_code": context.get("lottery_code") or "dlt",
                "title": self._build_conversation_title(first_message),
                "context_summary": context_summary,
                "context": context,
            }
        )

    def _get_model_definition(self, *, model_code: str, lottery_code: str) -> ModelDefinition:
        normalized_model_code = str(model_code or "").strip()
        if not normalized_model_code:
            raise ValueError("请选择 AI 模型")
        normalized_code = normalize_lottery_code(lottery_code)
        registry = load_model_registry()
        try:
            model_def = registry.get(normalized_model_code)
        except KeyError as exc:
            raise ValueError("所选 AI 模型不存在") from exc
        if model_def.is_deleted or not model_def.is_active:
            raise ValueError("所选 AI 模型不可用，请重新选择")
        if not model_def.supports_lottery(normalized_code):
            raise ValueError("所选 AI 模型不支持当前彩种，请重新选择")
        return model_def

    @staticmethod
    def _normalize_context(context: dict[str, Any]) -> dict[str, Any]:
        raw_lottery_code = str(context.get("lottery_code") or "dlt").strip()
        lottery_code = normalize_lottery_code(raw_lottery_code)
        page_title = str(context.get("page_title") or "").strip()
        route_path = str(context.get("route_path") or "").strip()
        target_period = str(context.get("target_period") or "").strip()
        chips = [str(item).strip() for item in context.get("chips") or [] if str(item).strip()]
        return {
            "lottery_code": lottery_code,
            "lottery_label": LOTTERY_LABELS.get(lottery_code, lottery_code),
            "page_title": page_title,
            "route_path": route_path,
            "target_period": target_period,
            "chips": chips[:8],
        }

    @staticmethod
    def _build_context_summary(context: dict[str, Any]) -> str:
        parts = [
            str(context.get("lottery_label") or "").strip(),
            str(context.get("page_title") or "").strip(),
            str(context.get("target_period") or "").strip(),
        ]
        summary = " · ".join(part for part in parts if part)
        return summary or "当前页面暂无可引用数据"

    def _ask_model(
        self,
        model_def: ModelDefinition,
        message: str,
        context: dict[str, Any],
        history: list[dict[str, Any]],
    ) -> str:
        model = ModelFactory().create(model_def)
        messages: list[dict[str, str]] = [{"role": "system", "content": self._build_system_prompt(context)}]
        for item in history[-MAX_CONTEXT_MESSAGES:]:
            role = str(item.get("role") or "").strip()
            content = str(item.get("content") or "").strip()
            if role in {"user", "assistant"} and content and str(item.get("status") or "success") == "success":
                messages.append({"role": role, "content": content})
        messages.append({"role": "user", "content": message})
        response = model.client.chat.completions.create(
            model=model_def.api_model,
            messages=messages,
            **model.request_kwargs(),
        )
        answer = (response.choices[0].message.content or "").strip()
        if not answer:
            raise ValueError("AI 暂未返回内容，请稍后重试")
        if "仅供参考" not in answer:
            answer = f"{answer}\n\n仅供参考，彩票结果具有随机性，请理性决策。"
        return answer

    @staticmethod
    def _build_system_prompt(context: dict[str, Any]) -> str:
        context_summary = AssistantService._build_context_summary(context)
        route_path = str(context.get("route_path") or "").strip() or "未知页面"
        chips = "、".join(context.get("chips") or []) or "无"
        return (
            "你是 LetouMe 的页面上下文 AI 助手，帮助用户理解彩票预测、图表、投注记录和开奖回溯。"
            "回答要使用中文，简洁、可操作，可以使用 Markdown、表格和分点。"
            "你会参考本轮会话的历史消息保持上下文连续。"
            "不要承诺中奖，不要暗示可以精准预测开奖结果；涉及选号或投注时必须强调随机性和理性投入。"
            f"\n当前上下文：{context_summary}"
            f"\n当前路由：{route_path}"
            f"\n上下文标签：{chips}"
        )

    @staticmethod
    def _serialize_model(model_def: ModelDefinition) -> dict[str, Any]:
        return {
            "model_code": model_def.id,
            "display_name": model_def.name,
            "provider": model_def.provider,
            "api_format": model_def.api_format or "",
            "api_model_name": model_def.api_model,
            "version": model_def.version,
            "tags": list(model_def.tags or []),
            "lottery_codes": list(model_def.lottery_codes or ["dlt"]),
        }

    @staticmethod
    def _build_conversation_title(message: str) -> str:
        compact = " ".join(str(message or "").split())
        if not compact:
            return "新的对话"
        return compact[:24]


assistant_service = AssistantService()
