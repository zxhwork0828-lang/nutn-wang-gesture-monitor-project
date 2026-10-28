# 手勢映廊：攝影機手勢圖片播放器

左側為鏡像攝影機與手部關鍵點，右側為圖片展示、縮圖及輔助按鈕。
攝影機與手勢辨識皆在瀏覽器進行，不上傳影像；FastAPI 提供頁面、圖片與健康檢查。
圖片切換到首尾即停止，不循環。

## 手勢與控制

| 操作 | 動作 |
| --- | --- |
| 張開手掌，往預覽畫面的左側移動 | 上一張 |
| 張開手掌，往預覽畫面的右側移動 | 下一張 |
| 只伸食指，維持約 0.5 秒 | 第一張 |
| 只伸小指，維持約 0.5 秒 | 最後一張 |
| 四個輔助按鈕／點選縮圖 | 不需要攝影機也能切換 |
| 鍵盤 ←、→、Home、End | 上一張、下一張、第一張、最後一張 |

辨識單手，拇指可以放鬆；請將整隻手放入畫面，盡量面向鏡頭，避免背光。
食指與小指由手部關鍵點的彎曲角度與距離判斷，並非額外訓練的分類模型。
切換後冷卻 1 秒；食指／小指觸發後須收回或換手勢才能再次觸發。
手掌在約 0.65 秒內水平移動超過畫面寬度的 16% 才切換，避免微小晃動誤觸。
實際準確度與 FPS 仍需依使用者攝影機、光線與裝置實測。

## 本機啟動（Windows PowerShell）

本次已在 gesture_detection/.venv 安裝執行套件。從工作區根目錄啟動：

```powershell
.\gesture_detection\.venv\Scripts\python.exe main.py
```

開啟 **http://127.0.0.1:8000**，按「啟動攝影機」並允許攝影機權限。
停止按鈕會釋放攝影機，頁面關閉時也會釋放。
從其他裝置存取時需使用 HTTPS；一般區網 HTTP IP 不符合瀏覽器的攝影機安全要求。
不要直接以檔案總管開啟 index.html。

若在新環境安裝，Python 3.10 以上可用，Render 以 .python-version 指定 3.13：

```powershell
cd gesture_detection
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn main:app --reload
```

## 圖片

- 已從上層練習素材複製五張範例圖片到 static/images/，不更動原始檔。
- 將 JPG、JPEG、PNG、WebP 或 GIF 放入 static/images/，重新整理即可讀取，依檔名排序。
- 「選取我的圖片」可一次選取多張，按檔名自然排序；僅在目前瀏覽器開啟，不會上傳，重新整理後恢復伺服器圖片。
- 範例圖片沿用工作區素材，公開部署前請確認圖片使用權。

## 檔案與套件

```text
item3/main.py                    # IDE 根目錄啟動入口
item3/gesture_detection/
  main.py                       # FastAPI、圖片 API、靜態檔案
  requirements.txt              # Python 安裝清單
  render.yaml                   # 獨立儲存庫部署範本
  .python-version               # Render Python 版本
  static/
    index.html                  # 左攝影機、右圖片版面
    styles.css                  # 桌面／手機版樣式
    app.js                      # 圖片控制、攝影機、MediaPipe 整合
    gestures.mjs                # 手指判定、滑動及冷卻邏輯
    images/                     # 五張範例圖片
    models/hand_landmarker.task  # MediaPipe 官方預訓練模型
  tests/gestures.test.mjs        # 手勢及切換邏輯測試
```

Python 必要套件為 fastapi、uvicorn 與 pydantic（明確使用 v2，避免 Python 3.14 的 v1 相容性問題），詳見 requirements.txt。
前端隨附固定版本 @mediapipe/tasks-vision@1.2.0 的 JavaScript 與 WASM（static/vendor/mediapipe），不需要 npm 建置或 Python 版 MediaPipe。
模型與辨識執行資源隨專案提供，不依賴外部 CDN。若 GPU 初始化失敗會嘗試 CPU。
模型或執行資源載入失敗時會顯示錯誤，按鈕與圖片功能仍可使用。
Google Fonts 為可選字型，無法載入時使用系統字型。

邏輯測試（已安裝 Node.js 時）：

```powershell
node --test gesture_detection/tests/gestures.test.mjs
```

測試涵蓋手勢方向、冷卻時間、伸指維持與釋放、微小晃動、垂直移動、追蹤中斷、圖片首尾與手指關鍵點判定。
真實攝影機與跨瀏覽器辨識仍需人工驗收，不能用合成座標測試取代。

## Render 部署

將目前儲存庫推送到 Git 平台後，建立 Python Web Service：

| 設定 | 值 |
| --- | --- |
| Root Directory | gesture_detection |
| Build Command | python -m pip install -r requirements.txt |
| Start Command | python -m uvicorn main:app --host 0.0.0.0 --port $PORT |
| Health Check Path | /health |
| Python | .python-version 指定 3.13 |

若把本子目錄獨立成 Git 儲存庫，Root Directory 留白，並可使用 render.yaml Blueprint。
若 Render 已設定 PYTHON_VERSION，該值會優先於 .python-version，請同步調整或移除。
API 清單為 /api/images，互動 API 文件為 /docs。
目前尚未實際部署到 Render。

## 官方來源

- [MediaPipe Hand Landmarker Web 文件](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js)
- [MediaPipe 模型](https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task)
- [MediaPipe 原始碼與授權](https://github.com/google-ai-edge/mediapipe)
- [瀏覽器攝影機 API 與 HTTPS 要求](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
- [Render FastAPI 部署](https://render.com/docs/deploy-fastapi)
- [Render Python 版本設定](https://render.com/docs/python-version)


## 本次驗證

- Python 3.14.2 本機環境啟動成功，pip check 通過。
- HTTP 檢查通過：首頁、健康端點、五張圖片、JavaScript、WASM 與模型資源。
- 5 項 Node 手勢／切換邏輯測試通過。
- Edge 無頭瀏覽器驗證通過：按鈕、鍵盤、縮圖、選取圖片、390px 手機版無水平溢出。
- 使用 Canvas 模擬攝影機串流，實際載入 MediaPipe 模型與 WASM，確認持續推論及停止時釋放串流。
- 尚未用實體攝影機驗證四種手勢，也尚未部署至 Render；Render Python 3.13 環境仍需部署驗證。

## 攝影機來源（外接優先）

- 網頁預設為「自動選擇（外接優先）」。授權後會重新列出裝置，以 USB、External、常見外接品牌等名稱優先，並避免自動選到可辨識的虛擬攝影機。
- 瀏覽器沒有標準的「內建／外接」欄位；名稱不明的裝置仍可能無法正確自動判斷，請在「攝影機來源」選單指定外接裝置。系統會記住手動選擇，同一瀏覽器與網址下次仍使用該裝置。
- 啟動後顯示「目前使用：裝置名稱」，可核對實際來源。切換選單會重新啟動辨識；重新插拔後可按「重新偵測」。
- 指定的外接攝影機忙碌或被拔除時會顯示錯誤，不會悄悄改用內建攝影機。只有一台可用攝影機時，仍可使用該裝置。
- 第一次授權可能短暫開啟瀏覽器預設攝影機以取得裝置名稱，取得後立即釋放，再以 exact deviceId 開啟所選裝置。
- 裝置選擇屬瀏覽器設定，與 OpenCV 的 CAMERA_INDEX 是不同入口。
- 測試：node --test gesture_detection/tests/cameras.test.mjs gesture_detection/tests/gestures.test.mjs

## 新增圖片特效（原功能保留）

一般瀏覽預設不啟用特效手勢，原本左／右切圖、食指第一張、小指最後一張，以及外接攝影機優先設定均保留。
圖片區下方新增「啟用特效手勢」，開啟後暫停手勢切圖以避免操作衝突；原本的四個切圖按鈕、縮圖、鍵盤與選取圖片仍可使用。

| 特效模式中的操作 | 圖片效果 |
| --- | --- |
| 張開四指，手心／手背連續翻轉 | 左右鏡像切換；相反方向需穩定約 0.25 秒 |
| 張開四指並傾斜手掌 | 相對啟用／校正時的角度旋轉 |
| 拇指靠近／遠離食指，其他四指維持張開 | 相對手掌寬度的指尖間距控制縮放，範圍 50%～250% |
| 張開四指，向下／向上移動 | 向下較透明，向上較不透明；不透明度 15%～100% |
| 握拳或移出畫面 | 暫停調整並保留效果 |

- 啟用後第一個有效手勢作為相對控制起點，不會立即跳動；按「重新校正手勢」可重設起點並保留目前效果。
- 翻面是以同一隻手的手掌平面方向變化推估，無須預先判定左右手；請連續翻轉，不要用換手代替。側對鏡頭的方向不明影格不觸發翻轉，失去追蹤超過約 0.75 秒時會重建起點，避免手重新入鏡時誤翻。
- 視覺效果採平滑處理。翻面過程的遮擋、手部辨識誤差與光線仍可能影響效果，須以實體攝影機確認。
- 左右翻轉按鈕、旋轉／縮放／不透明度滑桿可獨立使用，不需要啟動攝影機。
- 「重設特效」恢復未翻轉、0°、100% 縮放及 100% 不透明度；關閉特效手勢或停止攝影機會保留目前效果。
- 特效只作用於展示圖片，不修改原始圖片檔。切換圖片沿用目前效果；放大或旋轉超出展示區域時會裁切。
- 新增 static/transforms.mjs 與 tests/transforms.test.mjs，不需安裝新套件。

測試全部手勢與裝置邏輯：

```powershell
node --test gesture_detection/tests/gestures.test.mjs gesture_detection/tests/cameras.test.mjs gesture_detection/tests/transforms.test.mjs
```

新增特效驗證：17 項 Node 邏輯測試通過。Edge 瀏覽器以合成手部關鍵點及 Canvas 攝影機串流確認四種特效、模式切換、恢復原切圖手勢、手動控制、重設、圖片切換保留特效與手機版無水平溢出。此為程式整合測試，尚不能代表實體攝影機下的翻面辨識準確率。

## 精簡手勢說明欄

- 攝影機畫面與說明欄並排放在同一區域，包含切圖、食指／小指、翻面、旋轉、縮放及透明度手勢。
- 「特效手勢模式」開關移至攝影機旁的說明欄；切換時同步標示目前適用的手勢。
- 一般視窗同時列出兩種模式；較矮或較窄的視窗僅顯示目前模式，切換模式即可查看另一組，避免長說明被裁切。
- 桌面捲動圖片與特效控制區時，攝影機和說明一起停留在側邊；手機維持攝影機／說明並排，圖片區列於下方。
- 攝影機來源改為可展開的設定區，外接優先、指定裝置及記住選擇的功能不變。
- 瀏覽器驗證涵蓋 1366×768、1280×720、390×844、375×667、320×568、844×390，兩種模式均確認攝影機與說明在捲動至操作區後可完整同時顯示，且無水平溢出。

版面放大調整：桌面左側攝影機與說明區改為約 64% 寬度，攝影機預覽加高、說明文字加大。較矮的視窗只顯示目前模式說明，以維持攝影機與說明同時可見。新增 spacious.css 管理此版面調整，原功能不變。已通過六種桌面／手機尺寸的瀏覽器版面與控制操作檢查。
