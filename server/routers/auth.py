# File: server/routers/auth.py
# Description: 認証エンドポイント（カスタムusersテーブル）

import os
import traceback
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import bcrypt as _bcrypt
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
    try:
        res = supabase.table("APP_USER").select("*").eq("user_maile_adress", req.email).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB エラー: {str(e)}")

    rows = res.data or []
    if not rows:
        raise HTTPException(status_code=401, detail="メールアドレスまたはパスワードが正しくありません。")

    user = rows[0]

    if not user.get("valid_flag", False):
        raise HTTPException(status_code=403, detail="このアカウントは無効です。")

    if not _bcrypt.checkpw(req.password.encode(), user["user_pass"].encode()):
        raise HTTPException(status_code=401, detail="メールアドレスまたはパスワードが正しくありません。")

    status = user.get("status", "inactive")

    # 決済途中・解約・未課金 → 認証OK、無料プランとして返す
    if status in ("pending", "canceled", "inactive"):
        return {
            "access_token": None,
            "user_id": str(user["user_id"]),
            "email": user["user_maile_adress"],
            "expiration_date": None,
            "status": status,
        }

    # active の場合、有効期限確認
    exp_raw = user.get("expiration_date")
    if not exp_raw:
        raise HTTPException(status_code=403, detail="有料プランではありません。", headers={"X-User-Status": "inactive"})

    if isinstance(exp_raw, str):
        expiration = datetime.fromisoformat(exp_raw.replace("Z", "+00:00"))
    else:
        expiration = exp_raw

    now = datetime.now(timezone.utc)
    if expiration <= now:
        # 期限切れ → inactive に更新
        supabase.table("APP_USER").update({
            "status": "inactive",
            "update_date": now.isoformat(),
        }).eq("user_id", user["user_id"]).execute()
        raise HTTPException(status_code=403, detail="有料プランの有効期限が切れています。無料プランに切り替わりました。", headers={"X-User-Status": "inactive"})

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
        "status": status,
    }


@router.post("/register")
async def register(req: RegisterRequest):
    try:
        # メールアドレス重複チェック
        res = supabase.table("APP_USER").select("user_id, status").eq("user_maile_adress", req.email).execute()

        if res.data:
            existing_status = res.data[0].get("status", "inactive")
            if existing_status == "pending":
                raise HTTPException(status_code=409, detail="このメールアドレスは登録済みです（決済未完了）。ログイン画面から再決済してください。")
            raise HTTPException(status_code=409, detail="このメールアドレスは既に登録されています。")

        hashed = _bcrypt.hashpw(req.password.encode(), _bcrypt.gensalt()).decode()
        now_iso = datetime.now(timezone.utc).isoformat()

        supabase.table("APP_USER").insert({
            "user_name": req.name,
            "user_pass": hashed,
            "user_maile_adress": req.email,
            "status": "pending",
            "expiration_date": None,
            "valid_flag": True,
            "create_date": now_iso,
            "update_date": now_iso,
        }).execute()

        return {"message": "登録が完了しました。"}

    except HTTPException:
        raise
    except Exception as e:
        detail = f"{type(e).__name__}: {str(e)}\n{traceback.format_exc()}"
        raise HTTPException(status_code=500, detail=detail)
