@echo off
chcp 65001 > nul
title 議事録作成補助ツール セットアップ

echo.
echo ============================================================
echo   議事録作成補助ツール セットアップ
echo ============================================================
echo.

REM ── 1. Python 3.12 チェック / 自動インストール ───────────────
echo [1/5] Python 3.12 の確認...
py -3.12 --version > nul 2>&1
if %errorlevel% neq 0 (
    echo  Python 3.12 が見つかりません。自動インストールを開始します...
    echo  ※ ダウンロードに数分かかる場合があります。
    echo.
    winget install --id Python.Python.3.12 -e --silent --accept-package-agreements --accept-source-agreements
    if %errorlevel% neq 0 (
        echo.
        echo  [エラー] Python 3.12 の自動インストールに失敗しました。
        echo  手動で以下からインストールしてください。
        echo  https://www.python.org/downloads/release/python-3120/
        echo  ※「Add Python to PATH」に必ずチェックを入れてください。
        echo.
        pause
        exit /b 1
    )
    REM インストール後に PATH を再読み込み
    for /f "tokens=2*" %%a in ('reg query "HKCU\Environment" /v PATH 2^>nul') do set "USER_PATH=%%b"
    for /f "tokens=2*" %%a in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v PATH 2^>nul') do set "SYS_PATH=%%b"
    set "PATH=%SYS_PATH%;%USER_PATH%"
    echo  [OK] Python 3.12 のインストールが完了しました。
) else (
    py -3.12 --version
    echo  [OK] Python 3.12 が見つかりました。
)
echo.

REM ── 2. faster-whisper インストール ──────────────────────────
echo [2/4] faster-whisper のインストール...
py -3.12 -m pip install faster-whisper
if %errorlevel% neq 0 (
    echo.
    echo  [エラー] faster-whisper のインストールに失敗しました。
    echo.
    pause
    exit /b 1
)
echo  [OK] faster-whisper のインストールが完了しました。
echo.

REM ── 3. pyannote.audio インストール（話者分離用） ─────────────
echo [3/4] pyannote.audio のインストール（話者分離機能）...
echo  ※ PyTorch を含むため、ダウンロードに 10〜20 分かかる場合があります。
echo.
py -3.12 -m pip install pyannote.audio
if %errorlevel% neq 0 (
    echo.
    echo  [警告] pyannote.audio のインストールに失敗しました。
    echo  話者分離機能は使用できませんが、他の機能は問題なく動作します。
    echo.
) else (
    echo  [OK] pyannote.audio のインストールが完了しました。
)
echo.

REM ── 4. FFmpeg チェック / 自動インストール ────────────────────
echo [4/4] FFmpeg の確認...
ffmpeg -version > nul 2>&1
if %errorlevel% neq 0 (
    echo  FFmpeg が見つかりません。自動インストールを開始します...
    winget install --id Gyan.FFmpeg -e --silent --accept-package-agreements --accept-source-agreements
    if %errorlevel% neq 0 (
        echo.
        echo  [警告] FFmpeg の自動インストールに失敗しました。
        echo  手動で https://ffmpeg.org/download.html からインストールしてください。
        echo.
    ) else (
        for /f "tokens=2*" %%a in ('reg query "HKCU\Environment" /v PATH 2^>nul') do set "USER_PATH=%%b"
        for /f "tokens=2*" %%a in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v PATH 2^>nul') do set "SYS_PATH=%%b"
        set "PATH=%SYS_PATH%;%USER_PATH%"
        echo  [OK] FFmpeg のインストールが完了しました。
    )
) else (
    echo  [OK] FFmpeg が見つかりました。
)
echo.

:SETUP_DONE
echo.
echo ============================================================
echo   セットアップが完了しました！
echo   アプリを再起動してください。
echo ============================================================
echo.
pause
