(function() {
    const overlay_id = 'doomscroll-overlay';
    const style_id = 'doomscroll-style';
    let revealed = false;

    function injectBlockingStyle() {
        if (document.getElementById(style_id)) return;
        const style = document.createElement('style');
        style.id = style_id;
        style.textContent = `
            body[data-doomscroll-blocked] ytd-rich-grid-renderer #contents {
                display: none !important;
            }
        `;
        document.head.appendChild(style);
    }

    function createOverlay() {
        let overlay = document.getElementById(overlay_id);
        if (overlay) return overlay;

        overlay = document.createElement('div');
        overlay.id = overlay_id;
        overlay.style = 'display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; min-height: 60vh; background-color: var(--yt-spec-base-background, #0f0f0f);';

        const message = document.createElement('h2');
        message.innerText = 'Are you here intentionally?';
        message.style = 'color: var(--yt-spec-text-primary, #fff); margin-bottom: 20px; font-size: 24px; font-family: Roboto, Arial, sans-serif;';

        const button = document.createElement('button');
        button.innerText = 'View Content';
        button.style = 'background-color: var(--yt-spec-call-to-action, #065fd4); color: white; border: none; padding: 10px 24px; border-radius: 18px; font-size: 14px; cursor: pointer; font-family: Roboto, Arial, sans-serif; font-weight: 500; text-transform: uppercase;';

        button.onclick = function() {
            revealed = true;
            document.body.removeAttribute('data-doomscroll-blocked');
            overlay.remove();
        };

        overlay.appendChild(message);
        overlay.appendChild(button);
        return overlay;
    }

    function checkAndBlock() {
        const is_homepage = window.location.pathname === '/';

        if (! is_homepage) {
            revealed = false;
            document.body.removeAttribute('data-doomscroll-blocked');
            const overlay = document.getElementById(overlay_id);
            if (overlay) overlay.remove();
            return;
        }

        if (revealed) return;

        injectBlockingStyle();
        document.body.setAttribute('data-doomscroll-blocked', 'true');

        const grid = document.querySelector('ytd-rich-grid-renderer');
        if (! grid) return;

        if (! document.getElementById(overlay_id)) {
            const overlay = createOverlay();
            grid.insertBefore(overlay, grid.firstChild);
        }
    }

    const observer = new MutationObserver(checkAndBlock);

    function startObserver() {
        observer.observe(document.body, { childList: true, subtree: true });
    }

    if (document.body) {
        startObserver();
    } else {
        document.addEventListener('DOMContentLoaded', startObserver);
    }

    window.addEventListener('yt-navigate-finish', () => {
        revealed = false;
        checkAndBlock();
    });
    window.addEventListener('yt-page-data-updated', checkAndBlock);
    document.addEventListener('yt-action', checkAndBlock);

    checkAndBlock();
    setInterval(checkAndBlock, 500);
})();

