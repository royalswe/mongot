// classic (the default, the original blue and grey look), flat (dark, plain squares) or retro (neon arcade). The choice is kept per browser.
var THEME = (function () {
    const KEY = 'theme';
    const NAMES = ['classic', 'flat', 'retro'];
    const root = document.documentElement;

    function stored() {
        try {
            const value = localStorage.getItem(KEY);
            return NAMES.includes(value) ? value : NAMES[0];
        } catch (error) { return NAMES[0]; }
    }

    function after(current) {
        return NAMES[(NAMES.indexOf(current) + 1) % NAMES.length];
    }

    let name = stored();

    function apply() {
        NAMES.forEach(theme => root.classList.toggle('theme-' + theme, theme === name));
        const button = document.getElementById('theme_toggle');
        if (button) {
            const next = after(name);
            button.setAttribute('aria-label', 'Switch to the ' + next + ' theme');
            button.title = 'Switch to the ' + next + ' theme';
        }
    }

    function set(next) {
        name = NAMES.includes(next) ? next : NAMES[0];
        try { localStorage.setItem(KEY, name); } catch (error) { /* private mode */ }
        apply();
        document.dispatchEvent(new Event('themechange'));
    }

    apply();
    const button = document.getElementById('theme_toggle');
    if (button) { button.addEventListener('click', () => set(after(name))); }

    return {
        name: () => name,
        get: () => TETRIS.themes[name],
        set
    };
}());
