// File: app/renderer/renderer.js
// Description: レンダラープロセス
// Date: 2026-03-16
// Version: 2.0.0

// エレメントの取得
const elAudioPath = document.getElementById("audioPath");
const elLog = document.getElementById("log");
const elText = document.getElementById("text");
const btnPick = document.getElementById("btnPick");
const btnRecord = document.getElementById("btnRecord");
const btnTranscribe = document.getElementById("btnTranscribe");
const btnExport = document.getElementById("btnExport");
const exportDropdown = document.getElementById("exportDropdown");
const btnSummarize = document.getElementById("btnSummarize");
const btnSummaryCopy = document.getElementById("btnSummaryCopy");
const summaryText = document.getElementById("summaryText");
const chkDiarize = document.getElementById("chkDiarize");
const tabTranscribe = document.getElementById("tabTranscribe");
const tabSummary = document.getElementById("tabSummary");
const tabHistory = document.getElementById("tabHistory");
const panelTranscribe = document.getElementById("panelTranscribe");
const panelText = document.getElementById("panelText");
const panelSummary = document.getElementById("panelSummary");
const panelHistory = document.getElementById("panelHistory");
const historyList = document.getElementById("historyList");
const btnBulkDownload = document.getElementById("btnBulkDownload");
const uiLangSelect = document.getElementById("uiLangSelect");
const recordStatus = document.getElementById("recordStatus");
const recordIcon = recordStatus.querySelector(".recordIcon");
const recordWave = recordStatus.querySelector(".recordWave");

// 置換モーダル
const replaceModal = document.getElementById("replaceModal");
const findInput = document.getElementById("findInput");
const replaceInput = document.getElementById("replaceInput");
const btnReplaceOne = document.getElementById("btnReplaceOne");
const btnReplaceAll = document.getElementById("btnReplaceAll");
const btnCloseReplace = document.getElementById("btnCloseReplace");

// プランUI
const planLabel = document.getElementById("planLabel");
const btnSwitchPlan = document.getElementById("btnSwitchPlan");
const btnCancelPlan = document.getElementById("btnCancelPlan");

// ログインモーダル
const loginModal = document.getElementById("loginModal");
const loginEmail = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");
const btnLogin = document.getElementById("btnLogin");
const btnCloseLogin = document.getElementById("btnCloseLogin");
const loginError = document.getElementById("loginError");
const linkToRegister = document.getElementById("linkToRegister");

// 登録モーダル
const registerModal = document.getElementById("registerModal");
const regName = document.getElementById("regName");
const regEmail = document.getElementById("regEmail");
const regPassword = document.getElementById("regPassword");
const regPasswordConfirm = document.getElementById("regPasswordConfirm");
const btnRegister = document.getElementById("btnRegister");
const btnBackToLogin = document.getElementById("btnBackToLogin");
const registerError = document.getElementById("registerError");

// 変数の宣言
let selectedAudioPath = null;
let isPaidPlan = false;
let mediaRecorder = null;
let recordedChunks = [];
let currentLang = "ja";

// ログの表示
function uiLogSuccess(message) {
  const ts = new Date().toISOString().slice(11, 19);
  elLog.textContent += `[${ts}] ✅ ${message}\n`;
  elLog.scrollTop = elLog.scrollHeight;
}

// エラーログの表示
function uiLogError(message) {
  const ts = new Date().toISOString().slice(11, 19);
  elLog.textContent += `[${ts}] ❌ ${message}\n`;
  elLog.scrollTop = elLog.scrollHeight;
}

// ログの書き込み
function log(line) {
  window.gijiroku.writeLog("info", line);
}

// 音声ファイルのパスの設定
function setAudioPath(p) {
  selectedAudioPath = p;
  elAudioPath.textContent = p || "未選択";
  elAudioPath.classList.toggle("muted", !p);
  btnTranscribe.disabled = !p;
}

// タブの更新
function updateTabs(tab) {
  // すべてのタブとパネルをリセット
  [tabTranscribe, tabSummary, tabHistory].forEach((t) => t.classList.remove("active"));
  panelTranscribe.hidden = true;
  panelText.hidden = true;
  panelSummary.hidden = true;
  panelHistory.hidden = true;

  if (tab === "history") {
    tabHistory.classList.add("active");
    panelHistory.hidden = false;
  } else if (tab === "summary") {
    tabSummary.classList.add("active");
    panelSummary.hidden = false;
  } else {
    tabTranscribe.classList.add("active");
    panelTranscribe.hidden = false;
    panelText.hidden = false;
  }
}

// 履歴の更新
async function refreshHistory() {
  try {
    const items = await window.gijiroku.listHistory();
    historyList.innerHTML = "";

    // 履歴の一覧を作成
    for (const item of items) {
      // 履歴のアイテムを作成
      const li = document.createElement("li");
      li.className = "historyItem";

      // 履歴のメインエレメントを作成
      const main = document.createElement("div");
      main.className = "historyItem-main";

      // チェックボックスを作成
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "historyItem-checkbox";

      // 名前のラップを作成
      const nameWrap = document.createElement("div");
      nameWrap.className = "historyItem-name";

      // 名前の入力フィールドを作成
      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.value = item.name;

      // 名前の変更イベントを設定
      nameInput.addEventListener("change", async () => {
        const trimmed = nameInput.value.trim();
        if (!trimmed || trimmed === item.name) {
          nameInput.value = item.name;
          return;
        }
        try {
          // 履歴名の変更
          const updated = await window.gijiroku.renameHistory(item.path, trimmed);
          item.name = updated.name;
          item.path = updated.path;
          log(`履歴名変更: ${updated.name}`);
        } catch (e) {
          log(`履歴名変更失敗: ${e?.message || e}`);
          nameInput.value = item.name;
        }
      });
      nameWrap.appendChild(nameInput);

      // チェックボックスを追加
      main.appendChild(checkbox);

      // 名前のラップを追加
      main.appendChild(nameWrap);

      // アクションエレメントを作成
      const actions = document.createElement("div");
      actions.className = "historyItem-actions";

      // 再生ボタンを作成
      const btnPlay = document.createElement("button");
      btnPlay.className = "btn";
      btnPlay.textContent = "再生";
      btnPlay.addEventListener("click", () => {
        const audio = new Audio(`file://${item.path.replace(/\\/g, "/")}`);
        audio.play().catch((e) => log(`再生失敗: ${e?.message || e}`));
      });

      // ダウンロードボタンを作成
      const btnDownload = document.createElement("button");
      btnDownload.className = "btn";
      btnDownload.textContent = "DL";
      btnDownload.addEventListener("click", async () => {
        try {
          const res = await window.gijiroku.readHistoryFile(item.path);
          const buffer = new Uint8Array(res.bytes, res.byteOffset, res.byteLength);
          const blob = new Blob([buffer], { type: "audio/wav" });
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = item.name;
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 1000);
          log(`ダウンロード: ${item.name}`);
        } catch (e) {
          log(`ダウンロード失敗: ${e?.message || e}`);
        }
      });

      // 削除ボタンを作成
      const btnDelete = document.createElement("button");
      btnDelete.className = "btn";
      btnDelete.textContent = "削除";
      btnDelete.addEventListener("click", async () => {
        if (!confirm("削除しますがよろしいですか？")) return;
        try {
          await window.gijiroku.deleteHistory(item.path);
          log(`削除（論理）: ${item.name}`);
          li.remove();
        } catch (e) {
          log(`削除失敗: ${e?.message || e}`);
        }
      });

      // アクションエレメントにボタンを追加
      actions.appendChild(btnPlay);
      actions.appendChild(btnDownload);
      actions.appendChild(btnDelete);

      // リストアイテムにメインエレメントとアクションエレメントを追加
      li.appendChild(main);
      li.appendChild(actions);
      historyList.appendChild(li);
    }
  } catch (e) {
    log(`履歴取得失敗: ${e?.message || e}`);
  }
}

// 履歴の一括ダウンロード
async function bulkDownloadHistory() {
  try {
    const items = await window.gijiroku.listHistory();
    if (!items || items.length === 0) {
      uiLogError("履歴がありません。");
      return;
    }
    // チェックされた履歴のパスを取得
    const checkedPaths = Array.from(historyList.querySelectorAll(".historyItem"))
      .map((li, idx) => {
        const cb = li.querySelector(".historyItem-checkbox");
        return cb && cb.checked ? items[idx] : null;
      })
      .filter(Boolean);

    // 対象の履歴を取得
    const targetItems = checkedPaths.length > 0 ? checkedPaths : items;

    const first = targetItems[0];
    const m = first.name.match(/^(\d{8})_/);
    const yyyymmdd = m ? m[1] : "history";
    const zip = new JSZip();
    // 対象の履歴をzipに追加
    for (const item of targetItems) {
      const res = await window.gijiroku.readHistoryFile(item.path);
      const buffer = new Uint8Array(res.bytes, res.byteOffset, res.byteLength);
      zip.file(item.name, buffer);
    }
    // zipを生成
    const blob = await zip.generateAsync({ type: "blob" });
    // ダウンロード用のリンクを作成
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${yyyymmdd}_議事録.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    log(`一括ダウンロード: ${targetItems.length}件 -> ${yyyymmdd}_議事録.zip`);
  } catch (e) {
    log(`一括ダウンロード失敗: ${e?.message || e}`);
  }
}

// 録音の開始
async function startRecording() {
  try {
    // 音声ストリームを取得
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recordedChunks = [];
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.push(e.data);
    };
    mediaRecorder.onstop = async () => {
      try {
        // 録音されたチャンクをBlobに変換
        const blob = new Blob(recordedChunks, { type: "audio/webm" });
        const arrayBuffer = await blob.arrayBuffer();
        const res = await window.gijiroku.saveRecordedAudio(arrayBuffer);
        // 録音されたファイルを保存
        window.gijiroku.writeLog("info", `record saved: project=${res.filePath}, downloads=${res.downloadsPath}`);
        uiLogSuccess(`音声ファイルを保存しました。（${res.filePath}）`);
        await refreshHistory();
      } catch (e) {
        uiLogError("録音に失敗しました。詳細はログファイルを確認してください。");
        window.gijiroku.writeLog(`record save failed: ${e?.message || e}`);
      }
    };
    mediaRecorder.start();
    uiLogSuccess("録音を開始します。");
    window.gijiroku.writeLog("info", "record start");
    btnRecord.textContent = "停止";
    recordIcon.classList.add("active");
    recordWave.classList.add("active");
  } catch (e) {
    uiLogError("録音に失敗しました。詳細はログファイルを確認してください。");
    window.gijiroku.writeLog("error", `record start failed: ${e?.message || e}`);
  }
}

// 録音の停止
function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
    btnRecord.textContent = "録音";
    recordIcon.classList.remove("active");
    recordWave.classList.remove("active");
    uiLogSuccess("録音を停止しました。");
  }
}

// 録音のトグル
function toggleRecording() {
  if (!mediaRecorder || mediaRecorder.state === "inactive") {
    startRecording();
  } else {
    stopRecording();
  }
}

// 音声/動画ファイルの選択
async function pickAudio() {
  try {
    const p = await window.gijiroku.selectAudioFile();
    if (!p) return;

    const okExt = [".wav", ".mp3", ".m4a", ".aac", ".flac", ".ogg", ".wma", ".mp4", ".mov", ".avi", ".mkv", ".webm"];
    const lower = p.toLowerCase();
    const hasOk = okExt.some((ext) => lower.endsWith(ext));
    if (!hasOk) {
      uiLogError(
        `ファイルの拡張子が違います。使用できる拡張子は ${okExt.join(", ")} です。`
      );
      window.gijiroku.writeLog("error", `invalid extension: ${p}`);
      return;
    }

    setAudioPath(p);
    uiLogSuccess("ファイルの読込に成功しました。");
    window.gijiroku.writeLog("info", `file selected: ${p}`);
  } catch (e) {
    uiLogError("ファイルの読込に失敗しました。詳細はログファイルを確認してください。");
    window.gijiroku.writeLog("error", `select-audio failed: ${e?.message || e}`);
  }
}

// 文字起こし
async function transcribe() {
  // 音声ファイルが選択されていない場合は処理を終了
  if (!selectedAudioPath) return;
  // ボタンを無効化
  btnTranscribe.disabled = true;
  btnPick.disabled = true;
  btnExport.disabled = true;
  log(
    chkDiarize.checked
      ? "話者分離+文字起こし開始…（初回はモデルDLで時間がかかる場合があります）"
      : "文字起こし開始…（初回はモデルDLで時間がかかる場合があります）"
  );

  try {
    // 文字起こしを実行
    const result = await window.gijiroku.transcribeAudio(selectedAudioPath, { diarize: chkDiarize.checked });
    const text = (result?.text || "").trim();
    elText.value = text;
    // テキストが空の場合はボタンを無効化
    const hasText = text.length > 0;
    btnExport.disabled = !hasText;
    btnSummarize.disabled = !hasText;
    window.gijiroku.writeLog("info", "transcribe success");
    uiLogSuccess("文字起こしに成功しました。");
  } catch (e) {
    uiLogError("文字起こしに失敗しました。詳細はログファイルを確認してください。");
    window.gijiroku.writeLog("error", `transcribe failed: ${e?.message || e}`);
  } finally {
    // ボタンを有効化
    btnPick.disabled = false;
    btnTranscribe.disabled = !selectedAudioPath;
  }
}

// 多言語対応
function applyI18n() {
  // 辞書を定義
  const dict = {
    ja: {
      title: "議事録作成補助ツール",
      btnPick: "音声/動画ファイル選択",
      btnRecord: "録音",
      speakerDiarization: "話者分離",
      btnTranscribe: "文字起こし",
      btnExport: "エクスポート ▾",
      btnSummarize: "AI要約",
      btnSummaryCopy: "コピー",
      summaryTitle: "AI要約結果（編集可）",
      tabTranscribe: "文字起こし",
      tabSummary: "要約",
      tabHistory: "履歴",
      selectedAudio: "選択中の音声",
      logTitle: "ログ",
      transcriptTitle: "文字起こし結果（編集可）",
      historyTitle: "履歴",
      btnBulkDownload: "一括ダウンロード"
    },
    en: {
      title: "Minutes Assistant Tool",
      btnPick: "Select Audio/Video File",
      btnRecord: "Record",
      speakerDiarization: "Speaker Diarization",
      btnTranscribe: "Transcribe",
      btnExport: "Export ▾",
      btnSummarize: "AI Summary",
      btnSummaryCopy: "Copy",
      summaryTitle: "AI Summary (editable)",
      tabTranscribe: "Transcription",
      tabSummary: "Summary",
      tabHistory: "History",
      selectedAudio: "Selected Audio",
      logTitle: "Log",
      transcriptTitle: "Transcript (editable)",
      historyTitle: "History",
      btnBulkDownload: "Download All"
    }
  };

  const table = dict[currentLang] || dict.ja;
  document.querySelectorAll("[data-i18n-key]").forEach((el) => {
    const key = el.getAttribute("data-i18n-key");
    if (table[key]) {
      el.textContent = table[key];
    }
  });
}

// 言語の変更
function changeUiLang(lang) {
  currentLang = lang === "en" ? "en" : "ja";
  applyI18n();
}

// ファイル名のベース（タイムスタンプ付き）を生成
function makeExportBasename() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `議事録_${y}${m}${d}_${hh}${mm}`;
}

// CSV 形式に変換（発言者X: テキスト or 単純改行行）
function textToCsv(text) {
  const lines = text.split("\n").filter((l) => l.trim());
  const rows = [["発言者", "内容"]];
  for (const line of lines) {
    const m = line.match(/^(発言者[A-Z]):\s*(.*)$/);
    if (m) {
      rows.push([m[1], m[2]]);
    } else {
      rows.push(["", line]);
    }
  }
  return rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\r\n");
}

// エクスポート処理
async function exportAs(fmt) {
  const content = elText.value || "";
  if (!content) return;
  const base = makeExportBasename();

  try {
    let savedPath = null;
    if (fmt === "txt") {
      savedPath = await window.gijiroku.exportTxt(content, base);
      if (savedPath) uiLogSuccess(`テキストを保存しました。（${savedPath}）`);
    } else if (fmt === "csv") {
      savedPath = await window.gijiroku.exportCsv(textToCsv(content), base);
      if (savedPath) uiLogSuccess(`CSVを保存しました。（${savedPath}）`);
    } else if (fmt === "pdf") {
      savedPath = await window.gijiroku.exportPdf(content, base);
      if (savedPath) uiLogSuccess(`PDFを保存しました。（${savedPath}）`);
    } else if (fmt === "word") {
      savedPath = await window.gijiroku.exportWord(content, base);
      if (savedPath) uiLogSuccess(`Wordファイルを保存しました。（${savedPath}）`);
    }
    if (savedPath) window.gijiroku.writeLog("info", `export ${fmt}: ${savedPath}`);
  } catch (e) {
    uiLogError(`エクスポートに失敗しました。（${e?.message || e}）`);
    window.gijiroku.writeLog("error", `export ${fmt} failed: ${e?.message || e}`);
  }
}

// AI要約
async function summarize() {
  const content = elText.value || "";
  if (!content) return;
  btnSummarize.disabled = true;
  btnSummarize.textContent = "要約中…";
  summaryText.value = "";
  try {
    const result = await window.gijiroku.summarizeText(content);
    summaryText.value = result;
    btnSummaryCopy.disabled = false;
    window.gijiroku.writeLog("info", "summarize success");
    uiLogSuccess("AI要約が完了しました。");
  } catch (e) {
    uiLogError("AI要約に失敗しました。ANTHROPIC_API_KEY が設定されているか確認してください。");
    window.gijiroku.writeLog("error", `summarize failed: ${e?.message || e}`);
  } finally {
    btnSummarize.disabled = false;
    btnSummarize.textContent = currentLang === "en" ? "AI Summary" : "AI要約";
  }
}

// ======= 置換モーダル =======
function openReplaceModal() {
  replaceModal.hidden = false;
  findInput.focus();
}

function closeReplaceModal() {
  replaceModal.hidden = true;
  elText.focus();
}

function replaceOne() {
  const needle = findInput.value;
  if (!needle) return;
  const text = elText.value;
  const start = elText.selectionEnd;
  const idx = text.indexOf(needle, start);
  const searchFrom = idx >= 0 ? idx : text.indexOf(needle);
  if (searchFrom < 0) {
    uiLogError(`"${needle}" が見つかりませんでした。`);
    return;
  }
  const after = text.slice(0, searchFrom) + replaceInput.value + text.slice(searchFrom + needle.length);
  elText.value = after;
  elText.setSelectionRange(searchFrom, searchFrom + replaceInput.value.length);
  elText.focus();
}

function replaceAll() {
  const needle = findInput.value;
  if (!needle) return;
  const count = elText.value.split(needle).length - 1;
  if (count === 0) {
    uiLogError(`"${needle}" が見つかりませんでした。`);
    return;
  }
  elText.value = elText.value.split(needle).join(replaceInput.value);
  uiLogSuccess(`${count} 件を置換しました。`);
}

// ======= イベントリスナー =======
btnPick.addEventListener("click", pickAudio);
btnRecord.addEventListener("click", toggleRecording);
btnTranscribe.addEventListener("click", transcribe);
btnSummarize.addEventListener("click", summarize);
tabTranscribe.addEventListener("click", () => updateTabs("transcribe"));
tabSummary.addEventListener("click", () => {
  if (!isPaidPlan) return;
  updateTabs("summary");
});
tabHistory.addEventListener("click", () => {
  updateTabs("history");
  refreshHistory();
});
btnBulkDownload.addEventListener("click", bulkDownloadHistory);
uiLangSelect.addEventListener("change", () => changeUiLang(uiLangSelect.value));

// エクスポートドロップダウン
btnExport.addEventListener("click", (e) => {
  e.stopPropagation();
  exportDropdown.hidden = !exportDropdown.hidden;
});
exportDropdown.addEventListener("click", (e) => {
  const fmt = e.target.dataset.fmt;
  if (fmt) {
    exportDropdown.hidden = true;
    exportAs(fmt);
  }
});
document.addEventListener("click", () => {
  exportDropdown.hidden = true;
});

// 置換モーダル
elText.addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.key === "f") {
    e.preventDefault();
    openReplaceModal();
  }
});
btnReplaceOne.addEventListener("click", replaceOne);
btnReplaceAll.addEventListener("click", replaceAll);
btnCloseReplace.addEventListener("click", closeReplaceModal);
replaceModal.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeReplaceModal();
});

// AI要約コピー
btnSummaryCopy.addEventListener("click", () => {
  navigator.clipboard.writeText(summaryText.value).then(() => {
    uiLogSuccess("要約をクリップボードにコピーしました。");
  });
});

// テキストエリア変更時にエクスポート・要約ボタンを更新
elText.addEventListener("input", () => {
  const hasText = elText.value.trim().length > 0;
  btnExport.disabled = !hasText;
  btnSummarize.disabled = !hasText || !isPaidPlan;
});

// ======= プラン UI 更新 =======
let _currentUserId = null;

function applyPaidUI(email, expiresAt, userId) {
  isPaidPlan = true;
  _currentUserId = userId || _currentUserId;
  const dateStr = expiresAt ? new Date(expiresAt).toLocaleDateString("ja-JP") : "";
  planLabel.textContent = `有料プラン（${email}　期限: ${dateStr}）`;
  btnSwitchPlan.textContent = "ログアウト";
  btnCancelPlan.hidden = false;
  tabSummary.classList.remove("tab-disabled");
  tabSummary.title = "";
  btnSummarize.disabled = elText.value.trim().length === 0;
  btnSummaryCopy.disabled = summaryText.value.trim().length === 0;
  chkDiarize.disabled = false;
  chkDiarize.parentElement.title = "";
  chkDiarize.parentElement.style.opacity = "";
}

function applyFreeUI() {
  isPaidPlan = false;
  planLabel.textContent = "無料プラン";
  btnSwitchPlan.textContent = "有料プランに切り替え";
  btnCancelPlan.hidden = true;
  tabSummary.classList.add("tab-disabled");
  tabSummary.title = "有料プランが必要です";
  btnSummarize.disabled = true;
  btnSummaryCopy.disabled = true;
  chkDiarize.disabled = true;
  chkDiarize.checked = false;
  chkDiarize.parentElement.title = "有料プランが必要です";
  chkDiarize.parentElement.style.opacity = "0.4";
  if (!panelSummary.hidden) updateTabs("transcribe");
}

const btnRepayWrap = document.getElementById("btnRepayWrap");
const btnRepay = document.getElementById("btnRepay");
let _pendingEmail = null;

// ======= ログイン =======
async function handleLogin() {
  const email = loginEmail.value.trim();
  const password = loginPassword.value;
  if (!email || !password) {
    loginError.textContent = "メールアドレスとパスワードを入力してください。";
    return;
  }
  btnLogin.disabled = true;
  btnLogin.textContent = "ログイン中…";
  loginError.textContent = "";
  btnRepayWrap.hidden = true;
  try {
    const user = await window.gijiroku.login(email, password);
    loginModal.hidden = true;
    btnRepayWrap.hidden = true;

    if (user.status === "pending") {
      _pendingEmail = user.email;
      applyFreeUI();
      btnRepayWrap.hidden = false;
      alert("決済が完了していません。\n有料プランに切り替える場合は「決済を再開する」ボタンから決済を完了させてください。\nそのまま無料プランでご利用いただけます。");
      uiLogSuccess("無料プランで起動しました（決済未完了）。");
    } else if (user.status === "canceled") {
      _pendingEmail = user.email;
      applyFreeUI();
      btnRepayWrap.hidden = false;
      alert("サブスクリプションが解約されています。\n有料プランに戻す場合は「決済を再開する」ボタンから再度決済してください。");
      uiLogSuccess("無料プランで起動しました（解約済み）。");
    } else {
      applyPaidUI(user.email, user.expiresAt, user.user_id);
      uiLogSuccess(`ログイン成功（${user.email}）`);
    }
  } catch (e) {
    loginError.textContent = e?.message || "ログインに失敗しました。";
  } finally {
    btnLogin.disabled = false;
    btnLogin.textContent = "ログイン";
  }
}

btnLogin.addEventListener("click", handleLogin);
loginPassword.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleLogin();
});

btnCloseLogin.addEventListener("click", () => {
  loginModal.hidden = true;
  btnRepayWrap.hidden = true;
});

// 再決済ボタン
btnRepay.addEventListener("click", async () => {
  if (!_pendingEmail) return;
  btnRepay.disabled = true;
  btnRepay.textContent = "決済ページを開いています…";
  try {
    await window.gijiroku.createCheckoutSession(_pendingEmail);
    loginError.textContent = "ブラウザで決済を完了後、再度ログインしてください。";
  } catch (e) {
    loginError.textContent = e?.message || "決済ページの表示に失敗しました。";
  } finally {
    btnRepay.disabled = false;
    btnRepay.textContent = "決済を再開する";
  }
});

// ログインモーダル → 登録モーダルへ
linkToRegister.addEventListener("click", (e) => {
  e.preventDefault();
  loginModal.hidden = true;
  registerModal.hidden = false;
  regName.focus();
});

// 登録モーダル → ログインモーダルへ戻る
btnBackToLogin.addEventListener("click", () => {
  registerModal.hidden = true;
  loginModal.hidden = false;
  loginEmail.focus();
});

// ======= ユーザー登録 =======
async function handleRegister() {
  const name = regName.value.trim();
  const email = regEmail.value.trim();
  const password = regPassword.value;
  const confirm = regPasswordConfirm.value;

  if (!name || !email || !password || !confirm) {
    registerError.textContent = "すべての項目を入力してください。";
    return;
  }
  if (password !== confirm) {
    registerError.textContent = "パスワードが一致しません。";
    return;
  }

  btnRegister.disabled = true;
  btnRegister.textContent = "登録中…";
  registerError.textContent = "";
  try {
    await window.gijiroku.register(name, email, password);
    btnRegister.textContent = "決済ページを開いています…";
    await window.gijiroku.createCheckoutSession(email);
    registerModal.hidden = true;
    loginModal.hidden = false;
    loginEmail.value = email;
    loginPassword.value = "";
    loginError.textContent = "";
    loginEmail.focus();
    uiLogSuccess("登録完了。ブラウザで決済を完了後、ログインしてください。");
  } catch (e) {
    const msg = e?.message || "登録に失敗しました。";
    if (msg.includes("既に登録されています") || msg.includes("登録済みです")) {
      alert("このメールアドレスは既に登録されています。");
    } else {
      registerError.textContent = msg;
    }
  } finally {
    btnRegister.disabled = false;
    btnRegister.textContent = "登録して決済へ";
  }
}

btnRegister.addEventListener("click", handleRegister);
regPasswordConfirm.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleRegister();
});

// ======= 有料プラン切り替えボタン =======
btnSwitchPlan.addEventListener("click", async () => {
  if (btnSwitchPlan.textContent === "ログアウト") {
    await window.gijiroku.logout();
    applyFreeUI();
    uiLogSuccess("ログアウトしました。");
  } else {
    loginModal.hidden = false;
    loginEmail.focus();
  }
});

// ======= 解約ボタン =======
btnCancelPlan.addEventListener("click", async () => {
  if (!confirm("有料プランを解約しますか？\n解約後は無料プランに切り替わります。")) return;
  if (!_currentUserId) {
    alert("ユーザー情報が取得できません。再ログインしてください。");
    return;
  }
  btnCancelPlan.disabled = true;
  try {
    await window.gijiroku.cancelPlan(_currentUserId);
    applyFreeUI();
    _currentUserId = null;
    uiLogSuccess("解約しました。無料プランに切り替わりました。");
  } catch (e) {
    alert(e?.message || "解約に失敗しました。");
  } finally {
    btnCancelPlan.disabled = false;
  }
});

// アプリ起動時：有料プランステータス確認
(async () => {
  applyI18n();
  const status = await window.gijiroku.getPaidStatus();
  if (status.isPaid) {
    applyPaidUI(status.email, status.expiresAt);
    uiLogSuccess(`有料プランで起動しました（${status.email}）`);
  } else {
    applyFreeUI();
    uiLogSuccess("準備OK。音声/動画ファイルを選択するか、録音を開始してください。");
  }
})();
