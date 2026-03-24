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
    has_speakers = bool(re.search(r"^Speaker_[A-Z]:", req.text, re.MULTILINE))
    # ラベルを除いた本文から言語を判定
    content_only = re.sub(r"^Speaker_[A-Z]:\s*", "", req.text, flags=re.MULTILINE)
    has_japanese = bool(re.search(r"[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fff]", content_only))
    response_lang = "日本語" if has_japanese else "English"
    task_prompt = (
        "以下は話者ごとに分かれた会議の発言記録です。各話者の主要な発言・議論のポイントを整理し、会議全体を簡潔に要約してください。"
        if has_speakers else
        "以下は会議の文字起こしテキストです。主要な議題・決定事項・次のアクションを箇条書きで簡潔に要約してください。"
    )
    system_prompt = (
        "あなたは議事録の要約を担当するアシスタントです。" + task_prompt +
        f"【重要】必ず{response_lang}で回答してください。翻訳はしないでください。"
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
