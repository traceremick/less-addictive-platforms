(function () {
  const blocked_urls = [
    
  ];

  // How long the Bypass button stays disabled after the page is blocked.
  // Set to 0 for an instant bypass.
  const bypass_delay_seconds = 5;

  // A bypass lasts until the page is reloaded / the tab is closed.
  const bypassed_rules = new Set();

  function parseRule(entry) {
    try {
      const raw = String(entry).trim();
      if (! raw) return null;
      const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : 'https://' + raw);
      const host = url.hostname.toLowerCase().replace(/^www\./, '');
      const path = url.pathname.replace(/\*+$/, '').replace(/\/+$/, '').toLowerCase();
      return { key: host + path, host, path };
    } catch (e) {
      return null;
    }
  }

  const rules = blocked_urls.map(parseRule).filter(Boolean);

  function findMatchingRule() {
    const host = window.location.hostname.toLowerCase().replace(/^www\./, '');
    const path = window.location.pathname.replace(/\/+$/, '').toLowerCase();

    for (const rule of rules) {
      const host_matches = host === rule.host || host.endsWith('.' + rule.host);
      if (! host_matches) continue;
      if (rule.path === '' || path === rule.path || path.startsWith(rule.path + '/')) {
        return rule;
      }
    }
    return null;
  }

  if (! rules.length) return;

  const css = `
    .normalize-timeout-overlay {
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      left: 0;
      background: #0b0b0d;
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    .normalize-timeout-modal {
      background: #1a1a1e;
      color: #ececf0;
      padding: 28px;
      border-radius: 12px;
      max-width: 440px;
      width: 100%;
      text-align: center;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
      border: 1px solid #2d2d33;
    }

    .normalize-timeout-modal h2 {
      font-size: 20px;
      font-weight: 700;
      margin: 0 0 10px;
      color: #ececf0;
    }

    .normalize-timeout-modal p {
      font-size: 14px;
      color: #a8a8b3;
      margin: 0 0 22px;
      line-height: 1.5;
    }

    .normalize-timeout-modal strong {
      color: #ececf0;
      word-break: break-all;
    }

    .normalize-timeout-actions {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    @media (min-width: 480px) {
      .normalize-timeout-actions {
        flex-direction: row;
        justify-content: center;
      }
    }

    .normalize-timeout-button {
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

    .normalize-timeout-button:disabled {
      cursor: not-allowed;
      opacity: 0.45;
    }

    @media (min-width: 480px) {
      .normalize-timeout-button {
        max-width: 180px;
      }
    }

    .normalize-timeout-button--primary {
      background: #d97757;
      color: #fff;
    }

    .normalize-timeout-button--primary:not(:disabled):hover {
      background: #c4623f;
    }

    .normalize-timeout-button--secondary {
      background: #2d2d33;
      color: #ececf0;
    }

    .normalize-timeout-button--secondary:hover {
      background: #3a3a42;
    }

    html.normalize-timeout-locked {
      overflow: hidden !important;
    }
  `;

  function injectStyles() {
    if (document.getElementById('normalize-timeout-styles')) return;
    const style = document.createElement('style');
    style.id = 'normalize-timeout-styles';
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }

  let current_overlay = null;
  let current_rule_key = null;
  let pause_interval = null;
  let countdown_interval = null;

  function pauseMedia() {
    document.querySelectorAll('video, audio').forEach(m => {
      try { m.pause(); } catch (e) {}
    });
  }

  function showOverlay(rule) {
    if (current_overlay) return;

    injectStyles();

    const overlay = document.createElement('div');
    overlay.className = 'normalize-timeout-overlay';
    overlay.innerHTML = '<div class="normalize-timeout-modal" role="dialog" aria-modal="true"><h2>Timeout</h2><p>You put <strong></strong> in timeout.</p><div class="normalize-timeout-actions"><button class="normalize-timeout-button normalize-timeout-button--secondary" data-action="cancel">Go Back</button><button class="normalize-timeout-button normalize-timeout-button--primary" data-action="bypass" disabled>Bypass</button></div></div>';
    overlay.querySelector('strong').textContent = rule.host + rule.path;

    const bypass_button = overlay.querySelector('[data-action="bypass"]');

    (document.documentElement || document.body).appendChild(overlay);
    document.documentElement.classList.add('normalize-timeout-locked');
    current_overlay = overlay;

    pauseMedia();
    pause_interval = setInterval(pauseMedia, 300);

    let seconds_remaining = bypass_delay_seconds;

    function renderButton() {
      if (seconds_remaining > 0) {
        bypass_button.textContent = 'Bypass (' + seconds_remaining + 's)';
        bypass_button.disabled = true;
      } else {
        bypass_button.textContent = 'Bypass';
        bypass_button.disabled = false;
      }
    }

    renderButton();

    if (seconds_remaining > 0) {
      countdown_interval = setInterval(() => {
        seconds_remaining -= 1;
        if (seconds_remaining <= 0 && countdown_interval) {
          clearInterval(countdown_interval);
          countdown_interval = null;
        }
        renderButton();
      }, 1000);
    }

    bypass_button.addEventListener('click', () => {
      if (bypass_button.disabled) return;
      bypassed_rules.add(rule.key);
      removeOverlay();
    });

    overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => {
      if (window.history.length > 1) {
        window.history.back();
      } else {
        window.location.href = 'about:blank';
      }
    });
  }

  function removeOverlay() {
    if (pause_interval) {
      clearInterval(pause_interval);
      pause_interval = null;
    }
    if (countdown_interval) {
      clearInterval(countdown_interval);
      countdown_interval = null;
    }
    if (current_overlay) {
      current_overlay.remove();
      current_overlay = null;
    }
    document.documentElement.classList.remove('normalize-timeout-locked');
  }

  function evaluate() {
    const rule = findMatchingRule();
    const rule_key = rule ? rule.key : null;

    // Handle SPA navigations: if we moved to a different rule (or off a blocked page), reset.
    if (rule_key !== current_rule_key) {
      current_rule_key = rule_key;
      removeOverlay();
    }

    if (! rule) return;
    if (bypassed_rules.has(rule.key)) return;

    showOverlay(rule);
  }

  function tick() {
    try {
      evaluate();
    } catch (e) {
      console.error('normalize-timeout error', e);
    }
  }

  tick();
  setInterval(tick, 500);
})();
