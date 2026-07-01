(function () {
  const STORAGE_KEY = 'normalize_twitch_followed_channels';
  const SESSION_ALLOW_KEY = 'normalize_twitch_session_allowed';
  const CHAT_HIDDEN_KEY = 'normalize_twitch_chat_hidden';

  try { sessionStorage.removeItem(SESSION_ALLOW_KEY); } catch (e) {}

  const reserved_paths = new Set([
    '', 'directory', 'p', 'search', 'settings', 'wallet', 'inventory',
    'messages', 'subscriptions', 'friends', 'drops', 'turbo', 'prime',
    'bits', 'teams', 'team', 'jobs', 'login', 'signup', 'legal', 'safety',
    'following', 'popout', 'moderator', 'embed', 'videos', 'broadcast',
    'creatorcamp', 'downloads', 'redeem', 'store', 'communities',
    'security-advisories', 'sitemap', 'collections', 'user', 'payments',
    'friends-list',
  ]);

  const css = `
    .onsite-notifications,
    div[aria-label="Live Channels"].side-nav-section,
    div[aria-label="Recommended Categories"].side-nav-section,
    div[aria-label$="Viewers Also Watch"].side-nav-section,
    a[data-test-selector="followed-channel"] div:has(> p[title^="Watch Streak"]) {
      display: none !important;
    }

    [data-a-target="animated-channel-viewers-count"],
    .live-time,
    [data-a-target="side-nav-live-status"] span[aria-hidden="true"] {
      filter: blur(6px);
      transition: filter 0.15s ease;
      cursor: pointer;
      display: inline-block;
    }

    [data-a-target="animated-channel-viewers-count"]:hover,
    .live-time:hover,
    [data-a-target="side-nav-live-status"] span[aria-hidden="true"]:hover {
      filter: none;
    }

    body.normalize-twitch-chat-hidden #live-page-chat {
      display: none !important;
    }

    .normalize-twitch-chat-toggle {
      position: fixed;
      bottom: 16px;
      right: 16px;
      z-index: 2147483645;
      background: #1f1f23;
      color: #efeff1;
      border: 1px solid #3a3a40;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      font-family: inherit;
      opacity: 0.55;
      transition: opacity 0.15s ease, background 0.15s ease;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
    }

    .normalize-twitch-chat-toggle:hover {
      opacity: 1;
      background: #2f2f35;
    }

    .normalize-twitch-block-overlay {
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      left: 0;
      background: #000;
      z-index: 2147483646;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      font-family: inherit;
    }

    .normalize-twitch-block-modal {
      background: #1f1f23;
      color: #efeff1;
      padding: 28px;
      border-radius: 12px;
      max-width: 440px;
      width: 100%;
      text-align: center;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
      border: 1px solid #2f2f35;
    }

    .normalize-twitch-block-modal h2 {
      font-size: 20px;
      font-weight: 700;
      margin: 0 0 10px;
    }

    .normalize-twitch-block-modal p {
      font-size: 14px;
      color: #adadb8;
      margin: 0 0 22px;
      line-height: 1.5;
    }

    .normalize-twitch-block-modal strong {
      color: #efeff1;
    }

    .normalize-twitch-block-input {
      width: 100%;
      padding: 10px 12px;
      font-size: 14px;
      border-radius: 4px;
      border: 1px solid #3a3a40;
      background: #0e0e10;
      color: #efeff1;
      margin: 0 0 16px;
      box-sizing: border-box;
      font-family: inherit;
      outline: none;
    }

    .normalize-twitch-block-input:focus {
      border-color: #9147ff;
    }

    .normalize-twitch-block-actions {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    @media (min-width: 480px) {
      .normalize-twitch-block-actions {
        flex-direction: row;
        justify-content: center;
      }
    }

    .normalize-twitch-block-button {
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

    .normalize-twitch-block-button:disabled {
      cursor: not-allowed;
      opacity: 0.45;
    }

    @media (min-width: 480px) {
      .normalize-twitch-block-button {
        max-width: 180px;
      }
    }

    .normalize-twitch-block-button--primary {
      background: #9147ff;
      color: #fff;
    }

    .normalize-twitch-block-button--primary:not(:disabled):hover {
      background: #772ce8;
    }

    .normalize-twitch-block-button--secondary {
      background: #2f2f35;
      color: #efeff1;
    }

    .normalize-twitch-block-button--secondary:hover {
      background: #3a3a40;
    }
  `;

  function injectStyles() {
    if (document.getElementById('normalize-twitch-styles')) return;
    const style = document.createElement('style');
    style.id = 'normalize-twitch-styles';
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }

  function readStoredSet(key, storage) {
    try {
      const raw = storage.getItem(key);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch (e) {
      return new Set();
    }
  }

  function writeStoredSet(key, storage, set) {
    try {
      storage.setItem(key, JSON.stringify([...set]));
    } catch (e) {}
  }

  function getFollowedChannels() {
    return readStoredSet(STORAGE_KEY, localStorage);
  }

  let confirmed_channel = null;
  let has_scraped_followed_list = false;
  const first_check_time = Date.now();

  function scrapeFollowedChannels() {
    const links = document.querySelectorAll('a[data-test-selector="followed-channel"]');
    if (! links.length) return;

    const usernames = new Set();
    links.forEach(link => {
      const href = link.getAttribute('href');
      if (href && href.startsWith('/')) {
        const username = href.slice(1).split('/')[0].toLowerCase();
        if (username) usernames.add(username);
      }
    });

    if (usernames.size === 0) return;

    has_scraped_followed_list = true;
    const existing = getFollowedChannels();
    let changed = false;
    usernames.forEach(u => {
      if (! existing.has(u)) {
        existing.add(u);
        changed = true;
      }
    });

    if (changed) {
      writeStoredSet(STORAGE_KEY, localStorage, existing);
    }
  }

  function isChatHidden() {
    try {
      const value = localStorage.getItem(CHAT_HIDDEN_KEY);
      if (value === null) return true;
      return value === '1';
    } catch (e) {
      return true;
    }
  }

  function setChatHidden(hidden) {
    try {
      localStorage.setItem(CHAT_HIDDEN_KEY, hidden ? '1' : '0');
    } catch (e) {}
  }

  function applyChatVisibility() {
    if (! document.body) return;
    document.body.classList.toggle('normalize-twitch-chat-hidden', isChatHidden());
    const btn = document.getElementById('normalize-twitch-chat-toggle');
    if (btn) btn.textContent = isChatHidden() ? 'Show Chat' : 'Hide Chat';
  }

  function manageChatToggle() {
    const chat = document.getElementById('live-page-chat');
    const existing = document.getElementById('normalize-twitch-chat-toggle');
    if (! chat && ! isChatHidden()) {
      if (existing) existing.remove();
      return;
    }
    if (existing) return;
    const btn = document.createElement('button');
    btn.id = 'normalize-twitch-chat-toggle';
    btn.className = 'normalize-twitch-chat-toggle';
    btn.textContent = isChatHidden() ? 'Show Chat' : 'Hide Chat';
    btn.addEventListener('click', () => {
      setChatHidden(! isChatHidden());
      applyChatVisibility();
    });
    document.body.appendChild(btn);
  }

  function cleanTitle() {
    const cleaned = document.title.replace(/^\s*\(\d+\)\s*/, '');
    if (cleaned !== document.title) document.title = cleaned;
  }

  function watchTitle() {
    cleanTitle();
    if (typeof MutationObserver === 'undefined') return;
    const title_el = document.querySelector('title');
    if (! title_el) return;
    const observer = new MutationObserver(cleanTitle);
    observer.observe(title_el, { childList: true, characterData: true, subtree: true });
  }

  function getChannelFromUrl() {
    const path = window.location.pathname.replace(/^\/+|\/+$/g, '');
    if (! path) return null;
    const segments = path.split('/');
    const first = segments[0].toLowerCase();
    if (reserved_paths.has(first)) return null;
    if (first.startsWith('.')) return null;
    return first;
  }

  let current_overlay = null;
  let current_channel = null;
  let pause_interval = null;
  let sidebar_observer = null;

  function getSidebar() {
    return document.getElementById('side-nav') || document.querySelector('[aria-label="Left Navigation"]');
  }

  function positionOverlay() {
    if (! current_overlay) return;
    const sidebar = getSidebar();
    if (sidebar) {
      const rect = sidebar.getBoundingClientRect();
      current_overlay.style.left = Math.max(0, rect.right) + 'px';
    } else {
      current_overlay.style.left = '0px';
    }
  }

  function startSidebarTracking() {
    stopSidebarTracking();
    const sidebar = getSidebar();
    if (sidebar && typeof ResizeObserver !== 'undefined') {
      sidebar_observer = new ResizeObserver(positionOverlay);
      sidebar_observer.observe(sidebar);
    }
    window.addEventListener('resize', positionOverlay);
  }

  function stopSidebarTracking() {
    if (sidebar_observer) {
      sidebar_observer.disconnect();
      sidebar_observer = null;
    }
    window.removeEventListener('resize', positionOverlay);
  }

  function pauseVideos() {
    document.querySelectorAll('video').forEach(v => {
      try { v.pause(); } catch (e) {}
    });
  }

  function resumeVideos() {
    document.querySelectorAll('video').forEach(v => {
      try { v.play(); } catch (e) {}
    });
  }

  function showBlockOverlay(channel) {
    if (current_overlay) return;

    const countdown_seconds = 3;

    const overlay = document.createElement('div');
    overlay.className = 'normalize-twitch-block-overlay';
    overlay.innerHTML = '<div class="normalize-twitch-block-modal" role="dialog" aria-modal="true"><h2>Heads up</h2><p>You are not following <strong></strong>. Type the channel name to confirm you want to watch.</p><input type="text" class="normalize-twitch-block-input" data-input="channel" autocomplete="off" spellcheck="false"><div class="normalize-twitch-block-actions"><button class="normalize-twitch-block-button normalize-twitch-block-button--secondary" data-action="cancel">Go Back</button><button class="normalize-twitch-block-button normalize-twitch-block-button--primary" data-action="confirm" disabled></button></div></div>';
    overlay.querySelector('strong').textContent = channel;

    const input = overlay.querySelector('[data-input="channel"]');
    const confirm_button = overlay.querySelector('[data-action="confirm"]');
    input.placeholder = 'Type "' + channel + '"';

    document.body.appendChild(overlay);
    current_overlay = overlay;

    positionOverlay();
    startSidebarTracking();

    pauseVideos();
    pause_interval = setInterval(pauseVideos, 300);

    let seconds_remaining = countdown_seconds;
    let countdown_done = false;
    let countdown_interval = null;

    function render() {
      const name_matches = input.value.trim().toLowerCase() === channel.toLowerCase();
      if (! name_matches) {
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
      seconds_remaining = countdown_seconds;
      countdown_interval = setInterval(() => {
        seconds_remaining -= 1;
        if (seconds_remaining <= 0) {
          countdown_done = true;
          clearInterval(countdown_interval);
          countdown_interval = null;
        }
        overlay.dataset.countdownInterval = countdown_interval ? String(countdown_interval) : '';
        render();
      }, 1000);
      overlay.dataset.countdownInterval = String(countdown_interval);
    }

    function stopCountdown() {
      if (countdown_interval) {
        clearInterval(countdown_interval);
        countdown_interval = null;
        overlay.dataset.countdownInterval = '';
      }
      countdown_done = false;
      seconds_remaining = countdown_seconds;
    }

    input.addEventListener('input', () => {
      const name_matches = input.value.trim().toLowerCase() === channel.toLowerCase();
      if (name_matches) {
        startCountdown();
      } else {
        stopCountdown();
      }
      render();
    });

    render();

    setTimeout(() => { try { input.focus(); } catch (e) {} }, 50);

    confirm_button.addEventListener('click', () => {
      if (confirm_button.disabled) return;
      confirmed_channel = channel;
      removeBlockOverlay();
      resumeVideos();
    });

    overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => {
      if (window.history.length > 1) {
        window.history.back();
      } else {
        window.location.href = 'https://www.twitch.tv/';
      }
    });
  }

  function removeBlockOverlay() {
    if (pause_interval) {
      clearInterval(pause_interval);
      pause_interval = null;
    }
    stopSidebarTracking();
    if (current_overlay) {
      const countdown_interval = Number(current_overlay.dataset.countdownInterval);
      if (countdown_interval) clearInterval(countdown_interval);
      current_overlay.remove();
      current_overlay = null;
    }
  }

  function evaluate() {
    const channel = getChannelFromUrl();

    if (channel !== current_channel) {
      current_channel = channel;
      confirmed_channel = null;
      removeBlockOverlay();
    }

    if (! channel) return;
    if (confirmed_channel === channel) return;
    if (getFollowedChannels().has(channel)) return;

    if (! has_scraped_followed_list && getFollowedChannels().size === 0 && Date.now() - first_check_time < 4000) {
      return;
    }

    showBlockOverlay(channel);
  }

  function tick() {
    try {
      cleanTitle();
      scrapeFollowedChannels();
      evaluate();
      manageChatToggle();
    } catch (e) {
      console.error('normalize-twitch error', e);
    }
  }

  function init() {
    injectStyles();
    if (! document.body) {
      requestAnimationFrame(init);
      return;
    }
    applyChatVisibility();
    watchTitle();
    tick();
    setInterval(tick, 500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
