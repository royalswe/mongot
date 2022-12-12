function Piece(cells){
    this.cells = cells;
    this.dimension = this.cells.length;
    this.row = 0;
    this.column = 0;
}

Piece.fromIndex = function(index){
    let piece = null;
    switch (index){
        case 'O':// O
            piece = new Piece([
                [4, 4],
                [4, 4]
            ]);
            break;
        case 'J': // J
            piece = new Piece([
                [3, 3, 3],
                [0, 0, 3],
                [0, 0, 0]
            ]);
            break;
        case 'L': // L
            piece = new Piece([
                [0, 0, 2],
                [2, 2, 2],
                [0, 0, 0]
            ]);
            break;
        case 'Z': // Z
            piece = new Piece([
                [5, 5, 0],
                [0, 5, 5],
                [0, 0, 0]
            ]);
            break;
        case 'S': // S
            piece = new Piece([
                [0, 6, 6],
                [6, 6, 0],
                [0, 0, 0]
            ]);
            break;
        case 'T': // T
            piece = new Piece([
                [0, 7, 0],
                [7, 7, 7],
                [0, 0, 0]
            ]);
            break;
        case 'I': // I
            piece = new Piece([
                [0, 1, 0, 0],
                [0, 1, 0, 0],
                [0, 1, 0, 0],
                [0, 1, 0, 0]
            ]);
            break;

    }
    return piece;
};

Piece.prototype.clone = function(){
    let _cells = new Array(this.dimension);
    for (let r = 0; r < this.dimension; r++) {
        _cells[r] = new Array(this.dimension);
        for(let c = 0; c < this.dimension; c++){
            _cells[r][c] = this.cells[r][c];
        }
    }

    let piece = new Piece(_cells);
    piece.row = this.row;
    piece.column = this.column;
    return piece;
};

Piece.prototype.canMoveLeft = function(grid){
    for(let r = 0; r < this.cells.length; r++){
        for(let c = 0; c < this.cells[r].length; c++){
            let _r = this.row + r;
            let _c = this.column + c - 1;
            if (this.cells[r][c] != 0){
                if (!(_c >= 0 && grid.cells[_r][_c] == 0)){
                    return false;
                }
            }
        }
    }
    return true;
};

Piece.prototype.canMoveRight = function(grid){
    for(let r = 0; r < this.cells.length; r++){
        for(let c = 0; c < this.cells[r].length; c++){
            let _r = this.row + r;
            let _c = this.column + c + 1;
            if (this.cells[r][c] != 0){
                if (!(_c >= 0 && grid.cells[_r][_c] == 0)){
                    return false;
                }
            }
        }
    }
    return true;
};


Piece.prototype.canMoveDown = function(grid){
    for(let r = 0; r < this.cells.length; r++){
        for(let c = 0; c < this.cells[r].length; c++){
            let _r = this.row + r + 1;
            let _c = this.column + c;
            if (this.cells[r][c] !== 0 && _r >= 0){
                if (!(_r < grid.rows && grid.cells[_r][_c] === 0)){
                    return false;
                }
            }
        }
    }
    return true;
};

Piece.prototype.moveLeft = function(grid){
    if(!this.canMoveLeft(grid)){
        return false;
    }
    this.column--;
    return true;
};

Piece.prototype.moveRight = function(grid){
    if(!this.canMoveRight(grid)){
        return false;
    }
    this.column++;
    return true;
};

Piece.prototype.moveDown = function(grid){
    if(!this.canMoveDown(grid)){
        return false;
    }
    this.row++;
    return true;
};

Piece.prototype.rotateCells = function(){
      let _cells = new Array(this.dimension);
      for (let r = 0; r < this.dimension; r++) {
          _cells[r] = new Array(this.dimension);
      }

      switch (this.dimension) { // Assumed square matrix
          case 2:
              _cells[0][0] = this.cells[1][0];
              _cells[0][1] = this.cells[0][0];
              _cells[1][0] = this.cells[1][1];
              _cells[1][1] = this.cells[0][1];
              break;
          case 3:
              _cells[0][0] = this.cells[2][0];
              _cells[0][1] = this.cells[1][0];
              _cells[0][2] = this.cells[0][0];
              _cells[1][0] = this.cells[2][1];
              _cells[1][1] = this.cells[1][1];
              _cells[1][2] = this.cells[0][1];
              _cells[2][0] = this.cells[2][2];
              _cells[2][1] = this.cells[1][2];
              _cells[2][2] = this.cells[0][2];
              break;
          case 4:
              _cells[0][0] = this.cells[3][0];
              _cells[0][1] = this.cells[2][0];
              _cells[0][2] = this.cells[1][0];
              _cells[0][3] = this.cells[0][0];
              _cells[1][3] = this.cells[0][1];
              _cells[2][3] = this.cells[0][2];
              _cells[3][3] = this.cells[0][3];
              _cells[3][2] = this.cells[1][3];
              _cells[3][1] = this.cells[2][3];
              _cells[3][0] = this.cells[3][3];
              _cells[2][0] = this.cells[3][2];
              _cells[1][0] = this.cells[3][1];

              _cells[1][1] = this.cells[2][1];
              _cells[1][2] = this.cells[1][1];
              _cells[2][2] = this.cells[1][2];
              _cells[2][1] = this.cells[2][2];
              break;
      }

      this.cells = _cells;
};

Piece.prototype.computeRotateOffset = function(grid){
    let _piece = this.clone();
    _piece.rotateCells();
    if (grid.valid(_piece)) {
        return { rowOffset: _piece.row - this.row, columnOffset: _piece.column - this.column };
    }

    // Kicking
    const initialRow = _piece.row;
    const initialCol = _piece.column;

    for (let i = 0; i < _piece.dimension - 1; i++) {
        _piece.column = initialCol + i;
        if (grid.valid(_piece)) {
            return { rowOffset: _piece.row - this.row, columnOffset: _piece.column - this.column };
        }

        for (let j = 0; j < _piece.dimension - 1; j++) {
            _piece.row = initialRow - j;
            if (grid.valid(_piece)) {
                return { rowOffset: _piece.row - this.row, columnOffset: _piece.column - this.column };
            }
        }
        _piece.row = initialRow;
    }
    _piece.column = initialCol;

    for (let i = 0; i < _piece.dimension - 1; i++) {
        _piece.column = initialCol - i;
        if (grid.valid(_piece)) {
            return { rowOffset: _piece.row - this.row, columnOffset: _piece.column - this.column };
        }

        for (let j = 0; j < _piece.dimension - 1; j++) {
            _piece.row = initialRow - j;
            if (grid.valid(_piece)) {
                return { rowOffset: _piece.row - this.row, columnOffset: _piece.column - this.column };
            }
        }
        _piece.row = initialRow;
    }
    _piece.column = initialCol;

    return null;
};

Piece.prototype.rotate = function(grid){
    const offset = this.computeRotateOffset(grid);
    if (offset != null){
        this.rotateCells(grid);
        this.row += offset.rowOffset;
        this.column += offset.columnOffset;
    }
};

module.exports = Piece;