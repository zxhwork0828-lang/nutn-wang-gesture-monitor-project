// Browsers do not expose a standard built-in/external flag. Labels are hints;
// an explicit device choice always takes precedence over automatic selection.
const external = /usb|external|外接|外部|logitech|羅技|brio|c920|c922|c930|c270|creative|elgato|anker|obsbot|insta360|razer/i;
const internal = /integrated|internal|built[ -]?in|內建|内置|facetime|front|前置|後置|rear|back camera|ir camera|true.?depth/i;
const virtual = /virtual|虛擬|obs virtual|snap camera|manycam/i;

export function chooseCamera(devices, preferredId = '') {
  const cameras = devices.filter(device => device.kind === 'videoinput');
  if (preferredId) return cameras.find(device => device.deviceId === preferredId) ?? null;
  const physical = cameras.filter(device => !virtual.test(device.label));
  const candidates = physical.length ? physical : cameras;
  return candidates.find(device => external.test(device.label) && !internal.test(device.label))
    ?? candidates.filter(device => !internal.test(device.label)).at(-1)
    ?? candidates[0]
    ?? null;
}

export async function openPreferredCamera(mediaDevices, preferredId, onDevices, isCurrent = () => true) {
  let devices = await mediaDevices.enumerateDevices();
  if (!isCurrent()) return null;
  // Labels and the full list are commonly hidden until camera access is granted.
  if (!devices.some(device => device.kind === 'videoinput' && device.label)) {
    const permissionStream = await mediaDevices.getUserMedia({ video: true, audio: false });
    try {
      if (!isCurrent()) return null;
      devices = await mediaDevices.enumerateDevices();
    } finally {
      permissionStream.getTracks().forEach(track => track.stop());
    }
  }
  if (!isCurrent()) return null;
  onDevices(devices);
  const selected = chooseCamera(devices, preferredId);
  if (!selected) throw new DOMException(preferredId ? '指定的攝影機已拔除，請重新選擇。' : '找不到可用的攝影機。', 'NotFoundError');
  // exact prevents a busy/missing external camera from silently becoming internal.
  return mediaDevices.getUserMedia({
    video: { deviceId: { exact: selected.deviceId }, width: { ideal: 640 }, height: { ideal: 480 } },
    audio: false,
  });
}
