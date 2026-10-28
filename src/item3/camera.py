"""Camera capture isolated from the notebook's event loop and native driver hangs."""

import asyncio
import multiprocessing as mp
import queue
import sys
import time


def _capture(index, backend, frames, stopped):
    import cv2

    cap = None
    try:
        cap = cv2.VideoCapture(index, backend)
        if not cap.isOpened():
            frames.put(('error', f'無法開啟攝影機 {index}'))
            return
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        while not stopped.is_set():
            ok, frame = cap.read()
            if not ok:
                frames.put(('error', '無法讀取攝影機影像'))
                return
            try:
                frames.put_nowait(('frame', frame))
            except queue.Full:
                pass
    except Exception as error:
        frames.put(('error', str(error)))
    finally:
        if cap is not None:
            cap.release()


async def camera_frames(index, stop_event, status, open_timeout=8.0,
                        read_timeout=5.0, max_seconds=60.0):
    """Yield frames; stop or kill a capture process even if its driver blocks."""
    import cv2

    context = mp.get_context('spawn')
    backends = [('DirectShow', cv2.CAP_DSHOW), ('MSMF', cv2.CAP_MSMF)] \
        if sys.platform == 'win32' else [('預設', cv2.CAP_ANY)]
    started = time.monotonic()
    failures = []
    for name, backend in backends:
        if stop_event.is_set() or time.monotonic() - started >= max_seconds:
            return
        frames = context.Queue(maxsize=2)
        stopped = context.Event()
        process = context.Process(target=_capture, args=(index, backend, frames, stopped),
                                  daemon=True)
        received = False
        try:
            process.start()
            status.value = f'正在開啟攝影機 {index}（{name}，最多 {open_timeout:g} 秒）…'
            deadline = time.monotonic() + open_timeout
            while not stop_event.is_set():
                if time.monotonic() - started >= max_seconds:
                    return
                try:
                    kind, payload = frames.get_nowait()
                except queue.Empty:
                    if time.monotonic() >= deadline or not process.is_alive():
                        if received:
                            raise TimeoutError('攝影機影像讀取中斷或逾時，已釋放裝置。')
                        failures.append(f'{name}：開啟失敗或逾時')
                        break
                    await asyncio.sleep(0.03)
                    continue
                if kind == 'error':
                    if received:
                        raise OSError(payload)
                    failures.append(f'{name}：{payload}')
                    break
                received = True
                yield payload
                deadline = time.monotonic() + read_timeout
                await asyncio.sleep(0)
        finally:
            stopped.set()
            if process.pid is not None:
                # Give normal release a chance without blocking widget callbacks.
                until = time.monotonic() + 0.3
                while process.is_alive() and time.monotonic() < until:
                    await asyncio.sleep(0.03)
                if process.is_alive():
                    process.terminate()
                process.join(timeout=0.5)
                if process.is_alive():
                    process.kill()
                    process.join(timeout=0.5)
                process.close()
            frames.cancel_join_thread()
            frames.close()
        if received or stop_event.is_set():
            return
    raise OSError('；'.join(failures) + '。請檢查 CAMERA_INDEX、Windows 相機權限及其他程式占用。')
