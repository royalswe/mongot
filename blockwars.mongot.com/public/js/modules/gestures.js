// Turns a finger's path into game actions. Pure logic, so it runs in the browser and in unit tests.
(function (root) {
    const DEFAULTS = {
        holdMs: 300,      // a finger resting this long soft-drops
        tapMs: 250,       // a press shorter than this, without moving, is a tap
        slop: 10,         // px a finger may wander and still be still
        flickSpeed: 0.5,  // px/ms downwards that makes a drag a hard-drop flick
        flickCells: 2     // and it must also have travelled this many cells down
    };
    const FLICK_WINDOW_MS = 120;

    /**
     * options: cellWidth() and centerX() in px, sensitivity() (1 = a column per cell width of travel).
     * actions: move(direction), rotate(direction), softDrop(on), hardDrop().
     */
    function GestureRecognizer(options, actions) {
        this.options = Object.assign({}, DEFAULTS, options);
        this.actions = actions;
        this.active = false;
        this.softOn = false;
        this.holdTimer = null;
    }

    GestureRecognizer.prototype.setSoftDrop = function (on) {
        if (on === this.softOn) { return; }
        this.softOn = on;
        this.actions.softDrop(on);
    };

    GestureRecognizer.prototype.down = function (x, y, time) {
        if (this.active) { return; }
        this.active = true;
        this.startX = this.anchorX = x;
        this.startY = y;
        this.startTime = time;
        this.moved = false;
        this.held = false;
        this.samples = [{ y, time }];

        this.holdTimer = setTimeout(() => {
            if (!this.moved) {
                this.held = true;
                this.setSoftDrop(true);
            }
        }, this.options.holdMs);
    };

    GestureRecognizer.prototype.move = function (x, y, time) {
        if (!this.active) { return; }
        this.samples.push({ y, time });
        if (this.samples.length > 8) { this.samples.shift(); }

        const dx = x - this.startX;
        const dy = y - this.startY;
        if (!this.moved && Math.hypot(dx, dy) > this.options.slop) {
            this.moved = true;
            clearTimeout(this.holdTimer);
        }
        if (!this.moved) { return; }

        const cell = this.options.cellWidth();
        const step = cell / this.options.sensitivity();
        while (x - this.anchorX >= step) { this.actions.move(1); this.anchorX += step; }
        while (this.anchorX - x >= step) { this.actions.move(-1); this.anchorX -= step; }

        if (!this.held) { this.setSoftDrop(dy >= cell); }
    };

    GestureRecognizer.prototype.up = function (x, y, time) {
        if (!this.active) { return; }
        clearTimeout(this.holdTimer);
        this.active = false;

        const cell = this.options.cellWidth();
        const dx = x - this.startX;
        const dy = y - this.startY;

        if (!this.moved && !this.held && time - this.startTime <= this.options.tapMs) {
            this.actions.rotate(x < this.options.centerX() ? -1 : 1);
        }

        const recent = this.samples.find(sample => time - sample.time <= FLICK_WINDOW_MS) || this.samples[this.samples.length - 1];
        const speed = time > recent.time ? (y - recent.y) / (time - recent.time) : 0;
        const flicked = this.moved && dy >= this.options.flickCells * cell && dy > 2 * Math.abs(dx) && speed >= this.options.flickSpeed;

        this.setSoftDrop(false);
        if (flicked) { this.actions.hardDrop(); }
    };

    GestureRecognizer.prototype.cancel = function () {
        clearTimeout(this.holdTimer);
        this.active = false;
        this.setSoftDrop(false);
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = GestureRecognizer;
    } else {
        root.GestureRecognizer = GestureRecognizer;
    }
})(typeof self !== 'undefined' ? self : this);
