(function() {
  const AD_SELECTORS = [
    '[data-text-ad="1"]',
    '[data-pla-unit]',
    '.pla-unit',
    '.commercial-unit-desktop-top',
    '.commercial-unit-desktop-rhs',
    '.cu-container',
    '.mnr-c[data-text-ad]'
  ].join(',');

  function injectStyles() {
    if (document.getElementById('lap-ad-styles')) return;
    const style = document.createElement('style');
    style.id = 'lap-ad-styles';
    style.textContent = ".lap-ad{border:3px solid #d93025 !important;background:#fff8e1 !important;border-radius:10px !important;padding:10px !important;margin:8px 0 !important;position:relative !important}.lap-ad::before{content:'SPONSORED';display:inline-block;background:#d93025;color:#fff;font-weight:700;font-size:11px;letter-spacing:.5px;padding:3px 8px;border-radius:4px;margin-bottom:8px}.lap-ad-heading{background:#d93025 !important;color:#fff !important;font-weight:700 !important;padding:2px 6px !important;border-radius:3px !important}";
    (document.head || document.documentElement).appendChild(style);
  }

  function markAd(ad) {
    if (ad.dataset.lapAd) return;
    if (ad.closest('[data-lap-ad="1"]')) return;
    if (! ad.querySelector('a[href]')) return;
    ad.dataset.lapAd = "1";
    ad.classList.add('lap-ad');
  }

  function init() {
    document.querySelectorAll(AD_SELECTORS).forEach(markAd);
    document.querySelectorAll('span[role="heading"], .L8u9l').forEach(heading => {
      if (heading.dataset.lapAdHeading) return;
      const text = (heading.textContent || "").trim().toLowerCase();
      if (text === "sponsored" || text === "sponsored results") {
        heading.dataset.lapAdHeading = "1";
        heading.classList.add('lap-ad-heading');
      }
    });
  }

  const observer = new MutationObserver(function(mutations) {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue;
        if ((node.matches && node.matches(AD_SELECTORS)) || (node.querySelector && node.querySelector(AD_SELECTORS))) {
          init();
          return;
        }
      }
    }
  });

  injectStyles();
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  init();
})();
