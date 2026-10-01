'use strict';
// Plays a real GameBoard in-process: fake sockets record what they receive, timers run on a manual clock,
// and dice can be scripted. Without scripted values Math.random returns 0, so deals and missions are repeatable.
process.env.NODE_ENV = 'test';

const GameBoard = require('../../game/GameBoard').GameBoard;
const BotPlayer = require('../../game/BotPlayer');
const countryHandler = require('../../game/countryHandler');

const COLORS = ['red', 'blue', 'orange', 'green'];

function fakeSocket(id, flags) {
    return Object.assign({
        id: 'socket-' + id,
        username: 'Player' + id,
        color: COLORS[id],
        points: 1600,
        request: {headers: {'user-agent': 'test'}},
        handlers: {},
        sent: [],
        emitted: [],
        on(eventName, handler) { this.handlers[eventName] = handler; },
        removeAllListeners(eventName) { delete this.handlers[eventName]; },
        send(message) { this.sent.push(message); },
        emit(eventName, ...args) { this.emitted.push({event: eventName, args: args}); },
        disconnect() { this.disconnected = true; },
        can(eventName) { return typeof this.handlers[eventName] === 'function'; },
        act(eventName, ...args) {
            if (!this.can(eventName)) { throw new Error(this.username + ' cannot ' + eventName + ' now'); }
            return this.handlers[eventName](...args);
        }
    }, flags);
}

function installClock() {
    const originalSetTimeout = global.setTimeout;
    const originalClearTimeout = global.clearTimeout;
    const timers = new Map();
    let now = 0;
    let nextId = 1;
    global.setTimeout = (callback, delay = 0) => {
        const id = nextId++;
        timers.set(id, {at: now + delay, callback: callback});
        return id;
    };
    global.clearTimeout = (id) => { timers.delete(id); };
    return {
        advance(ms) {
            const end = now + ms;
            for (;;) {
                const due = [...timers].filter(([, timer]) => timer.at <= end)
                    .sort((left, right) => left[1].at - right[1].at || left[0] - right[0])[0];
                if (!due) { break; }
                timers.delete(due[0]);
                now = due[1].at;
                due[1].callback();
            }
            now = end;
        },
        restore() {
            global.setTimeout = originalSetTimeout;
            global.clearTimeout = originalClearTimeout;
        }
    };
}

function installRandom(options = {}) {
    const original = Math.random;
    const queue = [];
    if (options.seed !== undefined && options.seed !== null) {
        let s = options.seed >>> 0;
        Math.random = () => {
            if (queue.length) { return queue.shift(); }
            s = (s + 0x6D2B79F5) | 0;
            let t = Math.imul(s ^ (s >>> 15), 1 | s);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    } else if (options.realRandom) {
        Math.random = () => (queue.length ? queue.shift() : original());
    } else {
        Math.random = () => (queue.length ? queue.shift() : 0);
    }
    return {
        dice(values) { values.forEach((value) => queue.push((value - 1) / 6 + 0.01)); },
        restore() { Math.random = original; }
    };
}

function createTable({seats = [{}, {}], mapId = 'original', room = 'test-room', seed = null, realRandom = false} = {}) {
    const clock = installClock();
    const random = installRandom({seed, realRandom});
    const broadcasts = [];
    const roomChannel = {emit(eventName, ...args) { broadcasts.push({event: eventName, args: args}); }};
    const io = {of() { return {in() { return roomChannel; }}; }};
    const sockets = seats.map((seat, id) => seat.bot ?
        new BotPlayer({
            key: seat.bot.key || 'bot-' + id,
            username: seat.bot.username || 'Bot' + id,
            points_general: seat.bot.points_general || 1000,
            aggression: seat.bot.aggression !== undefined ? seat.bot.aggression : 0.5
        }, id, COLORS[id]) :
        fakeSocket(id, seat));
    const board = new GameBoard(sockets, io, room, mapId);
    const map = countryHandler.getMap(mapId);

    const info = () => board.getGameInfo();
    const player = (id) => info().playerList[id];
    const territory = (countryId) => {
        for (const id of Object.keys(info().playerList)) {
            const country = player(id).countries.find((candidate) => candidate.id === countryId);
            if (country) { return country; }
        }
        return undefined;
    };
    const ownerOf = (countryId) => {
        const owner = Object.keys(info().playerList).find((id) => player(id).countries.some((country) => country.id === countryId));
        return owner === undefined ? -1 : Number(owner);
    };
    // First pair of neighbouring territories held by `from` and `to` (the same player for an own border).
    const border = (from, to) => {
        for (const country of player(from).countries) {
            const neighbour = country.neighbour.find((id) => ownerOf(id) === to && id !== country.id);
            if (neighbour !== undefined) { return {from: country.id, to: neighbour}; }
        }
        throw new Error('no border between ' + from + ' and ' + to);
    };

    return {
        board: board,
        sockets: sockets,
        clock: clock,
        broadcasts: broadcasts,
        map: map,
        info: info,
        phase: () => info().phase,
        active: () => info().ap,
        player: player,
        territory: territory,
        ownerOf: ownerOf,
        border: border,
        setUnits(countryId, units) { territory(countryId).units = units; },
        rollDice: random.dice,
        messages(type) {
            return broadcasts.filter((entry) => entry.event === 'message' && entry.args[0].type === type).map((entry) => entry.args[0]);
        },
        // Everyone spends their starting gold on their first territory, which ends the first phase.
        finishEveryoneDeploy() {
            sockets.forEach((socket, id) => {
                while (info().phase === 'Everyone deploy' && player(id).gold >= 3) {
                    socket.act('everyone_deploy', player(id).countries[0].id, id);
                }
            });
        },
        pass() { sockets[info().ap].act('next_turn'); },
        close() {
            board.destroy();
            clock.restore();
            random.restore();
        }
    };
}

// What a player earns per turn: territory gold plus a bonus for every whole continent held.
function incomeOf(table, id) {
    const owned = table.player(id).countries.map((country) => country.id);
    const territoryGold = table.player(id).countries.reduce((total, country) => total + country.gold, 0);
    const continentGold = table.map.continents
        .filter((region) => countryHandler.ownsContinent(region.countries, owned))
        .reduce((total, region) => total + region.gold, 0);
    return territoryGold + continentGold;
}

module.exports = {createTable: createTable, incomeOf: incomeOf, fakeSocket: fakeSocket};
