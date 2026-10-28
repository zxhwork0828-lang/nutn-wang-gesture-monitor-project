import test from 'node:test';
import assert from 'node:assert/strict';
import { GestureController, classifyHand, nextIndex } from '../static/gestures.mjs';

test('mirrored swipes follow the displayed direction and obey cooldown', () => {
  const controller = new GestureController();
  assert.equal(controller.update('palm', 0.5, 0.5, 0), null);
  assert.equal(controller.update('palm', 0.3, 0.5, 200), 'previous');
  assert.equal(controller.update('palm', 0.6, 0.5, 400), null);
  assert.equal(controller.update('palm', 0.3, 0.5, 1250), null);
  assert.equal(controller.update('palm', 0.5, 0.5, 1450), 'next');
});

test('small jitter, vertical movement, and tracking gaps do not cause swipes', () => {
  const controller = new GestureController();
  controller.update('palm', 0.5, 0.5, 0);
  assert.equal(controller.update('palm', 0.52, 0.5, 200), null);
  assert.equal(controller.update('palm', 0.7, 0.9, 400), null);
  controller.update(null, 0, 0, 500);
  assert.equal(controller.update('palm', 0.1, 0.5, 600), null);
});

test('finger gestures require a hold and release before repeating', () => {
  const controller = new GestureController();
  assert.equal(controller.update('index', 0.5, 0.5, 0), null);
  assert.equal(controller.update('index', 0.5, 0.5, 400), null);
  assert.equal(controller.update('index', 0.5, 0.5, 500), 'first');
  assert.equal(controller.update('index', 0.5, 0.5, 2000), null);
  controller.update(null, 0, 0, 2100);
  controller.update('pinky', 0.5, 0.5, 2200);
  assert.equal(controller.update('pinky', 0.5, 0.5, 2700), 'last');
});

test('navigation stops at gallery boundaries and handles an empty gallery', () => {
  assert.equal(nextIndex(0, 'previous', 5), 0);
  assert.equal(nextIndex(4, 'next', 5), 4);
  assert.equal(nextIndex(2, 'first', 5), 0);
  assert.equal(nextIndex(2, 'last', 5), 4);
  assert.equal(nextIndex(0, 'next', 0), 0);
  assert.equal(nextIndex(0, 'last', 1), 0);
});

function hand(fingers) {
  const points = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.9, z: 0 }));
  [[5,6,7,8], [9,10,11,12], [13,14,15,16], [17,18,19,20]].forEach((indices, i) => {
    indices.forEach((index, joint) => {
      points[index] = { x: 0.3 + i * 0.12, y: fingers[i] ? 0.7 - joint * 0.14 : [0.7, 0.55, 0.68, 0.77][joint], z: 0 };
    });
  });
  return points;
}

test('landmark geometry distinguishes palm, index, pinky and unknown poses', () => {
  assert.equal(classifyHand(hand([true,true,true,true])), 'palm');
  assert.equal(classifyHand(hand([true,false,false,false])), 'index');
  assert.equal(classifyHand(hand([false,false,false,true])), 'pinky');
  assert.equal(classifyHand(hand([true,true,false,false])), null);
  assert.equal(classifyHand(hand([false,false,false,false])), null);
  assert.equal(classifyHand(undefined), null);
  const rotated = hand([false,false,false,true]).map(p => ({ x: 1 - p.y, y: p.x, z: p.z }));
  assert.equal(classifyHand(rotated), 'pinky');
});
