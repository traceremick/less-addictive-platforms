(function () {
  const ad_selectors = [
    '[data-testid="StandardAd"]',
    '.dfp-ad-top-wrapper',
    '.ad.place-ad',
    'div[id^="dfp-ad"]',
    'div[id^="google_ads_iframe"]',
    'div[data-google-query-id]'
  ];

  const wrapper_selectors = [
    'div:has(> div > [data-testid="StandardAd"])',
    'div:has(> div > .dfp-ad-top-wrapper)',
    'div:has(> [data-testid="StandardAd"])'
  ];

  const css = `
    ${ad_selectors.concat(wrapper_selectors).join(',\n    ')} {
      display: none !important;
    }
  `;

  function injectStyles() {
    if (document.getElementById('normalize-nyt-styles')) return;
    const style = document.createElement('style');
    style.id = 'normalize-nyt-styles';
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }

  function hideFullBleedWrapper(node) {
    let current = node;
    for (let depth = 0; current && current !== document.body && depth < 6; depth++) {
      const style = window.getComputedStyle(current);
      const full_width = current.offsetWidth >= window.innerWidth;
      const negative_bleed = parseFloat(style.marginLeft) < 0 || parseFloat(style.marginRight) < 0;
      if (full_width && negative_bleed) {
        current.style.setProperty('display', 'none', 'important');
        return;
      }
      current = current.parentElement;
    }
    node.style.setProperty('display', 'none', 'important');
  }

  function hideAds() {
    document.querySelectorAll(ad_selectors.join(',')).forEach(node => {
      hideFullBleedWrapper(node);
    });
  }

  function init() {
    injectStyles();
    hideAds();
  }

  init();

  const observer = new MutationObserver(hideAds);
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
