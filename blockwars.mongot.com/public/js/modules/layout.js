const LAYOUT = (function () {
    // Keep in sync with the media attribute of the phone stylesheet link in game.pug.
    const PHONE = window.matchMedia('(max-width: 768px), (max-height: 520px)');
    const TOAST_MS = 2500;
    const TILE_DELAY_MS = 1200;

    const container = document.getElementById('arena_container');
    const chatToggle = document.getElementById('chat_toggle');
    const chatClose = document.getElementById('chat_close');
    const unreadBadge = document.getElementById('chat_unread');
    const chat = document.getElementById('chat');
    const panelsToggle = document.getElementById('panels_toggle');
    const keyboard = document.getElementById('keyboard');
    let unread = 0;

    function renderUnread() {
        unreadBadge.textContent = unread;
        unreadBadge.hidden = unread === 0;
    }

    function setChatOpen(open) {
        document.body.classList.toggle('chat-open', open);
        chat.inert = !open;
        chatToggle.setAttribute('aria-expanded', String(open));
        chatToggle.setAttribute('aria-label', open ? 'Hide chat' : 'Show chat');
        chatToggle.title = open ? 'Hide chat' : 'Show chat';
        if (open) {
            unread = 0;
            renderUnread();
            const messages = document.getElementById('messages');
            messages.scrollTop = messages.scrollHeight;
        } else if (chat.contains(document.activeElement)) {
            (PHONE.matches ? chatToggle : panelsToggle).focus();
        }
    }

    function setPanelsOpen(open) {
        document.body.classList.toggle('panels-collapsed', !open);
        keyboard.inert = !open;
        panelsToggle.setAttribute('aria-expanded', String(open));
        panelsToggle.setAttribute('aria-label', open ? 'Hide chat and keyboard' : 'Show chat and keyboard');
        panelsToggle.title = open ? 'Hide chat and keyboard' : 'Show chat and keyboard';
        if (!open && keyboard.contains(document.activeElement)) { panelsToggle.focus(); }
        setChatOpen(open);
        SCREEN.resizeContent();
    }

    panelsToggle.addEventListener('click', () => setPanelsOpen(document.body.classList.contains('panels-collapsed')));
    chatToggle.addEventListener('click', () => setChatOpen(!document.body.classList.contains('chat-open')));
    chatClose.addEventListener('click', () => setChatOpen(false));
    PHONE.addEventListener('change', () => {
        document.body.classList.remove('panels-collapsed');
        keyboard.inert = false;
        if (PHONE.matches) { setChatOpen(false); } else { setPanelsOpen(true); }
    });
    setChatOpen(!PHONE.matches);
    chat.addEventListener('keydown', event => {
        if (event.key === 'Escape' && PHONE.matches) { setChatOpen(false); }
    });

    // Spectators, and Players who died while the Game goes on, see every Arena as an equal tile.
    // Once the Game ends everyone is back to their own big Arena at once.
    let gameRunning = false;
    const isTileMode = () => {
        const local = container.querySelector('.arena.local');
        return !local || (gameRunning && local.querySelector('.gameover.loser') !== null);
    };

    container.addEventListener('click', (e) => {
        if (!PHONE.matches || !isTileMode()) { return; }
        const arena = e.target.closest('.arena');
        if (arena) { arena.classList.toggle('enlarged'); }
    });

    // The stylesheet cannot see this state, so mirror it on the body.
    // Entering tile mode waits a moment so a passing state (an overlay, a Game that ends at once) never flashes the layout.
    let tileTimer = null;
    const markTileMode = (immediately) => {
        clearTimeout(tileTimer);
        const wanted = isTileMode();
        const enter = wanted && !document.body.classList.contains('tile-mode');
        if (enter && !immediately) {
            tileTimer = setTimeout(() => markTileMode(true), TILE_DELAY_MS);
        } else {
            document.body.classList.toggle('tile-mode', wanted);
        }
    };
    new MutationObserver(() => markTileMode(false)).observe(container, { childList: true, subtree: true });
    markTileMode(true);

    return {
        isPhone: () => PHONE.matches,

        focusChat: function () {
            if (PHONE.matches) { setChatOpen(true); } else { setPanelsOpen(true); }
            document.getElementById('message').focus();
        },

        setGameRunning: function (running) {
            gameRunning = running;
            markTileMode(false);
        },

        // Called for every chat or server message so a closed drawer can show how many were missed.
        noteChatMessage: function () {
            if (!document.body.classList.contains('chat-open')) {
                unread++;
                renderUnread();
            }
        },

        // Shows a game log entry briefly over the opponents, since the log itself is hidden on phones.
        toast: function (logItem) {
            const box = document.getElementById('toasts');
            if (!PHONE.matches || !box) { return; }

            const toast = logItem.cloneNode(true);
            toast.className = 'toast';
            box.appendChild(toast);
            while (box.children.length > 3) { box.firstChild.remove(); }
            setTimeout(() => toast.remove(), TOAST_MS);
        }
    };
})();
