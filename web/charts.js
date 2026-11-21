// Minimal canvas line/dot chart with a hover crosshair and tooltip.
// Colours come from CSS custom properties, so light/dark follow the page.
(function (global) {
  'use strict';

  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  function niceTicks(min, max, count) {
    if (!(max > min)) { max = min + 1; }
    const span = max - min, raw = span / count;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) || 10 * mag;
    const start = Math.ceil(min / step - 1e-9) * step;
    const ticks = [];
    for (let v = start; v <= max + step * 1e-6; v += step) ticks.push(+v.toFixed(10));
    return ticks;
  }

  class Chart {
    // opts: { canvas, xLabel, yLabel, xFmt, yFmt, height }
    constructor(opts) {
      this.o = opts;
      this.c = opts.canvas;
      this.series = [];   // { name, color(css var), data:[[x,y]], dots?:[{x,y,status,label}] }
      this.cursorX = null;
      this.hoverX = null;
      this.markers = [];  // vertical markers { x, label }
      this.c.addEventListener('mousemove', (e) => this._hover(e));
      this.c.addEventListener('mouseleave', () => { this.hoverX = null; this.draw(); this._tip(null); });
      this.tip = document.createElement('div');
      this.tip.className = 'chart-tip';
      this.c.parentElement.appendChild(this.tip);
    }
    set(series, extras) {
      this.series = series;
      Object.assign(this, extras || {});
      this.draw();
    }
    _layout() {
      const dpr = window.devicePixelRatio || 1;
      const w = this.c.clientWidth, h = this.o.height || 180;
      if (this.c.width !== Math.round(w * dpr) || this.c.height !== Math.round(h * dpr)) {
        this.c.width = Math.round(w * dpr); this.c.height = Math.round(h * dpr);
        this.c.style.height = h + 'px';
      }
      const g = this.c.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { g, w, h, L: 52, R: 12, T: 10, B: 30 };
    }
    _bounds() {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const s of this.series) for (const [x, y] of s.data) {
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      if (!isFinite(x0)) { x0 = 0; x1 = 1; y0 = 0; y1 = 1; }
      if (this.yZero !== false) { y0 = Math.min(y0, 0); y1 = Math.max(y1, 0); }
      if (this.yMin !== undefined) y0 = Math.min(y0, this.yMin);
      if (this.yMax !== undefined) y1 = Math.max(y1, this.yMax);
      if (y1 - y0 < 1e-9) { y1 += 1; y0 -= 1; }
      const pad = (y1 - y0) * 0.08;
      return { x0, x1, y0: y0 - (y0 < 0 ? pad : 0), y1: y1 + pad };
    }
    draw() {
      const { g, w, h, L, R, T, B } = this._layout();
      const b = this._bounds();
      this.b = b; this.geo = { w, h, L, R, T, B };
      const X = (x) => L + ((x - b.x0) / (b.x1 - b.x0 || 1)) * (w - L - R);
      const Y = (y) => T + (1 - (y - b.y0) / (b.y1 - b.y0)) * (h - T - B);
      this.X = X; this.Y = Y;
      g.clearRect(0, 0, w, h);
      g.font = '11px system-ui, -apple-system, "Segoe UI", sans-serif';
      // grid + y ticks
      g.strokeStyle = css('--grid'); g.lineWidth = 1; g.fillStyle = css('--muted');
      g.textAlign = 'right'; g.textBaseline = 'middle';
      const yf = this.o.yFmt || ((v) => +v.toFixed(3));
      for (const v of niceTicks(b.y0, b.y1, 4)) {
        const y = Math.round(Y(v)) + 0.5;
        g.beginPath(); g.moveTo(L, y); g.lineTo(w - R, y); g.stroke();
        g.fillText(yf(v), L - 6, y);
      }
      // zero / baseline
      if (b.y0 < 0 && b.y1 > 0) {
        g.strokeStyle = css('--axis'); g.beginPath();
        g.moveTo(L, Math.round(Y(0)) + 0.5); g.lineTo(w - R, Math.round(Y(0)) + 0.5); g.stroke();
      }
      // x ticks
      g.textAlign = 'center'; g.textBaseline = 'top'; g.fillStyle = css('--muted');
      const xf = this.o.xFmt || ((v) => +v.toFixed(3));
      for (const v of niceTicks(b.x0, b.x1, 6)) g.fillText(xf(v), X(v), h - B + 6);
      g.textAlign = 'left';
      if (this.o.xLabel) { g.textAlign = 'right'; g.fillText(this.o.xLabel, w - R, h - 13); g.textAlign = 'left'; }
      // markers
      for (const m of this.markers || []) {
        if (m.x < b.x0 || m.x > b.x1) continue;
        const x = Math.round(X(m.x)) + 0.5;
        g.strokeStyle = css('--axis'); g.setLineDash([3, 3]);
        g.beginPath(); g.moveTo(x, T); g.lineTo(x, h - B); g.stroke(); g.setLineDash([]);
        g.fillStyle = css('--text-2'); g.textBaseline = 'top';
        g.fillText(m.label, x + 4, T + 2);
      }
      // series lines
      for (const s of this.series) {
        if (!s.data.length || s.line === false) continue;
        g.strokeStyle = css(s.color); g.lineWidth = 2; g.lineJoin = 'round';
        g.beginPath();
        s.data.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y))));
        g.stroke();
      }
      // status dots
      for (const s of this.series) for (const d of s.dots || []) {
        g.fillStyle = css(d.ok ? '--good' : '--critical');
        g.strokeStyle = css('--surface'); g.lineWidth = 2;
        g.beginPath(); g.arc(X(d.x), Y(d.y), 4.5, 0, Math.PI * 2); g.fill(); g.stroke();
      }
      // playback cursor
      if (this.cursorX !== null && this.cursorX >= b.x0 && this.cursorX <= b.x1) {
        g.strokeStyle = css('--text-2'); g.lineWidth = 1;
        const x = Math.round(X(this.cursorX)) + 0.5;
        g.beginPath(); g.moveTo(x, T); g.lineTo(x, h - B); g.stroke();
      }
      // hover crosshair
      if (this.hoverX !== null) {
        g.strokeStyle = css('--muted'); g.lineWidth = 1;
        const x = Math.round(X(this.hoverX)) + 0.5;
        g.beginPath(); g.moveTo(x, T); g.lineTo(x, h - B); g.stroke();
        for (const s of this.series) {
          const pt = nearest(s.data, this.hoverX);
          if (!pt) continue;
          g.fillStyle = css(s.color); g.strokeStyle = css('--surface'); g.lineWidth = 2;
          g.beginPath(); g.arc(X(pt[0]), Y(pt[1]), 4, 0, Math.PI * 2); g.fill(); g.stroke();
        }
      }
    }
    _hover(e) {
      if (!this.b) return;
      const r = this.c.getBoundingClientRect();
      const px = e.clientX - r.left, { L, R, w } = this.geo;
      if (px < L || px > w - R) { this.hoverX = null; this.draw(); this._tip(null); return; }
      this.hoverX = this.b.x0 + ((px - L) / (w - L - R)) * (this.b.x1 - this.b.x0);
      this.draw();
      const xf = this.o.xTip || this.o.xFmt || ((v) => v.toFixed(3));
      const yf = this.o.yTip || this.o.yFmt || ((v) => v.toFixed(3));
      const rows = [];
      for (const s of this.series) {
        const pt = nearest(s.data, this.hoverX);
        if (!pt) continue;
        let extra = '';
        const dot = (s.dots || []).find((d) => d.x === pt[0]);
        if (dot) extra = ` <span class="${dot.ok ? 'ok' : 'bad'}">${dot.ok ? '✓' : '✗'} ${dot.label}</span>`;
        rows.push(`<div><i style="background:var(${s.color})"></i>${s.name}: <b>${yf(pt[1])}</b>${extra}</div>`);
      }
      this._tip(`<div class="tip-x">${this.o.xLabel ? this.o.xLabel + ' ' : ''}${xf(this.hoverX)}</div>${rows.join('')}`, px);
    }
    _tip(html, px) {
      if (!html) { this.tip.style.display = 'none'; return; }
      this.tip.innerHTML = html;
      this.tip.style.display = 'block';
      const w = this.c.clientWidth, tw = this.tip.offsetWidth;
      this.tip.style.left = Math.min(Math.max(px + 12, 0), w - tw) + 'px';
      this.tip.style.top = '8px';
    }
  }

  function nearest(data, x) {
    if (!data.length) return null;
    let lo = 0, hi = data.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (data[mid][0] < x) lo = mid; else hi = mid; }
    return Math.abs(data[lo][0] - x) < Math.abs(data[hi][0] - x) ? data[lo] : data[hi];
  }

  global.Chart = Chart;
})(window);
