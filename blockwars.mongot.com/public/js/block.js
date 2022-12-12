"use strict";
let Block = function (tetris) {
    this.DROP_SLOW = 800;
    this.DROP_FAST = 50;
    this.SidewaySpeed = DAS_VALUE;
    this.DAScounter = 0;
    this.DASkey = false;
    this.movePos = null;

    this.events = new Events();

    this.tetris = tetris;
    this.arena = tetris.arena;
    this.dropCounter = 0;
    this.dropInterval = this.DROP_SLOW;

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
    }
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

Block.prototype.update = function (deltaTime) {
    this.dropCounter += deltaTime;
    if (this.dropCounter > this.dropInterval) {
        this.drop();
    }
};

Block.prototype.DASupdate = function (deltaTime) {
    // Move sideways with DAS
    if (this.DASkey){
        this.DAScounter += deltaTime;
        if(this.DAScounter >= this.SidewaySpeed) {
            this.DAScounter = 0;
            this.SidewaySpeed = ARR_VALUE;
            this.move(this.movePos);
        }
    } 
};

Block.prototype.blockControll = function () {
    if (this.blockEventListening) {
        return;
    } // prevent more event listener
    this.blockEventListening = true;

    document.addEventListener('keydown', function (e) {
        keyDown(e);
    }, false); // keyboard
    document.addEventListener('touchstart', function (e) {
        keyDown(e);
    }, false); // touchscren
    document.addEventListener('mousedown', function (e) {
        keyDown(e);
    }, false); // mouse

    document.addEventListener('keyup', function (e) {
        keyUpp(e);
    }, false);
    document.addEventListener('touchend', function (e) {
        keyUpp(e);
    }, false);
    document.addEventListener('mouseup', function (e) {
        keyUpp(e);
    }, false);

    let keyUpp = (e) => {
        let keyPress = isNumeric(e.target.id) ? parseInt(e.target.id) : e.keyCode;

        if (keyPress === this.DASkey){
            this.DASkey = false;
        }
        if (keyPress === KEY_BINDS.moveDown) {
            this.dropInterval = this.DROP_SLOW;
        }
        e.preventDefault();
    };

    let keyDown = (e) => {
        if (this.tetris.stopped) {
            return;
        }

        let keyPress = isNumeric(e.target.id) ? parseInt(e.target.id) : e.keyCode;

        switch (keyPress) {
            case KEY_BINDS.moveRight:
            case KEY_BINDS.moveLeft: {

                this.movePos = (keyPress === KEY_BINDS.moveRight) ? +1 : -1;

                if(DAS_VALUE === 0){
                    this.move(this.movePos);
                }
                else if(!this.DASkey){
                    this.move(this.movePos);
                    this.DAScounter = 0;
                    this.SidewaySpeed = DAS_VALUE;
                    this.DASkey = keyPress;
                }

                break;
            }
            case KEY_BINDS.moveDown: // Down arrow
                if (this.dropInterval !== this.DROP_FAST && this.tetris.stopped !== null) {
                    this.drop();
                    this.dropInterval = this.DROP_FAST;
                }
                break;
            case KEY_BINDS.rotLeft: // z key
                this.rotate(-1);
                break;
            case KEY_BINDS.rotRight: // Up arrow key
                this.rotate(+1);
                break;
            case KEY_BINDS.hardDrop: // space
                if (document.getElementById('message') === document.activeElement || this.tetris.stopped === null) {
                    return;
                } // inactivate drop when chating
                this.drop(true);
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
                case 89: // Y test
                    var special = [16];//[Math.floor(Math.random() * (18 - 8 + 1)) + 8];
                    this.arena.events.emit('special', 'add-special', special);
                    break;
                case 72: // H test
                    var yy = Math.floor((Math.random() * 20) + 1);
                    var xx = Math.floor((Math.random() * 9) + 1);
                    var img = Math.floor(Math.random() * (19 - 8 + 1)) + 8;
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