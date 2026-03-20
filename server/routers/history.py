# File: server/routers/history.py
# Description: 履歴 CRUD エンドポイント（FILE + FILE_HISTORY テーブル使用）

from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from ..db import supabase
from ..auth_utils import get_current_user

router = APIRouter()


class FileSaveRequest(BaseModel):
    file_name: str
    file_path: Optional[str] = None
    file_size: Optional[int] = None
    file_type: Optional[str] = None   # 'audio' | 'video'
    duration: Optional[float] = None
    transcript: Optional[str] = None
    summary: Optional[str] = None
    diarized: bool = False


class FileRenameRequest(BaseModel):
    file_name: str


@router.get("/")
async def list_history(user=Depends(get_current_user)):
    """ユーザーのファイル一覧と最新の文字起こし・要約を取得"""
    try:
        res = (
            supabase.table("FILE")
            .select('*, FILE_HISTORY(*)')
            .eq("user_id", str(user.id))
            .is_("deleted_at", "null")
            .order("created_at", desc=False)
            .execute()
        )
        return res.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/")
async def save_history(req: FileSaveRequest, user=Depends(get_current_user)):
    """ファイル情報と文字起こし結果を保存"""
    try:
        # FILE テーブルに挿入
        file_res = (
            supabase.table("FILE")
            .insert({
                "user_id": str(user.id),
                "file_name": req.file_name,
                "file_path": req.file_path,
                "file_size": req.file_size,
                "file_type": req.file_type,
                "duration": req.duration,
            })
            .execute()
        )
        file_id = file_res.data[0]["id"]

        # FILE_HISTORY テーブルに挿入（文字起こし・要約がある場合）
        history_data = None
        if req.transcript or req.summary:
            history_res = (
                supabase.table("FILE_HISTORY")
                .insert({
                    "file_id": file_id,
                    "user_id": str(user.id),
                    "transcript": req.transcript,
                    "summary": req.summary,
                    "diarized": req.diarized,
                })
                .execute()
            )
            history_data = history_res.data[0]

        return {"file": file_res.data[0], "history": history_data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{file_id}/transcript")
async def update_transcript(
    file_id: str,
    req: FileSaveRequest,
    user=Depends(get_current_user),
):
    """既存ファイルに文字起こし・要約を追記"""
    try:
        res = (
            supabase.table("FILE_HISTORY")
            .insert({
                "file_id": file_id,
                "user_id": str(user.id),
                "transcript": req.transcript,
                "summary": req.summary,
                "diarized": req.diarized,
            })
            .execute()
        )
        return res.data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{file_id}/rename")
async def rename_file(
    file_id: str,
    req: FileRenameRequest,
    user=Depends(get_current_user),
):
    """ファイル名の変更"""
    try:
        res = (
            supabase.table("FILE")
            .update({"file_name": req.file_name})
            .eq("id", file_id)
            .eq("user_id", str(user.id))
            .execute()
        )
        return res.data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{file_id}")
async def delete_file(file_id: str, user=Depends(get_current_user)):
    """ファイルの論理削除（deleted_at を設定）"""
    try:
        supabase.table("FILE").update(
            {"deleted_at": datetime.now(timezone.utc).isoformat()}
        ).eq("id", file_id).eq("user_id", str(user.id)).execute()
        return {"deleted": file_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
