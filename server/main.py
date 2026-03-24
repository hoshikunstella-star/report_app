# File: server/main.py
# Description: FastAPI エントリポイント

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routers import auth, summarize, history, payment

app = FastAPI(
    title="議事録作成補助ツール API",
    description="音声文字起こし・AI要約・ユーザー管理 API",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["認証"])
app.include_router(summarize.router, prefix="/summarize", tags=["AI要約"])
app.include_router(history.router, prefix="/history", tags=["履歴"])
app.include_router(payment.router, prefix="/payment", tags=["決済"])


@app.get("/")
async def root():
    return {"status": "ok", "message": "議事録作成補助ツール API is running"}
