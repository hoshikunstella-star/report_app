#!/bin/bash
# Mac 用セットアップスクリプト

set -e

echo ""
echo "============================================================"
echo "  議事録作成補助ツール セットアップ (Mac)"
echo "============================================================"
echo ""

# ── 1. Python 3.12 チェック ───────────────────────────────────
echo "[1/5] Python 3.12 の確認..."
if command -v python3.12 &>/dev/null; then
    echo "  [OK] $(python3.12 --version) が見つかりました。"
elif command -v python3 &>/dev/null; then
    PY_VER=$(python3 --version 2>&1 | awk '{print $2}')
    echo "  [情報] python3 ($PY_VER) を使用します。"
    PYTHON=python3
else
    echo "  Python 3 が見つかりません。Homebrew でインストールします..."
    if ! command -v brew &>/dev/null; then
        echo "  Homebrew をインストールします..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    fi
    brew install python@3.12
    echo "  [OK] Python 3.12 のインストールが完了しました。"
fi

PYTHON=${PYTHON:-python3.12}
if ! command -v $PYTHON &>/dev/null; then
    PYTHON=python3
fi
echo ""

# ── 2. faster-whisper インストール ──────────────────────────
echo "[2/5] faster-whisper のインストール..."
$PYTHON -m pip install faster-whisper --quiet
echo "  [OK] faster-whisper のインストールが完了しました。"
echo ""

# ── 3. pyannote.audio インストール ─────────────────────────
echo "[3/5] pyannote.audio のインストール（話者分離機能）..."
echo "  ※ PyTorch を含むため、ダウンロードに 10〜20 分かかる場合があります。"
echo ""
if $PYTHON -m pip install pyannote.audio --quiet; then
    echo "  [OK] pyannote.audio のインストールが完了しました。"
else
    echo "  [警告] pyannote.audio のインストールに失敗しました。"
    echo "  話者分離機能は使用できませんが、他の機能は問題なく動作します。"
fi
echo ""

# ── 4. FFmpeg チェック ────────────────────────────────────
echo "[4/5] FFmpeg の確認..."
if command -v ffmpeg &>/dev/null; then
    echo "  [OK] FFmpeg が見つかりました。"
else
    echo "  FFmpeg が見つかりません。Homebrew でインストールします..."
    if ! command -v brew &>/dev/null; then
        echo "  Homebrew をインストールします..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    fi
    brew install ffmpeg
    echo "  [OK] FFmpeg のインストールが完了しました。"
fi
echo ""

# ── 5. .env ファイルの作成 ─────────────────────────────────
echo "[5/5] 接続設定の構成..."
echo ""

# Mac の .env 保存先: ~/Library/Application Support/議事録作成補助ツール/
ENV_DIR="$HOME/Library/Application Support/議事録作成補助ツール"
ENV_FILE="$ENV_DIR/.env"
mkdir -p "$ENV_DIR"

if [ -f "$ENV_FILE" ]; then
    echo "  [情報] .env ファイルがすでに存在します: $ENV_FILE"
    echo ""
    read -p "  上書きしますか？ [y/N]: " OVERWRITE
    if [ "$OVERWRITE" != "y" ] && [ "$OVERWRITE" != "Y" ]; then
        echo ""
        echo "  スキップしました。"
        echo ""
        echo "============================================================"
        echo "  セットアップが完了しました！"
        echo "  アプリを起動してください。"
        echo "============================================================"
        echo ""
        exit 0
    fi
fi

echo "  ----- サーバー接続の設定 -----"
echo "  Railway サーバーの URL を入力してください。"
echo "  （例: https://xxxx.up.railway.app）"
echo ""
read -p "  API_BASE_URL: " API_URL

echo ""
echo "  ----- 話者分離（HuggingFace）の設定 -----"
echo "  話者分離を使用するには HuggingFace のアクセストークンが必要です。"
echo "  1. https://huggingface.co/ で無料アカウントを作成"
echo "  2. https://huggingface.co/pyannote/speaker-diarization-3.1 でモデルの利用規約に同意"
echo "  3. Settings → Access Tokens でトークンを取得"
echo "  （使用しない場合は Enter でスキップ）"
echo ""
read -p "  HuggingFace トークン (hf_...): " HF_KEY

# .env ファイルに書き込み
> "$ENV_FILE"
if [ -n "$API_URL" ]; then
    echo "API_BASE_URL=$API_URL" >> "$ENV_FILE"
fi
if [ -n "$HF_KEY" ]; then
    echo "HF_TOKEN=$HF_KEY" >> "$ENV_FILE"
fi

echo ""
echo "  [OK] .env ファイルを作成しました: $ENV_FILE"
echo ""
echo "============================================================"
echo "  セットアップが完了しました！"
echo "  アプリを起動してください。"
echo "============================================================"
echo ""
