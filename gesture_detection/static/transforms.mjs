// Relative hand measurements keep the existing navigation gestures independent.
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const defaultTransform = () => ({ mirrored: false, rotation: 0, scale: 1, opacity: 1 });
export const angleDelta = (angle, reference) => ((angle - reference + 540) % 360) - 180;
const length = point => Math.hypot(point.x, point.y, point.z);
const subtract = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });

export function measureHand(points, aspect = 4 / 3) {
  if (!points || points.length !== 21 || !Number.isFinite(aspect) || aspect <= 0) return null;
  if (points.some(point => !point || ![point.x, point.y, point.z ?? 0].every(Number.isFinite))) return null;
  // Normalized x and z use image width; y uses image height.
  const p = points.map(point => ({ x: point.x * aspect, y: point.y, z: (point.z ?? 0) * aspect }));
  const index = subtract(p[5], p[0]);
  const pinky = subtract(p[17], p[0]);
  const axis = subtract(p[9], p[0]);
  const palmWidth = length(subtract(p[5], p[17]));
  const normalizer = length(index) * length(pinky);
  if (normalizer < 0.00001 || palmWidth < 0.015 || Math.hypot(axis.x, axis.y) < 0.015) return null;
  return {
    // Only changes relative to the first stable view matter; left/right hands
    // need no hard-coded palm/back label or potentially unstable handedness ID.
    facing: (index.x * pinky.y - index.y * pinky.x) / normalizer,
    rotation: Math.atan2(-axis.x, -axis.y) * 180 / Math.PI,
    gap: length(subtract(p[4], p[8])) / palmWidth,
    centerY: [0, 5, 9, 13, 17].reduce((sum, index) => sum + points[index].y / 5, 0),
  };
}

export class TransformController {
  constructor({ flipHoldMs = 250, facingThreshold = 0.22, lostMs = 750, smoothMs = 120 } = {}) {
    Object.assign(this, { flipHoldMs, facingThreshold, lostMs, smoothMs });
    this.reset();
  }

  reset(value = defaultTransform()) {
    this.value = { ...value };
    this.anchor = null;
    this.lastSeen = null;
    this.lastUpdate = null;
    this.side = null;
    this.candidate = null;
    this.candidateSince = 0;
  }

  update(measurement, now) {
    if (!measurement || !['facing', 'rotation', 'gap', 'centerY'].every(key => Number.isFinite(measurement[key])) || Math.abs(measurement.facing) < this.facingThreshold) {
      this.candidate = null;
      if (this.lastSeen !== null && now - this.lastSeen > this.lostMs) this.reset(this.value);
      return null;
    }
    if (this.lastSeen !== null && now - this.lastSeen > this.lostMs) this.reset(this.value);
    this.lastSeen = now;
    const side = Math.sign(measurement.facing);
    if (!this.anchor) {
      this.anchor = { ...measurement, gap: Math.max(0.15, measurement.gap), value: { ...this.value } };
      this.side = side;
      this.lastUpdate = now;
      return { value: { ...this.value }, flipped: false };
    }
    let flipped = false;
    if (side === this.side) {
      this.candidate = null;
    } else if (this.candidate !== side) {
      this.candidate = side;
      this.candidateSince = now;
    } else if (now - this.candidateSince >= this.flipHoldMs) {
      this.value.mirrored = !this.value.mirrored;
      this.side = side;
      this.candidate = null;
      flipped = true;
    }
    // Do not move the continuous controls while passing through an uncertain flip.
    if (this.candidate !== null) return { value: { ...this.value }, flipped: false };
    const alpha = 1 - Math.exp(-Math.min(100, Math.max(0, now - this.lastUpdate)) / this.smoothMs);
    this.lastUpdate = now;
    const targets = {
      rotation: clamp(this.anchor.value.rotation + angleDelta(measurement.rotation, this.anchor.rotation), -180, 180),
      scale: clamp(this.anchor.value.scale * Math.max(0.15, measurement.gap) / this.anchor.gap, 0.5, 2.5),
      opacity: clamp(this.anchor.value.opacity + (this.anchor.centerY - measurement.centerY) * 1.8, 0.15, 1),
    };
    for (const key of ['rotation', 'scale', 'opacity']) this.value[key] += (targets[key] - this.value[key]) * alpha;
    return { value: { ...this.value }, flipped };
  }
}

export function transformStyle(value) {
  return `rotate(${value.rotation}deg) scale(${value.scale}) scaleX(${value.mirrored ? -1 : 1})`;
}
