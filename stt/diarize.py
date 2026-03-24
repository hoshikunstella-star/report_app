# File: stt/diarize.py
# Description: 発言者の抽出処理
# Date: 2026-03-16
# Version: 1.0.0

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

# エラーログの表示
def eprint(*args):
    print(*args, file=sys.stderr, flush=True)

# soundfile が直接読めない拡張子
_SOUNDFILE_UNSUPPORTED = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4a", ".aac", ".wma", ".mp3"}

def _to_wav(audio_path: Path) -> tuple[Path, bool]:
    """MP4等の場合はffmpegで一時WAVに変換して返す。WAV等はそのまま返す。"""
    if audio_path.suffix.lower() not in _SOUNDFILE_UNSUPPORTED:
        return audio_path, False
    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    tmp.close()
    tmp_path = Path(tmp.name)
    try:
        result = subprocess.run(
            ["ffmpeg", "-y", "-i", str(audio_path), "-ar", "16000", "-ac", "1", str(tmp_path)],
            capture_output=True,
        )
    except FileNotFoundError:
        tmp_path.unlink(missing_ok=True)
        raise RuntimeError(
            "ffmpeg が見つかりません。インストールしてください。\n"
            "インストール方法: PowerShell（管理者）で `winget install ffmpeg` を実行後、再起動してください。"
        )
    if result.returncode != 0:
        tmp_path.unlink(missing_ok=True)
        raise RuntimeError(f"ffmpeg 変換失敗: {result.stderr.decode(errors='replace')}")
    return tmp_path, True

# 音声ファイルの読み込み
def load_audio_in_memory(audio_path: Path):
    """
    Avoid pyannote's built-in decoding (torchcodec/ffmpeg issues on Windows)
    by loading waveform in Python and passing it as a dict.
    """
    import numpy as np
    import soundfile as sf
    import torch

    wav_path, is_tmp = _to_wav(audio_path)
    try:
        data, sr = sf.read(str(wav_path), always_2d=True)
    finally:
        if is_tmp:
            wav_path.unlink(missing_ok=True)

    # data: (time, channels) 時間とチャンネル
    if data.shape[1] > 1:
        data = np.mean(data, axis=1, keepdims=True)
    waveform = torch.from_numpy(data.T).to(dtype=torch.float32)  # (channel, time) チャンネルと時間
    return {"waveform": waveform, "sample_rate": int(sr)}

# アノテーションの抽出
def extract_annotation(diarize_out):
    # アノテーションがない場合はNoneを返す
    # Most versions return pyannote.core.Annotation (has itertracks). 最も多くのバージョンはpyannote.core.Annotation (itertracksを持つ)を返します。
    if diarize_out is None:
        return None
    if hasattr(diarize_out, "itertracks"):  # itertracksを持つ場合はそのまま返す
        return diarize_out

    # Some versions wrap it into an object or dict-like output. 一部のバージョンはオブジェクトや辞書のような出力にラップされます。  
    # diarization, annotation, predicted, output, speaker_diarization, exclusive_speaker_diarization をチェック
    for attr in (
        "diarization",
        "annotation",
        "predicted",
        "output",
        "speaker_diarization",
        "exclusive_speaker_diarization",
    ):
        if hasattr(diarize_out, attr):  # attrを持つ場合はそのまま返す
            cand = getattr(diarize_out, attr)
            if hasattr(cand, "itertracks"):  # itertracksを持つ場合はそのまま返す
                return cand

    if isinstance(diarize_out, dict):  # dictの場合はdiarizationとannotationをチェック  
        for key in ("diarization", "annotation"):
            cand = diarize_out.get(key)
            if hasattr(cand, "itertracks"):
                return cand

    return None

# メイン関数
def main() -> int:
    if len(sys.argv) < 2:  # 引数が2つ未満の場合はエラーメッセージを表示
        eprint("Usage: python diarize.py <audio_path>")
        return 2

    audio_path = Path(sys.argv[1])  # 引数の1つ目を音声ファイルのパスとして取得 
    if not audio_path.exists():  # 音声ファイルが存在しない場合はエラーメッセージを表示
        eprint(f"Audio file not found: {audio_path}")
        return 2

    hf_token = os.environ.get("HF_TOKEN") or os.environ.get("HUGGINGFACE_TOKEN")  # HF_TOKENかHUGGINGFACE_TOKENを取得
    if not hf_token:  # HF_TOKENが設定されていない場合はエラーメッセージを表示
        eprint("HF_TOKEN is not set. pyannote models require authentication.")
        return 2

    try:  # pyannote.audioをインポート
        from pyannote.audio import Pipeline
    except Exception as ex:  # インポートに失敗した場合はエラーメッセージを表示
        eprint("Missing dependency: pyannote.audio (Python 3.12 env)")
        eprint(f"Import error: {ex}")
        return 2

    # These repos are often gated; user must request access on Hugging Face.
    candidates = [  # pyannote/speaker-diarization-3.1, pyannote/speaker-diarization-3.0, pyannote/speaker-diarization をチェック
        "pyannote/speaker-diarization-3.1",
        "pyannote/speaker-diarization-3.0",
        "pyannote/speaker-diarization",
    ]

    last_ex = None  # 最後のエラーを保存
    pipeline = None
    for repo_id in candidates:  # candidatesをチェック
        eprint(f"Loading diarization pipeline: {repo_id}")
        try:  # パイプラインをロード
            try:
                pipeline = Pipeline.from_pretrained(repo_id, token=hf_token)
            except TypeError:  # TypeErrorが発生した場合はuse_auth_tokenを使用
                pipeline = Pipeline.from_pretrained(repo_id, use_auth_token=hf_token)
            break
        except Exception as ex:
            last_ex = ex  # エラーを保存
            continue

    if pipeline is None:  # パイプラインがロードできない場合はエラーメッセージを表示
        eprint(f"Failed to load diarization pipeline. Last error: {last_ex}")
        return 2

    try:
        # 音声ファイルを読み込み
        audio = load_audio_in_memory(audio_path)
    except Exception as ex:  # エラーが発生した場合はエラーメッセージを表示
        eprint("Failed to load audio in memory.")
        eprint("Install in Python 3.12 env: py -3.12 -m pip install soundfile numpy")
        eprint(f"Audio load error: {ex}")
        return 2

    # パイプラインを実行
    diarize_out = pipeline(audio)
    # アノテーションを抽出
    annotation = extract_annotation(diarize_out)
    if annotation is None:  # アノテーションがない場合はエラーメッセージを表示
        eprint("Unsupported diarization output format.")
        eprint(f"type={type(diarize_out)}")
        if isinstance(diarize_out, dict):  # dictの場合はkeysを表示 (デバッグ用) 
            eprint(f"keys={list(diarize_out.keys())}")
        else:
            # Print some attribute names for debugging (best-effort) デバッグ用に属性名を表示
            try:
                attrs = [a for a in dir(diarize_out) if not a.startswith('_')]  # _から始まる属性名を除外
                eprint(f"attrs(sample)={attrs[:40]}")  # 最初の40個の属性名を表示
            except Exception:  # エラーが発生した場合はパス
                pass
        return 2

    segments = []  # セグメントを保存
    for turn, _, speaker in annotation.itertracks(yield_label=True):
        segments.append({"start": float(turn.start), "end": float(turn.end), "speaker": str(speaker)})  # セグメントを追加

    sys.stdout.write(json.dumps(segments, ensure_ascii=False))  # セグメントをJSON形式で出力
    sys.stdout.flush()
    return 0

# メイン関数を実行
if __name__ == "__main__":
    raise SystemExit(main())  # メイン関数を実行 （エラーが発生した場合は終了）

