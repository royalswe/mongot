"use strict";
let Block = function (tetris) {
    this.DROP_SLOW = 800;
    this.softDropping = false;
    this.shift = new Handling.AutoShift(direction => this.move(direction), () => HANDLING.get());

    this.events = new Events();

    this.tetris = tetris;
    this.arena = tetris.arena;
    this.dropCounter = 0;

    this.pos = { x: 0, y: 0 };
    this.matrix = [];
    this.initializeBlocks = null;
    this.blocks = '';
    this.blockEventListening = false;
};

Block.prototype.move = function (direction) {
    this.pos.x += direction;
    if (this.arena.collide(this)) {
        this.pos.x -= direction;
        return false;
    }
    return true;
    //this.events.emit('pos', this.pos); // comment out to update moving blocks to peers
};

/**
 * Randomize new block and set the position center top
 */
Block.prototype.randomizeBlock = function () {
    if (this.blocks.length < 4) { // Add more blocks if bellow 4
        this.blocks += this.initializeBlocks;
    }

    let newBlock = this.blocks.charAt(0); // get first block of all blocks
    this.blocks = this.blocks.slice(1); // remove the block
    this.matrix = this.createBlock(newBlock);

    const nextBlock = this.createBlock(this.blocks.charAt(0));
    this.tetris.drawMatrix(nextBlock, {
        x: nextBlock.length === 2 ? 0.5 : 0,
        y: nextBlock.length === 4 ? 1 : 2
    }, true); // Draw next incoming block

    this.pos.y = 0;
    this.pos.x = 4; //(this.arena.matrix[0].length / 2 | 0);

    this.events.emit('pos', { x: 4, y: 1 }); // increment y so peers can se the whole block

    this.events.emit('matrix', this.matrix); // comment out to update matrix when create new block to peers
    this.shift.cut();
    // Lose if new block collidates when generates new block.
    if (this.arena.collide(this)) {
        this.tetris.draw(); // draw the last created block before lose
        this.events.emit('lost', true);
    }
};

Block.prototype.rotate = function (direction) {
    const pos = this.pos.x;
    let offset = 1;
    this.rotateMatrix(this.matrix, direction);
    // Push block off from edge if needed.
    while (this.arena.collide(this)) {
        this.pos.x += offset;
        offset = -(offset + (offset > 0 ? 1 : -1));
        if (offset > this.matrix[0].length) {
            this.rotateMatrix(this.matrix, -direction);
            this.pos.x = pos;
            return;
        }
    }
    this.shift.cut();
    // this.events.emit('pos', this.pos); // comment out to update when rotating blocks to peers
    // this.events.emit('matrix', this.matrix); // comment out to update matrix when rotate to peers
};

Block.prototype.rotateMatrix = function (matrix, direction) {
    for (let y = 0; y < matrix.length; y += 1) {
        for (let x = 0; x < y; x += 1) {
            [
                matrix[x][y],
                matrix[y][x]
            ] = [
                matrix[y][x],
                matrix[x][y]
            ];
        }
    }
    if (direction > 0) {
        for (let x = 0; x < matrix.length; x += 1) {
            matrix[x].reverse();
        }
    } else {
        matrix.reverse();
    }
};

Block.prototype.drop = function (toBottom) {
    do {
        this.pos.y++;
        this.dropCounter = 0;
    }
    while (toBottom && !this.arena.collide(this));

    if (this.arena.collide(this)) {
        this.pos.y--;
        this.tetris.draw();
        this.arena.merge(this);
        this.arena.sweepRow(() => {
            this.randomizeBlock();
        });
    }
    //this.events.emit('pos', this.pos); // comment out to update falling blocks to peers
};

// Milliseconds per row: gravity, or gravity sped up by SDF while soft dropping.
Block.prototype.dropInterval = function () {
    const sdf = HANDLING.get().sdf;
    return this.softDropping && sdf < Handling.SDF_INFINITE ? this.DROP_SLOW / sdf : this.DROP_SLOW;
};

Block.prototype.update = function (deltaTime) {
    if (this.softDropping && HANDLING.get().sdf >= Handling.SDF_INFINITE) {
        this.sonicDrop();
    }
    this.dropCounter += deltaTime;
    if (this.dropCounter > this.dropInterval()) {
        this.drop();
    }
};

// Move sideways with DAS, ARR and DCD
Block.prototype.DASupdate = function (deltaTime) {
    this.shift.update(deltaTime);
};

// The row the block would land on, used by the ghost piece and an infinite SDF.
Block.prototype.landingY = function () {
    const y = this.pos.y;
    if (!this.matrix.length) { return y; }
    while (!this.arena.collide(this)) { this.pos.y++; }
    const landing = this.pos.y - 1;
    this.pos.y = y;
    return Math.max(landing, y);
};

// Falls to the floor without locking, so the block can still slide; gravity locks it.
Block.prototype.sonicDrop = function () {
    const landing = this.landingY();
    if (landing > this.pos.y) {
        this.pos.y = landing;
        this.dropCounter = 0;
    }
};

Block.prototype.softDrop = function (on) {
    if (!on) {
        this.softDropping = false;
    } else if (!this.softDropping && this.tetris.stopped === false) {
        this.softDropping = true;
        this.drop();
    }
};

// Forget held keys, e.g. when the window loses focus and their release is never seen.
Block.prototype.releaseAll = function () {
    this.shift.reset();
    this.softDrop(false);
};

Block.prototype.hardDrop = function () {
    if (this.tetris.stopped !== false) { return; } // stopped, or the cleared rows are animating
    this.drop(true);
};

Block.prototype.blockControll = function () {
    if (this.blockEventListening) {
        return;
    } // prevent more event listener
    this.blockEventListening = true;
    TOUCH.attach(this);

    document.addEventListener('keydown', function (e) {
        keyDown(e);
    }, false); // keyboard
    document.addEventListener('pointerdown', function (e) {
        keyDown(e);
    }, false); // touch and mouse on the on-screen keys

    document.addEventListener('keyup', function (e) {
        keyUpp(e);
    }, false);
    document.addEventListener('pointerup', function (e) {
        keyUpp(e);
    }, false);
    document.addEventListener('pointercancel', function (e) {
        keyUpp(e);
    }, false);
    window.addEventListener('blur', () => this.releaseAll(), false);

    // Pointer id -> key it pressed, so the release is right even if the pointer slid off the key.
    const pressedKeys = new Map();

    let keyUpp = (e) => {
        let keyPress = pressedKeys.has(e.pointerId) ? pressedKeys.get(e.pointerId) :
            (isNumeric(e.target.id) ? parseInt(e.target.id) : UTILS.keyCode(e));
        pressedKeys.delete(e.pointerId);

        if (keyPress === KEY_BINDS.moveLeft) {
            this.shift.release(-1);
        }
        if (keyPress === KEY_BINDS.moveRight) {
            this.shift.release(+1);
        }
        if (keyPress === KEY_BINDS.moveDown) {
            this.softDrop(false);
        }
        if (e.type === 'keyup') { e.preventDefault(); }
    };

    let keyDown = (e) => {
        if (this.tetris.stopped) {
            return;
        }

        let keyPress = isNumeric(e.target.id) ? parseInt(e.target.id) : UTILS.keyCode(e);
        if (e.pointerId !== undefined) { pressedKeys.set(e.pointerId, keyPress); }

        switch (keyPress) {
            case KEY_BINDS.moveRight:
            case KEY_BINDS.moveLeft:
                this.shift.press(keyPress === KEY_BINDS.moveRight ? +1 : -1);
                break;
            case KEY_BINDS.moveDown: // Down arrow
                this.softDrop(true);
                break;
            case KEY_BINDS.rotLeft: // z key
                this.rotate(-1);
                break;
            case KEY_BINDS.rotRight: // Up arrow key
                this.rotate(+1);
                break;
            case KEY_BINDS.hardDrop: // space
                if (document.getElementById('message') === document.activeElement) {
                    return;
                } // inactivate drop when chating
                this.hardDrop();
                break;
            case KEY_BINDS.special1: // 1
            case KEY_BINDS.special2: // 2
            case KEY_BINDS.special3: // 3
            case KEY_BINDS.special4: // 4
            case KEY_BINDS.special5: // 5
                this.tetris.special.useSpecial(keyPress);
                break;
            case 74: // J
                console.table(this.arena.matrix);
        }

        if (location.host === 'localhost:5090') {
            switch (keyPress) {
                case 84: // T test
                    //     this.arena.matrix[19].fill(1);
                    //    //this.tetris.special.performSpecial(14);
                    break;
                case 89: { // Y test
                    const special = [16];//[Math.floor(Math.random() * (18 - 8 + 1)) + 8];
                    this.arena.events.emit('special', 'add-special', special);
                    break;
                }
                case 72: { // H test
                    const yy = Math.floor((Math.random() * 20) + 1);
                    const xx = Math.floor((Math.random() * 9) + 1);
                    const img = Math.floor(Math.random() * (19 - 8 + 1)) + 8;
                    this.arena.events.emit('special', 'add-special', [11, 11, 11]);
                    //this.tetris.arena.matrix[yy][xx] = img;
                    this.arena.clear();
                    this.arena.matrix[21].fill(1);
                    this.arena.matrix[20].fill(2);
                    this.arena.matrix[21][0] = 0;
                    this.arena.matrix[21][1] = 0;
                    this.arena.matrix[20][0] = 0;
                    this.arena.matrix[20][1] = 0;


                    break;
                }
            }
        }

    };
};

Block.prototype.createBlock = function (type) {
    switch (type) {
        case 'I':
            return [
                [0, 1, 0, 0],
                [0, 1, 0, 0],
                [0, 1, 0, 0],
                [0, 1, 0, 0]
            ];
        case 'L':
            return [
                [0, 0, 2],
                [2, 2, 2],
                [0, 0, 0]
            ];
        case 'J':
            return [
                [3, 0, 0],
                [3, 3, 3],
                [0, 0, 0]
            ];
        case 'O':
            return [
                [4, 4],
                [4, 4]
            ];
        case 'Z':
            return [
                [5, 5, 0],
                [0, 5, 5],
                [0, 0, 0]
            ];
        case 'S':
            return [
                [0, 6, 6],
                [6, 6, 0],
                [0, 0, 0]
            ];
        case 'T':
            return [
                [0, 7, 0],
                [7, 7, 7],
                [0, 0, 0]
            ];
    }
};

function isNumeric(n) {
    return !isNaN(parseFloat(n)) && isFinite(n);
  }