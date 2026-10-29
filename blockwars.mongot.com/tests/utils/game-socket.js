'use strict';

const {expect} = require('@playwright/test');
const WebSocket = require('ws');

const emptyState = {arena: {matrix: []}, block: {matrix: [], pos: {x: 0, y: 0}}};

async function connectSocket(baseURL) {
    const socket = new WebSocket(baseURL.replace('http', 'ws') + '/game', {headers: {origin: baseURL}});
    const messages = [];
    socket.on('message', data => messages.push(JSON.parse(data)));
    await new Promise((resolve, reject) => {
        socket.once('open', resolve);
        socket.once('error', reject);
    });
    return {
        send: message => socket.send(JSON.stringify(message)),
        async next(type) {
            await expect.poll(() => messages.some(message => message.type === type), {
                message: `Expected a ${type} message from the game server`
            }).toBe(true);
            return messages.splice(messages.findIndex(message => message.type === type), 1)[0];
        },
        async join(room, name = 'Rival') {
            this.send({type: 'enter-room', user: {username: name, points_bw: null}, name: room, ranking: 'no'});
            await this.next('enter-room');
            this.send({type: 'take-seat', state: emptyState});
            await this.next('take-seat');
        },
        async close() {
            if (socket.readyState === WebSocket.CLOSED) { return; }
            await new Promise(resolve => {
                socket.once('close', resolve);
                socket.close();
            });
        }
    };
}

module.exports = {connectSocket};
