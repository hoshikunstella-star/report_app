# File: server/routers/payment.py
# Description: Stripe 決済エンドポイント

import os
import stripe
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from datetime import datetime, timezone, timedelta
from ..db import supabase

router = APIRouter()

STRIPE_SECRET_KEY = os.environ.get("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
STRIPE_PRICE_ID = os.environ.get("STRIPE_PRICE_ID", "")
PUBLIC_URL = os.environ.get("PUBLIC_URL", "").rstrip("/")


class CheckoutRequest(BaseModel):
    email: str


@router.post("/create-checkout-session")
async def create_checkout_session(req: CheckoutRequest):
    if not STRIPE_SECRET_KEY or not STRIPE_PRICE_ID:
        raise HTTPException(status_code=500, detail="Stripe設定が未完了です（STRIPE_SECRET_KEY / STRIPE_PRICE_ID）。")

    import traceback
    try:
        stripe.api_key = STRIPE_SECRET_KEY

        # ユーザー存在確認
        res = supabase.table("APP_USER").select("user_id").eq("user_maile_adress", req.email).execute()

        if not res.data:
            raise HTTPException(status_code=404, detail="このメールアドレスは登録されていません。先にアカウント登録してください。")

        user_id = str(res.data[0]["user_id"])

        base = PUBLIC_URL or "https://web-production-47d3e.up.railway.app"
        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[{"price": STRIPE_PRICE_ID, "quantity": 1}],
            mode="subscription",
            success_url=f"{base}/payment/success",
            cancel_url=f"{base}/payment/cancel",
            client_reference_id=user_id,
            customer_email=req.email,
        )
        return {"url": session.url}

    except HTTPException:
        raise
    except Exception as e:
        detail = f"{type(e).__name__}: {str(e)}\n{traceback.format_exc()}"
        raise HTTPException(status_code=500, detail=detail)


@router.get("/success")
async def payment_success():
    return HTMLResponse("""<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>支払い完了</title></head>
<body style="font-family:sans-serif;text-align:center;padding:80px;background:#f0f9f0;">
  <h1 style="color:#2a9d2a;">✅ 支払いが完了しました</h1>
  <p>アプリに戻ってログインしてください。<br>有料プランが有効になります。</p>
</body></html>""")


@router.get("/cancel")
async def payment_cancel():
    return HTMLResponse("""<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>キャンセル</title></head>
<body style="font-family:sans-serif;text-align:center;padding:80px;background:#fff8f0;">
  <h1>支払いがキャンセルされました</h1>
  <p>アプリに戻って再度お試しください。</p>
</body></html>""")


@router.post("/webhook")
async def stripe_webhook(request: Request):
    body = await request.body()
    sig_header = request.headers.get("stripe-signature")

    if not STRIPE_WEBHOOK_SECRET:
        raise HTTPException(status_code=500, detail="STRIPE_WEBHOOK_SECRET が未設定です。")

    stripe.api_key = STRIPE_SECRET_KEY

    try:
        event = stripe.Webhook.construct_event(body, sig_header, STRIPE_WEBHOOK_SECRET)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid payload")
    except stripe.error.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid signature")

    now_iso = datetime.now(timezone.utc).isoformat()
    expiration = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()

    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        user_id = session.get("client_reference_id")
        if user_id:
            supabase.table("APP_USER").update({
                "status": "active",
                "expiration_date": expiration,
                "update_date": now_iso,
            }).eq("user_id", user_id).execute()

    elif event["type"] in ("invoice.payment_succeeded", "invoice.paid"):
        # サブスク自動更新
        invoice = event["data"]["object"]
        customer_email = invoice.get("customer_email")
        if customer_email:
            supabase.table("APP_USER").update({
                "status": "active",
                "expiration_date": expiration,
                "update_date": now_iso,
            }).eq("user_maile_adress", customer_email).execute()

    elif event["type"] == "customer.subscription.deleted":
        # 解約
        subscription = event["data"]["object"]
        customer_id = subscription.get("customer")
        if customer_id:
            customer = stripe.Customer.retrieve(customer_id)
            email = customer.get("email")
            if email:
                supabase.table("APP_USER").update({
                    "status": "canceled",
                    "expiration_date": None,
                    "update_date": now_iso,
                }).eq("user_maile_adress", email).execute()

    return {"received": True}
