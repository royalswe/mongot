let Arena = function(tetris, w, h) {
    const matrix = [];
    while (h--) {
        matrix.push(new Array(w).fill(0));
    }
    this.matrix = matrix;

    this.tetris = tetris;
    this.events = new Events();
};

/**
 *  Clear the arena
 */
Arena.prototype.clear = function() {
    for (let x = 0; x < this.matrix.length; x += 1) {
        this.matrix[x].fill(0);
    }
    this.events.emit('matrix', this.matrix);
};

/**
 *  Remove row if filled
 */
Arena.prototype.sweepRow = function(callback) {
    let specials = [];
    let rowCount = 0;
    let rowNumbers = [];
    outer: for (let y = this.matrix.length - 1; y > 0; y -= 1) {
        specials = []; // remove specials if any
        for (let x = 0; x < this.matrix[y].length; x += 1) {
            if (this.matrix[y][x] === 0) {
                continue outer;
            }
            if (this.matrix[y][x] > 7) {
                specials.push(this.matrix[y][x]);
            }
        }

        if (specials.length > 0) { // if specials then store it in the server
            this.events.emit('special', 'add-special', specials);
            if (specials.indexOf(19) !== -1) { return; } // it is a mine
        }
        
        rowNumbers.push(y);
        rowCount++;
    }

    if(rowNumbers.length > 0){      
        this.tetris.drawSweepRow(rowNumbers, () => {
            for (; rowCount > 1; rowCount -= 2) {
                this.createSpecial();
            }
            this.events.emit('matrix', this.matrix);   
            
            this.tetris.block.dropInterval = this.tetris.block.DROP_SLOW; // Remove fast moving block 
            return callback();      
        });
    }
    else{
        return callback();
    }
};

Arena.prototype.createSpecial = function() {
    // Get number of rows that have blocks
    let y = 0;
    outer: for (let h = 0; h < this.matrix.length; h += 1) {
        for (let l = 0; l < this.matrix[h].length; l += 1) {
            if (this.matrix[h][l] > 0 && this.matrix[h][l] < 8){
                break outer; 
            }
        }
        y++; 
    }
    if (y >= TETRIS.TilesHeight) { return; } // The arena is empty

    // Get random special
    function weightedRand(spec) {
        let i, sum=0, r=Math.random();
        for (i in spec) {
            sum += spec[i];
            if (r <= sum) return i;
        }
    }

    let special = weightedRand({8:0.28, 9:0.28, 10:0.07, 11:0.04, 12:0.06, 13:0.09, 14:0.05, 15:0.04, 16:0.04, 17:0.01, 18:0.04});// random in percentage

    let tries = 500;
    let randomX = Math.floor((Math.random() * TETRIS.TilesWidth) + 0);
    let randomY = Math.floor(Math.random() * (21 - y + 1)) + y;
    while (tries--) {    
        if (this.matrix[randomY][randomX] > 0 && this.matrix[randomY][randomX] < 8) {
            return this.matrix[randomY][randomX] = parseInt(special);
        }
        randomX < TETRIS.TilesWidth -1 ? randomX++ : randomX = 0; // next block

        if(tries%TETRIS.TilesWidth === 0){
            randomY++; // next row
            if(randomY >= TETRIS.TilesHeight){
                randomY = y; // restart from top row with blocks
            }
        }
    }    
    console.log('wow over 500 randoms');
};

Arena.prototype.collide = function(block) {
    const m = block.matrix;
    const o = block.pos;
    for (let y = 0; y < m.length; y += 1) {
        for (let x = 0; x < m[y].length; x += 1) {
            if (m[y][x] !== 0 &&
                (this.matrix[y + o.y] &&
                    this.matrix[y + o.y][x + o.x]) !== 0) {
                return true;
            }
        }
    }
    return false;
};

/**
 * Merge the block to arena
 */
Arena.prototype.merge = function(block) {
    for (let y = 0; y < block.matrix.length; y += 1) {
        for (let x = 0; x < block.matrix[y].length; x += 1) {
            if (block.matrix[y][x] !== 0) {
                this.matrix[y + block.pos.y][x + block.pos.x] = block.matrix[y][x];
            }
        }
    }
    this.events.emit('matrix', this.matrix);
};