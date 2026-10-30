// Level Line — horizontal reference lines for any chart on any site.
//
//   Hold Option/Alt over a chart  → live preview line that follows the cursor
//   Option/Alt + click            → pin a line at that level
//   Drag the line or its label    → move it            Option/Alt + ↑/↓ → nudge last line (Shift = 10px)
//   Click the value               → copy it            ✕ → remove one     Esc → remove all
//
// Each line shows the estimated axis value (read from the chart's tick labels, linear or log), marks every
// point where the data crosses that level, and highlights the stretches where the data was at or above it.
// Works on SVG charts (lines, areas, bars, candles), 2D canvas charts (crossings via pixel scan), and
// falls back to a plain line on images / div-based charts. Lines stay pinned to their value when the chart
// re-renders or rescales.
(function () {
  if (window.__levelLine) return;
  window.__levelLine = true;

  const COLORS = ['#e8453c', '#1a73e8', '#188038', '#9334e6', '#e37400'];
  const MAX_DOTS = 500;
  const MAX_RECTS = 1500;
  const MAX_SAMPLES = 2000;
  const INFO_TTL = 1000;
  const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform);
  const MOD = IS_MAC ? '⌥' : 'Alt';
  const CHART_HINT = '[class*="chart" i],[id*="chart" i],[class*="plot" i],[data-chart],[role="img"],[role="figure"],figure';
  const SVG_SKIP = 'defs,clipPath,mask,pattern,marker,symbol,[class*="axis" i],[class*="grid" i],' +
    '[class*="legend" i],[class*="crosshair" i],[class*="tooltip" i],[class*="cursor" i]';

  const lines = [];
  const pathCache = new WeakMap();
  const infoCache = new WeakMap();
  const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 2 });
  let colorIdx = 0;
  let suppressClick = false;
  let host = null;
  let layer = null;
  let ghost = null;
  let ghostOn = false;
  let active = null;
  let pointer = null;
  let raf = 0;

  // ---------- UI layer (shadow DOM so page CSS can't interfere) ----------
  function hostParent() {
    const fs = document.fullscreenElement;
    return fs && !/^(VIDEO|CANVAS|IMG|IFRAME)$/.test(fs.tagName) ? fs : document.documentElement;
  }

  function ensureUI() {
    if (host) {
      if (!host.isConnected) hostParent().appendChild(host);
      return layer;
    }
    host = document.createElement('level-line-ui');
    host.style.cssText =
      'position:fixed!important;inset:0!important;pointer-events:none!important;' +
      'z-index:2147483647!important;display:block!important;';
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>
        :host{all:initial}
        .line{position:fixed;height:0;margin-top:-.75px;border-top:1.5px dashed var(--c);pointer-events:none;
              filter:drop-shadow(0 0 1px #fff)}
        .seg{position:fixed;box-sizing:border-box;border-bottom:3px solid var(--c);pointer-events:none;
             background:linear-gradient(to top,color-mix(in srgb,var(--c) 16%,transparent),transparent 70%)}
        .hit{position:fixed;height:12px;margin-top:-6px;pointer-events:auto;cursor:ns-resize}
        .label{position:fixed;transform:translate(-100%,calc(-100% - 4px));display:flex;gap:6px;align-items:center;
               background:var(--c);color:#fff;font:600 11px/1.3 system-ui,-apple-system,"Segoe UI",sans-serif;
               font-variant-numeric:tabular-nums;padding:3px 7px;border-radius:5px;pointer-events:auto;
               white-space:nowrap;cursor:ns-resize;box-shadow:0 1px 4px rgba(0,0,0,.3);user-select:none}
        .label.below{transform:translate(-100%,4px)}
        .val{cursor:copy}
        .val:empty,.badge:empty{display:none}
        .badge{background:rgba(255,255,255,.22);border-radius:3px;padding:0 4px;font-weight:500}
        .hint{opacity:.85;font-weight:500}
        .x{cursor:pointer;opacity:.75;padding:0 1px}
        .x:hover{opacity:1}
        .dot{position:fixed;width:9px;height:9px;margin:-4.5px 0 0 -4.5px;border-radius:50%;background:#fff;
             border:2px solid var(--c);box-sizing:border-box;pointer-events:none;box-shadow:0 0 0 1px rgba(255,255,255,.8)}
        .ghost{opacity:.7}
        .ghost .label{pointer-events:none}
        .off .line,.off .hit,.off .segs,.off .dots{display:none}
        .dragging .label{box-shadow:0 2px 10px rgba(0,0,0,.45)}
      </style>
      <div id="layer"></div>`;
    layer = root.getElementById('layer');
    // Don't let clicks on our controls reach the page (e.g. "click outside" handlers closing menus).
    for (const type of ['mousedown', 'mouseup', 'click', 'dblclick']) {
      layer.addEventListener(type, (e) => e.stopPropagation());
    }
    hostParent().appendChild(host);
    return layer;
  }

  document.addEventListener('fullscreenchange', () => {
    if (host) hostParent().appendChild(host);
    schedule();
  });

  // ---------- Finding the chart under the cursor ----------
  const bigEnough = (el, w = 120, h = 60) => {
    const r = el.getBoundingClientRect();
    return r.width >= w && r.height >= h;
  };

  // elementsFromPoint, descending into open shadow roots (web-component charts).
  function elementsAt(x, y) {
    let stack = document.elementsFromPoint(x, y);
    const seen = new Set();
    for (let i = 0; i < 8; i++) {
      const top = stack.find((el) => el !== host);
      const sr = top && top.shadowRoot;
      if (!sr || seen.has(sr) || !sr.elementsFromPoint) break;
      seen.add(sr);
      const inner = sr.elementsFromPoint(x, y);
      stack = [...inner, ...stack.filter((el) => !inner.includes(el))];
    }
    return stack.filter((el) => el !== host);
  }

  function findChart(x, y) {
    const stack = elementsAt(x, y);
    for (const el of stack) {
      if (el instanceof SVGElement) {
        let svg = el instanceof SVGSVGElement ? el : el.ownerSVGElement;
        while (svg && svg.ownerSVGElement) svg = svg.ownerSVGElement;
        if (svg && bigEnough(svg)) return svg;
      } else if (el instanceof HTMLCanvasElement && bigEnough(el)) {
        return el;
      } else if (el instanceof HTMLImageElement && bigEnough(el) && !el.closest('a')) {
        return el;
      }
    }
    // Div-based charts: only containers that look like a chart, so Alt+click elsewhere stays untouched.
    const top = stack[0];
    if (!top || top.closest('a,button,input,textarea,select,[contenteditable]')) return null;
    for (let el = top.closest(CHART_HINT); el; el = el.parentElement && el.parentElement.closest(CHART_HINT)) {
      if (el === document.body || el === document.documentElement) break;
      if (bigEnough(el, 200, 100)) return el;
    }
    return null;
  }

  // ---------- Reading the y-axis to estimate values ----------
  function parseNum(s) {
    s = s.replace(/[\s  ,]/g, '').replace(/[−–]/g, '-');
    const m = s.match(/^([-+]?)([$€£¥₹]?)([-+]?)(\d*\.?\d+)([kmbt])?(%)?$/i);
    if (!m || (m[1] && m[3])) return null;
    const mult = { k: 1e3, m: 1e6, b: 1e9, t: 1e12 }[(m[5] || '').toLowerCase()] || 1;
    const sign = m[1] === '-' || m[3] === '-' ? -1 : 1;
    return { v: sign * parseFloat(m[4]) * mult, pct: !!m[6], prefix: m[2] };
  }

  function linfit(pts) {
    const n = pts.length;
    let sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
    for (const [x, y] of pts) {
      sx += x; sy += y; sxx += x * x; sxy += x * y; syy += y * y;
    }
    const d = n * sxx - sx * sx;
    if (!d) return null;
    const a = (n * sxy - sx * sy) / d;
    const b = (sy - a * sx) / n;
    const ssTot = syy - (sy * sy) / n;
    if (ssTot <= 0 || !a) return null;
    let ssRes = 0;
    for (const [x, y] of pts) ssRes += (y - (a * x + b)) ** 2;
    return { a, b, r2: 1 - ssRes / ssTot };
  }

  // Fit chart-relative y -> value, trying linear first, then log10 for axes spanning several decades.
  function fitScale(pts) {
    let fit = linfit(pts.map((p) => [p.y, p.v]));
    let log = false;
    if (!fit || fit.r2 < 0.995) {
      const vs = pts.map((p) => p.v);
      if (Math.min(...vs) <= 0 || Math.max(...vs) / Math.min(...vs) < 50) return null;
      fit = linfit(pts.map((p) => [p.y, Math.log10(p.v)]));
      if (!fit || fit.r2 < 0.995) return null;
      log = true;
    }
    const vals = pts.map((p) => p.v).sort((a, b) => a - b);
    let step = Infinity;
    for (let i = 1; i < vals.length; i++) step = Math.min(step, vals[i] - vals[i - 1]);
    const { a, b } = fit;
    return {
      a, b, log,
      x: Math.min(...pts.map((p) => p.x)),
      decimals: Math.min(4, Math.max(0, 1 - Math.floor(Math.log10(step || 1)))),
      pct: pts.some((p) => p.pct),
      prefix: (pts.find((p) => p.prefix) || {}).prefix || '',
      toVal: (y) => (log ? 10 ** (a * y + b) : a * y + b),
      toY: (v) => (log ? (Math.log10(v) - b) / a : (v - b) / a),
    };
  }

  // Returns up to two axis scales (e.g. left + right axis).
  function inferScales(chart) {
    const cr = chart.getBoundingClientRect();
    if (!cr.height) return [];
    let root = chart;
    for (let i = 0; i < 4 && root.parentElement && root.parentElement !== document.body; i++) {
      root = root.parentElement;
    }
    const edge = Math.max(60, cr.width * 0.2);
    const ticks = [];
    const range = document.createRange();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n; (n = walker.nextNode()); ) {
      const t = n.textContent;
      if (!t || t.length > 16) continue;
      const parsed = parseNum(t);
      if (!parsed) continue;
      let r;
      if (n.parentElement instanceof SVGElement) r = n.parentElement.getBoundingClientRect();
      else { range.selectNodeContents(n); r = range.getBoundingClientRect(); }
      if (!r.width || !r.height) continue;
      const cy = r.top + r.height / 2;
      if (cy < cr.top - 12 || cy > cr.bottom + 12) continue;
      // Axis labels sit just outside the plot or tucked inside its left/right edge, never mid-plot.
      if (r.left > cr.right + 80 || r.right < cr.left - 80) continue;
      if (r.left > cr.left + edge && r.right < cr.right - edge) continue;
      ticks.push({ ...parsed, y: cy - cr.top, x: r.left,
                   kl: 'L' + Math.round(r.left / 6), kr: 'R' + Math.round(r.right / 6) });
    }

    // Group labels that share a left or right edge (i.e. an axis column).
    const groups = new Map();
    for (const t of ticks) {
      for (const k of [t.kl, t.kr]) {
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(t);
      }
    }

    const fits = new Map();
    for (const g of groups.values()) {
      const seen = new Set();
      const pts = g
        .sort((a, b) => a.y - b.y)
        .filter((p) => {
          const k = Math.round(p.y);
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
      if (pts.length < 3) continue;
      const sig = pts.map((p) => p.v + '@' + Math.round(p.y)).join('|');
      if (fits.has(sig)) continue;
      const s = fitScale(pts);
      if (s) fits.set(sig, s);
    }
    // Drop near-duplicates (same axis matched via both its left and right edges).
    const all = [];
    for (const s of [...fits.values()].sort((a, b) => a.x - b.x)) {
      const dup = all.some((o) => o.log === s.log &&
        Math.abs(o.a - s.a) <= Math.abs(s.a) * 0.01 &&
        Math.abs(o.toVal(cr.height / 2) - s.toVal(cr.height / 2)) <= Math.abs(s.a) * 2);
      if (!dup) all.push(s);
    }
    return all.length > 1 ? [all[0], all[all.length - 1]] : all;
  }

  function fmt(scale, v) {
    const abs = Math.abs(v);
    const body = abs >= 1e4
      ? compact.format(abs)
      : abs.toLocaleString(undefined, scale.log ? { maximumSignificantDigits: 3 } : { maximumFractionDigits: scale.decimals });
    const neg = v < 0 && /[1-9]/.test(body);
    return (neg ? '−' : '') + scale.prefix + body + (scale.pct ? '%' : '');
  }

  // ---------- SVG geometry ----------
  // Exact vertices for straight-segment paths (most line charts); NaN pairs mark subpath breaks.
  function parseLinearPath(d) {
    if (/[^MLHVZmlhvz0-9eE.,\s+-]/.test(d)) return null;
    const toks = d.match(/[MLHVZmlhvz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g);
    if (!toks) return null;
    const out = [];
    let cmd = '', x = 0, y = 0, sx = 0, sy = 0, i = 0;
    const num = () => parseFloat(toks[i++]);
    while (i < toks.length) {
      if (/^[MLHVZmlhvz]$/.test(toks[i])) cmd = toks[i++];
      switch (cmd) {
        case 'M': x = num(); y = num(); out.push(NaN, NaN, x, y); sx = x; sy = y; cmd = 'L'; break;
        case 'm': x += num(); y += num(); out.push(NaN, NaN, x, y); sx = x; sy = y; cmd = 'l'; break;
        case 'L': x = num(); y = num(); out.push(x, y); break;
        case 'l': x += num(); y += num(); out.push(x, y); break;
        case 'H': x = num(); out.push(x, y); break;
        case 'h': x += num(); out.push(x, y); break;
        case 'V': y = num(); out.push(x, y); break;
        case 'v': y += num(); out.push(x, y); break;
        case 'Z': case 'z': x = sx; y = sy; out.push(x, y); cmd = ''; break;
        default: return null;
      }
    }
    return out;
  }

  function samplePath(p) {
    const key = p.getAttribute('d') ?? p.getAttribute('points') ?? '';
    const cached = pathCache.get(p);
    if (cached && cached.key === key) return cached.pts;
    let pts = null;
    try {
      if (p.localName === 'polyline') {
        const n = (key.match(/[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) || []).map(Number);
        pts = n.length >= 4 ? n.slice(0, n.length - (n.length % 2)) : null;
      } else {
        pts = parseLinearPath(key);
        if (!pts) {
          // Curves: sample along the path.
          const len = p.getTotalLength();
          if (len > 0) {
            const n = Math.min(MAX_SAMPLES, Math.max(64, Math.ceil(len)));
            pts = [];
            for (let i = 0; i <= n; i++) {
              const q = p.getPointAtLength((len * i) / n);
              pts.push(q.x, q.y);
            }
          }
        }
      }
    } catch { pts = null; }
    pathCache.set(p, { key, pts });
    return pts;
  }

  const isClear = (c) => !c || c === 'none' || c === 'transparent' || /rgba\(.*,\s*0\)$/.test(c);

  function skipped(el, svg) {
    for (let n = el; n && n !== svg; n = n.parentElement) if (n.matches(SVG_SKIP)) return true;
    return false;
  }

  function svgGeometry(svg) {
    const sr = svg.getBoundingClientRect();
    const polys = [];
    const rects = [];
    for (const el of svg.querySelectorAll('path, polyline, rect')) {
      if (skipped(el, svg)) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) continue;
      const r = el.getBoundingClientRect();
      if (el.localName === 'rect') {
        // Bars / candle bodies: skip backgrounds, hover overlays and legend swatches.
        if (rects.length >= MAX_RECTS || isClear(cs.fill) || parseFloat(cs.fillOpacity) === 0) continue;
        if (r.width < 1 || r.height < 1 || r.width > sr.width * 0.5 || r.height > sr.height * 0.98) continue;
        if (r.width <= 14 && r.height <= 14 && Math.abs(r.width - r.height) <= 2) continue;
        rects.push(el);
      } else {
        if (isClear(cs.stroke) || parseFloat(cs.strokeOpacity) === 0) continue;
        if (r.width < 40 || r.height < 4) continue; // gridlines, ticks, icons
        const pts = samplePath(el);
        if (pts && pts.length >= 8) polys.push({ el, pts });
      }
    }
    return { polys, rects };
  }

  // ---------- Canvas geometry (pixel scan of one row) ----------
  function stackedCanvases(canvas) {
    const cr = canvas.getBoundingClientRect();
    const scope = (canvas.parentElement && canvas.parentElement.parentElement) || canvas.parentElement;
    if (!scope) return [canvas];
    return [...scope.querySelectorAll('canvas')].filter((c) => {
      const r = c.getBoundingClientRect();
      const w = Math.min(r.right, cr.right) - Math.max(r.left, cr.left);
      const h = Math.min(r.bottom, cr.bottom) - Math.max(r.top, cr.top);
      return w > 0 && h > 0 && w * h >= cr.width * cr.height * 0.8;
    });
  }

  function canvasCrossings(canvases, Y) {
    const xs = [];
    for (const c of canvases) {
      if (!c.isConnected || !c.width || !c.height) continue;
      const cr = c.getBoundingClientRect();
      if (!cr.width || !cr.height) continue;
      const row = Math.floor(((Y - cr.top) / cr.height) * c.height);
      if (row < 0 || row >= c.height) continue;
      let data;
      try {
        const ctx = c.getContext('2d'); // null for WebGL canvases
        if (!ctx) continue;
        data = ctx.getImageData(0, row, c.width, 1).data; // throws if cross-origin tainted
      } catch { continue; }

      // Background = most common colour in the row.
      const counts = new Map();
      let bg = 0, best = 0;
      for (let i = 0; i < data.length; i += 4) {
        const k = ((data[i] >> 4) << 12) | ((data[i + 1] >> 4) << 8) | ((data[i + 2] >> 4) << 4) | (data[i + 3] >> 4);
        const n = (counts.get(k) || 0) + 1;
        counts.set(k, n);
        if (n > best) { best = n; bg = i; }
      }
      const bgA = data[bg + 3];
      const bgL = 0.299 * data[bg] + 0.587 * data[bg + 1] + 0.114 * data[bg + 2];
      // "Ink" = series colour: saturated, or strongly contrasting. Light-grey gridlines don't count.
      const isInk = (i) => {
        if (data[i + 3] < 100) return false;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const chroma = Math.max(r, g, b) - Math.min(r, g, b);
        const l = 0.299 * r + 0.587 * g + 0.114 * b;
        if (bgA < 128) return chroma >= 60 || l < 90;
        const d = Math.abs(r - data[bg]) + Math.abs(g - data[bg + 1]) + Math.abs(b - data[bg + 2]);
        return d >= 90 && (chroma >= 60 || Math.abs(l - bgL) >= 110);
      };

      const px = cr.width / c.width;
      const runs = [];
      let start = -1;
      for (let x = 0; x <= c.width; x++) {
        const on = x < c.width && isInk(x * 4);
        if (on && start < 0) start = x;
        else if (!on && start >= 0) { runs.push([start * px, x * px]); start = -1; }
      }
      // A line crossing the row is one short isolated run. Clusters of runs are text glyphs or
      // hatching; long runs are fills or a series running along the row.
      for (let i = 0; i < runs.length; i++) {
        const [a, b] = runs[i];
        const near = (j) => runs[j] && Math.min(Math.abs(runs[j][0] - b), Math.abs(a - runs[j][1])) < 6;
        if (b - a > 24 || near(i - 1) || near(i + 1)) continue;
        const cx = cr.left + (a + b) / 2;
        if (!xs.some((v) => Math.abs(v - cx) < 3)) xs.push(cx);
        if (xs.length >= MAX_DOTS) return xs;
      }
    }
    return xs;
  }

  // ---------- Chart info (scales + geometry), cached briefly since charts re-render ----------
  function chartInfo(chart) {
    const now = performance.now();
    let info = infoCache.get(chart);
    if (!info || now - info.t > INFO_TTL) {
      let geo = {};
      try {
        if (chart instanceof SVGSVGElement) geo = svgGeometry(chart);
        else if (chart instanceof HTMLCanvasElement) geo = { canvases: stackedCanvases(chart) };
      } catch { geo = {}; }
      info = { t: now, scales: inferScales(chart), geo };
      infoCache.set(chart, info);
    }
    return info;
  }

  function mergeSpans(flat, r) {
    const s = [];
    for (let i = 0; i < flat.length; i += 2) {
      const a = Math.max(r.left, Math.min(flat[i], flat[i + 1]));
      const b = Math.min(r.right, Math.max(flat[i], flat[i + 1]));
      if (b >= a) s.push([a, b]);
    }
    s.sort((p, q) => p[0] - q[0]);
    const out = [];
    for (const p of s) {
      const last = out[out.length - 1];
      if (last && p[0] <= last[1] + 2) last[1] = Math.max(last[1], p[1]);
      else out.push(p);
    }
    return out;
  }

  // Crossing points and "at or above this level" spans at client-y Y. (Screen y grows downward.)
  function measure(geo, Y, r) {
    const dots = [];
    const flat = [];
    for (const { el, pts } of geo.polys || []) {
      if (!el.isConnected) continue;
      const m = el.getScreenCTM();
      if (!m) continue;
      let px = NaN, py = NaN;
      for (let i = 0; i < pts.length; i += 2) {
        const sx = pts[i], sy = pts[i + 1];
        if (Number.isNaN(sx)) { px = py = NaN; continue; }
        const x = m.a * sx + m.c * sy + m.e;
        const y = m.b * sx + m.d * sy + m.f;
        if (!Number.isNaN(px)) {
          const wasAbove = py <= Y, isAbove = y <= Y;
          if (wasAbove && isAbove) flat.push(px, x);
          else if (wasAbove !== isAbove) {
            const cx = px + ((Y - py) / (y - py)) * (x - px);
            if (dots.length < MAX_DOTS && cx >= r.left - 1 && cx <= r.right + 1) dots.push(cx);
            flat.push(wasAbove ? px : x, cx);
          }
        }
        px = x; py = y;
      }
    }
    for (const el of geo.rects || []) {
      if (!el.isConnected) continue;
      const b = el.getBoundingClientRect();
      if (b.top <= Y) flat.push(b.left, b.right);
    }
    if (geo.canvases) dots.push(...canvasCrossings(geo.canvases, Y));
    return { dots, spans: mergeSpans(flat, r) };
  }

  // ---------- Lines ----------
  function createLine(isGhost) {
    ensureUI();
    const L = { ghost: isGhost, chart: null, frac: 0, value: null, ax: 0, ay: 0, dragging: false, flashUntil: 0 };
    L.el = document.createElement('div');
    L.el.className = isGhost ? 'ghost' : '';
    L.el.innerHTML =
      '<div class="segs"></div><div class="dots"></div><div class="line"></div>' +
      (isGhost ? '' : '<div class="hit"></div>') +
      '<div class="label"><span class="val" title="Click to copy"></span><span class="badge"></span>' +
      (isGhost
        ? `<span class="hint">${MOD}+click to pin</span>`
        : '<span class="x" title="Remove (Esc removes all)">✕</span>') +
      '</div>';
    const $ = (s) => L.el.querySelector(s);
    L.segsEl = $('.segs');
    L.dotsEl = $('.dots');
    L.lineEl = $('.line');
    L.hitEl = $('.hit');
    L.labelEl = $('.label');
    L.valEl = $('.val');
    L.badgeEl = $('.badge');
    if (!isGhost) {
      L.labelEl.title = `Drag to move · ${MOD}+↑/↓ to nudge · Esc clears all`;
      attachControls(L);
    }
    layer.appendChild(L.el);
    return L;
  }

  function attachControls(L) {
    L.el.querySelector('.x').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      removeLine(L);
    });
    for (const handle of [L.hitEl, L.labelEl]) {
      let startY = 0, moved = false, onVal = false;
      handle.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        handle.setPointerCapture(e.pointerId);
        L.dragging = true;
        moved = false;
        onVal = !!e.target.closest('.val');
        startY = e.clientY;
        active = L;
        ghostOn = false;
        L.el.classList.add('dragging');
      });
      handle.addEventListener('pointermove', (e) => {
        if (!L.dragging) return;
        if (!moved && Math.abs(e.clientY - startY) < 3) return;
        moved = true;
        const r = L.chart.getBoundingClientRect();
        if (r.height) setFrac(L, (e.clientY - r.top) / r.height);
      });
      const end = (e) => {
        if (!L.dragging) return;
        L.dragging = false;
        L.el.classList.remove('dragging');
        if (!moved && onVal && e.type === 'pointerup') copyValue(L);
      };
      handle.addEventListener('pointerup', end);
      handle.addEventListener('pointercancel', end);
    }
    L.labelEl.addEventListener('pointerenter', () => { active = L; });
  }

  function setFrac(L, f) {
    L.frac = Math.min(1, Math.max(0, f));
    L.value = null; // re-derived from the new position on render
    schedule();
  }

  function copyValue(L) {
    const main = L.chart && chartInfo(L.chart).scales[0];
    if (!main || L.value == null || !navigator.clipboard) return;
    const text = String(main.log ? +L.value.toPrecision(4) : +L.value.toFixed(main.decimals));
    navigator.clipboard.writeText(text).then(() => {
      L.flashUntil = performance.now() + 900;
      schedule();
      setTimeout(schedule, 950);
    }, () => {});
  }

  function ensureChart(L) {
    if (L.chart && L.chart.isConnected) return true;
    if (L.ghost) return false;
    const c = findChart(L.ax, L.ay); // chart was replaced by a re-render: find its successor
    if (!c) return false;
    L.chart = c;
    return true;
  }

  const setText = (el, t) => { if (el.textContent !== t) el.textContent = t; };

  function render(L) {
    if (!ensureChart(L)) { L.el.style.display = 'none'; return; }
    const r = L.chart.getBoundingClientRect();
    if (r.width < 10 || r.height < 10) { L.el.style.display = 'none'; return; }
    L.el.style.display = '';

    // Lines are anchored to a value, so they stay at the same level when the chart rescales.
    const info = chartInfo(L.chart);
    const main = info.scales[0];
    if (main) {
      if (L.value == null || L.dragging) L.value = main.toVal(L.frac * r.height);
      else {
        const f = main.toY(L.value) / r.height;
        if (Number.isFinite(f)) L.frac = f;
      }
    }
    const off = L.frac < -0.001 ? -1 : L.frac > 1.001 ? 1 : 0;
    const y = r.top + Math.min(1, Math.max(0, L.frac)) * r.height;
    L.ax = r.left + r.width / 2;
    L.ay = r.top + r.height / 2;
    L.el.classList.toggle('off', !!off);

    for (const e of [L.lineEl, L.hitEl]) {
      if (!e) continue;
      e.style.left = r.left + 'px';
      e.style.top = y + 'px';
      e.style.width = r.width + 'px';
    }
    L.labelEl.style.left = Math.min(r.right, document.documentElement.clientWidth - 4) + 'px';
    L.labelEl.style.top = y + 'px';
    L.labelEl.classList.toggle('below', y - r.top < 26);

    let val = '';
    if (off && main) val = (off < 0 ? '↑ ' : '↓ ') + fmt(main, L.value) + ' (off chart)';
    else if (info.scales.length) val = '≈ ' + info.scales.map((s) => fmt(s, s.toVal(y - r.top))).join(' · ');
    setText(L.valEl, val);

    const { dots, spans } = off ? { dots: [], spans: [] } : measure(info.geo, y, r);
    let badge = '';
    if (performance.now() < L.flashUntil) badge = 'Copied ✓';
    else if (!off && (info.geo.polys?.length || info.geo.rects?.length)) {
      badge = spans.length ? `${spans.length}× above` : 'never above';
      L.badgeEl.title = 'Stretches where the data is at or above this level';
    } else if (!off && dots.length) {
      badge = `${dots.length} crossing${dots.length === 1 ? '' : 's'}`;
      L.badgeEl.title = 'Points where a series crosses this level';
    }
    setText(L.badgeEl, badge);

    L.segsEl.replaceChildren(...spans.map(([a, b]) => {
      const d = document.createElement('div');
      d.className = 'seg';
      d.style.cssText = `left:${a}px;width:${Math.max(2, b - a)}px;top:${r.top}px;height:${y - r.top + 1.5}px`;
      return d;
    }));
    L.dotsEl.replaceChildren(...dots.map((x) => {
      const d = document.createElement('div');
      d.className = 'dot';
      d.style.left = x + 'px';
      d.style.top = y + 'px';
      return d;
    }));
  }

  function renderGhost() {
    const chart = ghostOn && pointer && findChart(pointer.x, pointer.y);
    if (!chart) {
      if (ghost) ghost.el.style.display = 'none';
      return;
    }
    if (!ghost) ghost = createLine(true);
    ghost.el.style.setProperty('--c', COLORS[colorIdx % COLORS.length]); // the colour the pinned line will get
    ghost.chart = chart;
    const r = chart.getBoundingClientRect();
    ghost.frac = (pointer.y - r.top) / r.height;
    ghost.value = null;
    render(ghost);
  }

  function renderAll() {
    raf = 0;
    if (!lines.length && !ghost && !ghostOn) return;
    ensureUI();
    lines.forEach(render);
    renderGhost();
  }

  function schedule() {
    if (!raf) raf = requestAnimationFrame(renderAll);
  }

  function removeLine(L) {
    L.el.remove();
    const i = lines.indexOf(L);
    if (i >= 0) lines.splice(i, 1);
    if (active === L) active = lines[lines.length - 1] || null;
  }

  function addLine(chart, y) {
    const L = createLine(false);
    L.el.style.setProperty('--c', COLORS[colorIdx++ % COLORS.length]);
    const r = chart.getBoundingClientRect();
    L.chart = chart;
    L.frac = (y - r.top) / r.height;
    lines.push(L);
    active = L;
    render(L);
  }

  // ---------- Input ----------
  const fromUI = (e) => !!host && e.composedPath().includes(host);
  const isEditable = (t) => t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

  window.addEventListener('pointerdown', (e) => {
    suppressClick = false;
    if (!e.altKey || e.button !== 0 || !e.isPrimary || fromUI(e)) return;
    const chart = findChart(e.clientX, e.clientY);
    if (!chart) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    suppressClick = true;
    addLine(chart, e.clientY);
  }, true);

  // Keep the page's own handlers (and Option+click link downloads) from firing on our Option/Alt+click.
  for (const type of ['mousedown', 'mouseup', 'click']) {
    window.addEventListener(type, (e) => {
      if (!suppressClick) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (type === 'click') suppressClick = false;
    }, true);
  }

  window.addEventListener('pointermove', (e) => {
    pointer = { x: e.clientX, y: e.clientY };
    const want = e.altKey && !fromUI(e) && !lines.some((l) => l.dragging);
    if (want || ghostOn) {
      ghostOn = want;
      schedule();
    }
  }, { capture: true, passive: true });

  window.addEventListener('pointerout', (e) => {
    if (!e.relatedTarget) { pointer = null; if (ghostOn) { ghostOn = false; schedule(); } }
  }, true);

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Alt') {
      if (!e.repeat && pointer) { ghostOn = true; schedule(); }
      return;
    }
    if (e.key === 'Escape' && (lines.length || ghostOn)) {
      [...lines].forEach(removeLine);
      ghostOn = false;
      schedule();
      return;
    }
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && active && lines.includes(active) && !isEditable(e.target)) {
      const r = active.chart.getBoundingClientRect();
      if (!r.height) return;
      const step = (e.key === 'ArrowUp' ? -1 : 1) * (e.shiftKey ? 10 : 1);
      setFrac(active, (Math.min(1, Math.max(0, active.frac)) * r.height + step) / r.height);
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }, true);

  window.addEventListener('keyup', (e) => {
    if (e.key === 'Alt' && ghostOn) { ghostOn = false; schedule(); }
  }, true);

  window.addEventListener('blur', () => {
    if (ghostOn) { ghostOn = false; schedule(); }
  });

  window.addEventListener('scroll', schedule, { capture: true, passive: true });
  window.addEventListener('resize', schedule, { passive: true });

  // Charts often re-render (date range changes, live data, metric toggles); refresh periodically.
  setInterval(() => { if (lines.length) schedule(); }, INFO_TTL);
})();
