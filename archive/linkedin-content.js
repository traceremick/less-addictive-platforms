  (function() {
    function highlightPromoted() {
      console.log('linkedin-content.js loaded');
      document.querySelectorAll('.update-components-actor__sub-description').forEach(el => {
        if (el.textContent.includes('Promoted')) {
          let post = el.closest('.feed-shared-update-v2');
          if (post && ! post.hasAttribute('data-promoted-styled')) {
            post.setAttribute('data-promoted-styled', 'true');
            post.style = "border: 3px solid #ff0000 ! important; background: #fff3f3; margin: 8px 0; border-radius: 8px; box-shadow: 0 2px 8px rgba(217, 48, 37, 0.2);";
            let promoted_label = document.createElement('div');
            promoted_label.style = "background: #ff0000; color: #fff; font-weight: bold; padding: 6px 12px; border-radius: 6px; margin-bottom: 12px; display: inline-block; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;";
          }
        }
      });
    }

    let is_blocked = false;

    function blockInfiniteScroll() {
      if (is_blocked) return;
      is_blocked = true;

      const scroll_container = document.querySelector('.scaffold-finite-scroll') || document.querySelector('main[role="main"]');
      if (! scroll_container) return;

      let current_scroll_top = 0;
      const max_scroll = 3000;

      window.addEventListener('scroll', function(e) {
        const new_scroll = window.pageYOffset || document.documentElement.scrollTop;
        
        if (new_scroll > current_scroll_top + max_scroll) {
          e.preventDefault();
          e.stopPropagation();
          window.scrollTo(0, current_scroll_top + max_scroll);

          if (! document.querySelector('[data-load-more-btn]')) {
            const load_btn = document.createElement('button');
            load_btn.setAttribute('data-load-more-btn', 'true');
            load_btn.textContent = 'Load More Posts';
            load_btn.style = 'position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: linear-gradient(135deg, #0a66c2, #004182); color: #fff; font-weight: 600; padding: 14px 28px; border-radius: 50px; border: none; cursor: pointer; font-size: 16px; z-index: 10000; animation: pulse 2s infinite; font-family: -apple-system, sans-serif;';

            load_btn.onmouseover = function() {
              this.style.transform = 'translateX(-50%) scale(1.05)';
            };
            load_btn.onmouseout = function() {
              this.style.transform = 'translateX(-50%) scale(1)';
            };

            load_btn.onclick = function() {
              current_scroll_top = window.pageYOffset + max_scroll;
              this.remove();
            };

            document.body.appendChild(load_btn);
          }
        }
      }, true);

      console.log('LinkedIn infinite scroll blocked');
    }

    new MutationObserver(() => highlightPromoted()).observe(document.body, {
      childList: true,
      subtree: true
    });

    highlightPromoted();
    setTimeout(blockInfiniteScroll, 1000);
  })();