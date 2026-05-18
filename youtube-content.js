(function () {
  const shorts_pattern = /^\/shorts\/([A-Za-z0-9_-]+)/;

  function redirectShorts() {
    const match = window.location.pathname.match(shorts_pattern);
    if (! match) return;

    const video_id = match[1];
    const search = window.location.search ? '&' + window.location.search.slice(1) : '';
    const hash = window.location.hash || '';

    window.location.replace('https://www.youtube.com/watch?v=' + video_id + search + hash);
  }

  redirectShorts();

  let last_url = window.location.href;
  const observer = new MutationObserver(function () {
    if (window.location.href !== last_url) {
      last_url = window.location.href;
      redirectShorts();
    }
  });

  observer.observe(document, { childList: true, subtree: true });
})();
