// File: app/preload.js
// Description: プリロードスクリプト
// Date: 2026-03-16
// Version: 2.0.0

// インポート
const { contextBridge, ipcRenderer } = require("electron");

// ウィンドウの外部からのアクセスを許可
contextBridge.exposeInMainWorld("gijiroku", {
  selectAudioFile: () => ipcRenderer.invoke("select-audio-file"),
  transcribeAudio: (audioPath, options = {}) => ipcRenderer.invoke("transcribe-audio", { audioPath, options }),

  // 録音・履歴関連
  saveRecordedAudio: (arrayBuffer) => ipcRenderer.invoke("save-recorded-audio", { arrayBuffer }),
  listHistory: () => ipcRenderer.invoke("list-history"),
  deleteHistory: (filePath) => ipcRenderer.invoke("delete-history", { filePath }),
  renameHistory: (filePath, newName) => ipcRenderer.invoke("rename-history", { filePath, newName }),
  readHistoryFile: (filePath) => ipcRenderer.invoke("read-history-file", { filePath }),
  writeLog: (level, message) => ipcRenderer.invoke("write-log", { level, message }),

  // エクスポート
  exportTxt: (text, basename) => ipcRenderer.invoke("export-txt", { text, basename }),
  exportCsv: (csv, basename) => ipcRenderer.invoke("export-csv", { csv, basename }),
  exportPdf: (text, basename) => ipcRenderer.invoke("export-pdf", { text, basename }),
  exportWord: (text, basename) => ipcRenderer.invoke("export-word", { text, basename }),

  // AI 要約
  summarizeText: (text) => ipcRenderer.invoke("summarize-text", { text }),

  // 認証・プラン管理
  getPaidStatus: () => ipcRenderer.invoke("get-paid-status"),
  login: (email, password) => ipcRenderer.invoke("auth-login", { email, password }),
  register: (name, email, password) => ipcRenderer.invoke("auth-register", { name, email, password }),
  logout: () => ipcRenderer.invoke("auth-logout"),
  createCheckoutSession: (email) => ipcRenderer.invoke("create-checkout-session", { email })
});
