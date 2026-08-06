(function () {
  const COUNTDOWN_SECONDS = 3;

  const reserved_paths = new Set([
    '', 'search', 'settings', 'about', 'i', 'pic', 'video', 'rss', 'opensearch',
    'privacy', 'unsupported', 'favicon.ico', 'robots.txt', 'sitemap.xml', 'login',
  ]);

  const profile_sub_paths = new Set([
    'status', 'with_replies', 'media', 'favorites', 'followers', 'following', 'search',
  ]);

  const css = `
    .tweet-stat,
    .tweet-date,
    .profile-stat-num {
      filter: blur(5px);
      transition: filter 0.15s ease;
      cursor: pointer;
    }

    .tweet-stat,
    .tweet-date {
      display: inline-block;
    }

    .tweet-stat.normalize-xcancel-reveal,
    .tweet-date.normalize-xcancel-reveal,
    .profile-stat-num:hover,
    .profile-statlist li:hover .profile-stat-num,
    .profile-statlist li:active .profile-stat-num {
      filter: none;
    }

    .profile-card-avatar {
      cursor: zoom-in;
    }

    .normalize-xcancel-lens {
      position: fixed;
      width: 96px;
      height: 96px;
      border-radius: 50%;
      border: 3px solid rgba(248, 248, 242, 0.9);
      background-color: #0f0f0f;
      background-repeat: no-repeat;
      box-shadow: 0 10px 28px rgba(0, 0, 0, 0.55), inset 0 0 20px rgba(0, 0, 0, 0.4);
      pointer-events: none;
      z-index: 2147483000;
    }

    @media (min-width: 480px) {
      .normalize-xcancel-lens {
        width: 130px;
        height: 130px;
      }
    }

    .normalize-xcancel-lens::after {
      content: "";
      position: absolute;
      top: 92%;
      left: 78%;
      width: 34%;
      height: 11%;
      border-radius: 999px;
      background: rgba(248, 248, 242, 0.9);
      box-shadow: 0 4px 10px rgba(0, 0, 0, 0.5);
      transform: rotate(45deg);
      transform-origin: top left;
    }

    html.normalize-xcancel-gated,
    html.normalize-xcancel-gated body {
      overflow: hidden !important;
    }

    html.normalize-xcancel-gated body > *:not(.normalize-xcancel-block-overlay) {
      visibility: hidden !important;
    }

    .normalize-xcancel-block-overlay {
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      left: 0;
      background: #0f0f0f;
      z-index: 2147483646;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }

    .normalize-xcancel-block-modal {
      background: #161616;
      color: #f8f8f2;
      padding: 24px;
      border-radius: 12px;
      max-width: 440px;
      width: 100%;
      text-align: center;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
      border: 1px solid #2a2a2a;
      box-sizing: border-box;
    }

    @media (min-width: 480px) {
      .normalize-xcancel-block-modal {
        padding: 28px;
      }
    }

    .normalize-xcancel-block-modal h2 {
      font-size: 20px;
      font-weight: 700;
      margin: 0 0 10px;
    }

    .normalize-xcancel-block-modal p {
      font-size: 14px;
      color: #9c9c9c;
      margin: 0 0 22px;
      line-height: 1.5;
    }

    .normalize-xcancel-block-modal strong {
      color: #f8f8f2;
    }

    .normalize-xcancel-block-input {
      width: 100%;
      padding: 12px;
      font-size: 16px;
      border-radius: 4px;
      border: 1px solid #3a3a3a;
      background: #0f0f0f;
      color: #f8f8f2;
      margin: 0 0 16px;
      box-sizing: border-box;
      font-family: inherit;
      outline: none;
    }

    .normalize-xcancel-block-input:focus {
      border-color: #ff6c60;
    }

    .normalize-xcancel-block-actions {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    @media (min-width: 480px) {
      .normalize-xcancel-block-actions {
        flex-direction: row;
        justify-content: center;
      }
    }

    .normalize-xcancel-block-button {
      padding: 12px 16px;
      font-size: 14px;
      font-weight: 600;
      border-radius: 4px;
      border: none;
      cursor: pointer;
      flex: 1;
      font-family: inherit;
      transition: background 0.15s ease, opacity 0.15s ease;
    }

    .normalize-xcancel-block-button:disabled {
      cursor: not-allowed;
      opacity: 0.45;
    }

    @media (min-width: 480px) {
      .normalize-xcancel-block-button {
        max-width: 180px;
      }
    }

    .normalize-xcancel-block-button--primary {
      background: #ff6c60;
      color: #14100f;
    }

    .normalize-xcancel-block-button--primary:not(:disabled):hover {
      background: #ff8c82;
    }

    .normalize-xcancel-block-button--secondary {
      background: #2a2a2a;
      color: #f8f8f2;
    }

    .normalize-xcancel-block-button--secondary:hover {
      background: #363636;
    }
  `;

  function injectStyles() {
    if (document.getElementById('normalize-xcancel-styles')) return;
    const style = document.createElement('style');
    style.id = 'normalize-xcancel-styles';
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }

  function getProfileFromUrl() {
    const path = window.location.pathname.replace(/^\/+|\/+$/g, '');
    if (! path) return null;
    const segments = path.split('/');
    const first = decodeURIComponent(segments[0]).toLowerCase();
    if (! first || reserved_paths.has(first)) return null;
    if (first.startsWith('.') || first.includes('.')) return null;
    if (segments.length > 1 && ! profile_sub_paths.has(segments[1].toLowerCase())) return null;
    return first;
  }

  let pause_interval = null;
  let countdown_interval = null;

  function pauseMedia() {
    document.querySelectorAll('video, audio').forEach(el => {
      try { el.pause(); } catch (e) {}
    });
  }

  function showBlockOverlay(profile) {
    if (document.querySelector('.normalize-xcancel-block-overlay')) return;

    const overlay = document.createElement('div');
    overlay.className = 'normalize-xcancel-block-overlay';
    overlay.innerHTML = '<div class="normalize-xcancel-block-modal" role="dialog" aria-modal="true"><h2>Heads up</h2><p>Type <strong></strong> to confirm this is the account you meant to open.</p><input type="text" class="normalize-xcancel-block-input" data-input="profile" autocomplete="off" autocapitalize="off" spellcheck="false"><div class="normalize-xcancel-block-actions"><button class="normalize-xcancel-block-button normalize-xcancel-block-button--secondary" data-action="cancel">Go Back</button><button class="normalize-xcancel-block-button normalize-xcancel-block-button--primary" data-action="confirm" disabled></button></div></div>';
    overlay.querySelector('strong').textContent = '@' + profile;

    const input = overlay.querySelector('[data-input="profile"]');
    const confirm_button = overlay.querySelector('[data-action="confirm"]');
    input.placeholder = 'Type "' + profile + '"';

    document.body.appendChild(overlay);
    document.documentElement.classList.add('normalize-xcancel-gated');

    pauseMedia();
    pause_interval = setInterval(pauseMedia, 300);

    let seconds_remaining = COUNTDOWN_SECONDS;
    let countdown_done = false;

    function nameMatches() {
      return input.value.trim().replace(/^@/, '').toLowerCase() === profile;
    }

    function render() {
      if (! nameMatches()) {
        confirm_button.textContent = 'View Anyway';
        confirm_button.disabled = true;
        return;
      }
      if (! countdown_done) {
        confirm_button.textContent = 'View Anyway (' + seconds_remaining + 's)';
        confirm_button.disabled = true;
        return;
      }
      confirm_button.textContent = 'View Anyway';
      confirm_button.disabled = false;
    }

    function startCountdown() {
      if (countdown_interval || countdown_done) return;
      seconds_remaining = COUNTDOWN_SECONDS;
      countdown_interval = setInterval(() => {
        seconds_remaining -= 1;
        if (seconds_remaining <= 0) {
          countdown_done = true;
          clearInterval(countdown_interval);
          countdown_interval = null;
        }
        render();
      }, 1000);
    }

    function stopCountdown() {
      if (countdown_interval) {
        clearInterval(countdown_interval);
        countdown_interval = null;
      }
      countdown_done = false;
      seconds_remaining = COUNTDOWN_SECONDS;
    }

    input.addEventListener('input', () => {
      if (nameMatches()) {
        startCountdown();
      } else {
        stopCountdown();
      }
      render();
    });

    input.addEventListener('keydown', event => {
      if (event.key === 'Enter' && ! confirm_button.disabled) confirm_button.click();
    });

    render();

    setTimeout(() => { try { input.focus(); } catch (e) {} }, 50);

    confirm_button.addEventListener('click', () => {
      if (confirm_button.disabled) return;
      stopCountdown();
      if (pause_interval) {
        clearInterval(pause_interval);
        pause_interval = null;
      }
      document.documentElement.classList.remove('normalize-xcancel-gated');
      overlay.remove();
    });

    overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => {
      if (window.history.length > 1) {
        window.history.back();
      } else {
        window.location.href = 'https://' + window.location.hostname + '/';
      }
    });
  }

  let hovered_node = null;
  let move_frame = null;
  let pending_point = null;

  function revealTargetUnderPoint(target, x, y) {
    if (! target || ! target.closest) return null;
    const container = target.closest('.timeline-item, .main-tweet, .tweet-body');
    if (! container) return null;
    const nodes = container.querySelectorAll('.tweet-stat, .tweet-date');
    for (const node of nodes) {
      const rect = node.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return node;
    }
    return null;
  }

  function setHoveredNode(node) {
    if (hovered_node === node) return;
    if (hovered_node && hovered_node.dataset.xcancelLocked !== '1') {
      hovered_node.classList.remove('normalize-xcancel-reveal');
    }
    hovered_node = node;
    if (node) node.classList.add('normalize-xcancel-reveal');
  }

  function watchRevealHover() {
    document.addEventListener('mousemove', event => {
      pending_point = { target: event.target, x: event.clientX, y: event.clientY };
      if (move_frame) return;
      move_frame = requestAnimationFrame(() => {
        move_frame = null;
        setHoveredNode(revealTargetUnderPoint(pending_point.target, pending_point.x, pending_point.y));
      });
    }, { passive: true });

    document.addEventListener('click', event => {
      const node = revealTargetUnderPoint(event.target, event.clientX, event.clientY);
      if (! node || node.classList.contains('normalize-xcancel-reveal')) return;
      event.preventDefault();
      event.stopPropagation();
      node.dataset.xcancelLocked = '1';
      node.classList.add('normalize-xcancel-reveal');
    }, true);
  }

  let lens_node = null;
  let lens_anchor = null;
  let lens_rect = null;
  let lens_size = 0;

  function removeLens() {
    if (lens_node) {
      lens_node.remove();
      lens_node = null;
    }
    lens_anchor = null;
    lens_rect = null;
  }

  function createLens(anchor, img) {
    const rect = img.getBoundingClientRect();
    if (! rect.width || ! rect.height) return false;

    removeLens();

    const zoom = 2.6;
    lens_node = document.createElement('div');
    lens_node.className = 'normalize-xcancel-lens';
    lens_node.style.backgroundImage = 'url("' + (anchor.getAttribute('href') || img.src) + '")';
    lens_node.style.backgroundSize = (rect.width * zoom) + 'px ' + (rect.height * zoom) + 'px';
    document.body.appendChild(lens_node);

    lens_anchor = anchor;
    lens_rect = rect;
    lens_size = lens_node.offsetWidth || 96;
    lens_node.dataset.zoom = String(zoom);
    return true;
  }

  function updateLens(anchor, x, y) {
    const img = anchor.querySelector('img');
    if (! img) {
      removeLens();
      return;
    }

    if (lens_anchor !== anchor && ! createLens(anchor, img)) return;

    const zoom = Number(lens_node.dataset.zoom);
    const local_x = Math.min(Math.max(x - lens_rect.left, 0), lens_rect.width);
    const local_y = Math.min(Math.max(y - lens_rect.top, 0), lens_rect.height);

    lens_node.style.left = (x - lens_size / 2) + 'px';
    lens_node.style.top = (y - lens_size / 2) + 'px';
    lens_node.style.backgroundPosition = (lens_size / 2 - local_x * zoom) + 'px ' + (lens_size / 2 - local_y * zoom) + 'px';
  }

  function watchAvatarLens() {
    document.addEventListener('pointermove', event => {
      if (event.pointerType && event.pointerType !== 'mouse') return;
      const anchor = event.target && event.target.closest ? event.target.closest('.profile-card-avatar') : null;
      if (! anchor) {
        if (lens_node) removeLens();
        return;
      }
      updateLens(anchor, event.clientX, event.clientY);
    }, { passive: true });

    document.addEventListener('scroll', removeLens, { passive: true, capture: true });
    window.addEventListener('resize', removeLens);
    window.addEventListener('blur', removeLens);
  }

  function hasProfileContent() {
    return !! document.querySelector('.profile-card, .main-tweet, .timeline, .conversation, #posts');
  }

  function evaluate(profile) {
    if (! hasProfileContent()) {
      document.documentElement.classList.remove('normalize-xcancel-gated');
      return;
    }
    showBlockOverlay(profile);
  }

  function init() {
    injectStyles();
    watchRevealHover();
    watchAvatarLens();

    const profile = getProfileFromUrl();
    if (! profile) return;

    document.documentElement.classList.add('normalize-xcancel-gated');

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => evaluate(profile));
    } else {
      evaluate(profile);
    }
  }

  init();
})();
