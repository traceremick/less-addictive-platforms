(function () {
  const shorts_pattern = /^\/shorts\/([A-Za-z0-9_-]+)/;

  const blur_text_pattern = /(view|watching|\bago\b|streamed|premiered)/i;

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
  }

  function redirectShorts() {
    const match = window.location.pathname.match(shorts_pattern);
    if (! match) return;

    const video_id = match[1];
    const search = window.location.search ? '&' + window.location.search.slice(1) : '';
    const hash = window.location.hash || '';

    window.location.replace('https://www.youtube.com/watch?v=' + video_id + search + hash);
  }

  function init() {
    injectStyles();
    redirectShorts();
    blurMetadata();
  }

  init();

  let last_url = window.location.href;
  const observer = new MutationObserver(function () {
    if (window.location.href !== last_url) {
      last_url = window.location.href;
      redirectShorts();
    }
    blurMetadata();
  });

  observer.observe(document, { childList: true, subtree: true });

  setInterval(blurMetadata, 1000);
})();
