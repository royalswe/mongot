function AI(heightWeight, linesWeight, holesWeight, bumpinessWeight, specialWeight){
    this.heightWeight = heightWeight;
    this.linesWeight = linesWeight;
    this.holesWeight = holesWeight;
    this.bumpinessWeight = bumpinessWeight;
    this.specialWeight = specialWeight || 8.0;
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
            let mine = false;
            let lines = 0;
            let specialsOnBoard = 0;

            for (let r = 0; r < _grid.rows; r++) {
                if (_grid.isLine(r)) {
                    lines++;
                    for (let c = 0; c < _grid.columns; c++) {
                        const val = _grid.cells[r][c];
                        if (val === 19) mine = true;
                        else if (val > 7) specialsOnBoard++;
                    }
                }
            }

            if (mine || _grid.exceeded()) {
                score = -99999;
            } else {
                // In Blockwars, clearing two rows yields one special! 4 rows yields 2 specials.
                // 1 row yields 0 specials unless it collects an existing special from the board.
                const specialsFromRows = Math.floor(lines / 2);
                const totalSpecials = specialsFromRows + specialsOnBoard;

                let linesScore = 0;
                if (totalSpecials > 0) {
                    linesScore = this.linesWeight * lines + (totalSpecials * this.specialWeight);
                } else if (lines === 1) {
                    // When not in immediate danger, discourage burning single lines without specials
                    let maxH = 0;
                    for (let c = 0; c < _grid.columns; c++) {
                        const ch = _grid.columnHeight(c);
                        if (ch > maxH) maxH = ch;
                    }
                    linesScore = maxH >= 15 ? (this.linesWeight * lines) : -4.0;
                }

                if (workingPieceIndex == (workingPieces.length - 1)) {
                    score = linesScore - this.heightWeight * _grid.aggregateHeight() - this.holesWeight * _grid.holes() - this.bumpinessWeight * _grid.bumpiness();
                } else {
                    score = linesScore + this._best(_grid, workingPieces, workingPieceIndex + 1).score;
                }
            }

            // if row contains mines without holes
            for (let r = 0; r < _grid.rows; r++) {
                if(_grid.cells[r].every(c => c > 0 ) && _grid.cells[r].includes(19)){ score = -99999; }
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