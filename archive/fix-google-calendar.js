(function() {
  if (! window.location.hostname.includes('calendar.google.com')) return;

  const TARGET_HOUR_HEIGHT = 48;
  const TARGET_DAY_HEIGHT = TARGET_HOUR_HEIGHT * 24;
  const STYLE_ID = 'np-gcal-style';
  const VIEW_FLAG = 'np-gcal-timed';
  const CELL_SELECTOR = '[role="gridcell"][data-datekey]';
  const EVENT_SELECTOR = '[data-eventchip]';
  const HOUR_LABEL_RE = /^\s*\d{1,2}\s*(AM|PM)\s*$/i;
  const RANGE_RE = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:to|[\u2013\u2014\-])\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i;
  const SINGLE_RE = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i;
  const VIEW_RE = /\/r\/(week|day|customday|customweek)(?:\/|$)/;
  const DEBUG = true;

  function isTimedView() {
    return VIEW_RE.test(window.location.pathname);
  }

  function syncViewFlag() {
    document.documentElement.classList.toggle(VIEW_FLAG, isTimedView());
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      html.${VIEW_FLAG},
      html.${VIEW_FLAG} body,
      html.${VIEW_FLAG} [role="main"],
      html.${VIEW_FLAG} [role="grid"],
      html.${VIEW_FLAG} [role="row"],
      html.${VIEW_FLAG} ${CELL_SELECTOR} {
        --cal-timed-grid-cell-height: ${TARGET_HOUR_HEIGHT}px !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function parseTimePart(hours_str, mins_str, period) {
    let h = parseInt(hours_str, 10);
    const m = parseInt(mins_str || '0', 10);
    if (period) {
      period = period.toLowerCase();
      if (period === 'pm' && h !== 12) h += 12;
      if (period === 'am' && h === 12) h = 0;
    }
    return h + m / 60;
  }

  function parseEventTime(event_el) {
    const sources = [
      event_el.getAttribute('aria-label') || '',
      event_el.getAttribute('data-text') || '',
      event_el.textContent || ''
    ];
    for (const text of sources) {
      if (! text) continue;
      const range = text.match(RANGE_RE);
      if (range) {
        const start_hour = parseTimePart(range[1], range[2], range[3]);
        const end_hour = parseTimePart(range[4], range[5], range[6]);
        let duration = end_hour - start_hour;
        if (duration <= 0) duration += 24;
        if (duration > 0 && duration <= 24) return { start_hour, duration, has_end: true };
      }
    }
    for (const text of sources) {
      if (! text) continue;
      const single = text.match(SINGLE_RE);
      if (single) {
        const start_hour = parseTimePart(single[1], single[2], single[3]);
        return { start_hour, duration: null, has_end: false };
      }
    }
    return null;
  }

  function isTimedDayCell(cell) {
    const r = cell.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    if (r.height < 100) return false;
    if (r.width > r.height) return false;
    return true;
  }

  function setStyleIfChanged(el, prop, value) {
    if (el.style.getPropertyValue(prop) === value && el.style.getPropertyPriority(prop) === 'important') return;
    el.style.setProperty(prop, value, 'important');
  }

  function fixCells() {
    document.querySelectorAll(CELL_SELECTOR).forEach(cell => {
      if (! isTimedDayCell(cell)) return;
      setStyleIfChanged(cell, 'height', TARGET_DAY_HEIGHT + 'px');
      setStyleIfChanged(cell, 'min-height', TARGET_DAY_HEIGHT + 'px');
    });
  }

  function findHourLabels() {
    const roots = document.querySelectorAll('[role="grid"]');
    if (! roots.length) return [];
    const labels = [];
    roots.forEach(root => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
        acceptNode(node) {
          if (node.children.length !== 0) return NodeFilter.FILTER_SKIP;
          if (HOUR_LABEL_RE.test((node.textContent || '').trim())) return NodeFilter.FILTER_ACCEPT;
          return NodeFilter.FILTER_SKIP;
        }
      });
      let n;
      while ((n = walker.nextNode())) labels.push(n);
    });
    return labels;
  }

  function fixGutterLabels() {
    findHourLabels().forEach(el => {
      setStyleIfChanged(el, 'height', TARGET_HOUR_HEIGHT + 'px');
      setStyleIfChanged(el, 'min-height', TARGET_HOUR_HEIGHT + 'px');
      setStyleIfChanged(el, 'line-height', TARGET_HOUR_HEIGHT + 'px');
      setStyleIfChanged(el, 'box-sizing', 'border-box');
    });
  }

  function detectNaturalHourHeight(events) {
    for (const ev of events) {
      if (! ev.style.top || ! ev.style.height) continue;
      const time = parseEventTime(ev);
      if (! time || ! time.has_end || time.start_hour <= 0) continue;
      const cur_top = parseFloat(ev.style.top);
      const cur_h = parseFloat(ev.style.height);
      if (! Number.isFinite(cur_top) || ! Number.isFinite(cur_h) || cur_h <= 0) continue;
      const from_top = cur_top / time.start_hour;
      const from_height = cur_h / time.duration;
      const candidates = [from_top, from_height].filter(v => v > 5 && v < 200);
      if (candidates.length) {
        return candidates.reduce((a, b) => a + b, 0) / candidates.length;
      }
    }
    return null;
  }

  function fixEvent(event_el, natural_hour_height) {
    if (! event_el || ! event_el.style) return null;
    if (! event_el.style.top || ! event_el.style.height) return null;

    const cur_top = parseFloat(event_el.style.top);
    const cur_height = parseFloat(event_el.style.height);
    if (! Number.isFinite(cur_top) || ! Number.isFinite(cur_height)) return null;

    const time = parseEventTime(event_el);

    let target_top = null;
    let target_height = null;
    let strategy = 'none';

    if (time && time.has_end) {
      target_top = time.start_hour * TARGET_HOUR_HEIGHT;
      target_height = time.duration * TARGET_HOUR_HEIGHT;
      strategy = 'range';
    } else if (natural_hour_height && Math.abs(natural_hour_height - TARGET_HOUR_HEIGHT) > 0.5) {
      const scale = TARGET_HOUR_HEIGHT / natural_hour_height;
      if (time && time.start_hour != null) {
        target_top = time.start_hour * TARGET_HOUR_HEIGHT;
        target_height = cur_height * scale;
        strategy = 'single+scale';
      } else {
        target_top = cur_top * scale;
        target_height = cur_height * scale;
        strategy = 'scale';
      }
    } else {
      return { strategy: 'skip', text: (event_el.textContent || '').slice(0, 60) };
    }

    if (! Number.isFinite(target_top) || ! Number.isFinite(target_height)) return null;

    if (Math.abs(cur_top - target_top) > 0.5) {
      setStyleIfChanged(event_el, 'top', target_top + 'px');
    }
    if (Math.abs(cur_height - target_height) > 0.5) {
      setStyleIfChanged(event_el, 'height', target_height + 'px');
    }

    return { strategy, cur_top, cur_height, target_top, target_height, text: (event_el.textContent || '').slice(0, 60) };
  }

  function fixAllEvents() {
    const events = Array.from(document.querySelectorAll(EVENT_SELECTOR));
    if (! events.length) return;
    const natural = detectNaturalHourHeight(events);
    const stats = { range: 0, 'single+scale': 0, scale: 0, skip: 0, samples: [] };
    events.forEach(ev => {
      const result = fixEvent(ev, natural);
      if (! result) return;
      stats[result.strategy] = (stats[result.strategy] || 0) + 1;
      if (stats.samples.length < 3) stats.samples.push(result);
    });
    if (DEBUG && (stats.skip > 0 || stats.samples.length)) {
      console.log('[np-gcal] events:', { natural_hour_height: natural, ...stats });
    }
  }

  function applyAll() {
    syncViewFlag();
    if (! isTimedView()) return;
    fixCells();
    fixGutterLabels();
    fixAllEvents();
  }

  let scheduled = false;
  function scheduleApply() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      applyAll();
    });
  }

  function shouldReact(mutations) {
    for (const mutation of mutations) {
      if (mutation.type !== 'childList') continue;
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches?.(CELL_SELECTOR) || node.matches?.(EVENT_SELECTOR)) return true;
        if (node.querySelector?.(`${CELL_SELECTOR}, ${EVENT_SELECTOR}, [role="grid"]`)) return true;
        if (node.children?.length === 0 && HOUR_LABEL_RE.test((node.textContent || '').trim())) return true;
      }
    }
    return false;
  }

  function init() {
    injectStyles();
    applyAll();

    new MutationObserver((mutations) => {
      if (shouldReact(mutations)) scheduleApply();
    }).observe(document.body, { childList: true, subtree: true });

    window.addEventListener('resize', scheduleApply, { passive: true });
    window.addEventListener('hashchange', scheduleApply);
    window.addEventListener('popstate', scheduleApply);

    setInterval(applyAll, 1500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
