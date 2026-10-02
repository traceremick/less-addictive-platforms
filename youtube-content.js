(function () {
  const shorts_pattern = /^\/shorts\/([A-Za-z0-9_-]+)/;

  const blur_text_pattern = /(view|watching|\bago\b|streamed|premiered|subscriber)/i;

  const css = `
    .normalize-youtube-blur {
      filter: blur(6px);
      transition: filter 0.15s ease;
      cursor: pointer;
      display: inline-block;
    }

    .normalize-youtube-blur.normalize-youtube-reveal {
      filter: none;
    }

    html.normalize-youtube-reveal-all .normalize-youtube-blur {
      filter: none;
    }

    ytd-thumbnail.normalize-youtube-defer {
      background-color: rgba(128, 128, 128, 0.15);
      cursor: pointer;
    }

    ytd-thumbnail.normalize-youtube-defer img,
    ytd-thumbnail.normalize-youtube-defer yt-image {
      visibility: hidden !important;
    }

    ytd-thumbnail.normalize-youtube-defer::after {
      content: 'Hover to load';
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 500;
      color: rgba(128, 128, 128, 0.9);
      pointer-events: none;
    }
  `;

  const groups = new WeakMap();

  function injectStyles() {
    if (document.getElementById('normalize-youtube-styles')) return;
    const style = document.createElement('style');
    style.id = 'normalize-youtube-styles';
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }

  function getGroup(container) {
    let members = groups.get(container);
    if (! members) {
      members = new Set();
      groups.set(container, members);
    }
    return members;
  }

  function revealGroup(members, reveal) {
    members.forEach(member => {
      if (member.isConnected) member.classList.toggle('normalize-youtube-reveal', reveal);
    });
  }

  function blurNode(node, container) {
    if (! node || node.classList.contains('normalize-youtube-blur')) return;
    node.classList.add('normalize-youtube-blur');

    const members = getGroup(container || node);
    members.add(node);
    node.addEventListener('mouseenter', () => revealGroup(members, true));
    node.addEventListener('mouseleave', () => revealGroup(members, false));
  }

  function blurMetadata() {
    document.querySelectorAll('ytd-watch-info-text #view-count, ytd-watch-info-text #date-text').forEach(node => {
      blurNode(node, node.closest('ytd-watch-info-text'));
    });

    document.querySelectorAll('yt-formatted-string#info > span').forEach(span => {
      if (blur_text_pattern.test(span.textContent)) blurNode(span, span.closest('yt-formatted-string#info'));
    });

    document.querySelectorAll('.ytContentMetadataViewModelMetadataRow .ytContentMetadataViewModelMetadataText').forEach(span => {
      if (blur_text_pattern.test(span.textContent)) blurNode(span, span.closest('.ytContentMetadataViewModel') || span.closest('.ytContentMetadataViewModelMetadataRow'));
    });

    document.querySelectorAll('.ytContentMetadataViewModelMetadataRow .ytContentMetadataViewModelDelimiter').forEach(delimiter => {
      const prev = delimiter.previousElementSibling;
      const next = delimiter.nextElementSibling;
      const between_blurred = (prev && prev.classList.contains('normalize-youtube-blur')) && (next && next.classList.contains('normalize-youtube-blur'));
      if (between_blurred) blurNode(delimiter, delimiter.closest('.ytContentMetadataViewModel') || delimiter.closest('.ytContentMetadataViewModelMetadataRow'));
    });

    document.querySelectorAll('#metadata-line span.inline-metadata-item').forEach(span => {
      if (blur_text_pattern.test(span.textContent)) blurNode(span, span.closest('#metadata-line'));
    });

    document.querySelectorAll('#owner-sub-count, #subscriber-count').forEach(node => {
      blurNode(node, node);
    });
  }

  function revealAll(reveal) {
    document.documentElement.classList.toggle('normalize-youtube-reveal-all', reveal);
  }

  function bindSearchReveal() {
    document.querySelectorAll('textarea[name="search_query"], input[name="search_query"]').forEach(input => {
      if (input.dataset.normalizeSearchReveal) return;
      input.dataset.normalizeSearchReveal = '1';
      input.addEventListener('mouseenter', () => revealAll(true));
      input.addEventListener('mouseleave', () => revealAll(false));
    });
  }

  function isWatchLater() {
    return window.location.pathname === '/playlist' && new URLSearchParams(window.location.search).get('list') === 'WL';
  }

  function stripThumbnail(thumb) {
    if (thumb.dataset.normalizeRevealed) return;
    thumb.querySelectorAll('img').forEach(img => {
      const src = img.getAttribute('src');
      const srcset = img.getAttribute('srcset');
      if (src && ! img.dataset.normalizeSrc) img.dataset.normalizeSrc = src;
      if (srcset && ! img.dataset.normalizeSrcset) img.dataset.normalizeSrcset = srcset;
      if (src) img.removeAttribute('src');
      if (srcset) img.removeAttribute('srcset');
    });
  }

  function revealThumbnail(thumb) {
    if (thumb.dataset.normalizeRevealed) return;
    thumb.dataset.normalizeRevealed = '1';
    thumb.classList.remove('normalize-youtube-defer');
    thumb.querySelectorAll('img').forEach(img => {
      if (img.dataset.normalizeSrc) img.setAttribute('src', img.dataset.normalizeSrc);
      if (img.dataset.normalizeSrcset) img.setAttribute('srcset', img.dataset.normalizeSrcset);
    });
  }

  function deferThumbnails() {
    if (! isWatchLater()) return;

    document.querySelectorAll('ytd-thumbnail').forEach(thumb => {
      if (! thumb.dataset.normalizeDefer) {
        thumb.dataset.normalizeDefer = '1';
        thumb.classList.add('normalize-youtube-defer');
        thumb.addEventListener('mouseenter', () => revealThumbnail(thumb));
      }
      stripThumbnail(thumb);
    });
  }

  function redirectShorts() {
    const match = window.location.pathname.match(shorts_pattern);
    if (! match) return;

    const video_id = match[1];
    const search = window.location.search ? '&' + window.location.search.slice(1) : '';
    const hash = window.location.hash || '';

    window.location.replace('https://www.youtube.com/watch?v=' + video_id + search + hash);
  }

  function redirectPlaylist() {
    if (window.location.pathname !== '/watch' || window.location.hostname === 'music.youtube.com') return;

    const params = new URLSearchParams(window.location.search);
    const video_id = params.get('v');
    if (! video_id || ! params.has('list')) return;

    window.location.replace('https://www.youtube.com/watch?v=' + video_id);
  }

  function init() {
    injectStyles();
    redirectShorts();
    redirectPlaylist();
    blurMetadata();
    deferThumbnails();
    bindSearchReveal();
  }

  init();

  let last_url = window.location.href;
  const observer = new MutationObserver(function () {
    if (window.location.href !== last_url) {
      last_url = window.location.href;
      redirectShorts();
      redirectPlaylist();
    }
    blurMetadata();
    deferThumbnails();
    bindSearchReveal();
  });

  observer.observe(document, { childList: true, subtree: true });

  setInterval(function () {
    blurMetadata();
    deferThumbnails();
    bindSearchReveal();
  }, 1000);
})();
