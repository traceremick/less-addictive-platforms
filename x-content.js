(function() {
  const mirror_host = 'xcancel.com';

  const skipped_paths = [
    '/i/',
    '/home',
    '/explore',
    '/notifications',
    '/messages',
    '/settings',
    '/compose',
    '/intent/',
    '/login',
    '/logout',
    '/flow/',
    '/oauth'
  ];

  function shouldRedirect() {
    if (location.hostname === mirror_host) return false;
    const path = location.pathname.toLowerCase();
    if (path === '/') return false;
    return ! skipped_paths.some(skipped => path === skipped || path.startsWith(skipped));
  }

  function redirect() {
    const target = 'https://' + mirror_host + location.pathname + location.search + location.hash;
    if (target === location.href) return;
    window.stop();
    location.replace(target);
  }

  if (shouldRedirect()) redirect();
})();
