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

    switch (data.special) {
        case 8: {// Add row
            const row = new Array(10);
            for (let i = 0; i < row.length; i += 1) { // randow color for each square
                row[i] = Math.floor((Math.random() * 7) + 1);
            }            
            row[Math.floor((Math.random() * row.length) + 0)] = 0; // remove color on random square
            this.cells.splice(0, 1); // remove first row
            this.cells.push(row); // add created row last

            break;
        }
        case 9: {// Remove row
            const removeRow = this.cells.splice(this.height-1, 1)[0].fill(0);
            this.cells.unshift(removeRow);
            break;
        }
        case 10: // Earthquake, shuffle each row
            for (let y = this.cells.length - 1; y > 0; y -= 1) {
                shuffle(this.cells[y]);
            }
            break;
        case 11: {// Milkshake. shuffle rows vertical
            let counter = 0;
            // Remove empty rows
            outer: for (let y = 0; y < this.height; y += 1) {
                for (let x = 0; x < this.width; x += 1) {
                    if (this.cells[0][x] > 0) {
                        if(y > 7){ // Extra row to increase height if more than 5 visible empty rows left in arena
                            counter -= 2;
                            this.cells.unshift(new Array(this.width).fill(0));
                            this.cells.unshift(new Array(this.width).fill(0));
                        }
                        
                        break outer;
                    }
                }
                counter++;
                this.cells.splice(0, 1);
            }
            
            const matrixLength = this.cells.length;
            
            for (let x = 0; x < this.width; x++) {
            
              let temp = [];
              for (let i = 0; i < matrixLength; i++) {
                let shift = this.cells[i].shift();
                temp.push(shift);
              }
            
              shuffle(this.cells);

              for (let i = 0; i < matrixLength; i++) {
                  let shift = temp.shift(); 
                  this.cells[i].push(shift);
              }
            }

            // check if any row are filled, then remove a block
            for (let y = 0; y < this.cells.length; y++) {
                if(this.cells[y].indexOf(0) === -1){
                    for (let x = 0; x < this.width; x++) {
                        // if not a special then remove block
                        if (this.cells[y][x] < 8) {
                            this.cells[y][x] = 0;
                            break;
                        }
                    }
                }
            }

            // Add the removed blocks
            while (counter--) {
                this.cells.unshift(new Array(this.width).fill(0));
            }
            break;
        }
        case 12: // Remove all specials
            for (let y = this.cells.length - 1; y > 0; y -= 1) {
                for (let x = 0; x < this.cells[y].length; x += 1) {
                    if (this.cells[y][x] > 7) {
                        this.cells[y][x] = Math.floor((Math.random() * 7) + 1);
                    }
                }
            }
            break;
        case 13: // Shotgun
            for (let y = this.cells.length - 1; y > 0; y -= 1) {
                let length = this.cells[y].length;
                let randomBlock = Math.floor((Math.random() * length) + 0);
                this.cells[y][randomBlock] = 0;
                let randomBlock2 = Math.floor((Math.random() * length) + 0);
                this.cells[y][randomBlock2] = 0;
            }
            break;
        case 14:
            for (let y = this.cells.length - 1; y > 0; y -= 1) {
                for (let x = 0; x < this.cells[y].length; x += 1) {
                    if (this.cells[y][x] !== 0) { // if block is not null then push every block bellow it
                        for (let i = y; i < this.cells.length; i += 1) {
                            if (this.cells[i][x] === 0) {
                                this.cells[i][x] = this.cells[i-1][x]; // change color to above block
                                this.cells[i-1][x] = 0; // change the above block to no color;
                            }
                        }
                    }
                }
            }
            for (let i = 0; i < this.cells.length; i++) { // remove full rows
                if(this.cells[i].indexOf(0) === -1){
                    const row = this.cells.splice(i, 1)[0].fill(0); // sweep row
                    this.cells.unshift(row); // move it to the top
                }
            }
            break;
        case 15: // Clear arena
            for (let x = 0; x < this.cells.length; x += 1) {
                this.cells[x].fill(0);
            }
            break;
        case 16: { // Switch arena
            const switchMatrix = data.switchMatrix;
            for (let y = this.cells.length - 1; y >= 0; y -= 1) {
                for (let x = 0; x < this.cells[y].length; x += 1) {
                    this.cells[y][x] = switchMatrix[y][x];
                }
            }
            break;
        }
        case 17: // Monster
            for (let x = 8; x < this.cells.length; x += 1) {
                this.cells[x].fill(2);
            }
            this.cells[0].fill(0);this.cells[1].fill(0);this.cells[2].fill(0);this.cells[3].fill(0);
            this.cells[4].fill(0);this.cells[5].fill(0);this.cells[6].fill(0);this.cells[7].fill(0);

            this.cells[8][4] = 0;this.cells[8][5] = 0;
            this.cells[9][2] = 0;this.cells[9][4] = 0;this.cells[9][5] = 0;this.cells[9][7] = 0;
            this.cells[10][0] = 0;this.cells[10][1] = 0;this.cells[10][2] = 0;this.cells[10][7] = 0;this.cells[10][8] = 0;this.cells[10][9] = 0;
            this.cells[11][0] = 0;this.cells[11][1] = 0;this.cells[11][8] = 0;this.cells[11][9] = 0;
            this.cells[12][0] = 0;this.cells[12][9] = 0;
            this.cells[13][2] = 0;this.cells[13][3] = 0;this.cells[13][6] = 0;this.cells[13][7] = 0;
            this.cells[14][2] = 0;this.cells[14][3] = 0;this.cells[14][6] = 0;this.cells[14][7] = 0;
            this.cells[15][2] = 0;this.cells[15][3] = 1;this.cells[15][6] = 1;this.cells[15][7] = 0;
            this.cells[16][2] = 0;this.cells[16][3] = 1;this.cells[16][6] = 1;this.cells[16][7] = 0;
            this.cells[17][0] = 0;this.cells[17][9] = 0;
            this.cells[18][0] = 0;this.cells[18][1] = 0;this.cells[18][8] = 0;this.cells[18][9] = 0;
            this.cells[19][0] = 0;this.cells[19][1] = 0;this.cells[19][2] = 0;this.cells[19][7] = 0;this.cells[19][8] = 0;this.cells[19][9] = 0;
            this.cells[20][0] = 0;this.cells[20][1] = 0;this.cells[20][2] = 0;this.cells[20][4] = 0;this.cells[20][5] = 0;this.cells[20][7] = 0;this.cells[20][8] = 0;this.cells[20][9] = 0;
            this.cells[21][4] = 0;this.cells[21][5] = 0;
            break;
        case 18: // Mine, switch specials to mines
            for (let y = this.cells.length - 1; y > 0; y -= 1) {
                for (let x = 0; x < this.cells[y].length; x += 1) {
                    if (this.cells[y][x] > 7) {
                        this.cells[y][x] = 19;
                    }
                }
            }
            break;
        default:
            console.error('performSpecial ' + data);
            break;
    }

};

function shuffle(arr) {
    let i,j,temp;
    for (i = arr.length - 1; i > 0; i--) {
        j = Math.floor(Math.random() * (i + 1));
        temp = arr[i];
        arr[i] = arr[j];
        arr[j] = temp;
    }
    return arr;
}

module.exports = Grid;