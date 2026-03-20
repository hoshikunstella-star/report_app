# File: server/routers/auth.py
# Description: 認証エンドポイント（Supabase Auth）

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from ..db import supabase

router = APIRouter()


class AuthRequest(BaseModel):
    email: str
    password: str


@router.post("/login")
async def login(req: AuthRequest):
    try:
        res = supabase.auth.sign_in_with_password(
            {"email": req.email, "password": req.password}
        )
        return {
            "access_token": res.session.access_token,
            "user_id": str(res.user.id),
            "email": res.user.email,
        }
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"ログイン失敗: {str(e)}")


@router.post("/signup")
async def signup(req: AuthRequest):
    try:
        supabase.auth.sign_up({"email": req.email, "password": req.password})
        return {"message": "登録完了。メールを確認してアカウントを有効化してください。"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"登録失敗: {str(e)}")
