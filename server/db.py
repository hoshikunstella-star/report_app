# File: server/db.py
# Description: Supabase クライアント初期化

import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

_supabase_client: Client | None = None


def get_supabase() -> Client:
    global _supabase_client
    if _supabase_client is None:
        url = os.environ.get("SUPABASE_URL", "")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
        if not url or not key:
            raise RuntimeError("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定です")
        _supabase_client = create_client(url, key)
    return _supabase_client


# 後方互換用（既存コードが supabase を直接参照している箇所向け）
class _LazyClient:
    def __getattr__(self, name):
        return getattr(get_supabase(), name)


supabase: Client = _LazyClient()  # type: ignore
