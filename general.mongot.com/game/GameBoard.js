'use strict';
let countryHandler = require('./countryHandler');
let Mission = require('./Mission');
let BotPlayer = require('./BotPlayer');
let botStrategy = require('./botStrategy');
let dice = require('./dice');
let models = require('../../models');
let config = require('../config.json');
let rating = require('./rating');

// Must not overlap botProfiles usernames: bots.username is unique.
const BOT_NAMES = ['Ranger', 'Sentinel', 'Guardian', 'Keeper'];
const TURN_EVENTS = ['deploy', 'next_turn', 'battle', 'tactical_move'];
const RECONNECT_GRACE = 30000;
// A fast-forwarded bot match that has not ended after this many phases is a stalemate and is abandoned.
const FAST_FORWARD_PHASE_LIMIT = 4000;
const BOT_DELAYS = {
    deployInitial: 120,     // Initial delay for deployment (maintains test compatibility)
    deployStep: 400,        // Delay between placing individual units during regular deploy phase
    deployEnd: 450,         // Pause after deploying before ending deploy phase
    battleInitial: 600,     // Pause when entering battle phase before first attack
    battleStep: 850,        // Delay between attacks so animations & dice rolls are visible
    battleEnd: 500,         // Pause after last attack before ending battle phase
    tacticalInitial: 500,   // Pause when entering tactical move phase
    tacticalEnd: 400        // Pause before ending turn
};

// sockets.js passes its lobby updates in, so this module does not depend on it.
const noLobby = {returnRoom() {}, updatePlayerList() {}, matchAbandoned() {}};

// allowBots: whether a bot takes over a seat whose player gave up or did not return; otherwise the seat drops out.
let GameBoard = function (sockets, io, room, mapId = 'original', lobby = noLobby, settings = {}) {

    const allowBots = settings.allowBots !== false;
    let PlayerList = {};
    let botControllers = {};
    let map = countryHandler.getMap(mapId);
    let countries = countryHandler.countries(map.id);
    let continents = countryHandler.continents(map.id);
    let Missions;
    let disabledCountries = [];
    let ap; //ap stands for active player and decides whos turn it is
    let phase; // will store the current game phase
    let phaseMessage;
    let nextPhase;
    let timer;
    let phaseDeadline;
    let actionHistory = [];
    const actionHistoryLimit = 40;
    let gameOver = false;
    let everyoneDeployFinished = false;
    let graceTimers = {};
    let fastForward = false;
    let fastForwardPhases = 0;

    function botDelay(name) {
        return fastForward ? 0 : BOT_DELAYS[name];
    }
    let phaseTimer = 122000;
    let GameStart;
    let gameInfra = io.of('/game_infra'); // The namespace

    function recordAction(action) {
        action.timestamp = Date.now();
        actionHistory.push(action);
        if (actionHistory.length > actionHistoryLimit) { actionHistory.shift(); }
        gameInfra.in(room).emit('action_log', action);
    }

    function Game() {
        nextPhase = Game.Phase.everyoneDeploy;
        Missions = new Mission.Mission(sockets, map.id);
        GameStart = new Date().getTime();
        this.initGame();
        this.surrender();
        this.nextTurn();
    }

    this.returningPlayer = function (socket) {
        for(let i = 0; i<sockets.length; i += 1){
            // After a bot takeover PlayerList holds the bot's name, so match on the original socket.
            if((PlayerList[i].username === socket.username || sockets[i].username === socket.username) && !PlayerList[i].surrender){
                // Only giving up or being conquered loses the seat; a dropped connection can always reclaim it.
                if (PlayerList[i].countries.length <= 0 || PlayerList[i].lost === 'surrender') { return; }
                delete botControllers[i];
                clearTimeout(graceTimers[i]);
                delete graceTimers[i];
                PlayerList[i].username = socket.username;
                PlayerList[i].botControlled = false;
                lobby.returnRoom(room, socket, PlayerList[i].color); // Update lobby and join room
                sockets.splice(i, 1, socket);
                PlayerList[i].lost = false;
                gameInfra.in(room).emit('message', {type: 'serverMessage', message: socket.username + ' is back and has retaken their seat.'});
                socket.send({type: 'player_rejoin', mission: PlayerList[i].mission}); // Show players mission
                socket.send({type: 'update_gold', gold: PlayerList[i].gold});
                let gold = updateGoldIncome(i);
                socket.send({type: 'update_gold_income', goldIncome: gold});
                socket.send({type: 'phase', message: phase, phaseMsg: '<span style="color:#4bff00">Welcome back '+ PlayerList[i].username +'!</span>'});
                if (gameOver) {
                    socket.send({type: 'game_over', message: 'Match complete. The table is available for a rematch.'});
                }
                if (phase === Game.Phase.everyoneDeploy) {
                    Game.prototype.everyoneDeploy(i);
                }
                else {
                    if (ap === i) { Game.prototype.resumeTurn(); }
                    socket.send({
                        type: 'current_player',
                        bool: ap === i,
                        player: ap,
                        username: PlayerList[ap].username,
                        color: PlayerList[ap].color
                    });
                }
                Game.prototype.surrender(i);

                break;
            }
        }
    };

    this.getGameInfo = function () {
        return {playerList: PlayerList, ap: ap, phase: phase, phaseDeadline: phaseDeadline, actionHistory: actionHistory.slice(), disabledCountries: disabledCountries, mapId: map.id};
    };

    this.getMapInfo = function () {
        return countryHandler.getMap(map.id);
    };

    // Called by the server when a seated player's socket closes, so nothing depends on what other browsers report.
    this.playerDisconnected = function (socket) {
        const id = sockets.indexOf(socket);
        // A bot already plays for a surrendered player, so their departure must not interrupt the bot's turn.
        if (id !== -1 && !botControllers[id]) { Game.prototype.leaveGame(id); }
    };

    // True while at least one seat is still played by a human, including one inside the reconnect window.
    this.hasHumanPlayers = function () {
        return sockets.some((socket, id) => !getController(id).isBot);
    };

    this.getRematchPlayers = function (connectedPlayers) {
        if (!allowBots) { return sockets.filter((socket) => connectedPlayers.indexOf(socket) !== -1); }
        return sockets.map((socket, id) => {
            if (connectedPlayers.indexOf(socket) !== -1) {
                delete botControllers[id];
                return socket;
            }
            let controller = getController(id);
            if (!controller.isBot) {
                takeOverWithBot(id, 'disconnect', this);
                controller = getController(id);
            }
            controller.handlers = Object.create(null);
            return controller;
        });
    };

    this.getRoomPlayers = function () {
        return sockets.map((socket, id) => {
            const participant = getController(id);
            return {
                username: participant.username,
                points: participant.points,
                color: participant.color,
                ip: participant.ip,
                isBot: Boolean(participant.isBot),
                isGuest: Boolean(participant.isGuest),
                isUnverified: Boolean(participant.isUnverified),
                matchRanked: matchIsRanked()
            };
        });
    };

    this.isRankedMatch = function () {
        return matchIsRanked();
    };

    this.getPlayerCount = function () {
        return sockets.length;
    };

    this.isOver = function () {
        return gameOver;
    };

    function destroyBoard() {
        gameOver = true;
        clearTimeout(timer);
        Object.keys(graceTimers).forEach((id) => clearTimeout(graceTimers[id]));
        graceTimers = {};
    }

    this.destroy = destroyBoard;

    // With nobody left to watch, bots play out the match without their pacing delays.
    this.setFastForward = function (enabled) {
        fastForward = Boolean(enabled);
        fastForwardPhases = 0;
    };

    // Ends the reconnect window for everyone who is away: bots take their seats or they sit out.
    this.replaceAbsentPlayers = function () {
        Object.keys(PlayerList).forEach((id) => {
            if (PlayerList[id].lost === null) { Game.prototype.replaceAbsentPlayer(Number(id)); }
        });
    };

    // A match closed before anyone won: every player whose seat a bot took over is charged a loss.
    // Ratings are only settled against a winner, so points stay unchanged. Returns the charged usernames.
    this.abandon = function () {
        return Game.prototype.abandonMatch();
    };

    Game.prototype.abandonMatch = function () {
        if (gameOver) { return []; }
        const charged = [];
        sockets.forEach((socket, id) => {
            if (!botControllers[id] || socket.isBot || socket.isGuest) { return; }
            charged.push(socket.username);
            if (process.env.NODE_ENV !== 'test') {
                models.User.updateOne({username: socket.username}, {$inc: {games_lost_general: 1}},
                    function (err) { if (err) { console.log(err); } });
            }
        });
        gameInfra.in(room).emit('message', {type: 'game_over', message: 'The match was closed without a winner.'});
        destroyBoard();
        return charged;
    };

    this.kickoutPlayer = function (player) {
        for(let i in PlayerList) {
            if(PlayerList[i].username === player){
                sockets[i].send({type: 'serverMessage', message: 'You have been kicked from the game'});
                sockets[i].disconnect();
            }
        }
    };
    
    Game.Phase = {
        everyoneDeploy: "Everyone deploy",
        deploy: "Deploy",
        battle: "Battle",
        tacticalMove: "Tactical move",
        gameOver: "Game over"
    };

    Game.prototype.initGame = function () {
        // Add all players in new PlayerList objects
        for(let i = 0; i<sockets.length; i += 1){
            let player = this.Player(i);
            PlayerList[i] = player;
        }
        // Randomise starting countries to players
        let c = 0;
        for (let i = 0; i < countries.length; i += 1) {

            PlayerList[c].countries.push(countries[i]);
            c += 1;
            if (Object.keys(PlayerList).length === c) {
                c = 0;
            }
        }
    };
    /**
     * Will change the game phase
     */
    Game.prototype.nextTurn = function () {
        if (fastForward && !gameOver && (fastForwardPhases += 1) > FAST_FORWARD_PHASE_LIMIT) {
            this.abandonMatch();
            return lobby.matchAbandoned(room);
        }
        phase = nextPhase;
        clearTimeout(timer);
        phaseDeadline = phase === Game.Phase.gameOver ? null : Date.now() + phaseTimer;
        if (phaseDeadline !== null) {
            timer = setTimeout(() => {
                return this.nextTurn();
            }, phaseTimer);
        }
        gameInfra.in(room).emit('start_countdown', {
            deadline: phaseDeadline,
            serverTime: Date.now()
        });

        switch (phase) {
            case Game.Phase.everyoneDeploy:
                nextPhase = Game.Phase.deploy;
                this.renderGame();
                this.everyoneDeploy();
                break;
            case Game.Phase.deploy:
                nextPhase = Game.Phase.battle;
                this.nextPlayer();
                this.nextTurnButton();
                this.playerTurn();
                this.renderGame();
                this.deploy();
                this.determineVictor();
                break;
            case Game.Phase.battle:
                nextPhase = Game.Phase.tacticalMove;
                this.determineVictor();
                this.battle();
                break;
            case Game.Phase.tacticalMove:
                nextPhase = Game.Phase.deploy;
                this.collectGoldIncome(ap);
                this.updateGold(ap);
                this.tacticalMove();
                break;
            case Game.Phase.gameOver:
                clearTimeout(timer);
                break;
            default:
                console.log("ERROR: Invalid game phase.");
                break;
        }

        if(phase === Game.Phase.deploy){ phaseMessage = "Buy troops by clicking on your countries. Cost "+ config.ARMY_COST +" gold."}
        else if(phase === Game.Phase.battle){ phaseMessage = "Click on your country and then on neighboring enemy country to attack."}
        else if(phase === Game.Phase.tacticalMove){ phaseMessage = "Click on two of your neighboring countries to move troops."}
        else if(phase === Game.Phase.everyoneDeploy){ phaseMessage = "Click on your countries to buy troops. One unit cost "+ config.ARMY_COST +" gold"}

        if(ap !== undefined && !gameOver) {
            gameInfra.in(room).emit('message', {type: 'phase', message: phase, phaseMsg: "Waiting for " + PlayerList[ap].username});
            sockets[ap].send({type: 'phase', message: phase, phaseMsg: phaseMessage});
        }
        else{
            gameInfra.in(room).emit('message', {type: 'phase', message: phase, phaseMsg: phaseMessage});
        }
    };

    Game.prototype.nextTurnButton = function () {
            getController(ap).on('next_turn', () => {
            this.nextTurn();
        });
    };

    Game.prototype.renderGame = function () {
        gameInfra.in(room).emit('render_map', PlayerList);
    };

    Game.prototype.updateGold = function (id) {
        sockets[id].send({type: 'update_gold', gold: PlayerList[id].gold});
    };

    Game.prototype.collectGoldIncome = function (id) {
        let gold = updateGoldIncome(id);
        // collect gold from disabled countries
        if(disabledCountries.length > 0) {
            for (let i = 0; i < disabledCountries.length; i += 1) {
                gold += disabledCountries[i].gold;
            }
        }
        PlayerList[id].gold += gold;
    };

    Game.prototype.refreshGoldIncome = function () {
        sockets.forEach((socket, index) => {
            let gold = updateGoldIncome(index);

            if(disabledCountries.length > 0 && index === ap) {
                let bonusGold = 0;
                // collect gold from disabled countries
                for (let i = 0; i < disabledCountries.length; i += 1) {
                    bonusGold += disabledCountries[i].gold;
                }
                sockets[ap].send({type: 'update_gold_income', goldIncome: gold + '+' + bonusGold});
            }
            else {
                socket.send({type: 'update_gold_income', goldIncome: gold});
            }
        });
    };
    /**
     * Tell the players whos turn it is and enable the player to interact
     */
    Game.prototype.playerTurn = function () {
        gameInfra.in(room).emit('message', {
            type: 'current_player',
            bool: false,
            player: ap,
            username: PlayerList[ap].username,
            color: PlayerList[ap].color
        });
        sockets[ap].send({type: 'enable_player', bool: true});
    };

    Game.prototype.nextPlayer = function () {
        if (ap === undefined) { // runs first time
            if (Object.keys(PlayerList).length === 2){ // Player with lowest gold starts
                let gold = 200;
                for(let key in PlayerList){
                    if(PlayerList[key].gold < gold){
                        gold = PlayerList[key].gold;
                        ap = PlayerList[key].id;
                    }
                }
                PlayerList[ap].gold -= (config.ARMY_COST * 3); // withdraw gold from starting player if 2 players only
                sockets[ap].send({type: 'update_gold', gold: PlayerList[ap].gold});
                sockets[ap].emit('withdraw_gold_effect', config.ARMY_COST * 3); // show removed gold effect
            }
            else {
                ap = Math.floor(Math.random() * Object.keys(PlayerList).length); // Randomize starting player first time
            }
            return;
        }

        for (let i = 0; i < Object.keys(PlayerList).length; i++) {
            // If there is any event listeners then remove them
            removeListeners(getController(ap), TURN_EVENTS);
            if (getController(ap) !== sockets[ap]) {
                removeListeners(sockets[ap], TURN_EVENTS);
            }

            ap = ap >= Object.keys(PlayerList).length - 1 ? 0 : ap + 1; // change active player
            // A player inside the reconnect window still gets the turn, so others cannot skip past them.
            if (PlayerList[ap].lost !== true) { return; }
        }
    };

    // Hands the current phase to whoever now controls the active seat (a returning player or a stand-in bot).
    Game.prototype.resumeTurn = function () {
        this.nextTurnButton();
        switch (phase) {
            case Game.Phase.deploy:
                this.deploy();
                break;
            case Game.Phase.battle:
                this.battle();
                break;
            case Game.Phase.tacticalMove:
                this.tacticalMove();
                break;
        }
    };

    Game.prototype.deploy = function () {
        getController(ap).on('deploy', (country, owner) => {
            try{
                if(PlayerList[ap].gold < config.ARMY_COST) { return; } // jump over phase bugg: prevent running when money is bellow 5 gold
                this.buyUnit(ap, country, owner);
                if(PlayerList[ap].gold < config.ARMY_COST) {// If player cant deploy automaticly redirekt to next phase
                    this.nextTurn();
                }
            }
            catch (ex){
                return gameInfra.in(room).emit("error", ex.message);
            }
        });
        if (getController(ap).isBot) { this.botDeploy(ap, 'deploy'); }
    };
    /**
     * Only runs the first turn when all players deploy their units
     */
    Game.prototype.everyoneDeploy = function (player = 'all') {
        this.refreshGoldIncome();

        if(player === 'all'){
            setTimeout(() => { // Collect gold if player wait out the time
                if (!everyoneDeployFinished) {
                    for (let i = 0; i < Object.keys(PlayerList).length; i += 1) {
                        this.collectGoldIncome(i);
                        this.updateGold(i);
                    }
                }
            }, phaseTimer);
        }

        sockets.forEach((socket, index) => {
            if(player !== 'all' && player !== index){ return; } // So returning player runs once only
            this.updateGold(index);

            socket.send({type: 'start_game', mission: PlayerList[index].mission}); // Play sound notification
            socket.send({ // Let all players start same time first turn.
                type: 'current_player',
                bool: true,
                player: index,
                username: PlayerList[index].username,
                color: PlayerList[index].color
            });

            let np = JSON.parse(JSON.stringify(PlayerList));
            delete np[index];
            sockets[index].emit('render_map_everyone_deploy', np, [PlayerList[index]]);

            getController(index).on('everyone_deploy', (country, owner) => {
                try{
                    const target = PlayerList[index].countries.find(x=> x.id === country);
                    if (owner === index && target && PlayerList[index].gold >= config.ARMY_COST) {
                        PlayerList[index].gold -= config.ARMY_COST; // withdraw unit cost
                        target.units += 1;
                        sockets[index].emit('render_map_everyone_deploy', np, [PlayerList[index]]);
                        sockets[index].emit('bounce_country', country); // give deployed unit bounce effect
                        this.updateGold(index);
                    }

                    // Check if all player is done for the next round
                    if (everyoneHasDeployed()) { return this.finishEveryoneDeploy(); }
                }
                catch (ex){
                    return gameInfra.in(room).emit("error", ex.message);
                }
            });
            if (getController(index).isBot) { this.botDeploy(index, 'everyone_deploy'); }
        });
    };

    Game.prototype.finishEveryoneDeploy = function () {
        if (everyoneDeployFinished || phase !== Game.Phase.everyoneDeploy) { return; }
        everyoneDeployFinished = true;
        for (let i = 0; i < Object.keys(PlayerList).length; i += 1) {
            this.collectGoldIncome(i);
            this.updateGold(i);
        }
        return this.nextTurn();
    };

    function everyoneHasDeployed() {
        return Object.keys(PlayerList).every((i) =>
            PlayerList[i].gold < config.ARMY_COST || PlayerList[i].lost === true || PlayerList[i].lost === null);
    }

    Game.prototype.botDeploy = function (id, eventName) {
        const bot = getController(id);
        setTimeout(() => {
            if (gameOver || getController(id) !== bot) { return; }

            if (eventName === 'everyone_deploy') {
                while (!gameOver && getController(id) === bot && PlayerList[id] && PlayerList[id].gold >= config.ARMY_COST) {
                    const country = botStrategy.deploymentTarget(PlayerList, id, continents);
                    if (!country) { break; }
                    bot.serverAction(eventName, country.id, id);
                    if (phase !== Game.Phase.everyoneDeploy) { break; }
                }
                return;
            }

            const deployStep = () => {
                if (!botHasTurn(id, bot, Game.Phase.deploy)) { return; }

                if (PlayerList[id] && PlayerList[id].gold >= config.ARMY_COST) {
                    const country = botStrategy.deploymentTarget(PlayerList, id, continents);
                    if (country) {
                        bot.serverAction('deploy', country.id, id);
                        if (PlayerList[id] && PlayerList[id].gold >= config.ARMY_COST) {
                            setTimeout(deployStep, botDelay('deployStep'));
                            return;
                        }
                    }
                }

                if (botHasTurn(id, bot, Game.Phase.deploy)) {
                    setTimeout(() => {
                        if (botHasTurn(id, bot, Game.Phase.deploy)) {
                            this.nextTurn();
                        }
                    }, botDelay('deployEnd'));
                }
            };

            deployStep();
        }, botDelay('deployInitial'));
    };

    Game.prototype.buyUnit = function (id, country, owner) {
        const target = PlayerList[id].countries.find(x=> x.id === country);
        if (owner === id && target && PlayerList[id].gold >= config.ARMY_COST) {
            PlayerList[id].gold -= config.ARMY_COST;
            target.units += 1;
            this.renderGame();
            gameInfra.in(room).emit('bounce_country', country); // give deployed unit bounce effect
            recordAction({type: 'deploy', player: PlayerList[id].username, color: PlayerList[id].color, country: country, units: 1});
            this.updateGold(id);
        }
    };

    Game.prototype.tacticalMove = function () {
        if(disabledCountries.length > 0) {
            returnConqueredCountries(ap);
            this.refreshGoldIncome(); // Remove gold bonus
        }
        this.renderGame();

        setTimeout(() => { // to prevent bugg if user attacks when the time is out.
            if(disabledCountries.length > 0) {
                returnConqueredCountries(ap);
                this.renderGame();
            }
        }, 100);

        getController(ap).on('tactical_move', (moveFromCountry, moveToCountry, owner, units) => {
            if (!checkIfInteger([moveFromCountry, moveToCountry, owner, units])){ return; }

            try{
                if (!checkIfNeighbour(moveFromCountry, moveToCountry)) { return; } // Prevent neighbour cheat
                if (!PlayerList[ap].countries.some(x=> x.id === moveToCountry)) { return; } // only into own territory
                // Remove units from leaving country
                let moveFromCountryUnits = getCountryUnits(ap, moveFromCountry);
                if(units >= moveFromCountryUnits){ return; } // Prevent units cheat
                setCountryUnits(ap, moveFromCountry, moveFromCountryUnits - units);
                // Add units to arrival country
                let moveToCountryUnits = getCountryUnits(ap, moveToCountry);
                setCountryUnits(ap, moveToCountry, units + moveToCountryUnits);

                this.renderGame();
                gameInfra.in(room).emit('move_animation', moveFromCountry, moveToCountry, units);
                recordAction({type: 'move', player: PlayerList[ap].username, color: PlayerList[ap].color, from: moveFromCountry, to: moveToCountry, units: units});
                this.determineVictor();
                return this.nextTurn();
            }
            catch (ex){
                return gameInfra.in(room).emit("error", ex.message);
            }
        });
        if (getController(ap).isBot) { this.botTacticalMove(ap); }
    };

    Game.prototype.botTacticalMove = function (id) {
        const bot = getController(id);
        setTimeout(() => {
            if (!botHasTurn(id, bot, Game.Phase.tacticalMove)) { return; }

            const move = botStrategy.chooseMove(PlayerList, id);
            if (move) {
                const available = getCountryUnits(id, move.from);
                const moveUnits = Math.min(available - 1, move.units || Math.max(1, available - 1));
                if (moveUnits > 0) {
                    bot.serverAction('tactical_move', move.from, move.to, id, moveUnits);
                    return;
                }
            }

            if (botHasTurn(id, bot, Game.Phase.tacticalMove)) {
                setTimeout(() => {
                    if (botHasTurn(id, bot, Game.Phase.tacticalMove)) {
                        this.nextTurn();
                    }
                }, botDelay('tacticalEnd'));
            }
        }, botDelay('tacticalInitial'));
    };

    Game.prototype.battle = function () {
        getController(ap).on('battle', (attackCountry, defendCountry, defender, unitsSent) => {
            if (!checkIfInteger([attackCountry, defendCountry, defender, unitsSent])){ return; }
            try {
                if (!checkIfNeighbour(attackCountry, defendCountry)) { return; } // Prevent neighbour cheat
                // The browser names the defender, so check it really holds the target before anything changes.
                if (defender === ap || !PlayerList[defender] || !PlayerList[defender].countries.some(x=> x.id === defendCountry)) { return; }
                let unitsInAttackCountry = getCountryUnits(ap, attackCountry);
                if(unitsSent >= unitsInAttackCountry){ return; } // Prevent units cheat
                setCountryUnits(ap, attackCountry, unitsInAttackCountry - unitsSent); // Remove sent units from attackCountry

                let attackerUnits = unitsSent; // calculate attackers lost
                let getDefenderUnits = getCountryUnits(defender, defendCountry);
                const result = dice.fight(unitsSent, getDefenderUnits);
                unitsSent = result.attackers;
                let defenderUnits = result.defenders;
                gameInfra.in('log-'+room).emit('dice_log', result.attackerRolls, result.defenderRolls);

                if (defenderUnits <= 0) { // successful attack if 0
                    conquerCountry(defender, defendCountry, unitsSent);
                    gameInfra.in(room).emit('render_disabled_countries', disabledCountries);
                    this.refreshGoldIncome();
                }
                else {
                    setCountryUnits(defender, defendCountry, defenderUnits);
                    setTimeout(() => {
                        gameInfra.in(room).emit('nuke_country', attackCountry); // give defend country bounce effect
                    }, 700);
                }
                this.renderGame();

                gameInfra.in(room).emit('attack_animation', attackCountry, defendCountry);

                let attackerLost = attackerUnits - unitsSent;
                let defenderLost = getDefenderUnits - defenderUnits;
                recordAction({type: 'attack', player: PlayerList[ap].username, color: PlayerList[ap].color,
                    from: attackCountry, to: defendCountry, units: attackerUnits, attackerLost: attackerLost,
                    defenderLost: defenderLost, captured: defenderUnits <= 0});

                gameInfra.in(room).emit('message', {
                    type: 'attack',
                    message: "Attacker lost " + attackerLost + " troops<br>Defender lost " + defenderLost + " troops"
                });

                this.determineVictor();

                if (PlayerList[defender].countries.length <= 0) { // Check if player has any countries left
                    PlayerList[defender].lost = true;
                    for(let p in PlayerList){ // Check if any mission is completed
                        if(PlayerList[p].lost){ continue; }
                        if(Missions.CheckMission(PlayerList[p].mission, PlayerList, disabledCountries)  === true ){
                            return this.victory(PlayerList[p]);
                        }
                    }
                    this.determineVictor(); // Probably fix the no harm bug from jordgubb
                }

            }
            catch (ex){
                return gameInfra.in(room).emit("error", ex.message); // if error occur log it out on client side
            }
        });
        if (getController(ap).isBot) { this.botBattle(ap); }
    };

    Game.prototype.botBattle = function (id) {
        const bot = getController(id);
        let attempts = 0;
        const maxAttempts = Math.max(15, (PlayerList[id] && PlayerList[id].countries ? PlayerList[id].countries.length : 10) * 3);

        const battleStep = () => {
            if (!botHasTurn(id, bot, Game.Phase.battle)) { return; }

            if (attempts < maxAttempts) {
                attempts += 1;
                const attack = botStrategy.chooseAttack(PlayerList, id, bot.aggression, continents);
                if (attack) {
                    const beforeUnits = getCountryUnits(id, attack.from);
                    bot.serverAction('battle', attack.from, attack.to, attack.defender, attack.units);
                    const afterUnits = PlayerList[id] && PlayerList[id].countries.some((c) => c.id === attack.from)
                        ? getCountryUnits(id, attack.from)
                        : 0;

                    if (beforeUnits !== afterUnits && botHasTurn(id, bot, Game.Phase.battle)) {
                        setTimeout(battleStep, botDelay('battleStep'));
                        return;
                    }
                }
            }

            if (botHasTurn(id, bot, Game.Phase.battle)) {
                setTimeout(() => {
                    if (botHasTurn(id, bot, Game.Phase.battle)) {
                        this.nextTurn();
                    }
                }, botDelay('battleEnd'));
            }
        };

        setTimeout(battleStep, botDelay('battleInitial'));
    };

    Game.prototype.determineVictor = function () {
        if (gameOver === true) { return; }
        // Check if player is the only one left
        let winner = false;
        for (let p in PlayerList) {
            if (PlayerList[p].lost !== true) {
                if (!winner) {
                    winner = PlayerList[p];
                }
                else {
                    winner = false;
                    break;
                }
            }
        }

        if (winner) {
            return this.victory(winner);
        }
        if (phase === Game.Phase.everyoneDeploy) {
            return; // Only way to win on first phase is if everyone leaves where the loop above checks
        }
        if (PlayerList[ap].countries.length === countries.length) { // Check if player own all countries
            return this.victory(PlayerList[ap]);
        }
        if(Missions.CheckMission(PlayerList[ap].mission, PlayerList, disabledCountries)  === true ){ // Check if mission is completed
            return this.victory(PlayerList[ap]);
        }

    };

    Game.prototype.victory = function (winner) {
        if (gameOver === true) { return; } // prevent this function runs more than once
        gameOver = true;

        let nameAndIncPoints = [];
        const rankedMatch = matchIsRanked();
        const results = rateSeats(winner.id);

        results.forEach((result) => {
            const participant = result.participant;
            const isWinner = result.place === 1;
            if (rankedMatch) {
                participant.points = result.rating;
            }
            if (participant.isBot) {
                if (rankedMatch && process.env.NODE_ENV !== 'test') {
                    models.Bot.updateOne({key: participant.botKey}, {
                        $inc: {
                            points_general: result.change,
                            games_won_general: isWinner ? 1 : 0,
                            games_lost_general: isWinner ? 0 : 1
                        }
                    }, {upsert: true}, function (err) { if (err) { console.log(err); } });
                }
            }
            else if (!participant.isGuest) {
                const increments = {
                    games_won_general: isWinner ? 1 : 0,
                    games_lost_general: isWinner ? 0 : 1
                };
                if (rankedMatch) {
                    increments.points_general = result.change;
                }
                if (process.env.NODE_ENV !== 'test') {
                    models.User.updateOne({username: participant.username}, {
                        $inc: increments
                    }, function (err) { if (err) { console.log(err); } });
                }
                nameAndIncPoints.push(participant.username);
            }

            const outcome = isWinner ? 'won' : 'lost';
            const points = result.change > 0 ? '+' + result.change : result.change;
            gameInfra.in(room).emit('message', {
                type: 'game_over',
                message: '<span style="color:' + (isWinner ? '#ffd700' : '#ffffff') + '">' + participant.username + ' ' + outcome + (rankedMatch ? ' (' + points + ' rating).' : ' (unranked).') + '</span>'
            });
            if (result.standIn) {
                gameInfra.in(room).emit('message', {
                    type: 'game_over',
                    message: '<span style="color:' + (result.standInWon ? '#ffd700' : '#ffffff') + '">' + result.standIn.username +
                        (result.standInWon ? ' won' : ' finished') + ' as a stand-in for ' + participant.username + ' (unrated).</span>'
                });
            }
        });

        if (!rankedMatch) {
            sockets.forEach((socket) => {
                if (socket.isBot) { return; }
                socket.send({type: 'game_over', message: rating.unrankedNotice(socket)});
            });
        }

        lobby.updatePlayerList(room, nameAndIncPoints);
        
        // Show the game time
        let GameEnd = new Date().getTime();
        let timeDiff = GameEnd - GameStart; //in ms

        let hours = Math.floor(timeDiff / 3600 / 1000); //in hours
        let minutes = timeDiff / 60 / 1000; //in minutes
        let gameTime = hours + 'h:' + Math.floor(minutes - 60 * hours) + 'm';

        gameInfra.in(room).emit('message', { type: 'game_over', message: '<span>&#128337;</span> Game time: ' + gameTime });

        // log the game
        let logId = new Date().getTime();
        let logDate = new Date();
        if (process.env.NODE_ENV !== 'test') {
            results.forEach((result) => {
                const participant = result.participant;
                let logGame = new models.Games({
                    id: logId,
                    username: participant.username,
                    userAgent: participant.request.headers['user-agent'],
                    gameTime: gameTime,
                    points: participant.points,
                    players: results.length,
                    ip: participant.ip,
                    won: result.place === 1,
                    date: logDate
                });
                logGame.save();
            });
        }

        phaseMessage = winner.username +' won with mission: '+ winner.mission.message;
        nextPhase = Game.Phase.gameOver;
        return this.nextTurn();
    };

    Game.prototype.Player = function (id) {
        let newPlayer = {
            id: id,
            countries: [],
            gold: map.startingGold || config.GOLD/sockets.length,
            color: sockets[id].color,
            lost: false,
            surrender: false,
            mission: Missions.setMission(id),
            username: sockets[id].username
        };
        return newPlayer;
    };
    
    Game.prototype.surrender = function (player = 'all') {
        sockets.forEach((socket, id) => {
            if(player !== 'all' && player !== id){ return; } // So returning player runs once only
            socket.emit('display_flag');
            socket.on('surrender', () =>{
                let playersInGame = 0;
                for (let p in PlayerList) {
                    if (PlayerList[p].lost === false) { playersInGame +=1; }
                }
                if (playersInGame < 2 || gameOver || PlayerList[id].lost){ return; }

                const quitter = sockets[id].username;
                PlayerList[id].surrender = true;
                if (!allowBots) { return retirePlayer(id, 'surrender', this); }
                takeOverWithBot(id, 'surrender', this);
                gameInfra.in(room).emit('message', { type: 'serverMessage', message: '<span style="color: #ffffff">&#9873;</span> ' + quitter + ' surrendered. A bot has taken over.' });

                if (ap === id && !gameOver) { // If active player surrending
                    returnConqueredCountries(id);
                    nextPhase = Game.Phase.deploy;
                    this.nextTurn();
                }
            });
        });
    };

    Game.prototype.leaveGame = function (id) {
        if (PlayerList[id] == null || PlayerList[id].lost === true || PlayerList[id].lost === null || gameOver ) { return; }// Don't want surrenders to run this code OR if the game is over

        // The seat keeps its turns while the player is away; the others wait for it instead of skipping it.
        PlayerList[id].lost = null;
        gameInfra.in(room).emit('message', { type: 'serverMessage', message: PlayerList[id].username + ' lost connection and has 30 seconds to return' +
            (allowBots ? ' before a bot takes over.' : ' or leaves the game.') });
        clearTimeout(graceTimers[id]);
        graceTimers[id] = setTimeout(() => this.replaceAbsentPlayer(id), RECONNECT_GRACE);
    };

    // The reconnect window is over: a bot takes the seat, or without bots the player sits out.
    Game.prototype.replaceAbsentPlayer = function (id) {
        clearTimeout(graceTimers[id]);
        delete graceTimers[id];
        if (gameOver || PlayerList[id].lost !== null) { return; }
        if (!allowBots) { return retirePlayer(id, 'disconnect', this); }
        PlayerList[id].lost = false;
        takeOverWithBot(id, 'disconnect', this);
        if (ap === id && phase !== Game.Phase.everyoneDeploy) { this.resumeTurn(); }
        this.determineVictor();
    };

    // Each seat is rated once, at its original player's rating, so opponents' points do not depend on who finished it.
    // A player whose seat a stand-in bot took over always takes a loss, ranked behind every seat that stayed.
    // Stand-in bots are not rated themselves.
    function rateSeats(winnerId) {
        const seats = sockets.map((socket, id) => ({
            seat: id,
            rating: Number(getController(id).points) || 850,
            place: id === winnerId ? 1 : 2
        }));
        const seatResults = rating.calculate(seats);
        return seatResults.map((result) => {
            const controller = getController(result.seat);
            const socket = sockets[result.seat];
            if (controller === socket) {
                return {participant: socket, place: result.place, change: result.change, rating: result.rating};
            }
            const deserted = rating.calculate(seats.map((seat) => seat.seat === result.seat ? Object.assign({}, seat, {place: 3}) : seat))
                .find((candidate) => candidate.seat === result.seat);
            return {participant: socket, place: 2, change: deserted.change, rating: deserted.rating,
                standIn: controller, standInWon: result.place === 1};
        });
    }

    function checkIfNeighbour(fromCountry, toCountry) {
        let neighbours = PlayerList[ap].countries.find(x=> x.id === fromCountry).neighbour;
        if (neighbours.indexOf(toCountry) > -1) {
            return true;
        }
        return false;
    }

    // Territories conquered this turn wait in disabledCountries until the attacker's turn ends.
    function returnConqueredCountries(id) {
        PlayerList[id].countries.push(...disabledCountries);
        disabledCountries = [];
    }

    function removeListeners(controller, eventNames) {
        eventNames.forEach((eventName) => controller.removeAllListeners(eventName));
    }

    // A bot's queued steps stop once its seat is handed back to the returning player.
    function botHasTurn(id, bot, turnPhase) {
        return !gameOver && phase === turnPhase && ap === id && getController(id) === bot;
    }

    function getController(id) {
        return botControllers[id] || sockets[id];
    }

    // Everyone seated when the match started counts, including players who have since dropped out.
    function matchIsRanked() {
        return rating.isRankedMatch(sockets);
    }

    function takeOverWithBot(id, reason, gameInstance) {
        if (botControllers[id] || sockets[id].isBot) { return; }
        const player = PlayerList[id];
        const humanSocket = sockets[id];

        let username = BOT_NAMES[id % BOT_NAMES.length];
        let suffix = 2;
        while (Object.keys(PlayerList).some((playerId) => PlayerList[playerId].username === username)) {
            username = username + '-' + suffix;
            suffix += 1;
        }
        // A stand-in plays at the rating of the player it replaces, so opponents are rated against that player.
        const bot = new BotPlayer({
            key: 'takeover-' + username.toLowerCase(),
            username: username,
            points_general: Number(humanSocket.points) || 850,
            aggression: 0.5
        }, id, player.color);
        bot.isStandIn = true;

        botControllers[id] = bot;
        player.botControlled = true;
        player.conceded = reason === 'surrender';
        player.username = bot.username;
        removeListeners(humanSocket, TURN_EVENTS.concat(['everyone_deploy', 'surrender']));
        gameInfra.in(room).emit('bot_takeover', {id: id, username: bot.username, reason: reason});
        if (phase === Game.Phase.everyoneDeploy) {
            gameInstance.everyoneDeploy(id);
        }
    }

    // Without bots a player who gives up or does not return drops out: no more turns or income, but their
    // territories stay on the map for the others to conquer. They are rated as a loser if the match ends without them.
    // A player who only lost connection can still come back and reclaim the seat while the match is running.
    function retirePlayer(id, reason, gameInstance) {
        const player = PlayerList[id];
        const wasActive = ap === id && phase !== Game.Phase.everyoneDeploy;
        player.lost = true;
        player.conceded = reason === 'surrender';
        removeListeners(sockets[id], TURN_EVENTS.concat(['everyone_deploy', 'surrender']));
        gameInfra.in(room).emit('message', {type: 'serverMessage', message: reason === 'surrender' ?
            '<span style="color: #ffffff">&#9873;</span> ' + player.username + ' surrendered and is out of the game.' :
            player.username + ' did not return in time and sits out until they rejoin.'});

        if (wasActive) {
            returnConqueredCountries(id);
            nextPhase = Game.Phase.deploy;
            return gameInstance.nextTurn(); // the next player's deploy also checks for a sole survivor
        }
        gameInstance.determineVictor();
        if (!gameOver && phase === Game.Phase.everyoneDeploy && everyoneHasDeployed()) {
            gameInstance.finishEveryoneDeploy();
        }
    }

    function checkIfInteger(integers) {
        for (let i = 0; i < integers.length; i += 1) {
            if(Number.isInteger(integers[i])){
                // continue
            }
            else { return false; }
        }
        return true;
    }

    function getCountryUnits(id, country) {
        return PlayerList[id].countries.find(x=> x.id === country).units;
    }

    function setCountryUnits(id, country, units) {
        return PlayerList[id].countries.find(x=> x.id === country).units = units;
    }

    function conquerCountry(id, country, units) {
        // Remove the country from defender
        for (let i = 0; i < PlayerList[id].countries.length; i += 1) {
            if (PlayerList[id].countries[i].id === country) {
                let gold = PlayerList[id].countries[i].gold;
                let neighbour = PlayerList[id].countries[i].neighbour;
                let defeatedColor = PlayerList[id].color;
                PlayerList[id].countries.splice(i, 1);
                disabledCountries.push({id: country, gold: gold, units: units, neighbour: neighbour, defeatedColor: defeatedColor}); // add the country to disabled countries array
                break;
            }
        }
    }

    function updateGoldIncome(id) {
        let playersCountries = [];
        let gold = 0;

        // collect gold from countries
        for (let i = 0; i < PlayerList[id].countries.length; i += 1) {
            gold += PlayerList[id].countries[i].gold;
            playersCountries.push(PlayerList[id].countries[i].id);
        }
        // collect gold from disabled countries
        if(id === ap && disabledCountries.length > 0){
            for (let i = 0; i < disabledCountries.length; i += 1) {
                gold += disabledCountries[i].gold;
                playersCountries.push(disabledCountries[i].id);
            }
        }
        // collect gold from continents
        for (let i = 0; i < continents.length; i += 1) {
            if (countryHandler.ownsContinent(continents[i].countries, playersCountries)) {
                gold += continents[i].gold;
            }
        }
        return gold;
    }

    new Game();
};

module.exports.GameBoard = GameBoard;