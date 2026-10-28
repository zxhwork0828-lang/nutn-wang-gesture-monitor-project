# Item3：手勢映廊 Web 應用 & 電腦視覺／資料視覺化專案

本儲存庫包含兩大部分：
1. **手勢映廊（`gesture_detection/`）**：基於 FastAPI 與瀏覽器端 MediaPipe Hand Landmarker 的攝影機手勢圖片播放器（支援手勢切圖、食指／小指首尾跳轉、翻轉／旋轉／縮放／透明度特效手勢，以及外接攝影機優先選擇）。
2. **電腦視覺與資料分析練習（根目錄 Notebooks）**：OpenCV 影像處理與人臉偵測、YOLOv8 物件偵測、分類與迴歸資料視覺化。

---

## 專案結構

```text
item3/
├── main.py                                  # 根目錄啟動入口（轉發啟動 gesture_detection FastAPI）
├── requirements.txt                         # 雲端 Web 部署專用精簡套件清單（FastAPI / Uvicorn / Pydantic）
├── pyproject.toml                           # 完整本機開發與 Notebook 套件設定（uv）
├── render.yaml                              # Render Blueprint 部署設定（指定 rootDir: gesture_detection）
├── gesture_detection/                       # 手勢映廊 Web 應用主目錄
│   ├── main.py                              # FastAPI 伺服器、圖片清單 API 與健康檢查 (/health)
│   ├── requirements.txt                     # Web 服務套件清單
│   ├── render.yaml                          # 子目錄獨立部署範本
│   ├── .python-version                      # Render Python 版本設定 (3.13)
│   ├── static/                              # 前端 HTML/CSS/JS、MediaPipe WASM/模型與範例圖片
│   └── tests/                               # Node.js 前端手勢、攝影機選擇與特效邏輯單元測試
├── src/item3/                               # 共用 Python 工具（例如獨立程序的攝影機擷取模組）
├── models/                                  # OpenCV YuNet ONNX 與 YOLOv8n 預訓練權重
├── images/                                  # 課堂練習影像與影片素材
├── 01_opencv.ipynb                          # OpenCV 基礎影像處理與 Haar Cascade 練習
├── 02_opencv.ipynb                          # OpenCV YuNet 人臉偵測練習
├── 03_yolov8.ipynb                          # YOLOv8 物件偵測練習
├── VisualizingDataForClassification.ipynb   # 分類資料視覺化練習
└── VisualizingDataForRegression.ipynb       # 迴歸資料視覺化練習
```

---

## 快速啟動（手勢映廊 Web 應用）

從專案根目錄啟動：

```powershell
.\gesture_detection\.venv\Scripts\python.exe main.py
```

或建立新虛擬環境安裝 `requirements.txt` 後啟動：

```powershell
python -m venv .venv_web
.\.venv_web\Scripts\python.exe -m pip install -r requirements.txt
.\.venv_web\Scripts\python.exe main.py
```

啟動後於瀏覽器開啟 **http://127.0.0.1:8000**。詳細手勢操作說明請參閱 [`gesture_detection/README.md`](gesture_detection/README.md)。

---

## Render 雲端部署

將本專案推送至 GitHub 後，可於 Render 透過以下任一方式部署：

### 方式一：使用 Web Service 手動設定
| 設定項目 | 設定值 |
| --- | --- |
| **Root Directory** | `gesture_detection`（或留白由根目錄啟動皆可） |
| **Build Command** | `python -m pip install -r requirements.txt` |
| **Start Command** | `python -m uvicorn main:app --host 0.0.0.0 --port $PORT` |
| **Health Check Path** | `/health` |

### 方式二：使用 Render Blueprint (`render.yaml`)
於 Render 選擇 **New > Blueprint** 並連結本 GitHub 儲存庫，Render 會自動讀取根目錄的 `render.yaml`（已指定 `rootDir: gesture_detection`）完成部署。

