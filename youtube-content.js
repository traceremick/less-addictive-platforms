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

    .normalize-youtube-blur:hover {
      filter: none;
    }

    .ytContentMetadataViewModelDelimiter {
      display: none !important;
    }
  `;

  function injectStyles() {
    if (document.getElementById('normalize-youtube-styles')) return;
    const style = document.createElement('style');
    style.id = 'normalize-youtube-styles';
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }

  function blurNode(node) {
    if (node && ! node.classList.contains('normalize-youtube-blur')) {
      node.classList.add('normalize-youtube-blur');
    }
  }

  function blurMetadata() {
    document.querySelectorAll('ytd-watch-info-text #view-count, ytd-watch-info-text #date-text').forEach(blurNode);

    document.querySelectorAll('yt-formatted-string#info > span').forEach(span => {
      if (blur_text_pattern.test(span.textContent)) blurNode(span);
    });

    document.querySelectorAll('.ytContentMetadataViewModelMetadataRow .ytContentMetadataViewModelMetadataText').forEach(span => {
      if (blur_text_pattern.test(span.textContent)) blurNode(span);
    });

    document.querySelectorAll('#metadata-line span.inline-metadata-item').forEach(span => {
      if (blur_text_pattern.test(span.textContent)) blurNode(span);
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
