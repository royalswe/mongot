const applySpecial = require('../special-rules');

function Grid(height, width){
    this.height = height;
    this.width = width;

    this.rows = height;
    this.columns = width;

    let rows = height;
    this.cells = [];
    while (rows--) {
        this.cells.push(new Array(this.columns).fill(0));
    }
}

Grid.prototype.clearGrid = function(){
    this.cells = [];
    let rows = this.rows;
    while (rows--) {
        this.cells.push(new Array(this.columns).fill(0));
    }
};

Grid.prototype.clone = function(){
    let _grid = new Grid(this.rows, this.columns);
    for (let r = 0; r < this.rows; r++) {
        for(let c = 0; c < this.columns; c++){
            _grid.cells[r][c] = this.cells[r][c];
        }
    }
    return _grid;
};

Grid.prototype.clearLines = function(){
    let mine = false;
    let clearedRows = [];
    let specials = [];
    for(let r = this.rows - 1; r >= 0; r--){
        if (this.isLine(r)){
            for(let c = 0; c < this.columns; c++){
                if (this.cells[r][c] === 19) { return mine = true; } // picked mine
                if (this.cells[r][c] > 7) {
                    specials.push(this.cells[r][c]);
                }
            }
            clearedRows.push(r);
        }
    }
    // Remove rows
    for (let i = 0; i < clearedRows.length; i++) {
        const row = this.cells.splice(clearedRows[i] + i, 1)[0].fill(0); // sweep row  
        this.cells.unshift(row); 
    }

    const cleared = clearedRows.length;
    return mine || {cleared, specials};
};

Grid.prototype.isLine = function(row){
    for(let c = 0; c < this.columns; c++){
        if (this.cells[row][c] === 0){
            return false;
        }
    }
    return true;
};

Grid.prototype.isEmptyRow = function(row){
    for(let c = 0; c < this.columns; c++){
        if (this.cells[row][c] !== 0){
            return false;
        }
    }
    return true;
};

Grid.prototype.exceeded = function(){
    return !this.isEmptyRow(0) || !this.isEmptyRow(1);
};

Grid.prototype.height = function(){
    let r = 0;
    for(; r < this.rows && this.isEmptyRow(r); r++);
    return this.rows - r;
};

Grid.prototype.lines = function(){
    let count = 0;
    for(let r = 0; r < this.rows; r++){
        if (this.isLine(r)){
            count++;
        }
    }
    return count;
};

Grid.prototype.holes = function(){
    let count = 0;
    for(let c = 0; c < this.columns; c++){
        let block = false;
        for(let r = 0; r < this.rows; r++){
            if (this.cells[r][c] != 0) {
                block = true;
            }else if (this.cells[r][c] == 0 && block){
                count++;
            }
        }
    }
    return count;
};

Grid.prototype.blockades = function(){
    let count = 0;
    for(let c = 0; c < this.columns; c++){
        let hole = false;
        for(let r = this.rows - 1; r >= 0; r--){
            if (this.cells[r][c] == 0){
                hole = true;
            }else if (this.cells[r][c] != 0 && hole){
                count++;
            }
        }
    }
    return count;
};

Grid.prototype.aggregateHeight = function(){
    let total = 0;
    for(let c = 0; c < this.columns; c++){
        total += this.columnHeight(c);
    }
    return total;
};

Grid.prototype.bumpiness = function(){
    let total = 0;
    for(let c = 0; c < this.columns - 1; c++){
        total += Math.abs(this.columnHeight(c) - this.columnHeight(c+ 1));
    }
    return total;
};

Grid.prototype.columnHeight = function(column){
    let r = 0;
    for(; r < this.rows && this.cells[r][column] == 0; r++);
    return this.rows - r;
};

Grid.prototype.addPiece = function(piece) {
    for(let r = 0; r < piece.cells.length; r++) {
        for (let c = 0; c < piece.cells[r].length; c++) {
            let _r = piece.row + r;
            let _c = piece.column + c;
            if (piece.cells[r][c] !== 0 && _r >= 0){
                this.cells[_r][_c] = piece.cells[r][c];
            }
        }
    }
};

Grid.prototype.valid = function(piece){
    for(let r = 0; r < piece.cells.length; r++){
        for(let c = 0; c < piece.cells[r].length; c++){
            let _r = piece.row + r;
            let _c = piece.column + c;


            if (piece.cells[r][c] !== 0){
                if(_r < 0 || _r >= this.rows){
                    return false;
                }
                if(_c < 0 || _c >= this.columns){
                    return false;
                }
                if (this.cells[_r][_c] !== 0){
                    return false;
                }
            }

        }

    }
    
    return true;
};

Grid.prototype.performSpecial = function(data) {
    if (!applySpecial(this.cells, data.special, { switchMatrix: data.switchMatrix })) {
        console.error('performSpecial ' + data);
    }
};

module.exports = Grid;
