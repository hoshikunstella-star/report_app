# File: server/routers/summarize.py
# Description: AI 要約エンドポイント（Claude API）

import os
import anthropic
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from ..auth_utils import get_current_user

router = APIRouter()


class SummarizeRequest(BaseModel):
    text: str


@router.post("/")
async def summarize_text(req: SummarizeRequest, user=Depends(get_current_user)):
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY が設定されていません。")

    client = anthropic.Anthropic(api_key=api_key)

    import re
    has_speakers = bool(re.search(r"^発言者[A-Z]:", req.text, re.MULTILINE))
    task_prompt = (
        "以下は話者ごとに分かれた会議の発言記録です。各話者の主要な発言・議論のポイントを整理し、会議全体を簡潔に要約してください。"
        if has_speakers else
        "以下は会議の文字起こしテキストです。主要な議題・決定事項・次のアクションを箇条書きで簡潔に要約してください。"
    )
    system_prompt = (
        "あなたは議事録の要約を担当するアシスタントです。" + task_prompt +
        "【重要】回答は必ず文字起こしテキストと同じ言語で行ってください。翻訳はしないでください。"
    )

    try:
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1024,
            system=system_prompt,
            messages=[{"role": "user", "content": req.text}],
        )
        return {"summary": response.content[0].text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"要約失敗: {str(e)}")
