# File: server/routers/auth.py
# Description: 認証エンドポイント（カスタムusersテーブル）

import os
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from passlib.hash import bcrypt
import jwt
from ..db import supabase

router = APIRouter()

JWT_SECRET = os.environ.get("JWT_SECRET", "change-me-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_DAYS = 30


class LoginRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str


@router.post("/login")
async def login(req: LoginRequest):
    # usersテーブルからメールアドレスで検索
    try:
        res = supabase.table("USER").select("*").eq("user_maile_adress", req.email).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB エラー: {str(e)}")

    rows = res.data or []
    if not rows:
        raise HTTPException(status_code=401, detail="メールアドレスまたはパスワードが正しくありません。")

    user = rows[0]

    if not user.get("valid_flag", False):
        raise HTTPException(status_code=403, detail="このアカウントは無効です。")

    if not bcrypt.verify(req.password, user["user_pass"]):
        raise HTTPException(status_code=401, detail="メールアドレスまたはパスワードが正しくありません。")

    # 有料プラン確認
    exp_raw = user.get("expiration_date")
    if not exp_raw:
        raise HTTPException(status_code=403, detail="有料プランではありません。")

    # タイムゾーン付きで比較
    if isinstance(exp_raw, str):
        expiration = datetime.fromisoformat(exp_raw.replace("Z", "+00:00"))
    else:
        expiration = exp_raw

    now = datetime.now(timezone.utc)
    if expiration <= now:
        raise HTTPException(status_code=403, detail="有料プランの有効期限が切れています。")

    # JWT 生成（30日有効）
    token_exp = now + timedelta(days=JWT_EXPIRE_DAYS)
    payload = {
        "sub": str(user["user_id"]),
        "email": user["user_maile_adress"],
        "exp": token_exp,
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

    return {
        "access_token": token,
        "user_id": str(user["user_id"]),
        "email": user["user_maile_adress"],
        "expiration_date": expiration.isoformat(),
    }


@router.post("/register")
async def register(req: RegisterRequest):
    # メールアドレス重複チェック
    try:
        res = supabase.table("USER").select("user_id").eq("user_maile_adress", req.email).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB エラー: {str(e)}")

    if res.data:
        raise HTTPException(status_code=409, detail="このメールアドレスは既に登録されています。")

    hashed = bcrypt.hash(req.password)
    now_iso = datetime.now(timezone.utc).isoformat()

    try:
        supabase.table("USER").insert({
            "user_name": req.name,
            "user_pass": hashed,
            "user_maile_adress": req.email,
            "expiration_date": None,
            "valid_flag": True,
            "create_date": now_iso,
            "update_date": now_iso,
        }).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"登録に失敗しました: {str(e)}")

    return {"message": "登録が完了しました。"}
