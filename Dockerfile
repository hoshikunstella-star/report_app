FROM python:3.12-slim

WORKDIR /app

# ctranslate2 / faster-whisper が必要とするシステムライブラリ
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY server/requirements.txt server/requirements.txt
RUN pip install --no-cache-dir -r server/requirements.txt

COPY . .

CMD ["sh", "-c", "python3 -m uvicorn server.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
