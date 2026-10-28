import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseCamera, openPreferredCamera } from '../static/cameras.mjs';

const camera = (deviceId, label) => ({ kind: 'videoinput', deviceId, label });
const builtin = camera('internal', 'Integrated Camera');
const usb = camera('usb', 'USB Camera');

test('auto selection prefers external over the built-in default and virtual devices', () => {
  assert.equal(chooseCamera([builtin, camera('virtual', 'OBS Virtual Camera'), usb]), usb);
  assert.equal(chooseCamera([camera('generic', 'HD Camera'), usb]), usb);
  assert.equal(chooseCamera([builtin, camera('external', 'HD Webcam')]).deviceId, 'external');
  assert.equal(chooseCamera([builtin]), builtin);
  assert.equal(chooseCamera([]), null);
});

test('an explicit selection wins and a missing saved camera does not silently fall back', () => {
  assert.equal(chooseCamera([builtin, usb], 'internal'), builtin);
  assert.equal(chooseCamera([builtin], 'usb'), null);
});

test('permission probe is stopped before opening the exact external device', async () => {
  let enumerations = 0;
  let stopped = false;
  const calls = [];
  const actual = {};
  const media = {
    enumerateDevices: async () => ++enumerations === 1 ? [camera('internal', '')] : [builtin, usb],
    getUserMedia: async constraints => {
      calls.push(constraints);
      if (constraints.video === true) return { getTracks: () => [{ stop: () => { stopped = true; } }] };
      assert.equal(stopped, true);
      return actual;
    },
  };
  assert.equal(await openPreferredCamera(media, '', () => {}), actual);
  assert.equal(calls[1].video.deviceId.exact, 'usb');
  assert.equal(calls[1].audio, false);
});

test('cancellation during permission request releases the probe and does not reopen', async () => {
  let current = true, stopped = false, opens = 0;
  const media = {
    enumerateDevices: async () => [camera('internal', '')],
    getUserMedia: async () => {
      opens++;
      current = false;
      return { getTracks: () => [{ stop: () => { stopped = true; } }] };
    },
  };
  assert.equal(await openPreferredCamera(media, '', () => {}, () => current), null);
  assert.equal(stopped, true);
  assert.equal(opens, 1);
});

test('a busy external device reports the error without silently opening the built-in camera', async () => {
  const calls = [];
  const media = {
    enumerateDevices: async () => [builtin, usb],
    getUserMedia: async constraints => { calls.push(constraints); throw new DOMException('busy', 'NotReadableError'); },
  };
  await assert.rejects(openPreferredCamera(media, '', () => {}), { name: 'NotReadableError' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].video.deviceId.exact, 'usb');
});
