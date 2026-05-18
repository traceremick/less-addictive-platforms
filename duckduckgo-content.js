(function() {
  function init() {
    console.log('ddg-content.js loaded');
    document.querySelectorAll('li[data-layout="ad"]').forEach(ad => {
      ad.style = "border:0;background:#fff8e1;padding:8px;margin:6px 0;border-radius:8px";
      const badge = ad.querySelector('button[data-testid^="ad-badge-ad-tooltip"]');
      if (badge) {
        badge.style = "background:#d93025;color:#fff;font-weight:bold;padding:2px 6px;border-radius:3px;margin-left:6px";
        badge.textContent = "Sponsored";
      }
    });
  }

    const observer = new MutationObserver(function(mutations) {
      mutations.forEach(function(mutation) {
        mutation.addedNodes.forEach(function(node) {
          if (node.nodeType === 1) {
            if (node.matches && node.matches('li[data-layout="ad"]')) {
              init();
            } else if (node.querySelector) {
              const ads = node.querySelectorAll('li[data-layout="ad"]');
              if (ads.length > 0) {
                init();
              }
            }
          }
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    init();
    
  })();