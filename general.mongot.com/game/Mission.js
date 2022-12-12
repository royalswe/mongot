'use strict';
let countryHandler = require('./countryHandler');

let Mission = function (sockets) {

    let players = [];
    let numOfPlayers;
    let continents = countryHandler.continents();
    let missions = [1,2,3,4,5];

    function Init() {
        for(var i = 0; i < sockets.length; i += 1){ players.push(i); }
        numOfPlayers = sockets.length;
    }

    this.setMission = function (id) {
        let randomMission = 1;
        if(numOfPlayers > 2){
            randomMission = missions[Math.floor(Math.random()*missions.length)];
        }
        let index = missions.indexOf(randomMission);
        if(randomMission !== 1){ missions.splice(index, 1); }
        
        switch(randomMission){
            case 1:
                let opponent = conquerPlayer(id)
                if(opponent === false){ return {mission: Init.Mission.own21Countries, player: id, message: getMessage({mission: Init.Mission.own21Countries})}; }
                return {mission: Init.Mission.conquerPlayer, player: opponent, message: getMessage({mission: Init.Mission.conquerPlayer, opponent: sockets[opponent].color})};
            case 2:
                return {mission: Init.Mission.anyThreeContinents, player: id, message: getMessage({mission: Init.Mission.anyThreeContinents})};
            case 3:
                return {mission: Init.Mission.own21Countries, player: id, message: getMessage({mission: Init.Mission.own21Countries})};
            case 4:
                return {mission: Init.Mission.europePlusOne, player: id, message: getMessage({mission: Init.Mission.europePlusOne})};
            case 5:
                return {mission: Init.Mission.own17With4Each, player: id, message: getMessage({mission: Init.Mission.own17With4Each})};
            default:
        }
    };
    
    this.CheckMission = function (mission, playerList, disabledCountries) {
        switch(mission.mission){
            case Init.Mission.conquerPlayer:
                return playerList[mission.player].countries.length <= 0 ? true : false; // Check if player is defeated
            case Init.Mission.anyThreeContinents:
                return anyThreeContinents(mission.player, playerList, disabledCountries);
            case Init.Mission.own21Countries:
                return playerList[mission.player].countries.length + disabledCountries.length > 20; // Count players country and disabled countries
            case Init.Mission.europePlusOne:
                return europePlusOne(mission.player, playerList, disabledCountries);
            case Init.Mission.own17With4Each:
                return own17With4Each(mission.player, playerList, disabledCountries);
            default:
                console.log('ERROR: CheckMission');
        }
    };

    Init.Mission = {
        conquerPlayer: "conquer_player",
        anyThreeContinents: "any_three_continents",
        own21Countries: "own_21_countries",
        europePlusOne: "europe_plus_one",
        own17With4Each: "own_17_with_4_each"
    };

    function getMessage(msg) {
        switch(msg.mission){
            case Init.Mission.conquerPlayer:
                return "Take out "+ msg.opponent +" player";
            case Init.Mission.anyThreeContinents:
                return "Own three continents";
            case Init.Mission.own21Countries:
                return "Own 21 countries";
            case Init.Mission.europePlusOne:
                return "Own Europe and one more continent";
            case  Init.Mission.own17With4Each:
                return "Own 17 countries with at least 4 armies in each";
            default:
                console.log('ERROR: getMessage');
                break;
        }
    }

    function conquerPlayer(id) {
        let opponents = [];
        for(var i = 0; i < players.length; i += 1){
            if(players[i] === id){
                continue; // The current player
            }
            opponents.push(players[i]);
        }
        if(opponents.length === 0){ return false; }

        let opponent = opponents[Math.floor(Math.random()*opponents.length)];
        let index = players.indexOf(opponent);
        players.splice(index, 1);
        return opponent;
    }

    function europePlusOne(id, playerList, disabledCountries){
        let playersCountries = collectCountries(id, playerList, disabledCountries);

        if (compareCountriesWithContinent(continents[0].countries, playersCountries)) {
            for (let i = 1; i < continents.length; i += 1) {
                if (compareCountriesWithContinent(continents[i].countries, playersCountries)) {
                    return true; // Player has Europe and one more continent
                }
            }
        }

        return false;
    }

    function anyThreeContinents(id, playerList, disabledCountries) {
        let playersCountries = collectCountries(id, playerList, disabledCountries);
        let numOfContinents = 0;

        for (let i = 0; i < continents.length; i += 1) {
            if (compareCountriesWithContinent(continents[i].countries, playersCountries)) {
                numOfContinents += 1;
            }
        }
        return numOfContinents > 2 ? true : false; // Check if player has more then 2 continents
    }

    function own17With4Each(id, playerList, disabledCountries) {
        let playersCountries = collectCountriesObject(id, playerList, disabledCountries);
        let countriesWith4Each = 0;
        for (let i = 0; i < playersCountries.length; i += 1) {
            if (playersCountries[i].units > 3) {
                countriesWith4Each += 1;
            }
        }
        return countriesWith4Each > 16 ? true : false; // Check if player has more then 16 continents with 4 in each

    }

    function collectCountries(id, playerList, disabledCountries) {
        let playersCountries = [];
        for (let i = 0; i < disabledCountries.length; i += 1) {
            playersCountries.push(disabledCountries[i].id);
        }
        for (let i = 0; i < playerList[id].countries.length; i += 1) {
            playersCountries.push(playerList[id].countries[i].id);
        }
        return playersCountries;
    }

    function collectCountriesObject(id, playerList, disabledCountries) {
        let playersCountries = [];
        for (let i = 0; i < disabledCountries.length; i += 1) {
            playersCountries.push(disabledCountries[i]);
        }
        for (let i = 0; i < playerList[id].countries.length; i += 1) {
            playersCountries.push(playerList[id].countries[i]);
        }
        return playersCountries;
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

    new Init();
};

module.exports.Mission = Mission;
