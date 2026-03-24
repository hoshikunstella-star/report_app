# File: stt/transcribe.py
# Description: テキストの抽出処理
# Date: 2026-03-16
# Version: 1.0.0

import sys
from pathlib import Path

# エラーログの表示
def eprint(*args):
    print(*args, file=sys.stderr, flush=True)

# メイン関数
def main() -> int:
    if len(sys.argv) < 2:  # 引数が2つ未満の場合はエラーメッセージを表示
        eprint("Usage: python transcribe.py <audio_path>")
        return 2

    audio_path = Path(sys.argv[1])  # 引数の1つ目を音声ファイルのパスとして取得 
    if not audio_path.exists():  # 音声ファイルが存在しない場合はエラーメッセージを表示
        eprint(f"Audio file not found: {audio_path}")
        return 2

    try:  # faster_whisperをインポート
        from faster_whisper import WhisperModel
    except Exception as ex:  # インポートに失敗した場合はエラーメッセージを表示 
        eprint("Missing dependency: faster-whisper")
        eprint("Install: pip install -r stt/requirements.txt")
        eprint(f"Import error: {ex}")
        return 2

    model_name = "small"  # モデル名
    device = "cpu"  # デバイス
    compute_type = "int8"  # 計算型

    eprint(f"Loading model: {model_name} (device={device}, compute={compute_type})")  # モデルをロード
    model = WhisperModel(model_name, device=device, compute_type=compute_type)

    segments, info = model.transcribe(  # モデルを実行
        str(audio_path),
        vad_filter=True,
        vad_parameters=dict(min_silence_duration_ms=500),  # 最小無音時間
        beam_size=5,  # ビームサイズ
    )

    eprint(f"Detected language: {info.language} (p={info.language_probability:.2f})")  # 検出言語

    out_lines = []  # 出力を保存
    for seg in segments:
        text = (seg.text or "").strip()  # テキストを取得
        if text:  # テキストがある場合は出力に追加
            out_lines.append(text)

    sys.stdout.write("\n".join(out_lines))  # 出力をJSON形式で出力
    sys.stdout.flush()
    return 0

# メイン関数を実行
if __name__ == "__main__":
    raise SystemExit(main())  # メイン関数を実行 （エラーが発生した場合は終了）

