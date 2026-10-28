import { classifyHand, GestureController, nextIndex } from './gestures.mjs';
import { openPreferredCamera } from './cameras.mjs';
import { defaultTransform, measureHand, TransformController, transformStyle } from './transforms.mjs';

const $ = selector => document.querySelector(selector);
const video = $('#camera');
const canvas = $('#landmarks');
const context = canvas.getContext('2d');
const controller = new GestureController();
const transformController = new TransformController();
let imageTransform = defaultTransform();
let effectsEnabled = false;
const actionNames = { first: '第一張', previous: '上一張', next: '下一張', last: '最後一張' };
const poseNames = { palm: '張開手掌 · 左右移動切換', index: '食指 · 保持以回到第一張', pinky: '小指 · 保持以前往最後一張' };
let pictures = [], current = 0, localUrls = [];
let stream = null, running = false, session = 0, animation = 0, lastFrame = -1, lastInference = 0;
let handModel = null, modelPromise = null;
const VISION_ROOT = '/static/vendor/mediapipe'; // Bundled @mediapipe/tasks-vision 1.2.0.
const cameraSelect = $('#camera-device');
const CAMERA_KEY = 'gesture-gallery-camera';
let preferredCamera = '';
try { preferredCamera = localStorage.getItem(CAMERA_KEY) || ''; } catch { /* Storage may be disabled. */ }

function displayCameras(devices) {
  cameraSelect.replaceChildren(new Option('自動選擇（外接優先）', ''));
  const cameras = devices.filter(device => device.kind === 'videoinput');
  cameras.forEach((device, index) => cameraSelect.add(new Option(device.label || `攝影機 ${index + 1}（授權後顯示名稱）`, device.deviceId)));
  if (preferredCamera && !cameras.some(device => device.deviceId === preferredCamera)) {
    cameraSelect.add(new Option('先前指定的攝影機（未連接，請重新選擇）', preferredCamera));
  }
  cameraSelect.value = preferredCamera;
}

async function refreshCameras() {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  try { displayCameras(await navigator.mediaDevices.enumerateDevices()); }
  catch { $('#camera-status').textContent = '無法讀取裝置清單，請確認攝影機權限後重試。'; }
}

cameraSelect.addEventListener('change', () => {
  preferredCamera = cameraSelect.value;
  try { localStorage.setItem(CAMERA_KEY, preferredCamera); } catch { /* Selection still works for this page. */ }
  if (!$('#stop-camera').disabled) {
    stopCamera('正在切換攝影機…');
    startCamera();
  }
});
$('#refresh-cameras').addEventListener('click', refreshCameras);
navigator.mediaDevices?.addEventListener?.('devicechange', refreshCameras);
refreshCameras();

function applyTransform() {
  $('#slide-image').style.transform = transformStyle(imageTransform);
  $('#slide-image').style.opacity = String(imageTransform.opacity);
  $('#image-rotation').value = String(Math.round(imageTransform.rotation));
  $('#image-scale').value = String(Math.round(imageTransform.scale * 100));
  $('#image-opacity').value = String(Math.round(imageTransform.opacity * 100));
  $('#rotation-value').value = `${Math.round(imageTransform.rotation)}°`;
  $('#scale-value').value = `${Math.round(imageTransform.scale * 100)}%`;
  $('#opacity-value').value = `${Math.round(imageTransform.opacity * 100)}%`;
  $('#mirror-image').setAttribute('aria-pressed', String(imageTransform.mirrored));
  $('#mirror-image').textContent = imageTransform.mirrored ? '左右翻轉：已開啟' : '左右翻轉';
}

function recalibrateEffects() {
  transformController.reset(imageTransform);
  $('#effects-status').textContent = effectsEnabled ? '請張開四指面向鏡頭，作為特效起點；握拳或移出畫面可暫停調整。' : '一般瀏覽模式：原切圖手勢照常。也可直接使用下方控制。';
}

$('#effects-enabled').addEventListener('change', event => {
  effectsEnabled = event.target.checked;
  $('.camera-guide').dataset.mode = effectsEnabled ? 'effects' : 'browse';
  $('#calibrate-effects').disabled = !effectsEnabled;
  controller.reset();
  recalibrateEffects();
  $('#gesture-label').textContent = effectsEnabled ? '特效手勢模式 · 張開四指開始' : '等待切圖手勢';
  $('.gesture-tip').textContent = effectsEnabled ? '張開四指' : '保持約半秒';
  if (running) $('#camera-status').textContent = effectsEnabled ? '特效手勢已啟用；圖片按鈕與鍵盤仍可切換。' : '手掌左右移動切換；食指回第一張，小指到最後一張。';
});
$('#calibrate-effects').addEventListener('click', recalibrateEffects);
$('#mirror-image').addEventListener('click', () => {
  imageTransform.mirrored = !imageTransform.mirrored;
  applyTransform();
  recalibrateEffects();
});
$('#reset-effects').addEventListener('click', () => {
  imageTransform = defaultTransform();
  applyTransform();
  recalibrateEffects();
});
for (const [selector, key, factor] of [['#image-rotation', 'rotation', 1], ['#image-scale', 'scale', 100], ['#image-opacity', 'opacity', 100]]) {
  $(selector).addEventListener('input', event => {
    imageTransform[key] = Number(event.target.value) / factor;
    applyTransform();
    recalibrateEffects();
  });
}
applyTransform();

function showImage() {
  const picture = pictures[current];
  $('#image-count').textContent = `${pictures.length} 張圖片`;
  $('#image-position').textContent = picture ? `${String(current + 1).padStart(2, '0')} / ${String(pictures.length).padStart(2, '0')}` : '—';
  $('#image-name').textContent = picture?.name || '尚未選取圖片';
  $('#slide-image').hidden = !picture;
  $('#image-empty').hidden = Boolean(picture);
  if (picture) {
    $('#slide-image').alt = picture.name;
    $('#slide-image').src = picture.url;
  } else {
    $('#slide-image').removeAttribute('src');
    $('#image-empty').textContent = '尚無圖片，請使用「選取我的圖片」。';
  }
  document.querySelectorAll('[data-action]').forEach(button => {
    const action = button.dataset.action;
    button.disabled = !pictures.length || ((action === 'first' || action === 'previous') ? current === 0 : current === pictures.length - 1);
  });
  [...$('#thumbnails').children].forEach((button, index) => button.setAttribute('aria-current', String(index === current)));
  const strip = $('#thumbnails');
  const active = strip.children[current];
  if (active) strip.scrollBy({ left: active.getBoundingClientRect().left - strip.getBoundingClientRect().left - (strip.clientWidth - active.clientWidth) / 2, behavior: 'smooth' });
}

function buildThumbnails() {
  $('#thumbnails').replaceChildren();
  pictures.forEach((picture, index) => {
    const button = document.createElement('button');
    button.className = 'thumbnail';
    button.setAttribute('aria-label', `第 ${index + 1} 張：${picture.name}`);
    const image = document.createElement('img');
    image.src = picture.url;
    image.alt = '';
    image.loading = 'lazy';
    const number = document.createElement('span');
    number.textContent = String(index + 1).padStart(2, '0');
    button.append(image, number);
    button.addEventListener('click', () => { current = index; showImage(); $('#action-feedback').textContent = '已選取圖片'; });
    $('#thumbnails').append(button);
  });
  showImage();
}

function navigate(action, source = '按鈕') {
  if (!pictures.length) return;
  const old = current;
  current = nextIndex(current, action, pictures.length);
  showImage();
  $('#action-feedback').textContent = old === current ? `已是${current === 0 ? '第一張' : '最後一張'}` : `${source} · ${actionNames[action]}`;
}

document.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.action)));
document.addEventListener('keydown', event => {
  if (event.target.matches('input, textarea, select, [contenteditable="true"]') || event.altKey || event.ctrlKey || event.metaKey) return;
  const action = { ArrowLeft: 'previous', ArrowRight: 'next', Home: 'first', End: 'last' }[event.key];
  if (action) { event.preventDefault(); navigate(action, '鍵盤'); }
});

$('#slide-image').addEventListener('error', () => {
  $('#slide-image').hidden = true;
  $('#image-empty').hidden = false;
  $('#image-empty').textContent = '這張圖片無法讀取，請切換圖片或重新選取。';
});

$('#image-files').addEventListener('change', event => {
  const files = [...event.target.files].filter(file => /\.(jpe?g|png|webp|gif)$/i.test(file.name));
  if (!files.length) return;
  const oldUrls = localUrls;
  pictures = files.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant', { numeric: true })).map(file => ({ name: file.name, url: URL.createObjectURL(file) }));
  localUrls = pictures.map(picture => picture.url);
  current = 0;
  buildThumbnails();
  oldUrls.forEach(url => URL.revokeObjectURL(url));
  $('#action-feedback').textContent = `已選取 ${pictures.length} 張 · 僅在本機開啟`;
  event.target.value = '';
});

async function loadModel() {
  if (handModel) return handModel;
  if (!modelPromise) {
    modelPromise = (async () => {
      const { HandLandmarker, FilesetResolver } = await import(`${VISION_ROOT}/vision_bundle.mjs`);
      const files = await FilesetResolver.forVisionTasks(`${VISION_ROOT}/wasm`);
      const options = {
        baseOptions: { modelAssetPath: '/static/models/hand_landmarker.task', delegate: 'GPU' },
        runningMode: 'VIDEO', numHands: 1,
        minHandDetectionConfidence: 0.65, minHandPresenceConfidence: 0.65, minTrackingConfidence: 0.65,
      };
      try {
        handModel = await HandLandmarker.createFromOptions(files, options);
      } catch {
        // Devices without WebGL can still use the WASM CPU delegate.
        options.baseOptions.delegate = 'CPU';
        handModel = await HandLandmarker.createFromOptions(files, options);
      }
      return handModel;
    })().catch(error => { modelPromise = null; throw error; });
  }
  return modelPromise;
}

const connections = [
  [0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],
  [13,17],[0,17],[17,18],[18,19],[19,20],
];
function drawHand(points) {
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (!points) return;
  context.lineWidth = 3;
  context.strokeStyle = '#d0eaa0';
  for (const [a, b] of connections) {
    context.beginPath();
    context.moveTo(points[a].x * canvas.width, points[a].y * canvas.height);
    context.lineTo(points[b].x * canvas.width, points[b].y * canvas.height);
    context.stroke();
  }
  for (const point of points) {
    context.beginPath();
    context.arc(point.x * canvas.width, point.y * canvas.height, 4, 0, Math.PI * 2);
    context.fillStyle = '#f4ffe9';
    context.fill();
  }
}

function detect(now) {
  if (!running) return;
  try {
    if (video.readyState >= 2 && video.currentTime !== lastFrame && now - lastInference >= 50) {
      lastFrame = video.currentTime;
      lastInference = now;
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }
      const result = handModel.detectForVideo(video, now);
      const points = result.landmarks[0];
      drawHand(points);
      const pose = classifyHand(points);
      $('#gesture-label').textContent = effectsEnabled ? (points ? '特效模式 · 張開四指調整圖片' : '未偵測到手') : (poseNames[pose] || (points ? '請張開手掌，或只伸食指／小指' : '未偵測到手'));
      // Both preview layers are mirrored; use the same coordinates for gestures.
      const center = points ? [0, 5, 9, 13, 17].reduce((sum, index) => ({ x: sum.x + points[index].x / 5, y: sum.y + points[index].y / 5 }), { x: 0, y: 0 }) : null;
      if (effectsEnabled) {
        const updated = transformController.update(pose === 'palm' ? measureHand(points, video.videoWidth / video.videoHeight) : null, now);
        if (updated) {
          imageTransform = updated.value;
          applyTransform();
          $('#effects-status').textContent = updated.flipped ? '偵測到連續翻面，已切換左右鏡像。' : '特效調整中：翻面／傾斜／拇指間距／上下位置；握拳可暫停。';
        } else {
          $('#effects-status').textContent = '暫停調整：請張開四指，避免手掌側對鏡頭；重新出現時保留目前特效。';
        }
      } else {
        const action = controller.update(pose, center ? 1 - center.x : 0, center?.y ?? 0, now);
        if (action) navigate(action, '手勢');
      }
    }
    animation = requestAnimationFrame(detect);
  } catch (error) {
    console.error(error);
    stopCamera('辨識中斷，請重新啟動攝影機；仍可使用按鈕切換圖片。');
  }
}

function stopCamera(message = '攝影機已停止，可繼續使用按鈕或鍵盤。') {
  session += 1;
  running = false;
  cancelAnimationFrame(animation);
  stream?.getTracks().forEach(track => track.stop());
  stream = null;
  video.srcObject = null;
  context.clearRect(0, 0, canvas.width, canvas.height);
  controller.reset();
  recalibrateEffects();
  $('#camera-placeholder').hidden = false;
  $('#start-camera').disabled = false;
  $('#start-camera').textContent = '啟動攝影機';
  $('#stop-camera').disabled = true;
  $('#camera-badge').textContent = '攝影機未啟動';
  $('#gesture-label').textContent = '等待手勢';
  $('#active-camera').textContent = '攝影機未啟動';
  $('#camera-status').textContent = message;
}

async function startCamera() {
  const id = ++session;
  $('#start-camera').disabled = true;
  $('#start-camera').textContent = '啟動中…';
  $('#stop-camera').disabled = false;
  $('#camera-badge').textContent = '正在準備';
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('請使用 localhost 或 HTTPS 網址開啟，並確認瀏覽器支援攝影機。');
    $('#camera-status').textContent = '請允許攝影機存取；不會取得麥克風或上傳畫面。';
    const acquired = await openPreferredCamera(navigator.mediaDevices, preferredCamera, displayCameras, () => id === session);
    if (!acquired) return;
    if (id !== session) { acquired.getTracks().forEach(track => track.stop()); return; }
    stream = acquired;
    $('#active-camera').textContent = `目前使用：${stream.getVideoTracks()[0].label || '攝影機（瀏覽器未提供名稱）'}`;
    stream.getVideoTracks()[0].addEventListener('ended', () => { if (id === session) stopCamera('攝影機連線已中斷，請確認裝置後重新啟動。'); });
    video.srcObject = stream;
    await video.play();
    if (id !== session) return;
    $('#camera-placeholder').hidden = true;
    $('#camera-status').textContent = '正在載入手部辨識模型，首次使用可能需要一些時間…';
    await loadModel();
    if (id !== session) return;
    if (stream.getVideoTracks()[0].readyState !== 'live') throw new DOMException('攝影機連線已中斷。', 'NotReadableError');
    controller.reset();
    recalibrateEffects();
    lastFrame = -1;
    lastInference = 0;
    running = true;
    $('#camera-badge').textContent = '● 即時偵測中';
    $('#start-camera').textContent = '偵測中';
    $('#camera-status').textContent = effectsEnabled ? '特效手勢已啟用；圖片按鈕與鍵盤仍可切換。' : '手掌左右移動切換；食指回第一張，小指到最後一張。';
    animation = requestAnimationFrame(detect);
  } catch (error) {
    if (id !== session) return;
    console.error(error);
    const messages = {
      NotAllowedError: '攝影機權限未開啟，請在網址列允許後重試。',
      NotFoundError: '找不到指定的攝影機，請連接裝置或從來源選單重新選擇。',
      NotReadableError: '無法讀取攝影機，請確認是否被其他程式占用。',
      OverconstrainedError: '指定的攝影機無法開啟，請重新偵測並選擇裝置。',
    };
    const message = messages[error.name] || (stream ? '模型載入失敗，請重新整理後重試，並確認模型與執行資源完整；圖片按鈕仍可使用。' : error.message);
    stopCamera(message);
  }
}

$('#start-camera').addEventListener('click', startCamera);
$('#stop-camera').addEventListener('click', () => stopCamera());
window.addEventListener('pagehide', () => {
  stopCamera();
  localUrls.forEach(url => URL.revokeObjectURL(url));
});

async function loadGallery() {
  try {
    const response = await fetch('/api/images');
    if (!response.ok) throw new Error('無法取得圖片清單');
    const defaults = await response.json();
    // Do not replace a local selection made while the initial request was pending.
    if (!localUrls.length) { pictures = defaults; buildThumbnails(); }
  } catch (error) {
    if (!localUrls.length) {
      pictures = [];
      buildThumbnails();
      $('#image-empty').textContent = '範例圖片載入失敗，請選取自己的圖片。';
    }
    console.error(error);
  }
}
loadGallery();
