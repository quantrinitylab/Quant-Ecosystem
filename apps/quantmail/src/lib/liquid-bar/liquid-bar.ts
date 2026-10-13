/**
 * LiquidBar — the Quant Workplace "connected tab".
 *
 * A glass bar whose active segment rises out of it as ONE connected shape: a
 * raised top, a liquid meniscus where it meets the bar, S-curve sides that pour
 * into the far edge, and end tabs that swallow the bar's rounded corner. The tab
 * slides between segments on two springs (the leading edge stiffer than the
 * trailing one), so it stretches like a drop while it travels and settles on
 * arrival. The same shape serves the mobile app switcher, the mobile bottom tab
 * bar and the desktop app rail (vertical).
 *
 * Framework-free on purpose: React owns the buttons, this class owns one empty
 * layer element behind them (see `components/workplace/LiquidTrack.tsx`). It
 * draws into an SVG plus one backdrop-blurred glass div, animates only while
 * the tab is moving (no idle rAF), and snaps under prefers-reduced-motion.
 *
 * Geometry is built in bar space: u runs along the bar (0..L), v across it
 * (0 = the edge the tab rises from, T = the far edge). The tab lives at v < 0.
 * 'h' maps (u, v) -> (x, y); 'v' (desktop rail, tab rising towards the content
 * on the left) maps (u, v) -> (x = v, y = u).
 *
 * Colour comes from CSS: `--lq-accent` when set on an ancestor, else the
 * shell's per-app `--app-accent`; styles live in `app/workplace.css`.
 */
export interface LiquidConfig {
  orient: 'h' | 'v';
  count: number;
  thickness: number;
  radius: number;
  lift: number;
  /** Padding between the bar ends and the first/last segment. */
  pad?: number;
  /** Half-width of the tab top, as a fraction of the segment length. */
  top?: number;
  /** How far the tab's feet flare past its top corners, as a fraction of the segment length. */
  flare?: number;
  /** Upper bound for the flare in px, so bars with few, wide segments keep their feet off the neighbours. */
  flareMax?: number;
  /** Meniscus size where the raised tab meets the bar edge (px). */
  shoulder?: number;
  floor?: boolean;
  dividers?: boolean;
}

let uid = 0;
const NS = 'http://www.w3.org/2000/svg';
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
function sstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0 || 1), 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}
const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

class Edge {
  x = 0;
  v = 0;
  t = 0;
  step(dt: number, k: number, z: number): void {
    const w = Math.sqrt(k);
    const a = k * (this.t - this.x) - 2 * z * w * this.v;
    this.v += a * dt;
    this.x += this.v * dt;
  }
  snap(x: number): void {
    this.x = this.t = x;
    this.v = 0;
  }
}

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
}

export class LiquidBar {
  readonly host: HTMLElement;
  readonly cfg: Required<LiquidConfig>;
  count: number;
  index = 0;
  L = 0;
  private readonly a = new Edge();
  private readonly b = new Edge();
  private raf = 0;
  private last = 0;
  private readonly id = ++uid;
  private readonly svg: SVGSVGElement;
  private readonly glass: HTMLDivElement;
  private readonly floorEl: HTMLDivElement | null;
  private readonly p: Record<string, SVGPathElement> = {};
  private divs: SVGPathElement[] = [];
  private readonly rimStops: SVGStopElement[] = [];
  private readonly tabGrad: SVGLinearGradientElement;
  private readonly rimGrad: SVGLinearGradientElement;
  private readonly sideGrad: SVGLinearGradientElement;
  private readonly crestGrad: SVGLinearGradientElement;
  private readonly floorGrad: SVGLinearGradientElement;
  private readonly ro: ResizeObserver;
  onFrame: ((tabCenter: number, stretch: number) => void) | null = null;

  constructor(host: HTMLElement, cfg: LiquidConfig) {
    this.host = host;
    this.cfg = {
      pad: 6,
      top: 0.4,
      flare: 0.3,
      flareMax: Infinity,
      shoulder: 0,
      floor: true,
      dividers: true,
      ...cfg,
    };
    this.count = cfg.count;
    host.classList.add('lq', `lq-${cfg.orient}`);

    this.glass = document.createElement('div');
    this.glass.className = 'lq-glass';
    host.prepend(this.glass);

    this.floorEl = this.cfg.floor ? document.createElement('div') : null;
    if (this.floorEl) {
      this.floorEl.className = 'lq-floor';
      host.prepend(this.floorEl);
    }

    const svg = el('svg', { class: 'lq-svg', 'aria-hidden': 'true' });
    const defs = el('defs');
    const clip = el('clipPath', { id: `lqc${this.id}` });
    this.p.clip = el('path');
    clip.appendChild(this.p.clip);
    defs.appendChild(clip);

    // tab fill: accent light pooled at the top rim and on the floor of the tab
    this.tabGrad = el('linearGradient', { id: `lqt${this.id}`, gradientUnits: 'userSpaceOnUse' });
    for (const [o, a] of [
      [0, 0.5],
      [0.24, 0.25],
      [0.6, 0.12],
      [1, 0.32],
    ] as const) {
      const s = el('stop', { offset: o });
      s.setAttribute('style', `stop-color:var(--lq-accent, var(--app-accent));stop-opacity:${a}`);
      this.tabGrad.appendChild(s);
    }
    defs.appendChild(this.tabGrad);

    // rim along the bar: brighter where the tab is
    this.rimGrad = el('linearGradient', { id: `lqr${this.id}`, gradientUnits: 'userSpaceOnUse' });
    for (let i = 0; i < 5; i++) {
      const s = el('stop', { offset: i / 4 });
      s.setAttribute('style', 'stop-color:var(--lq-accent, var(--app-accent));stop-opacity:.3');
      this.rimStops.push(s);
      this.rimGrad.appendChild(s);
    }
    defs.appendChild(this.rimGrad);

    // tab outline: hot at the crest and at the feet, calmer down the sides
    this.sideGrad = el('linearGradient', { id: `lqs${this.id}`, gradientUnits: 'userSpaceOnUse' });
    for (const [o, a] of [
      [0, 1],
      [0.3, 0.55],
      [0.7, 0.5],
      [1, 0.95],
    ] as const) {
      const st = el('stop', { offset: o });
      st.setAttribute('style', `stop-color:var(--lq-accent, var(--app-accent));stop-opacity:${a}`);
      this.sideGrad.appendChild(st);
    }
    defs.appendChild(this.sideGrad);
    // crest + floor highlights fade out at both ends
    const fade = (id: string) => {
      const g = el('linearGradient', { id, gradientUnits: 'userSpaceOnUse' });
      for (const [o, a] of [
        [0, 0],
        [0.2, 1],
        [0.8, 1],
        [1, 0],
      ] as const) {
        const st = el('stop', { offset: o });
        st.setAttribute('style', `stop-color:var(--lq-hot, #fff);stop-opacity:${a}`);
        g.appendChild(st);
      }
      defs.appendChild(g);
      return g;
    };
    this.crestGrad = fade(`lqk${this.id}`);
    this.floorGrad = fade(`lqf${this.id}`);

    const blur = el('filter', { id: `lqb${this.id}`, x: '-20%', y: '-60%', width: '140%', height: '220%' });
    blur.appendChild(el('feGaussianBlur', { stdDeviation: 3.2 }));
    defs.appendChild(blur);
    svg.appendChild(defs);

    this.p.silTint = el('path', { class: 'lq-tint' });
    svg.appendChild(this.p.silTint);
    const g = el('g', { 'clip-path': `url(#lqc${this.id})` });
    this.p.tab = el('path', { fill: `url(#lqt${this.id})` });
    g.appendChild(this.p.tab);
    this.p.sheen = el('path', { class: 'lq-sheen' });
    g.appendChild(this.p.sheen);
    // light pooled just inside the tab's outline
    this.p.inner = el('path', { class: 'lq-inner', filter: `url(#lqb${this.id})` });
    g.appendChild(this.p.inner);
    this.divG = el('g', { class: 'lq-divs' });
    g.appendChild(this.divG);
    this.p.sides = el('path', { class: 'lq-sides', stroke: `url(#lqs${this.id})` });
    g.appendChild(this.p.sides);
    svg.appendChild(g);
    this.p.silLine = el('path', { class: 'lq-line' });
    svg.appendChild(this.p.silLine);
    this.p.rim = el('path', { class: 'lq-rim', stroke: `url(#lqr${this.id})` });
    svg.appendChild(this.p.rim);
    this.p.glow = el('path', { class: 'lq-glow', filter: `url(#lqb${this.id})` });
    svg.appendChild(this.p.glow);
    this.p.hot = el('path', { class: 'lq-hot', stroke: `url(#lqk${this.id})` });
    svg.appendChild(this.p.hot);
    this.p.hotB = el('path', { class: 'lq-hot lq-hotb', stroke: `url(#lqf${this.id})` });
    svg.appendChild(this.p.hotB);
    this.svg = svg;
    host.prepend(svg);

    this.ro = new ResizeObserver(() => this.layout());
    this.ro.observe(host);
    this.layout();
  }

  private divG: SVGGElement;

  /** Length of one segment. */
  get seg(): number {
    return (this.L - 2 * this.cfg.pad) / this.count;
  }
  center(i: number): number {
    return this.cfg.pad + this.seg * (i + 0.5);
  }

  setCount(n: number, index = 0): void {
    this.count = n;
    this.index = clamp(index, 0, n - 1);
    this.rebuildDividers();
    this.layout(true);
  }

  /** Tab geometry for the current segment length. */
  private geom() {
    const s = this.seg;
    const T = this.cfg.thickness;
    const ht = s * this.cfg.top; // half the tab's top
    const rt = Math.min(ht * 0.6, T * 0.28); // top corner radius
    const f = Math.min(s * this.cfg.flare, this.cfg.flareMax); // how far the feet flare past the top corners
    const rf = Math.min(f * 0.78, T * 0.34); // fillet into the far edge
    const sl = Math.max(0, f - rf); // slant of the straight part of the side
    return { ht, rt, f, rf, sl };
  }

  /** Edge targets for segment i. The end tabs swallow the bar's rounded end. */
  private targets(i: number): [number, number] {
    const c = this.center(i);
    const { ht, rt, f } = this.geom();
    const ext = rt + f + 6;
    return [i === 0 ? -ext : c - ht, i === this.count - 1 ? this.L + ext : c + ht];
  }

  setIndex(i: number, animate = true): void {
    this.index = clamp(i, 0, this.count - 1);
    [this.a.t, this.b.t] = this.targets(this.index);
    if (!animate || reducedMotion()) {
      this.a.snap(this.a.t);
      this.b.snap(this.b.t);
      this.draw();
      return;
    }
    this.kick();
  }

  layout(snap = false): void {
    const r = this.host.getBoundingClientRect();
    const L = this.cfg.orient === 'h' ? r.width : r.height;
    if (!L) return;
    const first = !this.L;
    this.L = L;
    if (first || this.divs.length !== this.count - 1) this.rebuildDividers();
    const { thickness: T, lift } = this.cfg;
    const gp = 18;
    if (this.cfg.orient === 'h') {
      Object.assign(this.svg.style, { left: `${-gp}px`, top: `${-(gp + lift)}px`, width: `${L + 2 * gp}px`, height: `${T + lift + 2 * gp}px` });
      this.svg.setAttribute('viewBox', `${-gp} ${-(gp + lift)} ${L + 2 * gp} ${T + lift + 2 * gp}`);
      Object.assign(this.glass.style, { left: '0px', top: `${-lift}px`, width: `${L}px`, height: `${T + lift}px` });
      this.tabGrad.setAttribute('x1', '0');
      this.tabGrad.setAttribute('x2', '0');
      this.tabGrad.setAttribute('y1', String(-lift));
      this.tabGrad.setAttribute('y2', String(T));
      this.rimGrad.setAttribute('x1', '0');
      this.rimGrad.setAttribute('x2', String(L));
      this.rimGrad.setAttribute('y1', '0');
      this.rimGrad.setAttribute('y2', '0');
    } else {
      Object.assign(this.svg.style, { left: `${-(gp + lift)}px`, top: `${-gp}px`, width: `${T + lift + 2 * gp}px`, height: `${L + 2 * gp}px` });
      this.svg.setAttribute('viewBox', `${-(gp + lift)} ${-gp} ${T + lift + 2 * gp} ${L + 2 * gp}`);
      Object.assign(this.glass.style, { left: `${-lift}px`, top: '0px', width: `${T + lift}px`, height: `${L}px` });
      this.tabGrad.setAttribute('x1', String(-lift));
      this.tabGrad.setAttribute('x2', String(T));
      this.tabGrad.setAttribute('y1', '0');
      this.tabGrad.setAttribute('y2', '0');
      this.rimGrad.setAttribute('x1', '0');
      this.rimGrad.setAttribute('x2', '0');
      this.rimGrad.setAttribute('y1', '0');
      this.rimGrad.setAttribute('y2', String(L));
    }
    [this.a.t, this.b.t] = this.targets(this.index);
    if (first || snap || !this.raf) {
      this.a.snap(this.a.t);
      this.b.snap(this.b.t);
    }
    this.draw();
  }

  private rebuildDividers(): void {
    this.divG.replaceChildren();
    this.divs = [];
    if (!this.cfg.dividers) return;
    for (let i = 0; i < this.count - 1; i++) {
      const p = el('path', { class: 'lq-div' });
      this.divG.appendChild(p);
      this.divs.push(p);
    }
  }

  private kick(): void {
    if (this.raf) return;
    // rAF timestamps can be earlier than a performance.now() taken in the input handler,
    // so the first frame uses a nominal step and later steps are clamped to [0, 1/30].
    this.last = -1;
    const loop = (now: number) => {
      const dt = this.last < 0 ? 1 / 60 : clamp((now - this.last) / 1000, 0, 1 / 30);
      this.last = now;
      const dir = Math.sign(this.a.t - this.a.x + this.b.t - this.b.x);
      // the edge in the direction of travel leads; the other one is dragged along
      const lead = dir >= 0 ? this.b : this.a;
      const trail = dir >= 0 ? this.a : this.b;
      lead.step(dt, 330, 0.8);
      trail.step(dt, 150, 0.86);
      this.draw();
      const moving =
        Math.abs(this.a.t - this.a.x) > 0.05 || Math.abs(this.b.t - this.b.x) > 0.05 || Math.abs(this.a.v) > 0.5 || Math.abs(this.b.v) > 0.5;
      if (moving) this.raf = requestAnimationFrame(loop);
      else {
        this.a.snap(this.a.t);
        this.b.snap(this.b.t);
        this.draw();
        this.raf = 0;
      }
    };
    this.raf = requestAnimationFrame(loop);
  }

  private draw(): void {
    const L = this.L;
    if (!L) return;
    const { thickness: T, radius: R, orient, pad } = this.cfg;
    const s = this.seg;
    const { rt, rf, sl } = this.geom();
    const speed = Math.abs((this.a.v + this.b.v) / 2);
    const stretch = clamp(speed / 1100, 0, 1);
    // the tab flattens a little while it travels, and stands up again when it lands
    const lift = this.cfg.lift * (1 - 0.45 * stretch);
    const ta = this.a.x;
    const tb = Math.max(this.b.x, ta + 2 * rt + 2);
    const top = -lift;
    const P =
      orient === 'h'
        ? (u: number, v: number) => `${u.toFixed(2)},${v.toFixed(2)}`
        : (u: number, v: number) => `${v.toFixed(2)},${u.toFixed(2)}`;
    const G =
      orient === 'h'
        ? (u: number, v: number) => `${u.toFixed(2)} ${(v + this.cfg.lift).toFixed(2)}`
        : (u: number, v: number) => `${(v + this.cfg.lift).toFixed(2)} ${u.toFixed(2)}`;

    // ---- silhouette: the bar plus the raised tab top, joined by a liquid meniscus
    const tabTop = (u: number) => {
      if (u < ta || u > tb) return Infinity;
      const d = Math.min(u - ta, tb - u);
      if (d >= rt) return top;
      const x = rt - d;
      return top + rt - Math.sqrt(Math.max(0, rt * rt - x * x));
    };
    const km = (this.cfg.shoulder || this.cfg.lift * 1.5) * (1 + 0.5 * stretch);
    const vTop = (u: number) => {
      const b = tabTop(u);
      if (b === Infinity) return 0;
      const h = Math.max(km - Math.abs(b), 0) / km;
      return Math.min(0, b) - h * h * km * 0.25;
    };
    const k = R * 0.5523;
    const sil = (M: (u: number, v: number) => string) => {
      const v0 = vTop(0);
      const vR = vTop(R);
      const vLR = vTop(L - R);
      const vL = vTop(L);
      let d = `M${M(0, T - R)}L${M(0, v0 + R)}C${M(0, v0 + R - k)} ${M(R - k, vR)} ${M(R, vR)}`;
      const step = 1.5;
      for (let u = R + step; u < L - R; u += step) d += `L${M(u, vTop(u))}`;
      d += `L${M(L - R, vLR)}C${M(L - R + k, vLR)} ${M(L, vL + R - k)} ${M(L, vL + R)}`;
      d += `L${M(L, T - R)}C${M(L, T - R + k)} ${M(L - R + k, T)} ${M(L - R, T)}`;
      d += `L${M(R, T)}C${M(R - k, T)} ${M(0, T - R + k)} ${M(0, T - R)}Z`;
      return d;
    };
    const silD = sil(P);
    this.p.clip.setAttribute('d', silD);
    this.p.silTint.setAttribute('d', silD);
    this.p.silLine.setAttribute('d', silD);
    this.p.rim.setAttribute('d', silD);
    this.glass.style.clipPath = `path('${sil(G)}')`;

    // ---- the tab: rounded top corners, sides that lean out and pour into the far edge
    const kc = 0.5523;
    const sy0 = top + rt; // where the corner hands over to the side
    const sy1 = T - rf; // where the side hands over to the fillet
    const len = Math.hypot(sl, sy1 - sy0) || 1;
    const du = sl / len;
    const dv = (sy1 - sy0) / len;
    // left side, from the top edge down to the foot (the right side mirrors it)
    const side = (x: number, m: 1 | -1) => {
      const cx = x; // corner end / side start (u)
      const fx = x - m * sl; // side end (u)
      const footX = fx - m * rf;
      return {
        start: [cx + m * rt, top] as const,
        c1: [cx + m * rt - m * kc * rt, top] as const,
        c2: [cx + m * du * kc * rt, sy0 - dv * kc * rt] as const,
        p1: [cx, sy0] as const,
        p2: [fx, sy1] as const,
        c3: [fx - m * du * kc * rf, sy1 + dv * kc * rf] as const,
        c4: [footX + m * kc * rf, T] as const,
        foot: [footX, T] as const,
      };
    };
    const Ls = side(ta, 1);
    const Rs = side(tb, -1);
    const pt = (q: readonly [number, number]) => P(q[0], q[1]);
    const open =
      `M${pt(Ls.foot)}C${pt(Ls.c4)} ${pt(Ls.c3)} ${pt(Ls.p2)}L${pt(Ls.p1)}C${pt(Ls.c2)} ${pt(Ls.c1)} ${pt(Ls.start)}` +
      `L${pt(Rs.start)}C${pt(Rs.c1)} ${pt(Rs.c2)} ${pt(Rs.p1)}L${pt(Rs.p2)}C${pt(Rs.c3)} ${pt(Rs.c4)} ${pt(Rs.foot)}`;
    this.p.tab.setAttribute('d', `${open}L${P(Rs.foot[0], T + 2)}L${P(Ls.foot[0], T + 2)}Z`);
    this.p.sides.setAttribute('d', open);
    this.p.inner.setAttribute('d', open);
    // glass sheen across the tab's top
    const sh = Math.min(10, T * 0.18);
    this.p.sheen.setAttribute(
      'd',
      `M${pt(Ls.start)}L${pt(Rs.start)}C${P(tb - rt * 0.4, top)} ${P(tb - 1, top + rt * 0.3)} ${P(tb - 2, top + sh)}` +
        `L${P(ta + 2, top + sh)}C${P(ta + 1, top + rt * 0.3)} ${P(ta + rt * 0.4, top)} ${pt(Ls.start)}Z`,
    );

    // ---- highlights: the crest of the tab and the floor under it
    const vis0 = Math.max(ta, 0);
    const vis1 = Math.min(tb, L);
    const tc = (vis0 + vis1) / 2;
    const c0 = Math.max(ta - 2, R * 0.9);
    const c1 = Math.min(tb + 2, L - R * 0.9);
    let crestD = '';
    for (let u = c0; u <= c1 + 0.01; u += 1.5) crestD += `${crestD ? 'L' : 'M'}${P(Math.min(u, c1), vTop(Math.min(u, c1)))}`;
    this.p.hot.setAttribute('d', crestD);
    const f0 = Math.max(Ls.foot[0] + rf * 0.6, R);
    const f1 = Math.min(Rs.foot[0] - rf * 0.6, L - R);
    const floorD = `M${P(f0, T)}L${P(f1, T)}`;
    this.p.hotB.setAttribute('d', floorD);
    this.p.glow.setAttribute('d', `${crestD}${floorD}`);
    const ax = (g: SVGLinearGradientElement, u0: number, u1: number) => {
      if (orient === 'h') {
        g.setAttribute('x1', u0.toFixed(1));
        g.setAttribute('x2', u1.toFixed(1));
        g.setAttribute('y1', '0');
        g.setAttribute('y2', '0');
      } else {
        g.setAttribute('y1', u0.toFixed(1));
        g.setAttribute('y2', u1.toFixed(1));
        g.setAttribute('x1', '0');
        g.setAttribute('x2', '0');
      }
    };
    ax(this.crestGrad, c0, c1);
    ax(this.floorGrad, f0, f1);
    if (orient === 'h') {
      this.sideGrad.setAttribute('x1', '0');
      this.sideGrad.setAttribute('x2', '0');
      this.sideGrad.setAttribute('y1', top.toFixed(1));
      this.sideGrad.setAttribute('y2', String(T));
    } else {
      this.sideGrad.setAttribute('y1', '0');
      this.sideGrad.setAttribute('y2', '0');
      this.sideGrad.setAttribute('x1', top.toFixed(1));
      this.sideGrad.setAttribute('x2', String(T));
    }

    // ---- dividers: faint S-curves between resting segments, fading out next to the tab
    const d0 = Math.min(s * 0.09, 6.5);
    const z0 = Ls.foot[0];
    const z1 = Rs.foot[0];
    this.divs.forEach((p, i) => {
      const x = pad + s * (i + 1);
      const near = x > z0 && x < z1 ? 0 : Math.min(Math.abs(x - z0), Math.abs(x - z1));
      const alpha = clamp((near - 2) / (s * 0.3), 0, 1);
      p.setAttribute('d', `M${P(x - d0, 0)}C${P(x - d0, T * 0.5)} ${P(x + d0, T * 0.5)} ${P(x + d0, T)}`);
      p.style.opacity = alpha.toFixed(3);
    });

    // ---- rim gradient follows the tab
    const at = clamp(tc / L, 0, 1);
    const spread = clamp((vis1 - vis0) / L + 0.12, 0.22, 0.5);
    const stops = [
      [0, 0.3],
      [clamp(at - spread, 0.01, 0.99), 0.1],
      [at, 0.9],
      [clamp(at + spread, 0.01, 0.99), 0.1],
      [1, 0.3],
    ];
    stops.sort((x, y) => x[0] - y[0]);
    stops.forEach(([o, a], i) => {
      this.rimStops[i].setAttribute('offset', o.toFixed(4));
      this.rimStops[i].setAttribute('style', `stop-color:var(--lq-accent, var(--app-accent));stop-opacity:${a}`);
    });

    if (this.floorEl) {
      const w = Math.max(20, f1 - f0 + rf * 2);
      if (orient === 'h') {
        Object.assign(this.floorEl.style, { left: `${tc - w * 0.6}px`, width: `${w * 1.2}px`, top: `${T - 10}px` });
      } else {
        Object.assign(this.floorEl.style, { top: `${tc - w * 0.6}px`, height: `${w * 1.2}px`, left: `${T - 10}px` });
      }
    }
    this.onFrame?.(tc, stretch);
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.ro.disconnect();
    this.onFrame = null;
    this.svg.remove();
    this.glass.remove();
    this.floorEl?.remove();
    this.host.classList.remove('lq', `lq-${this.cfg.orient}`);
  }
}
