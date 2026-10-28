// Keyboard handling settings (DAS, ARR, DCD, SDF, ghost piece, OS key repeat) and the auto-shift timing.
// Pure logic, so it runs in the browser and in unit tests.
(function (root) {
    const KEY = 'handling';
    const SDF_INFINITE = 41;

    // All times are milliseconds. SDF multiplies gravity while soft dropping; SDF_INFINITE drops to the floor at once.
    // osRepeat leaves sideways movement to the operating system's key repeat instead of DAS, ARR and DCD.
    const DEFAULTS = { das: 167, arr: 33, dcd: 0, sdf: 16, ghost: false, osRepeat: false };
    const FLAGS = ['ghost', 'osRepeat'];
    const LIMITS = {
        das: { min: 0, max: 500 },
        arr: { min: 0, max: 200 },
        dcd: { min: 0, max: 200 },
        sdf: { min: 2, max: SDF_INFINITE }
    };

    function clamp(value, { min, max }, fallback) {
        const number = Math.round(Number(value));
        if (value === '' || value === null || !Number.isFinite(number)) { return fallback; }
        return Math.min(max, Math.max(min, number));
    }

    function normalize(raw) {
        const source = raw && typeof raw === 'object' ? raw : {};
        const settings = {};
        for (const name of Object.keys(LIMITS)) {
            settings[name] = clamp(source[name], LIMITS[name], DEFAULTS[name]);
        }
        for (const name of FLAGS) {
            settings[name] = typeof source[name] === 'boolean' ? source[name] : DEFAULTS[name];
        }
        return settings;
    }

    // Before 'handling' existed, DAS and ARR were stored separately in tens of milliseconds and DAS 0 meant
    // "off" (the operating system's key repeat moved the piece), so those players keep that.
    function load(storage) {
        try {
            const saved = storage.getItem(KEY);
            if (saved) { return normalize(JSON.parse(saved)); }
            const legacyDas = storage.getItem('DAS');
            if (legacyDas !== null && legacyDas !== '') {
                const das = Number(legacyDas);
                if (das > 0) { return normalize({ das: das * 10, arr: Number(storage.getItem('ARR')) * 10 }); }
                if (das === 0) { return normalize({ osRepeat: true }); }
            }
        } catch (error) { /* private mode or a corrupt value */ }
        return normalize({});
    }

    function createStore(storage) {
        let current = load(storage);
        return {
            get: () => current,
            set(changes) {
                current = normalize(Object.assign({}, current, changes));
                try { storage.setItem(KEY, JSON.stringify(current)); } catch (error) { /* private mode */ }
                return current;
            }
        };
    }

    /**
     * Holds the left/right keys and moves the piece with DAS and ARR.
     * move(direction) moves the piece one column and returns false when it is blocked.
     * settings() returns the current handling settings, so changes apply at once.
     */
    function AutoShift(move, settings) {
        this.moveFn = move;
        this.settings = settings;
        this.held = [];      // directions being held, the last one pressed wins
        this.direction = 0;
        this.charge = 0;     // ms the current direction has been held, up to DAS
        this.repeat = 0;     // ms collected towards the next ARR move once DAS is charged
    }

    AutoShift.prototype.restart = function () {
        this.direction = this.held.length ? this.held[this.held.length - 1] : 0;
        this.charge = 0;
        this.repeat = 0;
    };

    // With osRepeat every keydown, including the operating system's repeats, moves one column.
    AutoShift.prototype.press = function (direction) {
        if (this.settings().osRepeat) {
            this.held = this.held.filter(held => held !== direction).concat(direction);
            this.restart();
            this.moveFn(direction);
            return;
        }
        if (this.held[this.held.length - 1] === direction) { return; }
        this.held = this.held.filter(held => held !== direction).concat(direction);
        this.restart();
        this.moveFn(direction);
    };

    // Letting go of the newest key hands over to a key still held, which has to charge DAS again.
    AutoShift.prototype.release = function (direction) {
        if (!this.held.includes(direction)) { return; }
        this.held = this.held.filter(held => held !== direction);
        if (direction === this.direction) { this.restart(); }
    };

    AutoShift.prototype.reset = function () {
        this.held = [];
        this.restart();
    };

    AutoShift.prototype.charged = function () {
        return this.direction !== 0 && this.charge >= this.settings().das;
    };

    // A new piece or a rotation: drop time carried over from the old piece and wait DCD before shifting again.
    AutoShift.prototype.cut = function () {
        if (!this.charged()) { return; }
        const { arr, dcd } = this.settings();
        this.repeat = Math.min(this.repeat, arr) - dcd;
    };

    AutoShift.prototype.update = function (deltaTime) {
        if (!this.direction || !(deltaTime > 0)) { return; }
        const { das, arr, osRepeat } = this.settings();
        if (osRepeat) { return; }

        if (this.charge < das) {
            this.charge += deltaTime;
            if (this.charge < das) { return; }
            this.repeat = arr + this.charge - das; // the first auto shift happens the moment DAS is charged
            this.charge = das;
        } else {
            this.repeat += deltaTime;
        }

        if (arr === 0) {
            if (this.repeat >= 0) { while (this.moveFn(this.direction)) { /* to the wall */ } }
            return;
        }
        while (this.repeat >= arr) {
            if (!this.moveFn(this.direction)) {
                this.repeat = arr; // blocked: slide as soon as there is room
                return;
            }
            this.repeat -= arr;
        }
    };

    const Handling = { KEY, DEFAULTS, LIMITS, SDF_INFINITE, normalize, load, createStore, AutoShift };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = Handling;
    } else {
        root.Handling = Handling;
        let storage;
        try { storage = root.localStorage; } catch (error) { /* storage blocked */ }
        root.HANDLING = createStore(storage || { getItem: () => null, setItem() {} });
    }
})(typeof self !== 'undefined' ? self : this);
