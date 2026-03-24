// File: app/main.js
// Description: メインプロセス
// Date: 2026-03-16
// Version: 2.0.0

// インポート
const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

// .env の読み込み
// 開発時: プロジェクトルート直下の .env
// 本番時: exe と同じフォルダの .env
const envFile = app.isPackaged
  ? path.join(path.dirname(process.execPath), ".env")
  : path.join(__dirname, "..", ".env");
require("dotenv").config({ path: envFile });

let mainWindow;

// サーバーモード設定
const API_BASE_URL = (process.env.API_BASE_URL || "").replace(/\/+$/, "");
let authToken = null;

// セッションファイルのパス（アプリ起動後に初期化）
function getSessionFilePath() {
  return path.join(app.getPath("userData"), "session.json");
}

// セッションの読み込み（起動時）
function loadSession() {
  try {
    const data = JSON.parse(fs.readFileSync(getSessionFilePath(), "utf-8"));
    if (!data.token || !data.expiresAt) return null;
    if (new Date(data.expiresAt) <= new Date()) return null; // 期限切れ
    return data;
  } catch {
    return null;
  }
}

// セッションの保存
function saveSession(token, email, expiresAt) {
  fs.writeFileSync(getSessionFilePath(), JSON.stringify({ token, email, expiresAt }), "utf-8");
}

// セッションの削除
function clearSession() {
  try { fs.unlinkSync(getSessionFilePath()); } catch {}
}

// プロジェクトフォルダの取得
function getProjectRoot() {
  // app フォルダの一つ上をプロジェクトルートとみなす
  return path.join(__dirname, "..");
}

// 履歴フォルダの取得
function getHistoryDir() {
  // プロジェクトフォルダ直下に「履歴」フォルダを作成
  const base = getProjectRoot();
  const dir = path.join(base, "履歴");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

// 削除されたファイルを保存するフォルダの取得
function ensureDeletedDir(baseDir) {
  const deletedDir = path.join(baseDir, "deleted");
  if (!fs.existsSync(deletedDir)) {
    fs.mkdirSync(deletedDir, { recursive: true });
  }
  return deletedDir;
}

// 履歴ファイル名の生成
function generateHistoryFilename(date = new Date()) {
  const dir = getHistoryDir();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const prefix = `${y}${m}${d}_${hh}_議事録`;
  const files = fs.readdirSync(dir).filter((f) => f.startsWith(prefix) && !f.startsWith("deleted"));
  const n = files.length + 1;
  const filename = `${prefix}${n}.wav`;
  return path.join(dir, filename);
}

// ログフォルダの取得
function getLogDir() {
  const base = getProjectRoot();
  const dir = path.join(base, "log");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

// ログの追加
function appendLog(level, message) {
  const dir = getLogDir();
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level}] ${message}\n`;
  const file = level === "error" ? "error.log" : "app.log";
  fs.appendFile(path.join(dir, file), line, () => {});
}

// ウィンドウの作成
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
  mainWindow.setTitle("議事録作成補助ツール");
  mainWindow.maximize();
}

// プロセスの実行
function runProcess(exe, args, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, {
      windowsHide: true,
      env: { ...process.env, ...extraEnv }
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (buf) => {
      stdout += buf.toString("utf8");
    });
    child.stderr.on("data", (buf) => {
      stderr += buf.toString("utf8");
    });

    child.on("error", (err) => reject(err));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

// 発言者ラベルの正規化
function normalizeSpeakerLabel(raw) {
  if (!raw) return "発言者A";
  const m = String(raw).match(/(\d+)/);
  const idx = m ? Number(m[1]) : 0;
  const letter = String.fromCharCode("A".charCodeAt(0) + (idx % 26));
  return `発言者${letter}`;
}

// 発言者ラベルの割り当て
function assignSpeakerToSegment(diarizationSegments, t) {
  if (!Array.isArray(diarizationSegments) || diarizationSegments.length === 0) return null;

  for (const s of diarizationSegments) {
    if (typeof s?.start !== "number" || typeof s?.end !== "number") continue;
    if (t >= s.start && t <= s.end) return s.speaker ?? s.label ?? s.id ?? null;
  }

  let best = null;
  let bestDist = Infinity;
  for (const s of diarizationSegments) {
    if (typeof s?.start !== "number" || typeof s?.end !== "number") continue;
    const dist = t < s.start ? s.start - t : t > s.end ? t - s.end : 0;
    if (dist < bestDist) {
      bestDist = dist;
      best = s.speaker ?? s.label ?? s.id ?? null;
    }
  }
  return best;
}

// 有料プランステータスの取得
ipcMain.handle("get-paid-status", () => {
  const saved = loadSession();
  if (saved) {
    authToken = saved.token; // 念のため同期
    return { isPaid: true, email: saved.email, expiresAt: saved.expiresAt };
  }
  authToken = null;
  return { isPaid: false, email: null, expiresAt: null };
});

// ログイン（有料プラン切り替え）
ipcMain.handle("auth-login", async (_event, { email, password }) => {
  if (!API_BASE_URL) throw new Error("API_BASE_URL が設定されていません。");
  const res = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let detail = res.statusText || "";
    try { detail = JSON.parse(body).detail || detail; } catch {}
    // 402 = 決済未完了(pending) → メッセージにメールを埋め込んでrenderer側で再決済ボタンを表示
      throw new Error(detail || "ログインに失敗しました。");
  }
  const data = await res.json();
  authToken = data.access_token;
  saveSession(data.access_token, data.email, data.expiration_date);
  appendLog("info", `auth-login: user=${data.email}`);
  return { email: data.email, user_id: data.user_id, expiresAt: data.expiration_date, status: data.status };
});

// ユーザー登録
ipcMain.handle("auth-register", async (_event, { name, email, password }) => {
  if (!API_BASE_URL) throw new Error("API_BASE_URL が設定されていません。");
  const res = await fetch(`${API_BASE_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password })
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let detail = res.statusText || "";
    try { detail = JSON.parse(body).detail || detail; } catch {}
    throw new Error(detail || "登録に失敗しました。");
  }
  return await res.json();
});

// Stripe チェックアウトセッション作成（登録後に決済へ）
ipcMain.handle("create-checkout-session", async (_event, { email }) => {
  if (!API_BASE_URL) throw new Error("API_BASE_URL が設定されていません。");
  const res = await fetch(`${API_BASE_URL}/payment/create-checkout-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email })
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let detail = res.statusText || "";
    try { detail = JSON.parse(body).detail || detail; } catch {}
    throw new Error(detail || "決済セッションの作成に失敗しました。");
  }
  const data = await res.json();
  shell.openExternal(data.url);
  return {};
});

// ログアウト
ipcMain.handle("auth-logout", () => {
  authToken = null;
  clearSession();
  appendLog("info", "auth-logout");
  return {};
});

// アプリ内録音データの保存
ipcMain.handle("save-recorded-audio", async (_event, { arrayBuffer }) => {
  if (!arrayBuffer) {
    throw new Error("arrayBuffer is required");
  }
  const projectHistoryPath = generateHistoryFilename();
  const downloadsDir = app.getPath("downloads");

  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const prefix = `${y}${m}${d}_${hh}_議事録`;

  // ダウンロードフォルダ直下に保存（サブフォルダなし）
  const downloadsFiles = fs.readdirSync(downloadsDir).filter((f) => f.startsWith(prefix));
  const dn = downloadsFiles.length + 1;
  const downloadsPath = path.join(downloadsDir, `${prefix}${dn}.wav`);

  const buffer = Buffer.from(arrayBuffer);
  await fs.promises.writeFile(projectHistoryPath, buffer);
  await fs.promises.writeFile(downloadsPath, buffer);

  appendLog("info", `recorded-audio saved: project=${projectHistoryPath}, downloads=${downloadsPath}`);
  return { filePath: projectHistoryPath, downloadsPath };
});

// UI からのログ出力
ipcMain.handle("write-log", async (_event, { level = "info", message = "" }) => {
  appendLog(level, message);
  return {};
});

// 履歴一覧取得
ipcMain.handle("list-history", async () => {
  const dir = getHistoryDir();
  const deletedDir = ensureDeletedDir(dir);

  const entries = await fs.promises.readdir(dir);
  const results = [];

  for (const name of entries) {
    const fullPath = path.join(dir, name);
    if (fullPath === deletedDir) continue;

    const stat = await fs.promises.stat(fullPath);
    if (!stat.isFile()) continue;

    results.push({
      name,
      path: fullPath,
      size: stat.size,
      createdAt: stat.birthtimeMs || stat.ctimeMs,
      deleted: false
    });
  }

  // 作成日時の昇順
  results.sort((a, b) => a.createdAt - b.createdAt);
  return results;
});

// 履歴の論理削除（deleted サブフォルダへ移動）
ipcMain.handle("delete-history", async (_event, { filePath }) => {
  if (!filePath) throw new Error("filePath is required");
  const dir = getHistoryDir();
  const deletedDir = ensureDeletedDir(dir);

  const base = path.basename(filePath);
  const dest = path.join(deletedDir, base);
  await fs.promises.rename(filePath, dest);
  return { deletedPath: dest };
});

// 履歴の名前変更
ipcMain.handle("rename-history", async (_event, { filePath, newName }) => {
  if (!filePath) throw new Error("filePath is required");
  if (!newName) throw new Error("newName is required");

  const dir = path.dirname(filePath);
  const newPath = path.join(dir, newName);
  await fs.promises.rename(filePath, newPath);
  const stat = await fs.promises.stat(newPath);
  return {
    name: path.basename(newPath),
    path: newPath,
    size: stat.size,
    createdAt: stat.birthtimeMs || stat.ctimeMs
  };
});

// 一括ダウンロード用: 単一ファイル内容を読む
ipcMain.handle("read-history-file", async (_event, { filePath }) => {
  if (!filePath) throw new Error("filePath is required");
  const data = await fs.promises.readFile(filePath);
  return { bytes: data.buffer, byteOffset: data.byteOffset, byteLength: data.byteLength };
});

// アプリの準備完了時の処理
app.whenReady().then(() => {
  // 保存済みセッションを復元
  const saved = loadSession();
  if (saved) {
    authToken = saved.token;
    appendLog("info", `session restored: email=${saved.email}`);
  }
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// ウィンドウが全て閉じた時の処理
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// 音声/動画ファイルの選択
ipcMain.handle("select-audio-file", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "音声/動画ファイルを選択",
    properties: ["openFile"],
    filters: [
      {
        name: "Audio / Video",
        extensions: ["wav", "mp3", "m4a", "aac", "flac", "ogg", "wma", "mp4", "mov", "avi", "mkv", "webm"]
      },
      { name: "All Files", extensions: ["*"] }
    ]
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// 音声ファイルの文字起こし
ipcMain.handle("transcribe-audio", async (_event, { audioPath, options = {} }) => {
  if (!audioPath) throw new Error("audioPath is required");
  const diarize = Boolean(options?.diarize);

  // ローカルモード（文字起こし・話者分離は常にローカル処理）
  const scriptPlainPath = path.join(__dirname, "..", "stt", "transcribe.py");
  const scriptSegmentsPath = path.join(__dirname, "..", "stt", "transcribe_segments.py");
  const scriptDiarizePath = path.join(__dirname, "..", "stt", "diarize.py");

  const pythonExe = process.env.PYTHON || "python";
  const extraEnv = { PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" };

  if (!diarize) {
    const { code, stdout, stderr } = await runProcess(pythonExe, [scriptPlainPath, audioPath], extraEnv);
    if (code !== 0) throw new Error(`transcribe failed (code=${code}): ${stderr || stdout}`);
    return { text: stdout.trim(), stderr: stderr.trim() };
  }

  const diarizeExe = process.env.PYTHON_DIARIZE || "py";
  const diarizeArgsPrefix = process.env.PYTHON_DIARIZE_ARGS
    ? process.env.PYTHON_DIARIZE_ARGS.split(" ").filter(Boolean)
    : diarizeExe.toLowerCase() === "py"
      ? ["-3.12"]
      : [];

  const diarizeRun = await runProcess(diarizeExe, [...diarizeArgsPrefix, scriptDiarizePath, audioPath], extraEnv);
  if (diarizeRun.code !== 0) throw new Error(`diarize failed (code=${diarizeRun.code}): ${diarizeRun.stderr || diarizeRun.stdout}`);

  let diarizationSegments;
  try {
    diarizationSegments = JSON.parse(diarizeRun.stdout);
  } catch (e) {
    throw new Error(`diarize returned invalid JSON: ${String(e?.message || e)}`);
  }

  const segRun = await runProcess(pythonExe, [scriptSegmentsPath, audioPath], extraEnv);
  if (segRun.code !== 0) throw new Error(`transcribe-segments failed (code=${segRun.code}): ${segRun.stderr || segRun.stdout}`);

  let whisperSegments;
  try {
    whisperSegments = JSON.parse(segRun.stdout);
  } catch (e) {
    throw new Error(`transcribe-segments returned invalid JSON: ${String(e?.message || e)}`);
  }

  const lines = [];
  for (const seg of whisperSegments) {
    const start = typeof seg?.start === "number" ? seg.start : null;
    const end = typeof seg?.end === "number" ? seg.end : null;
    const text = String(seg?.text || "").trim();
    if (!text) continue;
    const mid = start != null && end != null ? (start + end) / 2 : start ?? end ?? 0;
    const rawSpeaker = assignSpeakerToSegment(diarizationSegments, mid);
    const label = normalizeSpeakerLabel(rawSpeaker);
    lines.push(`${label}: ${text}`);
  }

  return {
    text: lines.join("\n"),
    stderr: [diarizeRun.stderr?.trim(), segRun.stderr?.trim()].filter(Boolean).join("\n")
  };
});

// テキスト エクスポート
ipcMain.handle("export-txt", async (_event, { text, basename }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "テキストを保存",
    defaultPath: path.join(app.getPath("downloads"), `${basename}.txt`),
    filters: [{ name: "テキスト", extensions: ["txt"] }]
  });
  if (result.canceled || !result.filePath) return null;
  await fs.promises.writeFile(result.filePath, text, "utf-8");
  appendLog("info", `export-txt: ${result.filePath}`);
  shell.showItemInFolder(result.filePath);
  return result.filePath;
});

// CSV エクスポート
ipcMain.handle("export-csv", async (_event, { csv, basename }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "CSVを保存",
    defaultPath: path.join(app.getPath("downloads"), `${basename}.csv`),
    filters: [{ name: "CSV", extensions: ["csv"] }]
  });
  if (result.canceled || !result.filePath) return null;
  await fs.promises.writeFile(result.filePath, "\uFEFF" + csv, "utf-8");
  appendLog("info", `export-csv: ${result.filePath}`);
  shell.showItemInFolder(result.filePath);
  return result.filePath;
});

// PDF エクスポート
ipcMain.handle("export-pdf", async (_event, { text, basename }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "PDFを保存",
    defaultPath: path.join(app.getPath("downloads"), `${basename}.pdf`),
    filters: [{ name: "PDF", extensions: ["pdf"] }]
  });
  if (result.canceled || !result.filePath) return null;

  const escapedText = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>body{font-family:"Meiryo","Yu Gothic",sans-serif;font-size:12pt;line-height:1.8;margin:40px;color:#111;}</style>
</head><body>${escapedText}</body></html>`;

  const win = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true } });
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  const pdfData = await win.webContents.printToPDF({ pageSize: "A4", printBackground: false });
  win.destroy();

  await fs.promises.writeFile(result.filePath, pdfData);
  appendLog("info", `export-pdf: ${result.filePath}`);
  shell.showItemInFolder(result.filePath);
  return result.filePath;
});

// Word エクスポート
ipcMain.handle("export-word", async (_event, { text, basename }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "Wordファイルを保存",
    defaultPath: path.join(app.getPath("downloads"), `${basename}.docx`),
    filters: [{ name: "Word", extensions: ["docx"] }]
  });
  if (result.canceled || !result.filePath) return null;

  const { Document, Paragraph, TextRun, Packer } = require("docx");
  const lines = text.split("\n");
  const paragraphs = lines.map(
    (line) =>
      new Paragraph({
        children: [new TextRun({ text: line, font: "Meiryo", size: 24 })]
      })
  );

  const doc = new Document({ sections: [{ properties: {}, children: paragraphs }] });
  const buffer = await Packer.toBuffer(doc);
  await fs.promises.writeFile(result.filePath, buffer);
  appendLog("info", `export-word: ${result.filePath}`);
  shell.showItemInFolder(result.filePath);
  return result.filePath;
});

// AI 要約（Claude API）
ipcMain.handle("summarize-text", async (_event, { text }) => {
  // サーバーモード
  if (API_BASE_URL) {
    if (!authToken) throw new Error("ログインが必要です。");
    const res = await fetch(`${API_BASE_URL}/summarize/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({ text })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || "要約に失敗しました。");
    }
    const data = await res.json();
    appendLog("info", "summarize-text: server mode success");
    return data.summary;
  }

  // ローカルモード
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY が設定されていません。");

  const Anthropic = require("@anthropic-ai/sdk");
  const client = new Anthropic.default({ apiKey });

  const hasSpeakers = /^発言者[A-Z]:/m.test(text);
  const systemPrompt = hasSpeakers
    ? "あなたは議事録の要約を担当するアシスタントです。以下は話者ごとに分かれた会議の発言記録です。各話者の主要な発言・議論のポイントを整理し、会議全体を簡潔に要約してください。"
    : "あなたは議事録の要約を担当するアシスタントです。以下は会議の文字起こしテキストです。主要な議題・決定事項・次のアクションを箇条書きで簡潔に要約してください。";

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: "user", content: text }]
  });

  const result = response.content[0]?.text || "";
  appendLog("info", "summarize-text: success");
  return result;
});
