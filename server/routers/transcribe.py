# File: server/routers/transcribe.py
# Description: 文字起こし・話者分離エンドポイント

import os
import json
import tempfile
from fastapi import APIRouter, File, Form, UploadFile, Depends, HTTPException
from ..auth_utils import get_current_user

router = APIRouter()

# faster-whisper（ctranslate2 依存）はオプション扱いにして起動クラッシュを防ぐ
try:
    from faster_whisper import WhisperModel
    _HAS_WHISPER = True
except Exception:
    _HAS_WHISPER = False

# モデルのシングルトン（初回リクエスト時にロード）
_whisper_model = None


def _get_whisper():
    global _whisper_model
    if not _HAS_WHISPER:
        raise HTTPException(status_code=501, detail="faster-whisper がインストールされていません。")
    if _whisper_model is None:
        _whisper_model = WhisperModel("small", device="cpu", compute_type="int8")
    return _whisper_model


# 話者分離モジュール（オプション）
try:
    from pyannote.audio import Pipeline as DiarizationPipeline
    _HF_TOKEN = os.environ.get("HF_TOKEN", "")
    _diarize_pipeline = None

    def _get_diarize():
        global _diarize_pipeline
        if _diarize_pipeline is None:
            _diarize_pipeline = DiarizationPipeline.from_pretrained(
                "pyannote/speaker-diarization-3.1",
                use_auth_token=_HF_TOKEN,
            )
        return _diarize_pipeline

    _HAS_DIARIZE = True
except ImportError:
    _HAS_DIARIZE = False


def _normalize_speaker(raw: str) -> str:
    import re
    if not raw:
        return "発言者A"
    m = re.search(r"(\d+)", str(raw))
    idx = int(m.group(1)) if m else 0
    return f"発言者{chr(ord('A') + (idx % 26))}"


@router.post("/")
async def transcribe_audio(
    file: UploadFile = File(...),
    diarize: str = Form("false"),
    user=Depends(get_current_user),
):
    do_diarize = diarize.lower() == "true"
    suffix = os.path.splitext(file.filename or "audio")[1] or ".wav"

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        model = _get_whisper()

        if not do_diarize:
            # 通常の文字起こし
            segments, _ = model.transcribe(
                tmp_path,
                language="ja",
                vad_filter=True,
                beam_size=5,
            )
            text = "\n".join(seg.text.strip() for seg in segments if seg.text.strip())
            return {"text": text}

        # 話者分離あり
        if not _HAS_DIARIZE:
            raise HTTPException(
                status_code=501,
                detail="サーバーに pyannote.audio がインストールされていません。",
            )

        # セグメント単位で文字起こし
        seg_results, _ = model.transcribe(
            tmp_path,
            language="ja",
            vad_filter=True,
            beam_size=5,
            word_timestamps=False,
        )
        whisper_segs = [
            {"start": s.start, "end": s.end, "text": s.text.strip()}
            for s in seg_results
            if s.text.strip()
        ]

        # 話者分離
        pipeline = _get_diarize()
        diarization = pipeline(tmp_path)
        diarize_segs = [
            {"start": turn.start, "end": turn.end, "speaker": speaker}
            for turn, _, speaker in diarization.itertracks(yield_label=True)
        ]

        # マッチング
        def assign_speaker(t):
            for s in diarize_segs:
                if s["start"] <= t <= s["end"]:
                    return s["speaker"]
            best, best_dist = None, float("inf")
            for s in diarize_segs:
                dist = s["start"] - t if t < s["start"] else t - s["end"] if t > s["end"] else 0
                if dist < best_dist:
                    best_dist, best = dist, s["speaker"]
            return best

        lines = []
        for seg in whisper_segs:
            mid = (seg["start"] + seg["end"]) / 2
            label = _normalize_speaker(assign_speaker(mid))
            lines.append(f"{label}: {seg['text']}")

        return {"text": "\n".join(lines)}

    finally:
        os.unlink(tmp_path)
