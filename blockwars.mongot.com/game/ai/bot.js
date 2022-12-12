const mockClient = require('./mockClient.js');
const AI = require('./ai');
const RandomPieceGenerator = require('./random_piece_generator');
const Grid = require('./grid');
const Status = require('../status');

const Bot = function(session, name){
    this.socket = new mockClient();

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
    this.state = {"arena":{"matrix":this.grid.cells},"block":{"matrix":[],"pos":{"x":1,"y":1}}};
    this.status = Status.client.joined;
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

Bot.prototype.specialsDecision = function(_specials){
    if(_specials.length === 0){ return; }

    const opponents = this.opponents.filter(o => o.lost === false); // still alived opponents
    const opponent = opponents.reduce((prev, current) => (prev.specials.length > current.specials.length) ? prev : current); // opponent with most specials
 
    const _client = countRowTypes(opponent.state.arena.matrix);
    const rows = _client.rowsCount;
    const mines = _client.mineCount;
    const specials = _client.specialsCount; // exclude Add and Remove row

    const me = countRowTypes(this.grid.cells);
    const myRows = me.rowsCount;
    const myMines = me.mineCount;

    for (let i = 0; i < _specials.length; i++) {
        const s = _specials[i];

        if (
            (s === 8 && rows > 15) // Add row
            || (s === 9 && (mines > 0 || myRows > 15)) // Remove row
            || (s === 10 && rows > 9) // Earthquake
            || (s === 11 && rows > 6) // Milkshake
            || (s === 12 && (myMines > 0 || (mines === 0 && specials > 0))) // Remove Specials
            || (s === 13 && (rows > 10 || specials > 1)) // Shotgun
            || (s === 14 && (myMines > 0 || myRows > 12)) // Gravity
            || (s === 15 && (myMines > 0 || myRows > 15)) // Clear
            || (s === 17 && rows < 15) // Monster
            || (s === 18 && specials > 0) // Mine
        ) {
            return this.useSpecial(opponent);
        }

        if (s === 16) // Switch arena
        {
            let client = null;
            let bestScore = getArenaScore(this.grid.cells) + 80; // at least 80 points greather.

            for (let player of opponents) {
                const score = getArenaScore(player.state.arena.matrix);
                if (score > bestScore) {
                    bestScore = score;
                    client = player;
                }
            }
            if (client) { return this.useSpecial(client); }
        }
    }

};

Bot.prototype.useSpecial = function(opponent) {
    if(this.stop) return; // Game stopped

    const special = this.specials.splice(0, 1)[0]; // remove and use first special

    let client = this;
    
    // use clear specials if mines exist
    if(special === 12 && this.grid.cells.find(c => c.includes(19))){
        client = this;
    }
    else if(special === 16){ // switch arena
        let bestScore = getArenaScore(this.grid.cells);
        const _opponents = this.opponents.filter(o => o.lost === false);

        for (let player of _opponents) {
            const score = getArenaScore(player.state.arena.matrix);
            if(score > bestScore){
                bestScore = score;
                client = player;
            }
        }
    }
    else if(special === 9){
        if(this.grid.cells.find(c => c.includes(19))){
            client = this; // if board contains mine
        }
        else if(this.grid.cells[this.height-1].some(x => x > 7)){
            client = opponent; // if row has specials then remove from opponent instead
        }
    }
    else if (special !== 14 && special !== 15) { // If bad special
        client = opponent;
    }

    const data = {};
    data.type = "use-special";
    data.special = special;
    data.receiver = client.id;
    data.clientId = this.id;

    // swap grids between bots are special
    if(special === 16 && client.socket.constructor.name === 'MockClient'){
        //copy matrix without reference
        const matrix = JSON.parse(JSON.stringify(client.state.arena.matrix));
        const matrix2 = JSON.parse(JSON.stringify(this.state.arena.matrix));

        swap(client.state.arena.matrix, matrix2);
        swap(this.state.arena.matrix, matrix);

        this.drawGrid();
    }
    else{    
        client.send(data);
    
        if (special === 16) { // if swop arena then swop player id
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

Bot.prototype.broadcast = function(data){
    data.clientId = this.id;
    for (let client of this.session.clients) {
        client.send(data);
    }
};

/**
 * Send to local client only
 */
Bot.prototype.send = function(event) {
    const data = JSON.stringify(event);
    const client = this.socket;
    client.send(data, function ack(err) {
        if (client.readyState !== 1){ return; }
        if (err) { 
            console.log(this.id, err); 
        }
    });
};

function countRowTypes(grid){
    let rowsCount = 0;
    let mineCount = 0;
    let specialsCount = 0;

    let row = false;
    for (let y = grid.length - 1; y > 0; y -= 1) {
        for (let x = 0; x < grid[y].length; x += 1) {
            if (grid[y][x] > 0) {
                row = true;
            }
            if (grid[y][x] === 19) {
                mineCount++;
            }
            else if (grid[y][x] > 9) {
                specialsCount++;
            }
        }
        if(row) rowsCount++;
        row = false;
    }
    return {rowsCount, mineCount, specialsCount};
}

function getArenaScore(grid){
    let points = 0;
    let row = false;
    for (let y = grid.length - 1; y > 0; y -= 1) {
        for (let x = 0; x < grid[y].length; x += 1) {
            if (grid[y][x] > 0) {
                row = true;
            }
            else if (grid[y][x] === 19) {
                points -= 500;
            }
            else if (grid[y][x] > 9) {
                points += 10;
            }
        }
        if(row) points -= 10;
        else points += 10;

        row = false;
    }
    return points;
}

module.exports = Bot;