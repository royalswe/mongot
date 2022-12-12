function AI(heightWeight, linesWeight, holesWeight, bumpinessWeight){
    this.heightWeight = heightWeight;
    this.linesWeight = linesWeight;
    this.holesWeight = holesWeight;
    this.bumpinessWeight = bumpinessWeight;
}

AI.prototype._best = function(grid, workingPieces, workingPieceIndex){
    let best = null;
    let bestScore = null;
    let workingPiece = workingPieces[workingPieceIndex];

    for(let rotation = 0; rotation < 4; rotation++){
        let _piece = workingPiece.clone();
        
        for(let i = 0; i < rotation; i++){
            _piece.rotate(grid);
        }

        while(_piece.moveLeft(grid));

        while(grid.valid(_piece)){
            let _pieceSet = _piece.clone();
            while(_pieceSet.moveDown(grid));

            let _grid = grid.clone();
            _grid.addPiece(_pieceSet);

            let score = null;
            if (workingPieceIndex == (workingPieces.length - 1)) {
                score = -this.heightWeight * _grid.aggregateHeight() + this.linesWeight * _grid.lines() - this.holesWeight * _grid.holes() - this.bumpinessWeight * _grid.bumpiness();
            }else{
                score = this._best(_grid, workingPieces, workingPieceIndex + 1).score;
            }

            // if row contains mines without holes
            for (let r = 0; r < _grid.rows; r++) {
                if(_grid.cells[r].every(c => c > 0 ) && _grid.cells[r].includes(19)){ score = -9999; }
            }

            if (score > bestScore || bestScore == null){
                bestScore = score;
                best = _piece.clone();
            }

            _piece.column++;
        }
    }

    return {piece:best, score:bestScore};
};

AI.prototype.best = function(grid, workingPieces){
    return this._best(grid, workingPieces, 0).piece;
};

module.exports = AI;