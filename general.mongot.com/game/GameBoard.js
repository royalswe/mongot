'use strict';
let countryHandler = require('./countryHandler');
let Mission = require('./Mission');
let models = require('../../models');
let config = require('../config.json');
let socketClass = require('../sockets');

let GameBoard = function (sockets, io, room) {

    let PlayerList = {};
    let countries = countryHandler.countries();
    let continents = countryHandler.continents();
    let Missions;
    let disabledCountries = [];
    let ap; //ap stands for active player and decides whos turn it is
    let phase; // will store the current game phase
    let phaseMessage;
    let nextPhase;
    let timer;
    let gameOver = false;
    let phaseTimer = 122000;
    let GameStart;
    let gameInfra = io.of('/game_infra'); // The namespace

    function Game() {
        nextPhase = Game.Phase.everyoneDeploy;
        Missions = new Mission.Mission(sockets);
        GameStart = new Date().getTime();
        this.initGame();
        this.leaveGame();
        this.surrender();
        this.nextTurn();
    }

    this.returningPlayer = function (socket) {
        for(let i = 0; i<sockets.length; i += 1){
            if(PlayerList[i].username === socket.username && !PlayerList[i].surrender){
                if (PlayerList[i].countries.length <= 0 || PlayerList[i].lost === 'surrender') { return; }
                socket.id = i;
                socketClass.returnRoom(room, socket, PlayerList[i].color); // Update lobby and join room
                sockets.splice(i, 1, socket);
                PlayerList[i].lost = false;
                socket.send({type: 'player_rejoin', mission: PlayerList[i].mission}); // Show players mission
                socket.send({type: 'update_gold', gold: PlayerList[i].gold});
                let gold = updateGoldIncome(i);
                socket.send({type: 'update_gold_income', goldIncome: gold});
                socket.send({type: 'phase', message: phase, phaseMsg: '<span style="color:#4bff00">Welcome back '+ PlayerList[i].username +'!</span>'});
                if (phase === Game.Phase.everyoneDeploy) {
                    Game.prototype.everyoneDeploy(i);
                }
                else {
                    socket.send({
                        type: 'current_player',
                        bool: false,
                        player: ap,
                        username: PlayerList[ap].username,
                        color: PlayerList[ap].color
                    });
                }
                Game.prototype.leaveGame(i);
                Game.prototype.surrender(i);

                break;
            }
        }
    };

    this.getGameInfo = function () {
        return {playerList: PlayerList, ap: ap, phase: phase, disabledCountries: disabledCountries};
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
            sockets[i].id = i;

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
        phase = nextPhase;

        gameInfra.in(room).emit('start_countdown'); // Start timer in client

        clearTimeout(timer);
        timer = setTimeout(() => {
            return this.nextTurn();
        }, phaseTimer);

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
            gameInfra.in(room).send({type: 'phase', message: phase, phaseMsg: "Waiting for " + PlayerList[ap].username});
            sockets[ap].send({type: 'phase', message: phase, phaseMsg: phaseMessage});
        }
        else{
            gameInfra.in(room).send({type: 'phase', message: phase, phaseMsg: phaseMessage});
        }
    };

    Game.prototype.nextTurnButton = function () {
        sockets[ap].on('next_turn', () => {
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
        gameInfra.in(room).send({
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
            sockets[ap].removeAllListeners('deploy');
            sockets[ap].removeAllListeners('next_turn');
            sockets[ap].removeAllListeners('battle');
            sockets[ap].removeAllListeners('tactical_move');

            ap = ap >= Object.keys(PlayerList).length - 1 ? 0 : ap + 1; // change active player
            if (PlayerList[ap].lost === false) { return; }
        }
    };

    Game.prototype.deploy = function () {
        sockets[ap].on('deploy', (country, owner) => {
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
    };
    /**
     * Only runs the first turn when all players deploy their units
     */
    Game.prototype.everyoneDeploy = function (player = 'all') {
        this.refreshGoldIncome();

        if(player === 'all'){
            var count = 0;
            setTimeout(() => { // Collect gold if player wait out the time
                if (count < Object.keys(PlayerList).length) {
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

            socket.on('everyone_deploy', (country, owner) => {
                try{
                    if (owner === index && PlayerList[index].gold >= config.ARMY_COST) {
                        PlayerList[index].gold -= config.ARMY_COST; // withdraw unit cost
                        PlayerList[index].countries.find(x=> x.id === country).units += 1; // increment units by one
                        sockets[index].emit('render_map_everyone_deploy', np, [PlayerList[index]]);
                        sockets[index].emit('bounce_country', country); // give deployed unit bounce effect
                        this.updateGold(index);
                    }

                    // Check if all player is done for the next round
                    count = 0;
                    for (let i in PlayerList) {
                        if(PlayerList[i].gold < config.ARMY_COST || PlayerList[i].lost === true || PlayerList[i].lost === null){
                            count += 1;
                            if (count === Object.keys(PlayerList).length) {
                                for(let i = 0; i < count; i += 1){
                                    this.collectGoldIncome(i);
                                    this.updateGold(i);
                                }
                                return this.nextTurn();
                            }
                        }
                    }
                }
                catch (ex){
                    return gameInfra.in(room).emit("error", ex.message);
                }
            });
        });
    };

    Game.prototype.buyUnit = function (id, country, owner) {
        if (owner === id && PlayerList[id].gold >= config.ARMY_COST) {
            PlayerList[id].gold -= config.ARMY_COST; // unit cost 5 gold
            PlayerList[id].countries.find(x=> x.id === country).units += 1; // increment units by one
            this.renderGame();
            gameInfra.in(room).emit('bounce_country', country); // give deployed unit bounce effect
            this.updateGold(id);
        }
    };

    Game.prototype.tacticalMove = function () {
        if(disabledCountries.length > 0) {
            for (let i = 0; i < disabledCountries.length; i += 1) { // Remove disabled countries
                PlayerList[ap].countries.push(disabledCountries[i]);
            }
            disabledCountries = [];

            this.refreshGoldIncome(); // Remove gold bonus
        }
        this.renderGame();

        setTimeout(() => { // to prevent bugg if user attacks when the time is out.
            if(disabledCountries.length > 0) {
                for (let i = 0; i < disabledCountries.length; i += 1) { // Remove disabled countries
                    PlayerList[ap].countries.push(disabledCountries[i]);
                }
                disabledCountries = [];
                console.log('testar');

                this.renderGame();
            }
        }, 100);

        sockets[ap].on('tactical_move', (moveFromCountry, moveToCountry, owner, units) => {
            if (!checkIfInteger([moveFromCountry, moveToCountry, owner, units])){ return; }

            try{
                if (!checkIfNeighbour(moveFromCountry, moveToCountry)) { return; } // Prevent neighbour cheat
                // Remove units from leaving country
                let moveFromCountryUnits = getCountryUnits(ap, moveFromCountry);
                if(units >= moveFromCountryUnits){ return; } // Prevent units cheat
                setCountryUnits(ap, moveFromCountry, moveFromCountryUnits - units);
                // Add units to arrival country
                let moveToCountryUnits = getCountryUnits(ap, moveToCountry);
                setCountryUnits(ap, moveToCountry, units + moveToCountryUnits);

                this.renderGame();
                gameInfra.in(room).emit('bounce_country', moveToCountry); // give moved units bounce effect
                this.determineVictor();
                return this.nextTurn();
            }
            catch (ex){
                return gameInfra.in(room).emit("error", ex.message);
            }
        });
    };

    Game.prototype.battle = function () {
        sockets[ap].on('battle', (attackCountry, defendCountry, defender, unitsSent) => {
            if (!checkIfInteger([attackCountry, defendCountry, defender, unitsSent])){ return; }
            try {
                if (!checkIfNeighbour(attackCountry, defendCountry)) { return; } // Prevent neighbour cheat
                let unitsInAttackCountry = getCountryUnits(ap, attackCountry);
                if(unitsSent >= unitsInAttackCountry){ return; } // Prevent units cheat
                setCountryUnits(ap, attackCountry, unitsInAttackCountry - unitsSent); // Remove sent units from attackCountry

                let attackerUnits = unitsSent; // calculate attackers lost
                let getDefenderUnits = getCountryUnits(defender, defendCountry);
                let defenderUnits = getDefenderUnits; // calculate defenders lost
                // Fight until one of the players army is defeated
                let attackerDiceLog = [];
                let defenderDiceLog = [];
                let streak = 0;
                while (unitsSent > 0 && defenderUnits > 0) {
                    let attackDice = [];
                    let defendDice = [];

                    for (let i = 1; i <= unitsSent; i += 1) {
                        if(streak < -5){
                            attackDice.push(6);
                        }
                        else {
                            attackDice.push(Math.floor((Math.random() * 6) + 1));
                        }

                        if (i === 3) { break; }
                    }
                    for (let i = 1; i <= defenderUnits; i += 1) {
                        if(streak > 6){
                            defendDice.push(6);
                        }
                        else {
                            defendDice.push(Math.floor((Math.random() * 6) + 1));
                        }

                        if (i === 2) { break; }
                    }
                    if(streak > 6 || streak < -5){ streak = 0; }

                    attackerDiceLog.push(JSON.parse(JSON.stringify(attackDice)));
                    defenderDiceLog.push(JSON.parse(JSON.stringify(defendDice)));

                    for (let i = 0; i <= attackDice.length; i += 1) {
                        let attMax = Math.max.apply(Math, attackDice);
                        let defMax = Math.max.apply(Math, defendDice);

                        if (defMax >= attMax) {
                            unitsSent -= 1;
                            streak -=1;
                        }
                        else {
                            defenderUnits -= 1;
                            streak += 1;
                        }

                        let attIndex = attackDice.indexOf(attMax);
                        let defIndex = defendDice.indexOf(defMax);
                        attackDice.splice(attIndex, 1);
                        defendDice.splice(defIndex, 1);

                        if (defendDice.length <= 0 || attackDice.length <= 0) {
                            break;
                        }
                    }
                }
                gameInfra.in('log-'+room).emit('dice_log', attackerDiceLog, defenderDiceLog);

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

                gameInfra.in(room).emit('nuke_country', defendCountry); // give attacked country nuke effect
                gameInfra.in(room).emit('attacker_animation', attackCountry); // give attack country bounce effect

                let attackerLost = attackerUnits - unitsSent;
                let defenderLost = getDefenderUnits - defenderUnits;

                gameInfra.in(room).send({
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

        let losers = [];
        let nameAndIncPoints = [];
        let winnerPoints = sockets[winner.id].points;

        for (let i = 0; i < sockets.length; i += 1) {
            if (sockets[i].id === winner.id) {
                continue; // The winner
            }
            let loser = sockets[i].points;
            const decreaseValue = loser - winnerPoints;
            let losePoints = 25 + (decreaseValue / loser) * 50;

            losePoints = Math.round(losePoints);

            if (losePoints < 6) {
                losePoints = 5;
            }
            else if (losePoints > 50) {
                losePoints = 50;
            }
            losers.push(losePoints);
            nameAndIncPoints.push(sockets[i].username);

            models.User.updateOne({username: sockets[i].username}, { $inc: { points_general: -losePoints, games_lost_general: 1 }}, function (err) { if(err){console.log(err);} });
            gameInfra.in(room).send({ type: 'game_over', message: '<span style="color:#ffffff">&#9760;</span> ' + sockets[i].username + ' lost ' + losePoints + ' points.' });
        }

        // Winner claims the price of all losers points points
        try {
            var losersPoints = losers.reduce(function (a, b) {
                return a + b;
            });
        }
        catch (ex){
            var losersPoints = 0;
            gameInfra.in(room).emit("error", "losersPoints: " + ex.message); // if error occur log it out on client side
        }

        nameAndIncPoints.push(winner.username);
        gameInfra.in(room).send({ type: 'game_over', message: '<span style="color:#ffd700">&#9813;</span> ' + winner.username + ' won ' + losersPoints + ' points.' });
        models.User.updateOne({username: winner.username}, { $inc: { points_general: losersPoints, games_won_general: 1 }}, function (err) { if(err){console.log(err);} });

        setTimeout(function(){
            socketClass.updatePlayerList(room, nameAndIncPoints);
        }, 400);
        
        // Show the game time
        let GameEnd = new Date().getTime();
        let timeDiff = GameEnd - GameStart; //in ms

        let hours = Math.floor(timeDiff / 3600 / 1000); //in hours
        let minutes = timeDiff / 60 / 1000; //in minutes
        let gameTime = hours + 'h:' + Math.floor(minutes - 60 * hours) + 'm';

        gameInfra.in(room).send({ type: 'game_over', message: '<span>&#128337;</span> Game time: ' + gameTime });

        // log the game
        let logId = new Date().getTime();
        let logDate = new Date();
        for (let i = 0; i < sockets.length; i += 1) {
            var logGame = new models.Games({
                id: logId,
                username: sockets[i].username,
                userAgent: sockets[i].request.headers['user-agent'],
                gameTime: gameTime,
                points: sockets[i].points,
                players: sockets.length,
                ip: sockets[i].ip,
                won: sockets[i].id === winner.id,
                date: logDate
            });
            logGame.save();
        }

        phaseMessage = winner.username +' won with mission: '+ winner.mission.message;
        nextPhase = Game.Phase.gameOver;
        return this.nextTurn();
    };

    Game.prototype.Player = function (id) {
        let newPlayer = {
            id: id,
            countries: [],
            gold: config.GOLD/sockets.length,
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

                PlayerList[id].lost = true;
                PlayerList[id].surrender = true;
                gameInfra.in(room).send({ type: 'serverMessage', message: '<span style="color: #ffffff">&#9873;</span> ' + PlayerList[id].username + ' did surrender' });
                this.determineVictor();

                if (ap === id && !gameOver) { // If active player surrending
                    if(disabledCountries.length > 0) { // If player has occupied countries before left.
                        for (let i = 0; i < disabledCountries.length; i += 1) {
                            PlayerList[id].countries.push(disabledCountries[i]);
                        }
                        disabledCountries = [];
                    }
                    nextPhase = Game.Phase.deploy;
                    this.nextTurn();
                }
            });
        });
    };

    Game.prototype.leaveGame = function (player = 'all') {
        sockets.forEach((socket, index) => {
            if(player !== 'all' && player !== index){ return; } // So returning player runs once only
            socket.on('player_left', (id) => {
                if (PlayerList[id] == null || PlayerList[id].lost === true || gameOver ) { return; }// Don't want surrenders to run this code OR if the game is over

                PlayerList[id].lost = null;
                let playersLeft = 0;
                for (let p in PlayerList) {
                    if (PlayerList[p].lost === false) {
                        playersLeft += 1;
                    }
                }
                if(playersLeft < 2){
                    socket.send({ type: 'serverMessage', message: PlayerList[id].username + ' have 30 seconds to return before lose' });
                }
                if (ap === id) { // If active player leaving then end his round
                    if(phase !== Game.Phase.tacticalMove){
                        this.collectGoldIncome(id);
                    }
                    if(disabledCountries.length > 0) { // If player has occupied countries before left.
                        for (let i = 0; i < disabledCountries.length; i += 1) {
                            PlayerList[id].countries.push(disabledCountries[i]);
                        }
                        disabledCountries = [];
                    }
                    nextPhase = Game.Phase.deploy;
                    this.nextTurn();
                }
                setTimeout(() => {
                    if(PlayerList[id].lost === null){ PlayerList[id].lost = true; }
                    this.determineVictor();
                }, 30000);

            });
        });
    };

    function checkIfNeighbour(fromCountry, toCountry) {
        let neighbours = PlayerList[ap].countries.find(x=> x.id === fromCountry).neighbour;
        if (neighbours.indexOf(toCountry) > -1) {
            return true;
        }
        return false;
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
                PlayerList[id].countries.splice(i, 1);
                disabledCountries.push({id: country, gold: gold, units: units, neighbour: neighbour}); // add the country to disabled countries array
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
            if (compareCountriesWithContinent(continents[i].countries, playersCountries)) {
                gold += continents[i].gold;
            }
        }
        return gold;
    }

    function compareCountriesWithContinent(continent, playersCountries) {
        let filteredCountries = playersCountries.filter(function (a) {
            return ~this.indexOf(a);
        }, continent);

        if (continent.sort().join(',') === filteredCountries.sort().join(',')) {
            return true;
        }
        return false;
    }

    new Game();
};

module.exports.GameBoard = GameBoard;