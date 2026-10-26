// Keyboard and screen reader behaviour of the settings menu and the two dialogs.
(function () {
    const FOCUSABLE = 'button, input, select, textarea, [href], [tabindex]:not([tabindex="-1"])';

    // The settings menu opens on click or tap, never on hover.
    const wrapper = document.querySelector('.settings-wrapper');
    const toggle = document.getElementById('settings_toggle');

    function setMenu(open) {
        wrapper.classList.toggle('open', open);
        toggle.setAttribute('aria-expanded', String(open));
    }

    toggle.addEventListener('click', () => setMenu(!wrapper.classList.contains('open')));
    document.addEventListener('click', (e) => { if (!wrapper.contains(e.target)) { setMenu(false); } });
    wrapper.addEventListener('click', (e) => {
        if (e.target.closest('.icon-help, .icon-keyboard')) { setMenu(false); } // a dialog opens instead
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && wrapper.classList.contains('open')) {
            setMenu(false);
            toggle.focus();
        }
    });

    // A dialog takes focus when it opens, keeps Tab inside, closes on Escape and hands focus back.
    function watchDialog(modal, closeSelector) {
        let opener = null;
        let open = false;
        modal.tabIndex = -1;

        new MutationObserver(() => {
            const shown = modal.style.display === 'block';
            if (shown === open) { return; }
            open = shown;
            if (shown) {
                opener = wrapper.contains(document.activeElement) ? toggle : document.activeElement;
                modal.focus();
            } else if (opener && document.contains(opener)) {
                opener.focus();
            }
        }).observe(modal, { attributes: true, attributeFilter: ['style'] });

        modal.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                modal.querySelector(closeSelector).click();
            } else if (e.key === 'Tab') {
                const items = [...modal.querySelectorAll(FOCUSABLE)].filter(item => item.offsetParent !== null);
                if (items.length === 0) { return; }
                const first = items[0];
                const last = items[items.length - 1];
                if (e.shiftKey && (document.activeElement === first || document.activeElement === modal)) {
                    e.preventDefault();
                    last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        });
    }

    watchDialog(document.getElementById('rules_modal'), '.close-rules');
    watchDialog(document.getElementById('controler_settings'), '.close-controler-modal button');
})();
