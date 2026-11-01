const mockClient = require('./mockClient.js');
const AI = require('./ai');
const RandomPieceGenerator = require('./random_piece_generator');
const Grid = require('./grid');
const Status = require('../status');
const Client = require('../client');

const Bot = function(session, name){
    Client.call(this, new mockClient(), name);

    this.opponents = [];

    this.height = 22;
    this.width = 10;
    this.grid = new Grid(this.height, this.width);

    this.rpg = new RandomPieceGenerator();
    this.ai = new AI(0.510066, 0.760666, 0.35663, 0.184483);
    
    this.workingPieces = [null, null];
    this.workingPiece = null;

    this.session = null;
    this.id = name;
    this.isBot = true;
    this.state = {"arena":{"matrix":this.grid.cells},"block":{"matrix":[],"pos":{"x":1,"y":1}}};
    this.status = Status.client.seated;
    this.points = 1500;
    this.lost = false;
    this.stop = false;
    this.specials = [];
    this.onlyBots = false;

    const randomSpeed = [750, 800, 850, 900][Math.floor(Math.random() * 4)];

    // game interval
    this._updateGame = () => {
        let interval = setInterval(() => {
            if(this.stop !== false) {
                return clearInterval(interval);
            }
            try {
                this.startTurn();
            } catch (error) {
                console.log(error);
                return clearInterval(interval);
            }
        }, randomSpeed);
    };

    this.init();
};

Bot.prototype = Object.create(Client.prototype); // send and broadcast come from Client
Bot.prototype.constructor = Bot;

Bot.prototype.init = function (){
    this.socket.on('error', (err) => console.log('bot socket: ', err));

    this.socket.on('mock-msg', (message) => {
        const msg = JSON.parse(message);

        if(msg.type === "game-start"){
            this.opponents = [];
            for (let client of this.session.clients) {
                if(this.id !== client.id && client.state !== null){
                    this.opponents.push(client);
                }        
            }

            this.rpg.blocks = [];
            this.rpg.bag = msg.blocks;
            this.workingPieces[1] = this.rpg.nextPiece();
            this.drawGrid();
            this.stop = false;
            this.onlyBots = false;
            this._updateGame();
        }
        else if(msg.type === "state-winner"){
            if(this.status === Status.client.ready){
                this.drawGrid();
            }
            this.stop = true;
        }
        else if(msg.type === "player-ready"){
            this.grid.clearGrid();
            this.status = Status.client.ready;
            this.lost = false;
        }
        else if(msg.type === "use-special"){
            if (msg.special === 16) {   
                let clients = this.session.clients;
                clients.forEach(function(client){
                    if(client.id === msg.clientId){
                        msg.switchMatrix = client.state.arena.matrix;
                    }
                });
                return setTimeout(() => { // Wait for oponent to switch the arena first
                    this.grid.performSpecial(msg);
                    this.drawGrid();
                }, 100);
            }
            else{
                this.grid.performSpecial(msg);
                this.drawGrid();
            }
            
        }
    });
};

Bot.prototype.startTurn = function(){
    // Shift working pieces
    for(let i = 0; i < this.workingPieces.length - 1; i++){
        this.workingPieces[i] = this.workingPieces[i + 1];
    }
    this.workingPieces[this.workingPieces.length - 1] = this.rpg.nextPiece();
    this.workingPiece = this.workingPieces[0];

    this.workingPiece = this.ai.best(this.grid, this.workingPieces);

    if(this.onlyBots) this.workingPiece.column = 5; // Bot gives upp when all players lost
    if(this.workingPiece === null){ return this.endGame(); }

    while(this.workingPiece.moveDown(this.grid));

    try {
        this.state.arena = {matrix:this.grid.cells};
    } catch (error) {
        console.log('--------Line 123 bot.js--------');
        console.log(new Date());
        console.log(this.opponents);
        this.stop = true;
        this.lost = true;
        console.log('--------Line 132 bot.js--------');
    }

    if(!this.endTurn()){
        return this.endGame();
    }
    else {
        this.drawGrid();
    }
    
};

Bot.prototype.drawGrid = function(){
    const data = {};
    data.type = 'state-update';
    data.fragment = 'block';
    let prop = 'pos';
    let state = { x: 4, y: 1 };
    data.state = [prop, state];
    this.broadcast(data);

    prop = 'matrix';
    state = this.workingPieces[1].cells;
    data.state = [prop, state];
    this.broadcast(data);

    data.type = 'state-update';
    data.fragment = 'arena';
    data.state = ['matrix', this.grid.cells];
    this.broadcast(data);
};

// Process end of turn
Bot.prototype.endTurn = function(){
    // Add working piece
    this.grid.addPiece(this.workingPiece);

    this.drawGrid();

    let rows = this.grid.clearLines();

    if(rows === true){ // it is a mine
        const data = {};
        data.type = "log-special";
        data.special = 19;
        data.receiver = this.id;
        this.broadcast(data);
        
        return false; 
    }

    if (rows.cleared > 1) {
        this.broadcast({ type: "arena-bounce", rows: Math.min(rows.cleared, 4) });
    }

    for (; rows.cleared > 1; rows.cleared -= 2) { // create special every two rows
        this.createSpecial();
    }

    if(rows.specials.length > 0){
        this.specials.push.apply(this.specials, rows.specials);
    }

    // Check if special should be sent every cleared row
    this.specialsDecision(this.specials);

    return !this.grid.exceeded();
};

Bot.prototype.endGame = function(){
    this.stop = true;
    this.lost = true;
    this.broadcast({type: "state-lost"});
    this.session.isGameOver({type: "state-lost"});
};

Bot.prototype.specialsDecision = function(_specials) {
    if (!this.specials || this.specials.length === 0 || this.stop || this.lost) {
        return;
    }

    // Only the first queued special can be played
    const special = this.specials[0];
    const decision = this.decideSpecial(special);
    if (decision && decision.use) {
        this.useSpecial(decision.target, special);

        // Emergency follow-up: if self still has a lethal mine on board and has another special to disarm/clear
        if (this.specials.length > 0 && this.grid.cells.some(row => row.includes(19))) {
            const nextSpecial = this.specials[0];
            const nextDecision = this.decideSpecial(nextSpecial);
            if (nextDecision && nextDecision.use && nextDecision.target === this) {
                this.useSpecial(nextDecision.target, nextSpecial);
            }
        }
    }
};

Bot.prototype.decideSpecial = function(special) {
    const activeOpponents = (this.opponents || []).filter(o => {
        return o && !o.lost && o.state && o.state.arena && Array.isArray(o.state.arena.matrix);
    });

    const selfStats = analyzeArena(this.grid.cells);

    activeOpponents.forEach(o => {
        o.arenaStats = analyzeArena(o.state.arena.matrix);
    });

    const hasOpponents = activeOpponents.length > 0;
    const hasMultipleSpecials = this.specials.length >= 2;

    const highestOpponentBy = (prop) => {
        if (!hasOpponents) return null;
        return activeOpponents.reduce((best, cur) => cur.arenaStats[prop] > best.arenaStats[prop] ? cur : best);
    };

    switch (special) {
        case 8: { // Add row - offensive, adds garbage row with hole at bottom
            if (!hasOpponents) return { use: false };
            const target = highestOpponentBy('maxHeight');
            if (target && (target.arenaStats.maxHeight >= 8 || hasMultipleSpecials)) {
                return { use: true, target };
            }
            return { use: false };
        }

        case 9: { // Remove row - clears bottom row
            // If self has a mine on the bottom row, remove it immediately!
            if (selfStats.hasBottomMine) {
                return { use: true, target: this };
            }
            // If self board is high, lower it
            if (selfStats.maxHeight >= 8) {
                return { use: true, target: this };
            }
            // If self is safe, check if any opponent has valuable specials on bottom row
            if (hasOpponents) {
                const oppWithBottomSpecials = activeOpponents.find(o => o.arenaStats.hasBottomSpecials);
                if (oppWithBottomSpecials) {
                    return { use: true, target: oppWithBottomSpecials };
                }
            }
            // Keep board low if queue has specials
            if (selfStats.maxHeight >= 4 || (hasMultipleSpecials && selfStats.maxHeight >= 2)) {
                return { use: true, target: this };
            }
            return { use: false };
        }

        case 10: { // Earthquake - scrambles horizontal rows
            if (!hasOpponents) return { use: false };
            const target = highestOpponentBy('rowsCount');
            if (target && (target.arenaStats.rowsCount >= 5 || (hasMultipleSpecials && target.arenaStats.rowsCount >= 3))) {
                return { use: true, target };
            }
            return { use: false };
        }

        case 11: { // Milkshake - scrambles vertical columns, adds +2 rows if > 5 empty top rows
            if (!hasOpponents) return { use: false };
            const target = highestOpponentBy('rowsCount');
            if (target && (target.arenaStats.rowsCount >= 4 || (hasMultipleSpecials && target.arenaStats.rowsCount >= 2))) {
                return { use: true, target };
            }
            return { use: false };
        }

        case 12: { // Clear specials - turns all specials > 7 into regular blocks 1-7
            // Emergency: disarm lethal mines on our board
            if (selfStats.mineCount > 0) {
                return { use: true, target: this };
            }
            // Otherwise, target opponent with specials on their board to deny them
            if (hasOpponents) {
                const oppWithSpecials = activeOpponents
                    .filter(o => o.arenaStats.specialsCount > 0)
                    .reduce((best, cur) => (!best || cur.arenaStats.specialsCount > best.arenaStats.specialsCount) ? cur : best, null);
                if (oppWithSpecials) {
                    return { use: true, target: oppWithSpecials };
                }
            }
            // Cycle if queue is crowded
            if (this.specials.length >= 3) {
                return { use: true, target: hasOpponents ? highestOpponentBy('maxHeight') : this };
            }
            return { use: false };
        }

        case 13: { // Shotgun - punches 2 holes in every non-empty row
            if (!hasOpponents) return { use: false };
            const target = highestOpponentBy('rowsCount');
            if (target && (target.arenaStats.rowsCount >= 5 || (hasMultipleSpecials && target.arenaStats.rowsCount >= 3))) {
                return { use: true, target };
            }
            return { use: false };
        }

        case 14: { // Gravitation - drops floating blocks to fill holes and sweeps full rows
            if (selfStats.holesCount > 0 || selfStats.maxHeight >= 8 || hasMultipleSpecials) {
                return { use: true, target: this };
            }
            return { use: false };
        }

        case 15: { // Clear arena - completely clears arena
            if (selfStats.mineCount > 0 || selfStats.maxHeight >= 8 || selfStats.holesCount >= 3 || hasMultipleSpecials) {
                return { use: true, target: this };
            }
            return { use: false };
        }

        case 16: { // Switch arena - swaps our board with an opponent's board
            if (!hasOpponents) return { use: false };
            const bestOpponent = activeOpponents.reduce((best, cur) => cur.arenaStats.score > best.arenaStats.score ? cur : best);
            const isSelfInDanger = selfStats.mineCount > 0 || selfStats.maxHeight >= 10 || selfStats.holesCount >= 4 || selfStats.score < -80;
            if (bestOpponent && isSelfInDanger && (bestOpponent.arenaStats.score - selfStats.score >= 50)) {
                return { use: true, target: bestOpponent };
            }
            return { use: false };
        }

        case 17: { // Monster - fills rows 8-21 (height 14) and clears top rows
            if (!hasOpponents) return { use: false };
            // Only send to opponent with low board (height <= 11) to spike their board up
            const lowOpps = activeOpponents.filter(o => o.arenaStats.maxHeight <= 11);
            if (lowOpps.length > 0) {
                const target = lowOpps.reduce((lowest, cur) => cur.arenaStats.maxHeight < lowest.arenaStats.maxHeight ? cur : lowest);
                return { use: true, target };
            }
            return { use: false };
        }

        case 18: { // Mini bomb - turns all specials on the arena into deadly mines (19)
            if (!hasOpponents) return { use: false };
            const oppWithSpecials = activeOpponents
                .filter(o => o.arenaStats.specialsCount > 0)
                .reduce((best, cur) => (!best || cur.arenaStats.specialsCount > best.arenaStats.specialsCount) ? cur : best, null);
            if (oppWithSpecials) {
                return { use: true, target: oppWithSpecials };
            }
            return { use: false };
        }

        default:
            return { use: false };
    }
};

Bot.prototype.useSpecial = function(target, special) {
    if (this.stop || this.lost) return;

    if (!special) {
        special = this.specials.shift();
    } else {
        const idx = this.specials.indexOf(special);
        if (idx !== -1) {
            this.specials.splice(idx, 1);
        } else {
            special = this.specials.shift();
        }
    }

    if (!special) return;

    const client = target || this;

    const data = {
        type: "use-special",
        special: special,
        receiver: client.id,
        clientId: this.id
    };

    // Swap grids between bots if special is 16
    if (special === 16 && client.isBot) {
        const matrix = JSON.parse(JSON.stringify(client.state.arena.matrix));
        const matrix2 = JSON.parse(JSON.stringify(this.state.arena.matrix));

        swap(client.state.arena.matrix, matrix2);
        swap(this.state.arena.matrix, matrix);

        client.drawGrid();
        this.drawGrid();
    } else {
        client.send(data);

        if (special === 16) {
            data.clientId = client.id;
            this.send(data);
        }
    }

    data.type = "log-special";
    this.broadcast(data);
};

// swap grids for bots
function swap(grid, switchGrid) {
    for (let y = grid.length - 1; y >= 0; y -= 1) {
            grid[y] = switchGrid[y];
    }
}

Bot.prototype.createSpecial = function() {
    let y = 0;
    outer: for (let h = 0; h < this.grid.cells.length; h += 1) {
        for (let l = 0; l < this.grid.cells[h].length; l += 1) {
            if (this.grid.cells[h][l] > 0 && this.grid.cells[h][l] < 8){
                break outer; 
            }
        }
        y++; 
    }
    if (y >= this.height) { return; } // The arena is empty

    function weightedRand(spec) {
        let i, sum=0, r=Math.random();
        for (i in spec) {
            sum += spec[i];
            if (r <= sum) return i;
        }
    }

    let special = weightedRand({8:0.28, 9:0.28, 10:0.07, 11:0.04, 12:0.06, 13:0.09, 14:0.05, 15:0.04, 16:0.04, 17:0.01, 18:0.04});// random in percentage

    let tries = 500;
    let randomX = Math.floor((Math.random() * this.width) + 0);
    let randomY = Math.floor(Math.random() * (21 - y + 1)) + y;
    while (tries--) {
        if (this.grid.cells[randomY][randomX] > 0 && this.grid.cells[randomY][randomX] < 8) {
            return this.grid.cells[randomY][randomX] = parseInt(special);
        }
        randomX < this.width -1 ? randomX++ : randomX = 0; // next block
        
        if(tries%this.width === 0){
            randomY++; // next row
            if(randomY >= this.height){
                randomY = y; // restart from top row with blocks
            }
        }
    }
    
    console.log('-------------createSpecial--------------------');
    console.log('BOT: wow over 500 randoms');
    console.log(new Date());
    console.dir(this.state, { depth: null });
    console.log(y, randomY, randomX);
    console.dir(this.grid.cells, { depth: null });
    console.log(this.status, this.lost, this.stop);
    console.log(this.session.status);
    console.log('--------------createSpecial-------------------');
};

function analyzeArena(matrix) {
    if (!matrix || !Array.isArray(matrix)) {
        return {
            maxHeight: 0,
            rowsCount: 0,
            holesCount: 0,
            bumpiness: 0,
            mineCount: 0,
            specialsCount: 0,
            hasBottomMine: false,
            hasBottomSpecials: false,
            score: 0
        };
    }

    const height = matrix.length;
    const width = matrix[0] ? matrix[0].length : 10;
    const colHeights = new Array(width).fill(0);
    let rowsCount = 0;
    let mineCount = 0;
    let specialsCount = 0;
    let holesCount = 0;

    for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) {
            if (matrix[y][x] > 0) {
                colHeights[x] = height - y;
                break;
            }
        }
    }

    for (let y = 0; y < height; y++) {
        let hasBlock = false;
        for (let x = 0; x < width; x++) {
            const val = matrix[y][x];
            if (val > 0) {
                hasBlock = true;
                if (val === 19) {
                    mineCount++;
                } else if (val > 7) {
                    specialsCount++;
                }
            }
        }
        if (hasBlock) rowsCount++;
    }

    let maxHeight = 0;
    for (let x = 0; x < width; x++) {
        if (colHeights[x] > maxHeight) maxHeight = colHeights[x];
        const topY = height - colHeights[x];
        for (let y = topY; y < height; y++) {
            if (matrix[y][x] === 0) {
                holesCount++;
            }
        }
    }

    let bumpiness = 0;
    for (let x = 0; x < width - 1; x++) {
        bumpiness += Math.abs(colHeights[x] - colHeights[x + 1]);
    }

    const bottomRow = matrix[height - 1] || [];
    const hasBottomMine = bottomRow.includes(19);
    const hasBottomSpecials = bottomRow.some(v => v > 7 && v !== 19);

    const score = - (maxHeight * 12) - (holesCount * 15) - (bumpiness * 3) - (mineCount * 300) + (specialsCount * 5);

    return {
        maxHeight,
        rowsCount,
        holesCount,
        bumpiness,
        mineCount,
        specialsCount,
        hasBottomMine,
        hasBottomSpecials,
        score
    };
}

function countRowTypes(grid) {
    const stats = analyzeArena(grid);
    return {
        rowsCount: stats.rowsCount,
        mineCount: stats.mineCount,
        specialsCount: stats.specialsCount
    };
}

function getArenaScore(grid) {
    return analyzeArena(grid).score;
}

module.exports = Bot;