// Pure gesture logic, shared by the browser and Node's built-in test runner.
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));

function extended(points, base, pip, dip, tip) {
  const a = points[base], b = points[pip], c = points[tip];
  const ab = [a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0)];
  const cb = [c.x - b.x, c.y - b.y, (c.z ?? 0) - (b.z ?? 0)];
  const norm = Math.hypot(...ab) * Math.hypot(...cb);
  const cosine = norm ? ab.reduce((sum, v, i) => sum + v * cb[i], 0) / norm : 1;
  return cosine < -0.65 && distance(points[tip], points[0]) > distance(points[pip], points[0]) * 1.1;
}

export function classifyHand(points) {
  if (!points || points.length !== 21) return null;
  const fingers = [[5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]]
    .map(indices => extended(points, ...indices));
  // Thumb position is intentionally ignored: users can relax their thumb.
  if (fingers.every(Boolean)) return 'palm';
  if (fingers[0] && !fingers[1] && !fingers[2] && !fingers[3]) return 'index';
  if (!fingers[0] && !fingers[1] && !fingers[2] && fingers[3]) return 'pinky';
  return null;
}

export class GestureController {
  constructor({ holdMs = 500, cooldownMs = 1000, swipeWindowMs = 650, swipeDistance = 0.16 } = {}) {
    Object.assign(this, { holdMs, cooldownMs, swipeWindowMs, swipeDistance });
    this.reset();
  }

  reset() {
    this.pose = null;
    this.since = 0;
    this.lastAction = -Infinity;
    this.latched = false;
    this.samples = [];
  }

  update(pose, mirroredX, y, now) {
    if (pose !== this.pose) {
      this.pose = pose;
      this.since = now;
      this.samples = [];
      this.latched = false;
    }
    if (now - this.lastAction < this.cooldownMs) {
      this.samples = [];
      this.since = now;
      return null;
    }
    let action = null;
    if ((pose === 'index' || pose === 'pinky') && !this.latched && now - this.since >= this.holdMs) {
      action = pose === 'index' ? 'first' : 'last';
      this.latched = true;
    } else if (pose === 'palm') {
      this.samples.push({ x: mirroredX, y, at: now });
      this.samples = this.samples.filter(sample => now - sample.at <= this.swipeWindowMs);
      const first = this.samples[0];
      const dx = mirroredX - first.x;
      const dy = y - first.y;
      // Require sustained, mainly horizontal movement rather than frame jitter.
      if (now - first.at >= 120 && Math.abs(dx) >= this.swipeDistance && Math.abs(dy) < Math.abs(dx) * 0.7) {
        action = dx < 0 ? 'previous' : 'next';
        this.samples = [];
      }
    }
    if (action) this.lastAction = now;
    return action;
  }
}

export function nextIndex(current, action, count) {
  if (!count) return 0;
  if (action === 'first') return 0;
  if (action === 'last') return count - 1;
  if (action === 'previous') return Math.max(0, current - 1);
  if (action === 'next') return Math.min(count - 1, current + 1);
  return Math.min(Math.max(0, current), count - 1);
}
