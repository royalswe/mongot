let Tetris = function (element) {
    this.element = element;
    this.canvas = element.querySelector('canvas.tetris');
    this.ctx = this.canvas.getContext('2d');
    this.ctx.translate(0, -19); // move the canvas above the visible arena
    this.ctx.scale(24, 22);

    this.nextCanvas = null;
    this.nextCtx = null;
    this.lastNext = null;

    this.resizeObserver = new ResizeObserver(() => this.fitCanvas());
    this.resizeObserver.observe(this.canvas);

    this.arena = new Arena(this, TETRIS.TilesWidth, TETRIS.TilesHeight);
    this.block = new Block(this);
    this.special = new Special(this);

    this.redraw = () => {
        this.draw();
        if (this.lastNext) { this.drawMatrix(this.lastNext.matrix, this.lastNext.offset, true); }
    };
    document.addEventListener('themechange', this.redraw);
    this.gameAnimation = null;
    this.stopped = false;

    // create all specials
    this.images = Array.from({ length: 12 }, function (_, i) {
        const img = new Image();
        img.src = 'img/game/specials/' + (i + 8) + '.gif';
        return img;
    });

    /**
     * if user is inactive then drop block with setTimeout
     */
    this.handleVisibilityChange = () => {
        if (document.hidden && !this.stopped) {
            setTimeout(() => {
                this.block.drop();
                this.draw();
                this.handleVisibilityChange();
            }, 620);
        }
    };

    let lastTime = 0;
    this._update = (time = 0) => {
        const deltaTime = time - lastTime;
        lastTime = time;
        this.block.update(deltaTime);
        this.block.DASupdate(deltaTime);
        this.draw();

        if (this.stopped === false) {
            this.gameAnimation = requestAnimationFrame(this._update);
        }
    };

};

Tetris.prototype.drawSweepRow = function (rows, callback) {
    this.stopped = null;
    TOUCH.haptic('rows', rows.length);

    let fps = 30;
    let now;
    let then = Date.now();
    let interval = 500 / fps;
    let delta;
    let count = 90;

    let loop = () => {
        if (count > 10) {
            requestAnimationFrame(loop);

            now = Date.now();
            delta = now - then;
            if (delta > interval) {
                then = now - (delta % interval);
                count -= 5;

                for (let i = 0; i < rows.length; i++) {
                    let y = rows[i];
                    for (let x = 0; x < TETRIS.TilesWidth; x++) {
                        // clear rows
                        this.ctx.fillStyle = THEME.get().field;
                        this.ctx.fillRect(x, y, 1, 1);
                        // paint rows
                        this.ctx.fillStyle = "rgba(255, 255, 255, 0." + count + 10 + ")";
                        this.ctx.fillRect(x, y, 1, 1);
                        this.ctx.fillStyle = "rgba(255, 255, 255, 0." + count + ")";
                        this.ctx.fillRect(x, y, 0.8, 0.8);
                        this.ctx.fillStyle = "rgba(255, 255, 255, 0." + count + ")";
                        this.ctx.fillRect(x + 0.1, y + 0.1, 0.1, 0.3);
                        this.ctx.fillRect(x + 0.1, y + 0.1, 0.3, 0.1);
                    }
                }
            }
        }
        else {
            for (let i = 0; i < rows.length; i++) {
                let row = this.arena.matrix.splice(rows[i] + i, 1)[0].fill(0); // sweep row
                this.arena.matrix.unshift(row); // move it to the top
            }
            this.bounceRows(rows.length);
            if (this.stopped === null) { // start the animation again if game not ended
                this.stopped = false;
                this._update();
            }

            return callback();
        }
    };
    loop();
};

Tetris.prototype.fitCanvas = function () {
    const changed = CANVAS.fit(this.canvas, this.ctx, 240, 464, ctx => {
        ctx.translate(0, -19); // move the canvas above the visible arena
        ctx.scale(24, 22);
    });
    const nextChanged = this.nextCanvas && CANVAS.fit(this.nextCanvas, this.nextCtx, 120, 200, ctx => ctx.scale(40, 34));

    if (nextChanged && this.lastNext) {
        this.drawMatrix(this.lastNext.matrix, this.lastNext.offset, true);
    }
    if (changed) { this.draw(); }
};

Tetris.prototype.draw = function () {
    this.ctx.fillStyle = THEME.get().field;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawGrid(THEME.get().grid);

    this.drawMatrix(this.arena.matrix, {x: 0, y: 0});
    this.drawGhost();
    this.drawMatrix(this.block.matrix, this.block.pos);
};

// Where the falling block will land, only on your own Arena and only when turned on in Controls.
Tetris.prototype.drawGhost = function () {
    if (!HANDLING.get().ghost || !(this.block instanceof Block) || !this.element.classList.contains('local')) { return; }
    const y = this.block.landingY();
    if (y <= this.block.pos.y) { return; }
    this.ctx.save();
    this.ctx.globalAlpha = 0.3;
    this.drawMatrix(this.block.matrix, {x: this.block.pos.x, y});
    this.ctx.restore();
};

// Faint lines between the cells, so a played field matches the blocks of an empty one
Tetris.prototype.drawGrid = function (colour) {
    if (!colour) { return; }
    const line = 0.04;
    this.ctx.fillStyle = colour;
    for (let x = 1; x < TETRIS.TilesWidth; x += 1) {
        this.ctx.fillRect(x - line / 2, 0, line, TETRIS.TilesHeight);
    }
    for (let y = 0; y <= TETRIS.TilesHeight; y += 1) {
        this.ctx.fillRect(0, y - line / 2, TETRIS.TilesWidth, line);
    }
};

// The face colour at 55% brightness, cached because every bevelled block asks for it on every frame
Tetris.darkShades = new Map();
Tetris.darkShade = function (hex) {
    if (!Tetris.darkShades.has(hex)) {
        const channels = [1, 3, 5].map(i => Math.round(parseInt(hex.slice(i, i + 2), 16) * 0.55));
        Tetris.darkShades.set(hex, 'rgb(' + channels.join(',') + ')');
    }
    return Tetris.darkShades.get(hex);
};

// The classic Tetris block: a lit top and left edge, a shaded bottom and right edge, a flat face and a small gloss
Tetris.prototype.drawBevelledBlock = function (ctx, x, y, face, light) {
    const bx = 0.16;
    const by = 0.17;
    ctx.fillStyle = Tetris.darkShade(face);
    ctx.fillRect(x, y, 1, 1);

    ctx.fillStyle = light;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 1, y);
    ctx.lineTo(x + 1 - bx, y + by);
    ctx.lineTo(x + bx, y + by);
    ctx.lineTo(x + bx, y + 1 - by);
    ctx.lineTo(x, y + 1);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = face;
    ctx.fillRect(x + bx, y + by, 1 - 2 * bx, 1 - 2 * by);
};

Tetris.prototype.drawMatrix = function (matrix, offset, NextBlock = false) {
    let ctx = this.ctx;
    const theme = THEME.get();
    if(NextBlock){ // If the block will show as the next incoming block
        this.lastNext = { matrix, offset };
        ctx = this.nextCtx;
        ctx.fillStyle = theme.field;
        ctx.fillRect(0, 0, this.nextCanvas.width, this.nextCanvas.height);
    }

    for (let y = 0; y < matrix.length; y += 1) {
        for (let x = 0; x < matrix[y].length; x += 1) {
            if (matrix[y][x] > 7) { // draw special img
                ctx.drawImage(this.images[matrix[y][x] - 8], x, y, 0.99, 0.99);
            } else if (matrix[y][x] !== 0) { // draw square
                const id = matrix[y][x];
                if (theme.flat) {
                    ctx.fillStyle = theme.blocks[id];
                    ctx.fillRect(x + offset.x + 0.04, y + offset.y + 0.04, 0.92, 0.92);
                } else if (theme.bevel) {
                    this.drawBevelledBlock(ctx, x + offset.x, y + offset.y, theme.blocks[id], theme.borders[id]);
                } else {
                    ctx.beginPath();
                    ctx.fillStyle = theme.blocks[id];
                    ctx.fillRect(x + offset.x, y + offset.y, 1, 1);
                    ctx.fillStyle = theme.borders[id];
                    ctx.fillRect(x + offset.x, y + offset.y, 0.8, 0.8);
                    ctx.fillStyle = "#fff";
                    ctx.fillRect(x + offset.x + 0.1, y + offset.y + 0.1, 0.1, 0.3);
                    ctx.fillRect(x + offset.x + 0.1, y + offset.y + 0.1, 0.3, 0.1);
                    ctx.stroke();
                }
            }

        }
    }
};

Tetris.prototype.run = function () {
    if (!this.nextCanvas) { // Get canvas for next block matrix if not already initiazed
        this.nextCanvas = document.querySelector('canvas.next-block');
        this.nextCtx = this.nextCanvas.getContext('2d');
        this.nextCtx.scale(40, 34);
        this.resizeObserver.observe(this.nextCanvas);
        this.fitCanvas();
    }
    this.block.DROP_SLOW = 800;
    this.block.releaseAll(); // Remove fast moving block and held keys from the last game
    this.stopped = false;
    this._update(); // start the game
    this.handleVisibilityChange();
    document.addEventListener("visibilitychange", this.handleVisibilityChange, false);
};

Tetris.prototype.serialize = function () {
    return {
        arena: {
            matrix: this.arena.matrix,
        },
        block: {
            matrix: this.block.matrix,
            pos: this.block.pos
        },
    };
};

// Draw players arena and block
Tetris.prototype.unserialize = function (state) {
    this.arena = Object.assign(state.arena);
    this.block = Object.assign(state.block);
    this.draw();
};

Tetris.prototype.arenaNaming = function (client) {
    if (this.element.querySelector(".open-seat")) {
        this.element.querySelector(".open-seat").remove();
    }
    if (client.status === "ready" && client.gamestatus === "waiting") {
        this.playerReady();
    }

    const points = client.points;

    const rank = '<img src="img/rankings/' + UTILS.getCrownImg(points) + '" id="'+ client.id +'_crown" title="' + points + ' points" alt="' + points + ' points"/>';

    let div = this.element.querySelector(".client-name");
    div.className += " client-number";
    div.style.top = "39%";
    div.dataset.player = client.id;
    div.innerHTML = rank + "<span>" + client.id + "</span>";

    if (!this.element.classList.contains('local')) { // opponents are where you click to send a Special
        this.element.setAttribute('role', 'button');
        this.element.tabIndex = 0;
        this.element.setAttribute('aria-label', 'Send your next Special to ' + client.id);
    }
};

Tetris.prototype.playerReady = function () {
    let span = document.createElement("span");
    span.className = TETRIS.playerReadyClass;
    span.innerHTML = "ready";
    this.element.appendChild(span);
};

Tetris.prototype.gameOver = function (text) {
    let span = document.createElement("span");
    let nameClass = (text === "WINNER") ? "winner" : "loser";
    span.className = "gameover " + nameClass;
    span.innerHTML = text;
    this.element.appendChild(span);
};

Tetris.prototype.stop = function () {
    this.stopped = true;
    cancelAnimationFrame(this.gameAnimation);
};

Tetris.prototype.bounceArena = function () {
    this.element.querySelector(".tetris").classList.remove("tetris-pulse");
    void this.element.offsetWidth; // requires a recalc to append the class again
    this.element.querySelector(".tetris").classList.add("tetris-pulse");
};

Tetris.prototype.bounceRows = function (rowCount) {
    if (rowCount < 2 || localStorage.getItem("arena-bounce") === "off") { return; }
    const arena = this.element.querySelector(".tetris");
    if (!arena) { return; }
    arena.classList.remove("tetris-bounce", "tetris-bounce-big");
    void arena.offsetWidth; // requires a recalc to append the class again
    arena.classList.add(rowCount >= 4 ? "tetris-bounce-big" : "tetris-bounce");
};

Tetris.prototype.speedUpBlocks = function () {
    this.block.DROP_SLOW = this.block.DROP_SLOW / 2;

    let span = document.createElement("div");
    span.className = "display-speed-up";
    span.innerHTML = "Speed up!";
    this.element.appendChild(span);

    setTimeout(function () {
        span.remove();
    }, 1100);
};