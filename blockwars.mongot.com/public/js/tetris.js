let Tetris = function (element) {
    this.element = element;
    this.canvas = element.querySelector('canvas.tetris');
    this.ctx = this.canvas.getContext('2d');
    this.ctx.translate(0, -19); // move the canvas above the visible arena
    this.ctx.scale(24, 22);

    this.nextCanvas = null;
    this.nextCtx = null;

    this.arena = new Arena(this, TETRIS.TilesWidth, TETRIS.TilesHeight);
    this.block = new Block(this);
    this.special = new Special(this);

    this.borders = [null, '#FF0D72', '#0DC2FF', '#0DFF72', '#F538FF', '#FF8E0D', '#FFE138', '#3877FF', '#00ff17'];
    this.colors = [null, '#b3004a', '#0099cc', '#00cc55', '#da00e6', '#cc6d00', '#e6c300', '#0051ff', '#00b30f'];
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
                        this.ctx.fillStyle = "#333333";
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
            if (this.stopped === null) { // start the animation again if game not ended
                this.stopped = false;
                this._update();
            }

            return callback();
        }
    };
    loop();
};

Tetris.prototype.draw = function () {
    this.ctx.fillStyle = '#333333';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.drawMatrix(this.arena.matrix, {x: 0, y: 0});
    this.drawMatrix(this.block.matrix, this.block.pos);
};

Tetris.prototype.drawMatrix = function (matrix, offset, NextBlock = false) {
    let ctx = this.ctx;
    if(NextBlock){ // If the block will show as the next incoming block
        ctx = this.nextCtx;
        ctx.fillStyle = '#333333';
        ctx.fillRect(0, 0, this.nextCanvas.width, this.nextCanvas.height);
    }

    for (let y = 0; y < matrix.length; y += 1) {
        for (let x = 0; x < matrix[y].length; x += 1) {
            if (matrix[y][x] > 7) { // draw special img
                ctx.drawImage(this.images[matrix[y][x] - 8], x, y, 0.99, 0.99);
            } else if (matrix[y][x] !== 0) { // draw square
                ctx.beginPath();
                ctx.fillStyle = this.colors[matrix[y][x]];
                ctx.fillRect(x + offset.x, y + offset.y, 1, 1);
                ctx.fillStyle = this.borders[matrix[y][x]];
                ctx.fillRect(x + offset.x, y + offset.y, 0.8, 0.8);
                ctx.fillStyle = "#fff";
                ctx.fillRect(x + offset.x + 0.1, y + offset.y + 0.1, 0.1, 0.3);
                ctx.fillRect(x + offset.x + 0.1, y + offset.y + 0.1, 0.3, 0.1);
                ctx.stroke();
            }

        }
    }
};

Tetris.prototype.run = function () {
    if (!this.nextCanvas) { // Get canvas for next block matrix if not already initiazed
        this.nextCanvas = document.querySelector('canvas.next-block');
        this.nextCtx = this.nextCanvas.getContext('2d');
        this.nextCtx.scale(40, 34);
    }
    this.block.DROP_SLOW = 800;
    this.block.dropInterval = this.block.DROP_SLOW; // Remove fast moving block
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

Tetris.prototype.speedUpBlocks = function () {
    this.block.DROP_SLOW = this.block.DROP_SLOW / 2;
    this.block.dropInterval = this.block.DROP_SLOW;

    let span = document.createElement("div");
    span.className = "display-speed-up";
    span.innerHTML = "Speed up!";
    this.element.appendChild(span);

    setTimeout(function () {
        span.remove();
    }, 1100);
};