import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultTransform, measureHand, TransformController, angleDelta, transformStyle } from '../static/transforms.mjs';

const measurement = (values = {}) => ({ facing: 0.8, rotation: 0, gap: 1, centerY: 0.5, ...values });

test('front/back transitions require stable orientation and flip only once per transition', () => {
  const control = new TransformController();
  control.update(measurement(), 0);
  assert.equal(control.update(measurement({ facing: -0.8 }), 100).flipped, false);
  assert.equal(control.update(measurement({ facing: -0.8 }), 300).flipped, false);
  assert.equal(control.update(measurement({ facing: -0.8 }), 360).value.mirrored, true);
  assert.equal(control.update(measurement({ facing: -0.8 }), 900).flipped, false);
  control.update(measurement(), 1000);
  assert.equal(control.update(measurement(), 1260).value.mirrored, false);
});

test('side-on frames and brief reversed noise do not count as flips', () => {
  const control = new TransformController();
  control.update(measurement(), 0);
  control.update(measurement({ facing: -0.8 }), 100);
  assert.equal(control.update(measurement({ facing: 0.02 }), 200), null);
  control.update(measurement({ facing: -0.8 }), 300);
  assert.equal(control.update(measurement(), 350).value.mirrored, false);
});

test('rotation, pinch distance, and vertical position smoothly change the image', () => {
  const control = new TransformController();
  control.update(measurement(), 0);
  let result;
  for (let time = 50; time <= 500; time += 50) result = control.update(measurement({ rotation: 60, gap: 2, centerY: 0.8 }), time);
  assert.ok(result.value.rotation > 50 && result.value.rotation < 60);
  assert.ok(result.value.scale > 1.9 && result.value.scale < 2);
  assert.ok(result.value.opacity < 0.5 && result.value.opacity > 0.45);
});

test('hand loss and recalibration preserve effects rather than flipping on re-entry', () => {
  const value = { mirrored: true, rotation: 30, scale: 1.4, opacity: 0.6 };
  const control = new TransformController();
  control.reset(value);
  control.update(measurement(), 0);
  assert.equal(control.update(null, 1000), null);
  const reentered = control.update(measurement({ facing: -0.8, rotation: 90, gap: 3, centerY: 0.2 }), 1100);
  assert.deepEqual(reentered.value, value);
  assert.equal(reentered.flipped, false);
});

test('effect limits prevent invisible or extreme transforms and invalid measurements are ignored', () => {
  const control = new TransformController();
  control.update(measurement(), 0);
  for (let time = 50; time <= 1000; time += 50) control.update(measurement({ rotation: 175, gap: 100, centerY: 10 }), time);
  assert.ok(control.value.scale <= 2.5);
  assert.ok(control.value.opacity >= 0.15);
  assert.ok(control.value.rotation <= 180);
  assert.equal(control.update(measurement({ gap: NaN }), 1100), null);
  control.reset();
  assert.deepEqual(control.value, defaultTransform());
  assert.equal(angleDelta(-179, 179), 2);
});

function hand() {
  const p = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  p[0] = { x: 0.5, y: 0.8, z: 0 };
  p[5] = { x: 0.38, y: 0.6, z: 0 };
  p[9] = { x: 0.5, y: 0.55, z: 0 };
  p[17] = { x: 0.65, y: 0.65, z: 0 };
  p[4] = { x: 0.3, y: 0.4, z: 0 };
  p[8] = { x: 0.4, y: 0.2, z: 0 };
  return p;
}

test('landmarks normalize pinch by palm size and detect opposite facing', () => {
  const points = hand();
  const normal = measureHand(points);
  const larger = measureHand(points.map(p => ({ x: 0.5 + (p.x - 0.5) * 1.5, y: 0.5 + (p.y - 0.5) * 1.5, z: 0 })));
  const reversed = measureHand(points.map(p => ({ ...p, x: 1 - p.x })));
  assert.ok(Math.abs(normal.gap - larger.gap) < 1e-10);
  assert.ok(normal.facing * reversed.facing < 0);
  assert.ok(Math.abs(normal.rotation) < 1e-10);
  assert.equal(measureHand(undefined), null);
  assert.equal(measureHand(Array(21).fill({ x: 0.5, y: 0.5 })), null);
});

test('CSS composes rotation, scale and horizontal mirror without transforming the controls', () => {
  assert.equal(transformStyle({ mirrored: true, rotation: 45, scale: 1.5, opacity: 0.5 }), 'rotate(45deg) scale(1.5) scaleX(-1)');
});
