let ConnectionManager = function(document) {
    this.conn = null;
    this.peers = new Map();
    this.readyBtn = false;
    this.joinBtn = false;

    this.chat = new Chat(document, this);
    this.tetrisManager = new TetrisManager(document);
    this.localTetris = null;
    this.localID = null;
    this.countDownInterval = null;

    this.CountDownSound = new Howl({ src: ["sounds/get-ready.mp3"], volume: 0.4 });
    this.GameWon = new Howl({ src: ["sounds/winner.mp3"] });
    this.GameLost = new Howl({ src: ["sounds/lost.mp3"] });
    // this.TetrisTrance = new Howl({
    //     src: ['sounds/techno-trance.mp3'],
    //     loop: true,
    //     volume: 0.5
    // });
};

ConnectionManager.prototype.connect = function(address) {
    this.tetrisManager.initArenas();
    
    this.conn = new WebSocket(address);

    this.conn.addEventListener('open', () => {
        this.initSession();
    });

    this.conn.addEventListener('message', event => {
        this.receive(event);
    });

    this.conn.onclose = () => {
        if (this.localTetris !== null) {
            this.localTetris.stop(); // stop the tetris
        }

        this.conn = null; // remove the connection
        let element = '<div class="modal-overlay"><div class="disconnect-popup"><span class="close-popup">X</span>' +
            '<h1>Disconnected &#x2639;</h1><p>You dropped connection! Refresh the page to establish the game again.</p>' +
            '<button id="reload_page">Reload page</button></div></div>';
        document.getElementsByTagName("body")[0].innerHTML += element;

        document.getElementById("reload_page").addEventListener('click', function () {
            location.reload();
        }, false);
        document.getElementsByClassName("close-popup")[0].addEventListener('click', function () {
            removeElementsByClass("modal-overlay");
        }, false);
    };

    window.addEventListener('beforeunload', () => {
        this.conn.close(); // close the connection when reload to prevent chrome bug
    });
};

/**
 * See if we have a hash in url when connecting
 */
ConnectionManager.prototype.initSession = function() {
    this.showAvailableSeats();
    const roomName = decodeURI((RegExp("room=" + '(.+?)(&|$)').exec(location.search) || ['', null])[1]);
    const ranking = decodeURI((RegExp("rank=" + '(.+?)(&|$)').exec(location.search) || ['', null])[1]);
    document.title = roomName;

    if (roomName) {
        this.send({
            type: 'join-session',
            user: user,
            name: roomName,
            ranking: ranking.toLowerCase()
        });
    }
};

ConnectionManager.prototype.join = function() {
    this.toggleBtnType("hide-join");

    this.localTetris = this.tetrisManager.createLocalPlayer();
    this.showAvailableSeats();
    const state = this.localTetris.serialize();

    this.watchEvents();
    this.send({
        type: 'join-game',
        state
    });
};

ConnectionManager.prototype.send = function(data) {
    this.conn.send(JSON.stringify(data));
};

ConnectionManager.prototype.showAvailableSeats = function() {
    let elem = document.getElementsByClassName('arena');
    for (let i = 0; i < elem.length; i += 1) {
        if(elem[i].querySelector(".client-number") || elem[i].querySelector(".open-seat")) { continue; } // Seat is taken
        
        let span = document.createElement("span");
        span.innerHTML = "Seat open";
        span.className = "open-seat";
        
        elem[i].appendChild(span);
    }

    let bg = document.getElementsByClassName('empty-arena');
    while (bg[0]) { // remove every background img
        bg[0].classList.remove("empty-arena");
    }

};

ConnectionManager.prototype.countDown = function() {
    if (localStorage.getItem("toggle-sound") !== "off") {
        this.CountDownSound.play();
    }
    
    // reset countdown if exist
    clearInterval(this.countDownInterval);

    removeElementById("count_down");

    let names = document.getElementsByClassName("client-number"); // move players name to the bottom of arena
    for (let i = 0; i < names.length; i++) {
       names[i].style.top = "97%";
    }

    const element = document.getElementsByClassName("arena")[2];
    let span = document.createElement("span");
    span.innerHTML = "&nbsp;"; // space because safari needs content
    element.appendChild(span);
    span.id = "count_down";

    let i = 10; // countdown start number
    this.countDownInterval = setInterval(() => {
        span.innerHTML = i;
        
        if (i === 0) {
            clearInterval(this.countDownInterval);
            span.remove();
            removeElementsByClass(TETRIS.playerReadyClass);
        }
        i--;
    }, 1000);
};

ConnectionManager.prototype.updateManager = function(peers) {
    peers.clients.forEach(client => {
        if (peers.you === client.id) { return; }
        else if (!this.peers.has(client.id)) {
            const tetris = this.tetrisManager.createPlayer();
            tetris.unserialize(client.state);
            this.peers.set(client.id, tetris);
            tetris.arenaNaming(client);
            if(client.lost){
                tetris.gameOver('GAME OVER');
            }
        }
    });
    
    // Remove clients if not exists
    [...this.peers.entries()].forEach(([id, tetris]) => {
        if (!peers.clients.some(client => client.id === id)) {
            this.tetrisManager.removePlayer(tetris, peers.gamestatus);
            this.peers.delete(id);
        }
    });
    if(this.peers.size > 4){
        this.toggleBtnType("hide-join");
    }
    else if(this.localTetris === null){
        this.toggleBtnType("join");
    }
    else if(peers.gamestatus === "running"){
        this.toggleBtnType("hide");
    }

};

/**
 * Draw peers new block and arena
 *
 * @param id = clients unique id
 * @param fragment = block or arena
 * @param prop = pos, matrix, score
 * @param value = example {"x":6,"y":6}
 */
ConnectionManager.prototype.updatePeer = function(id, fragment, [prop, value]) {
    if (!this.peers.has(id)) {
        return console.error('client does not exist', id);
    }

    const tetris = this.peers.get(id);
    tetris[fragment][prop] = value;
    tetris.draw();
};

ConnectionManager.prototype.start = function(data) {
    //this.toggleBtnType("hide");
    clearInterval(this.countDownInterval);
    removeElementById("count_down"); // remove countdown if exist
      
    let names = document.getElementsByClassName("client-number"); // move players name to the bottom of arena
    for (let i = 0; i < names.length; i++) {
       names[i].style.top = "97%";
    }

    let li = document.createElement("li");
    li.innerHTML = "The game has started!";
    writeToLog(li);

    removeElementsByClass(TETRIS.playerReadyClass);

    let arena = document.getElementsByClassName('open-seat');
    for (let i = 0; i < arena.length; i += 1) {
        arena[i].parentNode.querySelector(".tetris").classList.add("empty-arena");
    }
    while (arena[0]) {
        arena[0].parentNode.removeChild(arena[0]);
    }
  
    if (this.joinBtn) { this.joinBtn.style.background = "#dc862a99"; } // if spectator return with joinBtn transparent
    if(this.localTetris == null) return;

    this.localTetris.arena.clear();
    this.localTetris.special.clearSpecials();
    this.localTetris.block.blocks = data.blocks;
    this.localTetris.block.initializeBlocks = data.blocks;
    this.localTetris.run();
    this.localTetris.block.randomizeBlock();
    this.localTetris.block.blockControll();
    this.localTetris.special.sendingSpecial = false; // just in case, not needed
};

ConnectionManager.prototype.logSpecial = function(data) {
    let li = document.createElement("li");
    let img = document.createElement("img");
    img.src = "img/game/specials/" + data.special + ".gif";
    
    if(data.special === 19){
        li.appendChild(img);
        li.innerHTML += data.clientId + " collected a mine";
        li.style.color = "red";
    }
    else{ 
        li.innerHTML = data.clientId + " >";
        li.appendChild(img);
        li.innerHTML += TETRIS.specialName(data.special) + " > " + data.receiver;
    }
    writeToLog(li);
    if (this.peers.get(data.receiver)) { this.peers.get(data.receiver).bounceArena(); }
    
};

ConnectionManager.prototype.receive = function(event) {
    const data = JSON.parse(event.data);

    switch (data.type) {
        case 'session-broadcast':
            this.updateManager(data.peers);
            break;
        case 'state-update':
            this.updatePeer(data.clientId, data.fragment, data.state);
            break;
        case 'add-special':
            this.localTetris.special.updateSpecials(data);
            break;
        case 'use-special': {
            let matrix;
            if (data.special === 16) {
                if (!this.peers.has(data.clientId)){ return; } // swoping same arena
                matrix = this.peers.get(data.clientId).arena.matrix;
            }
            this.localTetris.special.performSpecial(data, matrix);
            break;
        }
        case 'log-special':
            this.logSpecial(data);
            break;
        case 'remove-special':
            this.localTetris.special.removeSpecial();
            break;
        case 'use-special-failed':
            this.localTetris.special.sendingSpecial = false; // user can send special again
            break;
        case 'join-session':
            this.localID = data.clientId;
            if(data.isGuest){
                data.msg = "&#8505; <a style='color: #0088ff' href='https://mongot.com/register'>Register</a> new account or  <a style='color: #0088ff' href='https://mongot.com/login'>login</a> to play in ranked rooms.";
                this.chat.serverMessage(data);
            }
            else{
                this.readyBtn = document.getElementById("player_ready");
                this.joinBtn = document.getElementById("join_game");
                this.joinBtn.addEventListener('click', () => { this.join(); }, false);
                this.readyBtn.addEventListener('click', () => { this.send({ type: "player-ready" }); }, false);
            }

            if(data.joinable){
                this.toggleBtnType("join");
            }
            if(data.status === "running"){
                this.start(data);
            }

            break;
        case 'player-ready':
            if (this.peers.has(data.clientId)) {
                this.peers.get(data.clientId).playerReady();
            }
            if(data.clientId === this.localID){
                this.toggleBtnType("hide");
            }
            break;
        case 'join-game':
            this.toggleBtnType("ready");
            this.localTetris.arenaNaming(data);
            this.peers.set(data.id, this.localTetris);
            break;
        case 'unjoin-arena': {
            if(data.status === "ready"){
                this.toggleBtnType("ready");
            }
            if(data.status === "joined"){
                this.toggleBtnType("join");
               // this.tetrisManager.removeLocalPlayer();
                this.localTetris = null;
            }

            removeElementsByClass(TETRIS.playerReadyClass);

            const names = document.getElementsByClassName("client-number"); // bring up the players name
            for (let i = 0; i < names.length; i++) {
               names[i].style.top = "39%";
            }
            
            this.showAvailableSeats();
            break;
        }
        case 'start-countdown':
            this.countDown();
            break;
        case 'state-lost':
            if (this.peers.has(data.clientId)) {
                this.peers.get(data.clientId).gameOver('GAME OVER');
                this.peers.get(data.clientId).stop();
            }
            if(data.clientId === this.localID && localStorage.getItem("toggle-sound") !== "off"){
                    this.GameLost.play();
            }
            break;
        case 'game-start':
            this.start(data);
            break;
        case 'speed-up-blocks': {
            if(this.localTetris){
                this.localTetris.speedUpBlocks();
            }
            //document.getElementById("game_log").innerHTML += '<li class="player-info">&#187; Game speed increased</li>';
            let text = document.createElement("li");
            text.className = "player-info";
            text.innerHTML = "&#187; Game speed increased";
            writeToLog(text);
            break;
        }
        case 'state-winner': {
            if(data.winner === "no-winner"){
                data.winner = "no one ";
            }
            else if (this.peers.has(data.winner)) {
                this.peers.get(data.winner).gameOver('WINNER');
                this.peers.get(data.winner).stop();
            }

            if(data.winner === this.localID && localStorage.getItem("toggle-sound") !== "off"){ this.GameWon.play(); }

            // show the winner in description log
            let li = document.createElement("li");
            li.innerHTML = data.winner + " won the game!";
            li.className = "player-info";
            writeToLog(li);

            let log = document.getElementsByClassName('game-description')[0];
            log.scrollTop = log.scrollHeight;

            if(data.gameTime){
                data.msg = '<span style="color:#ffffff">&#128337; </span> Game time: '+ data.gameTime;
                this.chat.serverMessage(data);
            }

            if(this.joinBtn) this.joinBtn.style.removeProperty('background'); // remove transparent joinBtn if necessary

            this.countDownInterval = setTimeout(() => {
                let gameOvers = document.getElementsByClassName('gameover');
                for (let i = 0; i < gameOvers.length; i++) {
                    gameOvers[i].classList.add("hideGameOver"); // game over text hide anmiation
                }
                
                let clientNames = document.getElementsByClassName('client-number');
                for (let i = 0; i < clientNames.length; i++) {
                    clientNames[i].style.top = "39%";  // bring up the players name
                }

                if(this.localTetris){
                    this.toggleBtnType("ready");
                }
                else if(this.peers.size < 5){
                    this.toggleBtnType("join");
                }
                this.showAvailableSeats();
            }, 2000);
            
            setTimeout(removeElementsByClass, 3500, "gameover");
            break;
        }
        case 'state-chat':
            this.chat.message(data);
            break;
        case 'server-message':
            this.chat.serverMessage(data);
            break;
        case 'status-error':
            console.log('status-error', data.message); 
            break;
        case 'update-scores': {
            const players = data.players;
            for (let i = 0; i < players.length; i++) {
                const player = document.getElementById(players[i].name + "_crown");
                if(player){
                    player.src = "img/rankings/" + UTILS.getCrownImg(players[i].newPoints); // update crown
                    player.title = players[i].newPoints; // update score
                }
                if (players[i].pointsLost) {
                    players.msg = '<span style="color:#ffffff">&#9760;</span> ' + players[i].name + ' lost ' + players[i].pointsLost + ' points.';
                    this.chat.serverMessage(players);
                }
                else {
                    players.msg = '<span style="color:#ffd700">&#9813;</span> ' + players[i].name + ' won ' + players[i].pointsWon + ' points.';
                    this.chat.serverMessage(players);
                }

            }
            break;
        }
        default:
            console.log('No switch case');
    }
};

ConnectionManager.prototype.watchEvents = function() {
    const local = this.localTetris;
    
    const block = local.block;
    ['pos', 'matrix'].forEach(prop => {
        block.events.listen(prop, value => {
            this.send({
                fragment: 'block',
                state: [prop, value],
                type: 'state-update'
            });
        });
    });

    block.events.listen('lost', value => {
        this.localTetris.stop();
        this.send({
            state: ['lost', value],
            type: 'state-lost'
        });
    });

    const arena = local.arena;
    arena.events.listen('special', (type, values) => {
        this.send({
            type: type,
            specials: values
        });
    });

    arena.events.listen('matrix', value => {
        this.send({
            type: 'state-update',
            fragment: 'arena',
            state: ['matrix', value]
        });
    });

};

ConnectionManager.prototype.toggleBtnType = function(type){
    if(!this.joinBtn){ return; }

    if(type === "join"){
        this.joinBtn.style.display = "block";
        this.readyBtn.style.display = "none";
    }
    else if(type === "ready"){
        this.joinBtn.style.display = "none";
        this.readyBtn.style.display = "block";
    }
    else if(type === "hide"){
        this.joinBtn.style.display = "none";
        this.readyBtn.style.display = "none";
    }
    else if(type === "hide-join"){
        this.joinBtn.style.display = "none";
    }
};

function removeElementsByClass(className){
    let elements = document.getElementsByClassName(className);
    while(elements.length > 0){
        elements[0].parentNode.removeChild(elements[0]);
    }
}

function removeElementById(id){
    if(document.getElementById(id)){
        document.getElementById(id).remove();
    }
}

function writeToLog(msg){
    document.getElementById("game_log").appendChild(msg);

    const log = document.getElementsByClassName('game-description')[0];
    log.scrollTop = log.scrollHeight;
}
