let Special = function(tetris) {
    this.tetris = tetris;
    this.element = tetris.element;
    this.events = tetris.arena.events;
    this.matrix = tetris.arena.matrix;

    this.sendingSpecial = false;
    this.specialTube = [];
};

Special.prototype.clearSpecials = function(){
    this.specialTube = [];
    this.element.querySelector('.specials').innerHTML = "";
    this.element.querySelector('.current-special').innerHTML = "";
};

Special.prototype.updateSpecials = function(data) {
    this.specialTube.push.apply(this.specialTube, data.specials);

    for (let i = 0; i < data.specials.length; i += 1) {
        const img = document.createElement("img");
        img.src = "img/game/specials/" + data.specials[i] + ".gif";
        const specElem = this.element.querySelector('.specials');
        specElem.insertBefore(img, specElem.firstChild);
    }

    this.element.querySelector('.current-special').innerHTML = TETRIS.specialName(this.specialTube[0]);
};

Special.prototype.useSpecial = function(index) {
    if(this.sendingSpecial){ // Dont send special faster than server can handle
        // if user send special to fast then let him know
        let li = document.createElement("li");
        li.innerHTML = "Wait for last special to be done!";
        li.className = "server-message";
        document.getElementById("game_log").appendChild(li);
        return;
    } 
    const special = this.specialTube[0];
    const playerIndex = [0, KEY_BINDS.special1, KEY_BINDS.special2, KEY_BINDS.special3, KEY_BINDS.special4, KEY_BINDS.special5].indexOf(index);
    //const arena = document.getElementsByClassName('arena')[playerIndex-1].querySelector('.client-name');
    const arena = document.getElementsByClassName('client-name')[playerIndex-1];
    const playerId = arena.getAttribute("data-player");

    if (special == null || playerId == null) return; // no specials or no player exist
    
    this.sendingSpecial = true;

    if(special === 16){ // remove top 4 rows before switch arena
        this.matrix[0].fill(0);this.matrix[1].fill(0);
        this.matrix[2].fill(0);this.matrix[3].fill(0);
        this.matrix[4].fill(0);
        this.events.emit('matrix', this.matrix);
    }
    
    this.events.emit('special', 'use-special', [special, playerId]);
};

Special.prototype.removeSpecial = function(){
    this.specialTube.splice(0, 1); // remove first special
    this.sendingSpecial = false; // available to send special again;
    const elem = this.element.querySelector('.specials');
    elem.removeChild(elem.lastChild); // remove special img
    this.element.querySelector('.current-special').innerHTML = TETRIS.specialName(this.specialTube[0]); // update special name
};

Special.prototype.performSpecial = function(data, switchMatrix) {
    // display used special with the senders name then remove the element
    let span = document.createElement("div");
    span.className = "display-used-special";
    span.innerHTML = TETRIS.specialName(data.special) + '<span>' + data.clientId + '</span>';
    this.element.appendChild(span);
    const _tilesWidth = TETRIS.TilesWidth;
    const _tilesHeight = TETRIS.TilesHeight;

    setTimeout(function(){
        span.remove();
    }, 1100);
    
    switch (data.special) {
        case 8: { // Add row
            let row = new Array(10);
            for (let i = 0; i < row.length; i += 1) { // randow color for each square
                row[i] = Math.floor((Math.random() * 7) + 1);
            }            
            row[Math.floor((Math.random() * row.length) + 0)] = 0; // remove color on random square
            this.matrix.splice(0, 1); // remove first row
            this.matrix.push(row); // add created row last

            break;
        }
        case 9: {// Remove row
            const removeRow = this.matrix.splice(_tilesHeight-1, 1)[0].fill(0);
            this.matrix.unshift(removeRow);
            break;
        }
        case 10: // Earthquake, shuffle each row
            for (let y = this.matrix.length - 1; y > 0; y -= 1) {
                shuffle(this.matrix[y]);
            }
            break;
        case 11: {// Milkshake. shuffle rows vertical
            let counter = 0;
            // Remove empty rows
            outer: for (let y = 0; y < _tilesHeight; y += 1) {
                for (let x = 0; x < _tilesWidth; x += 1) {
                    if (this.matrix[0][x] > 0) {
                        if(y > 7){ // Extra row to increase height if more than 5 visible empty rows left in arena
                            counter -= 2;
                            this.matrix.unshift(new Array(_tilesWidth).fill(0));
                            this.matrix.unshift(new Array(_tilesWidth).fill(0));
                        }
                        
                        break outer;
                    }
                }
                counter++;
                this.matrix.splice(0, 1);
            }
            
            const matrixLength = this.matrix.length;
            
            for (let x = 0; x < _tilesWidth; x++) {
            
              let temp = [];
              for (let i = 0; i < matrixLength; i++) {
                let shift = this.matrix[i].shift();
                temp.push(shift);
              }
            
              shuffle(this.matrix);

              for (let i = 0; i < matrixLength; i++) {
                  let shift = temp.shift(); 
                  this.matrix[i].push(shift);
              }
            }

            // check if any row are filled, then remove a block
            for (let y = 0; y < this.matrix.length; y++) {
                if(this.matrix[y].indexOf(0) === -1){
                    for (let x = 0; x < _tilesWidth; x++) {
                        // if not a special then remove block
                        if (this.matrix[y][x] < 8) {
                            this.matrix[y][x] = 0;
                            break;
                        }
                    }
                }
            }
            
            // Add the removed blocks
            while (counter--) {
                this.matrix.unshift(new Array(_tilesWidth).fill(0));
            }
            break;
        }
        case 12: // Remove all specials
            for (let y = this.matrix.length - 1; y > 0; y -= 1) {
                for (let x = 0; x < this.matrix[y].length; x += 1) {
                    if (this.matrix[y][x] > 7) {
                        this.matrix[y][x] = Math.floor((Math.random() * 7) + 1);
                    }
                }
            }
            break;
        case 13: // Shotgun
            for (let y = this.matrix.length - 1; y > 0; y -= 1) {
                let length = this.matrix[y].length;
                let randomBlock = Math.floor((Math.random() * length) + 0);
                this.matrix[y][randomBlock] = 0;
                let randomBlock2 = Math.floor((Math.random() * length) + 0);
                this.matrix[y][randomBlock2] = 0;
            }
            break;
        case 14: // Gravitation
            for (let y = this.matrix.length - 1; y > 0; y -= 1) {
                for (let x = 0; x < this.matrix[y].length; x += 1) {
                    if (this.matrix[y][x] !== 0) { // if block is not null then push every block bellow it
                        for (let i = y; i < this.matrix.length; i += 1) {
                            if (this.matrix[i][x] === 0) {
                                this.matrix[i][x] = this.matrix[i-1][x]; // change color to above block
                                this.matrix[i-1][x] = 0; // change the above block to no color;
                            }
                        }
                    }
                }
            }
            for (let i = 0; i < this.matrix.length; i++) { // remove full rows
                if(this.matrix[i].indexOf(0) === -1){
                    const row = this.matrix.splice(i, 1)[0].fill(0); // sweep row
                    this.matrix.unshift(row); // move it to the top
                }
            }
            break;
        case 15: // Clear arena
            for (let x = 0; x < this.matrix.length; x += 1) {
                this.matrix[x].fill(0);
            }
            break;
        case 16: // Switch arena
            for (let y = this.matrix.length - 1; y >= 0; y -= 1) {
                for (let x = 0; x < this.matrix[y].length; x += 1) {
                    this.matrix[y][x] = switchMatrix[y][x];
                }
            }
            break;
        case 17: // Monster
            for (let x = 8; x < this.matrix.length; x += 1) {
                this.matrix[x].fill(2);
            }
            this.matrix[0].fill(0);this.matrix[1].fill(0);this.matrix[2].fill(0);this.matrix[3].fill(0);
            this.matrix[4].fill(0);this.matrix[5].fill(0);this.matrix[6].fill(0);this.matrix[7].fill(0);

            this.matrix[8][4] = 0;this.matrix[8][5] = 0;
            this.matrix[9][2] = 0;this.matrix[9][4] = 0;this.matrix[9][5] = 0;this.matrix[9][7] = 0;
            this.matrix[10][0] = 0;this.matrix[10][1] = 0;this.matrix[10][2] = 0;this.matrix[10][7] = 0;this.matrix[10][8] = 0;this.matrix[10][9] = 0;
            this.matrix[11][0] = 0;this.matrix[11][1] = 0;this.matrix[11][8] = 0;this.matrix[11][9] = 0;
            this.matrix[12][0] = 0;this.matrix[12][9] = 0;
            this.matrix[13][2] = 0;this.matrix[13][3] = 0;this.matrix[13][6] = 0;this.matrix[13][7] = 0;
            this.matrix[14][2] = 0;this.matrix[14][3] = 0;this.matrix[14][6] = 0;this.matrix[14][7] = 0;
            this.matrix[15][2] = 0;this.matrix[15][3] = 1;this.matrix[15][6] = 1;this.matrix[15][7] = 0;
            this.matrix[16][2] = 0;this.matrix[16][3] = 1;this.matrix[16][6] = 1;this.matrix[16][7] = 0;
            this.matrix[17][0] = 0;this.matrix[17][9] = 0;
            this.matrix[18][0] = 0;this.matrix[18][1] = 0;this.matrix[18][8] = 0;this.matrix[18][9] = 0;
            this.matrix[19][0] = 0;this.matrix[19][1] = 0;this.matrix[19][2] = 0;this.matrix[19][7] = 0;this.matrix[19][8] = 0;this.matrix[19][9] = 0;
            this.matrix[20][0] = 0;this.matrix[20][1] = 0;this.matrix[20][2] = 0;this.matrix[20][4] = 0;this.matrix[20][5] = 0;this.matrix[20][7] = 0;this.matrix[20][8] = 0;this.matrix[20][9] = 0;
            this.matrix[21][4] = 0;this.matrix[21][5] = 0;
            break;
        case 18: // Mine, switch specials to mines
            for (let y = this.matrix.length - 1; y > 0; y -= 1) {
                for (let x = 0; x < this.matrix[y].length; x += 1) {
                    if (this.matrix[y][x] > 7) {
                        this.matrix[y][x] = 19;
                    }
                }
            }
            break;
        default:
            console.error('performSpecial ' + data);
            break;
    }

    this.events.emit('matrix', this.matrix); //updatePeer
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