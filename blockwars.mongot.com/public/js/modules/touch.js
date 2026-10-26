const TOUCH = (function () {
    const COARSE = window.matchMedia('(pointer: coarse)');
    const PATTERNS = {
        special: 40,
        lost: [100, 50, 100],
        won: [30, 40, 30, 40, 120]
    };

    function read(name) {
        try { return localStorage.getItem('touch-' + name); } catch (error) { return null; }
    }
    function write(name, value) {
        try { localStorage.setItem('touch-' + name, value); } catch (error) { /* private mode */ }
    }

    const settings = {
        // 1 = one column per cell width of finger travel
        sensitivity: () => Math.min(2, Math.max(0.5, parseFloat(read('sensitivity')) || 1)),
        // Gestures and tapping opponents are the default on touch screens; with a mouse the keys are the way to play.
        buttons: () => read('buttons') === null ? !COARSE.matches : read('buttons') === 'on',
        haptics: () => read('haptics') !== 'off',
        wakeLock: () => read('wakelock') !== 'off'
    };

    function applyButtons() {
        const shown = settings.buttons();
        document.body.classList.toggle('hide-keys', !shown);
        document.getElementById('keyboard_toggle').setAttribute('aria-expanded', String(shown));
        document.getElementById('keyboard_toggle').setAttribute('aria-label', shown ? 'Hide keyboard' : 'Show keyboard');
        document.getElementById('keyboard_toggle').title = shown ? 'Hide keyboard' : 'Show keyboard';
        document.getElementById('touch_buttons').checked = shown;
    }

    document.getElementById('keyboard_toggle').addEventListener('click', () => {
        write('buttons', settings.buttons() ? 'off' : 'on');
        applyButtons();
    });

    /** Short vibration for what happens in the game. Silently does nothing where unsupported. */
    function haptic(kind, count) {
        if (!settings.haptics() || !navigator.vibrate) { return; }
        navigator.vibrate(kind === 'rows' ? (count > 1 ? [20, 30, 20] : 20) : PATTERNS[kind]);
    }

    let gameRunning = false;
    let wakeLock = null;

    async function acquireWakeLock() {
        if (!gameRunning || wakeLock || !settings.wakeLock() || !navigator.wakeLock) { return; }
        try {
            const lock = await navigator.wakeLock.request('screen');
            wakeLock = lock;
            lock.addEventListener('release', () => { if (wakeLock === lock) { wakeLock = null; } });
        } catch (error) { /* the browser refused, e.g. low battery */ }
    }

    function releaseWakeLock() {
        const lock = wakeLock;
        wakeLock = null;
        if (lock) { lock.release().catch(() => {}); }
    }

    // The browser drops the lock when the page is hidden.
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') { acquireWakeLock(); }
    });

    function bindSettings() {
        const field = id => document.getElementById(id);
        const sensitivity = field('touch_sensitivity');
        if (!sensitivity) { return; }

        sensitivity.value = settings.sensitivity();
        sensitivity.addEventListener('input', () => write('sensitivity', sensitivity.value));

        const toggles = [
            ['touch_buttons', 'buttons', settings.buttons, applyButtons],
            ['touch_haptics', 'haptics', settings.haptics, () => {}],
            ['touch_wakelock', 'wakelock', settings.wakeLock, () => (settings.wakeLock() ? acquireWakeLock() : releaseWakeLock())]
        ];
        for (const [id, name, current, apply] of toggles) {
            const checkbox = field(id);
            checkbox.checked = current();
            checkbox.addEventListener('change', () => {
                write(name, checkbox.checked ? 'on' : 'off');
                apply();
            });
        }
    }

    /** Lets a finger on the playfield steer the block: drag, tap, hold and flick. */
    function attach(block) {
        const canvas = block.tetris.canvas;
        const playing = () => !block.tetris.stopped;

        const gesture = new GestureRecognizer({
            cellWidth: () => canvas.getBoundingClientRect().width / TETRIS.TilesWidth,
            centerX: () => { const box = canvas.getBoundingClientRect(); return box.left + box.width / 2; },
            sensitivity: settings.sensitivity
        }, {
            move: direction => { if (playing()) { block.move(direction); } },
            rotate: direction => { if (playing()) { block.rotate(direction); } },
            softDrop: on => block.softDrop(on),
            hardDrop: () => block.hardDrop()
        });

        let pointer = null;
        const owns = e => e.pointerId === pointer;
        canvas.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'mouse' || pointer !== null) { return; }
            pointer = e.pointerId;
            canvas.setPointerCapture(pointer);
            gesture.down(e.clientX, e.clientY, e.timeStamp);
        });
        canvas.addEventListener('pointermove', (e) => { if (owns(e)) { gesture.move(e.clientX, e.clientY, e.timeStamp); } });
        canvas.addEventListener('pointerup', (e) => {
            if (!owns(e)) { return; }
            pointer = null;
            gesture.up(e.clientX, e.clientY, e.timeStamp);
        });
        canvas.addEventListener('pointercancel', (e) => {
            if (!owns(e)) { return; }
            pointer = null;
            gesture.cancel();
        });

        if (COARSE.matches && read('hint-seen') === null) {
            write('hint-seen', 'yes');
            const hint = document.createElement('li');
            hint.textContent = 'Drag to move, tap to rotate, flick down to drop';
            writeToLog(hint);
        }
    }

    applyButtons();
    bindSettings();

    return {
        attach: attach,
        haptic: haptic,
        settings: settings,

        explainTargetingOnce: function () {
            if (!COARSE.matches || read('target-hint-seen') !== null) { return; }
            write('target-hint-seen', 'yes');
            const hint = document.createElement('li');
            hint.textContent = 'Tap an opponent to send your next Special, or tap the queue to use it on yourself';
            writeToLog(hint);
        },
        gameRunning: function (running) {
            gameRunning = running;
            if (running) { acquireWakeLock(); } else { releaseWakeLock(); }
        }
    };
})();
