const Piece = require('./piece');

function RandomPieceGenerator(){
    this.bag = [];
    this.blocks = [];
}

RandomPieceGenerator.prototype.nextPiece = function(){
    if (this.blocks.length < 4) { // Add more blocks if bellow 4
        this.blocks += this.bag;
    }

    const newBlock = this.blocks.charAt(0); // get first block of all blocks
    this.blocks = this.blocks.slice(1); // remove the block

    return Piece.fromIndex(newBlock);
};

module.exports = RandomPieceGenerator;