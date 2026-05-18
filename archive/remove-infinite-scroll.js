(function() {
  const EXCLUDED_DOMAINS = [
    'telegram.org',
    'musclelab.la',
    'musclelab.test',
    'twitch.tv',
    'runescape.wiki'
  ];

  const hostname = window.location.hostname;
  if (EXCLUDED_DOMAINS.some(domain => hostname.includes(domain))) {
    return;
  }

  const SITE_CONFIG = [
    { domain: 'facebook.com', limit: 3000 },
    { domain: 'linkedin.com', limit: 3000 },
    { domain: 'x.com', limit: 3000 },
  ];
  const DEFAULT_LIMIT = 12000;

  function getLimit() {
    const config = SITE_CONFIG.find(site => hostname.includes(site.domain));
    return config ? config.limit : DEFAULT_LIMIT;
  }

  const MAX_SCROLL_CHUNK = getLimit();
  
  // Store state for each scrollable element
  const scroll_states = new WeakMap(); 
  const active_buttons = new WeakMap();
  
  // Touch tracking
  let touch_start_y = 0;

  function getScrollState(target) {
    if (!scroll_states.has(target)) {
      scroll_states.set(target, { baseline: 0, blocked: false });
    }
    return scroll_states.get(target);
  }

  function getScrollPosition(target) {
    return target === window ? window.scrollY : target.scrollTop;
  }

  function setScrollPosition(target, pos) {
    if (target === window) window.scrollTo(window.scrollX, pos);
    else target.scrollTop = pos;
  }

  function isBlocked(target) {
    if (!target) return false;
    // Walk up the tree to check if any scrollable parent is blocked
    // But usually we just care about the target being scrolled.
    // Events like wheel bubble, so the target might be a child of the scroll container.
    // We need to find the scroll container associated with the event target.
    // For simplicity in the global handlers, we might need to find the closest scrollable parent.
    // However, since we track specific targets in scroll_states, we can check if the target passed to us is blocked.
    return scroll_states.has(target) && scroll_states.get(target).blocked;
  }

  function handleScroll(e) {
    const target = e.target === document ? window : e.target;
    if (target !== window && !(target instanceof HTMLElement)) return;

    const state = getScrollState(target);
    const current_scroll = getScrollPosition(target);
    const limit = state.baseline + MAX_SCROLL_CHUNK;

    if (state.blocked) {
      if (current_scroll > limit) {
        // Force reset
        setScrollPosition(target, limit);
        showContinueButton(target, state);
      }
      return;
    }

    if (current_scroll > limit) {
      state.blocked = true;
      setScrollPosition(target, limit);
      showContinueButton(target, state);
    }
  }

  // Intercept inputs to prevent scrolling when blocked
  function handleInput(e) {
    // We need to find which element is the scroll container for this event
    // It's usually the target or one of its ancestors.
    // Since we don't know easily which one handles the scroll without expensive checks,
    // we can check if any ancestor is currently blocked.
    
    let el = e.target;
    while (el) {
      const target = el === document.documentElement || el === document.body ? window : el;
      if (scroll_states.has(target)) {
        const state = scroll_states.get(target);
        if (state.blocked) {
          const current_scroll = getScrollPosition(target);
          const limit = state.baseline + MAX_SCROLL_CHUNK;
          
          // Allow scrolling UP (less than limit)
          // But prevent scrolling DOWN (past limit)
          
          let trying_to_scroll_down = false;
          
          if (e.type === 'wheel') {
            if (e.deltaY > 0) trying_to_scroll_down = true;
          } else if (e.type === 'keydown') {
            if (['ArrowDown', 'Space', 'PageDown', 'End'].includes(e.code)) trying_to_scroll_down = true;
            if (e.code === 'Space' && e.shiftKey) trying_to_scroll_down = false;
          } else if (e.type === 'touchmove') {
            if (touch_start_y > e.touches[0].clientY) trying_to_scroll_down = true;
          }

          if (trying_to_scroll_down && current_scroll >= limit - 5) { // tolerance
             e.preventDefault();
             e.stopPropagation();
             setScrollPosition(target, limit);
             return;
          }
        }
      }
      if (el === window || el === document) break;
      el = el.parentElement;
      if (!el && target !== window) el = window; // Check window last
      else if (!el) break;
    }
  }

  function handleTouchStart(e) {
    touch_start_y = e.touches[0].clientY;
  }

  function showContinueButton(target, state) {
    // Map window to document.body for button placement context if needed, 
    // but we use fixed positioning so it doesn't matter much.
    // Use a unique key for the button map.
    const key_target = target; 

    if (active_buttons.has(key_target)) {
      const existing_btn = active_buttons.get(key_target);
      if (existing_btn.isConnected) return;
      active_buttons.delete(key_target);
    }

    const btn = document.createElement('button');
    btn.textContent = 'Continue Scrolling';
    btn.style = "position: fixed; bottom: 40px; left: 50%; transform: translateX(-50%); background: #1f2937; color: #fff; padding: 12px 24px; border-radius: 9999px; font-weight: 600; font-family: system-ui, -apple-system, sans-serif; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); z-index: 2147483647; cursor: pointer; transition: all 0.2s;";
    
    btn.onmouseenter = () => btn.style.transform = 'translateX(-50%) scale(1.05)';
    btn.onmouseleave = () => btn.style.transform = 'translateX(-50%) scale(1)';
    
    btn.onclick = (e) => {
      e.stopPropagation();
      e.preventDefault();
      state.baseline = getScrollPosition(target);
      state.blocked = false;
      btn.remove();
      active_buttons.delete(key_target);
    };

    document.body.appendChild(btn);
    active_buttons.set(key_target, btn);
  }

  // Passive: false is crucial for preventing default
  window.addEventListener('scroll', handleScroll, { capture: true, passive: false });
  window.addEventListener('wheel', handleInput, { capture: true, passive: false });
  window.addEventListener('keydown', handleInput, { capture: true, passive: false });
  window.addEventListener('touchstart', handleTouchStart, { capture: true, passive: true });
  window.addEventListener('touchmove', handleInput, { capture: true, passive: false });

  console.log(`Infinite scroll limiter loaded (Limit: ${MAX_SCROLL_CHUNK}px)`);
})();
