import type { ShapeLayer } from '@/lib/types';

/**
 * Game interface pieces that are drawn, not assembled: a bar with studs and a "remaining" section, a button,
 * a key, a key ring. Each is painted here from the layer's own colours, at whatever size the layer is.
 *
 * The look is the one hand-made Roblox thumbnail assets have: flat, saturated colour inside a thick black
 * outline, and nothing else. No gradients, bevels or shine unless asked for; those are what make a piece
 * look generated.
 */

type Ctx = CanvasRenderingContext2D;

const round = (ctx: Ctx, x: number, y: number, w: number, h: number, r: number) => {
  ctx.beginPath();
  ctx.roundRect(x, y, Math.max(0, w), Math.max(0, h), Math.max(0, Math.min(r, w / 2, h / 2)));
};

/**
 * Roblox studs: two rows of small squares pressed into the surface, each with a dark edge on two sides and a
 * light edge on the other two. Measured against a 131-pixel-tall studded bar: squares 0.29 of the height,
 * 0.54 apart, rows centred 0.21 and 0.76 of the way down.
 */
function studs(ctx: Ctx, x: number, y: number, w: number, h: number, shift = 0) {
  const size = h * 0.29, pitch = h * 0.54, line = Math.max(1.5, h * 0.03), r = size * 0.16;
  ctx.lineWidth = line;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const centre of [0.21, 0.76]) {
    const sy = y + h * centre - size / 2;
    for (let sx = x + pitch * 0.42 + (shift % pitch) - pitch; sx < x + w; sx += pitch) {
      ctx.fillStyle = 'rgba(0,0,0,0.05)';
      round(ctx, sx, sy, size, size, r);
      ctx.fill();
      // Dark along the left and the bottom, light along the top and the right.
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.moveTo(sx, sy + r);
      ctx.lineTo(sx, sy + size - r);
      ctx.quadraticCurveTo(sx, sy + size, sx + r, sy + size);
      ctx.lineTo(sx + size - r, sy + size);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.beginPath();
      ctx.moveTo(sx + r, sy);
      ctx.lineTo(sx + size - r, sy);
      ctx.quadraticCurveTo(sx + size, sy, sx + size, sy + r);
      ctx.lineTo(sx + size, sy + size - r);
      ctx.stroke();
    }
  }
}

/** A band of light across the upper part. Off unless the layer asks for it. */
function shine(ctx: Ctx, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  round(ctx, x + h * 0.14, y + h * 0.1, w - h * 0.28, h * 0.3, h * 0.15);
  ctx.fill();
}

/** The inside of an outlined piece: everything drawn by `paint` is kept within the rounded inner edge. */
function inside(ctx: Ctx, l: ShapeLayer, r: number, paint: (x: number, y: number, w: number, h: number, r: number) => void) {
  const s = Math.min(l.strokeWidth, l.width / 3, l.height / 3);
  const x = s, y = s, w = l.width - s * 2, h = l.height - s * 2, inner = Math.max(0, r - s);
  // The outline is the whole shape in the outline colour, with the inside painted over it.
  if (s > 0) {
    ctx.fillStyle = l.stroke;
    round(ctx, 0, 0, l.width, l.height, r);
    ctx.fill();
  }
  ctx.save();
  round(ctx, x, y, w, h, inner);
  ctx.clip();
  paint(x, y, w, h, inner);
  ctx.restore();
}

/** One flat colour, or a fade from top to bottom when the layer has a second one. */
function face(ctx: Ctx, l: ShapeLayer, x: number, y: number, w: number, h: number, fallback: string) {
  if (l.fill2 && l.fill2 !== l.fill) {
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, l.fill || fallback);
    g.addColorStop(1, l.fill2);
    ctx.fillStyle = g;
  } else ctx.fillStyle = l.fill || fallback;
  ctx.fillRect(x, y, w, h);
}

const WIDGETS: Record<string, (ctx: Ctx, l: ShapeLayer) => void> = {
  // A health, money or progress bar: the filled part in one colour, what is left in another.
  bar(ctx, l) {
    const r = l.radius ?? l.height / 2;
    inside(ctx, l, r, (x, y, w, h, inner) => {
      const filled = (w * Math.min(100, Math.max(0, l.value ?? 68))) / 100;
      ctx.fillStyle = l.fill2 ?? '#FF1E1E';
      ctx.fillRect(x, y, w, h);
      if (l.studs !== false) studs(ctx, x, y, w, h);
      // The filled part is the same rounded bar slid in from the left, so it ends in a rounded cap.
      ctx.save();
      round(ctx, x + filled - w, y, w, h, inner);
      ctx.clip();
      ctx.fillStyle = l.fill || '#2BFF14';
      ctx.fillRect(x, y, filled, h);
      if (l.studs !== false) studs(ctx, x, y, filled, h);
      ctx.restore();
      if (l.gloss) shine(ctx, x, y, w, h);
    });
  },
  // A flat button, the way Roblox game menus draw them.
  button(ctx, l) {
    const r = l.radius ?? l.height * 0.24;
    inside(ctx, l, r, (x, y, w, h) => {
      face(ctx, l, x, y, w, h, '#1E90FF');
      if (l.studs) studs(ctx, x, y, w, h);
      if (l.gloss) shine(ctx, x, y, w, h);
    });
  },
  // The see-through plate behind an on-screen prompt.
  panel(ctx, l) {
    const r = l.radius ?? l.height * 0.12;
    const whole = ctx.globalAlpha;
    // The plate and its edge are both see-through, on top of whatever opacity the layer itself has.
    ctx.globalAlpha = whole * 0.62;
    ctx.fillStyle = l.fill || '#8C8C8C';
    round(ctx, 0, 0, l.width, l.height, r);
    ctx.fill();
    if (l.strokeWidth > 0) {
      ctx.globalAlpha = whole * 0.5;
      ctx.strokeStyle = l.stroke;
      ctx.lineWidth = l.strokeWidth;
      round(ctx, l.strokeWidth / 2, l.strokeWidth / 2, l.width - l.strokeWidth, l.height - l.strokeWidth, r - l.strokeWidth / 2);
      ctx.stroke();
    }
    ctx.globalAlpha = whole;
  },
  // A square key, as Roblox shows the key to press.
  keycap(ctx, l) {
    const r = l.radius ?? l.height * 0.2;
    inside(ctx, l, r, (x, y, w, h) => {
      face(ctx, l, x, y, w, h, '#FFFFFF');
      if (l.gloss) shine(ctx, x, y, w, h);
    });
  },
  // A thin ring with the key's letter inside it: the hold-to-interact prompt.
  'key-ring'(ctx, l) {
    const cx = l.width / 2, cy = l.height / 2, s = l.strokeWidth;
    const band = Math.min(l.width, l.height) * 0.045;
    const radius = Math.min(l.width, l.height) / 2 - s - band / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    if (l.fill2) {
      ctx.fillStyle = l.fill2;
      ctx.fill();
    }
    if (s > 0) {
      ctx.lineWidth = band + s * 2;
      ctx.strokeStyle = l.stroke;
      ctx.stroke();
    }
    ctx.lineWidth = band;
    ctx.strokeStyle = l.fill || '#FFFFFF';
    ctx.stroke();
  },
};

// ---- effects: light and motion laid over or behind the scene. They have no outline and fade into nothing.

/** `#RRGGBB` with an alpha, for fades. Anything else is used as it is. */
const clear = (colour: string, alpha: number) => (/^#[0-9a-f]{6}$/i.test(colour) ? colour + Math.round(alpha * 255).toString(16).padStart(2, '0') : colour);
/** The same number for the same input, so an effect does not reshuffle every time it is redrawn. */
const noise = (i: number) => { const v = Math.sin(i * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };

Object.assign(WIDGETS, {
  // Wedges of light from the middle, bright at the centre and gone by the edge.
  sunrays(ctx, l) {
    const count = Math.max(4, Math.round(l.value ?? 12)), colour = l.fill || '#FFFFFF';
    const R = Math.max(l.width, l.height) / 2, step = (Math.PI * 2) / count;
    ctx.save();
    ctx.translate(l.width / 2, l.height / 2);
    ctx.scale(l.width / (R * 2), l.height / (R * 2));
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
    g.addColorStop(0, clear(colour, 1));
    g.addColorStop(0.55, clear(colour, 0.7));
    g.addColorStop(1, clear(colour, 0));
    ctx.fillStyle = g;
    for (let i = 0; i < count; i++) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, R, i * step - Math.PI / 2, i * step - Math.PI / 2 + step / 2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  },
  // Thin streaks rushing in from every edge, leaving the middle clear for the subject.
  speedlines(ctx, l) {
    const count = Math.max(8, Math.round(l.value ?? 70));
    const cx = l.width / 2, cy = l.height / 2, rx = l.width * 0.78, ry = l.height * 0.78;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, l.width, l.height);
    ctx.clip();
    ctx.fillStyle = l.fill || '#FFFFFF';
    for (let i = 0; i < count; i++) {
      const angle = ((i + noise(i) * 0.8) / count) * Math.PI * 2;
      const tip = 0.5 + noise(i + 99) * 0.34, half = 0.004 + noise(i + 7) * 0.014;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * rx * tip, cy + Math.sin(angle) * ry * tip);
      ctx.lineTo(cx + Math.cos(angle - half) * rx * 1.3, cy + Math.sin(angle - half) * ry * 1.3);
      ctx.lineTo(cx + Math.cos(angle + half) * rx * 1.3, cy + Math.sin(angle + half) * ry * 1.3);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  },
  // Darkness creeping in from the corners.
  vignette(ctx, l) {
    const colour = l.fill || '#000000', R = Math.max(l.width, l.height) / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, l.width, l.height);
    ctx.clip();
    ctx.translate(l.width / 2, l.height / 2);
    ctx.scale(l.width / (R * 2), l.height / (R * 2));
    const g = ctx.createRadialGradient(0, 0, R * 0.55, 0, 0, R * 1.42);
    g.addColorStop(0, clear(colour, 0));
    g.addColorStop(1, clear(colour, 0.95));
    ctx.fillStyle = g;
    ctx.fillRect(-R * 1.5, -R * 1.5, R * 3, R * 3);
    ctx.restore();
  },
  // The soft dark patch under a character that makes it stand on the ground.
  blob(ctx, l) {
    const colour = l.fill || '#000000', R = Math.max(l.width, l.height) / 2;
    ctx.save();
    ctx.translate(l.width / 2, l.height / 2);
    ctx.scale(l.width / (R * 2), l.height / (R * 2));
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
    g.addColorStop(0, clear(colour, 0.75));
    g.addColorStop(0.6, clear(colour, 0.45));
    g.addColorStop(1, clear(colour, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  },
  // A cone of light from above.
  spotlight(ctx, l) {
    const colour = l.fill || '#FFF6C8';
    const g = ctx.createLinearGradient(0, 0, 0, l.height);
    g.addColorStop(0, clear(colour, 0.95));
    g.addColorStop(1, clear(colour, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(l.width * 0.36, 0);
    ctx.lineTo(l.width * 0.64, 0);
    ctx.lineTo(l.width, l.height);
    ctx.lineTo(0, l.height);
    ctx.closePath();
    ctx.fill();
  },
} satisfies Record<string, (ctx: Ctx, l: ShapeLayer) => void>);

// ---- drawings in two colours: Roblox's on-screen controls

/** Draws on a fixed grid, stretched to the layer. Line widths inside are in grid units. */
const onGrid = (ctx: Ctx, l: ShapeLayer, gw: number, gh: number, draw: () => void) => {
  ctx.save();
  ctx.scale(l.width / gw, l.height / gh);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  draw();
  ctx.restore();
};
const disc = (ctx: Ctx, x: number, y: number, r: number) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); };
const trace = (ctx: Ctx, d: string) => new Path2D(d);

/** A round touch control: the dark disc with a faint ring that Roblox puts on a phone screen. */
function touchDisc(ctx: Ctx, l: ShapeLayer, inner: (fg: string) => void) {
  const fg = l.fill2 ?? '#7F9BBF';
  onGrid(ctx, l, 100, 100, () => {
    ctx.fillStyle = l.fill || '#1B3250';
    disc(ctx, 50, 50, 50);
    ctx.fill();
    ctx.strokeStyle = clear(fg, 0.7);
    ctx.lineWidth = 2.2;
    disc(ctx, 50, 50, 44);
    ctx.stroke();
    inner(fg);
  });
}
/** A top-bar button: a dark rounded tile with a white drawing on it. */
function tile(ctx: Ctx, l: ShapeLayer, inner: (fg: string) => void) {
  const fg = l.fill2 ?? '#FFFFFF';
  onGrid(ctx, l, 100, 100, () => {
    ctx.fillStyle = l.fill || '#1B3250';
    round(ctx, 0, 0, 100, 100, 22);
    ctx.fill();
    ctx.strokeStyle = fg;
    ctx.fillStyle = fg;
    ctx.lineWidth = 3.4;
    inner(fg);
  });
}
/** The voice-chat bubble over a player's head, with the microphone on or struck through. */
function mic(ctx: Ctx, l: ShapeLayer, muted: boolean) {
  onGrid(ctx, l, 100, 100, () => {
    ctx.fillStyle = l.fill || '#E3E5E8';
    ctx.fill(trace(ctx, 'M18 2 H82 Q98 2 98 18 V70 Q98 86 82 86 H62 L50 100 L38 86 H18 Q2 86 2 70 V18 Q2 2 18 2 Z'));
    const live = muted ? '#4A5260' : (l.fill2 ?? '#27C489');
    ctx.fillStyle = live;
    round(ctx, 40, 22, 20, 36, 10);
    ctx.fill();
    // The darker cap of the microphone.
    ctx.save();
    ctx.beginPath();
    ctx.rect(38, 20, 24, 13);
    ctx.clip();
    ctx.fillStyle = '#4A5260';
    round(ctx, 40, 22, 20, 36, 10);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = live;
    ctx.lineWidth = 3.4;
    ctx.stroke(trace(ctx, 'M33 46 Q33 66 50 66 Q67 66 67 46 M50 66 V74 M41 75 H59'));
    if (muted) {
      ctx.strokeStyle = l.fill2 ?? '#E0425A';
      ctx.lineWidth = 5;
      ctx.stroke(trace(ctx, 'M35 25 L66 62'));
    }
  });
}

Object.assign(WIDGETS, {
  'ui-jump': (ctx, l) => touchDisc(ctx, l, (fg) => {
    ctx.fillStyle = fg;
    ctx.fill(trace(ctx, 'M50 29 L66 47 Q68 50 64 50 H57 V60 H43 V50 H36 Q32 50 34 47 Z'));
    ctx.strokeStyle = fg;
    ctx.lineWidth = 2;
    ctx.stroke(trace(ctx, 'M42 66 H58'));
  }),
  'ui-stick': (ctx, l) => touchDisc(ctx, l, (fg) => {
    ctx.fillStyle = fg;
    disc(ctx, 50, 50, 22);
    ctx.fill();
  }),
  'ui-chat': (ctx, l) => tile(ctx, l, () => ctx.stroke(trace(ctx, 'M30 28 H70 Q76 28 76 34 V62 Q76 68 70 68 H24 V34 Q24 28 30 28 Z M34 41 H66 M34 50 H66 M34 59 H48'))),
  'ui-menu': (ctx, l) => tile(ctx, l, () => {
    disc(ctx, 50, 50, 30);
    ctx.stroke();
    for (const x of [38, 50, 62]) { disc(ctx, x, 50, 3.2); ctx.fill(); }
  }),
  'ui-mic': (ctx, l) => mic(ctx, l, false),
  'ui-mic-off': (ctx, l) => mic(ctx, l, true),
} satisfies Record<string, (ctx: Ctx, l: ShapeLayer) => void>);

/** Drawings in two colours, each with its own names for them. */
export const TWO_TONE: Record<string, [string, string, string]> = {
  'ui-jump': ['Button colour', 'Icon colour', '#7F9BBF'],
  'ui-stick': ['Button colour', 'Stick colour', '#7F9BBF'],
  'ui-chat': ['Button colour', 'Icon colour', '#FFFFFF'],
  'ui-menu': ['Button colour', 'Icon colour', '#FFFFFF'],
  'ui-mic': ['Bubble colour', 'Microphone colour', '#27C489'],
  'ui-mic-off': ['Bubble colour', 'Strike colour', '#E0425A'],
};

/** Pieces that are see-through or have no solid body: no outline, no corners, and nothing solid drawn under them. */
export const SOFT = new Set(['key-ring', 'panel', 'sunrays', 'speedlines', 'vignette', 'blob', 'spotlight', ...Object.keys(TWO_TONE)]);
/** Effects and drawings: they take colours (and, for some, a count), but have no outline or corners to set. */
export const EFFECTS = new Set(['sunrays', 'speedlines', 'vignette', 'blob', 'spotlight', ...Object.keys(TWO_TONE)]);
export const isWidget = (shape: string) => shape in WIDGETS;
export const drawWidget = (ctx: Ctx, layer: ShapeLayer) => WIDGETS[layer.shape]?.(ctx, layer);
