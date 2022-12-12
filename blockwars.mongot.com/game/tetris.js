"use strict";
let Tetris = function() {
    this.blocks = "";
};

Tetris.prototype.start = function() {
    return this.createBlocks();
};

Tetris.prototype.createBlocks = function() {
    let text = "";
    let possible = "ILJOTSZ";

    for(let i = 0; i < 100; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    this.blocks = text;

    return this.blocks;
};

module.exports = Tetris;