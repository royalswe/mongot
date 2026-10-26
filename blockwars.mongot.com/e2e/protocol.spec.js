'use strict';

const {test, expect} = require('@playwright/test');
const {connectSocket: connect} = require('./helpers');

const emptyState = {arena: {matrix: []}, block: {matrix: [], pos: {x: 0, y: 0}}};

test('entering a room and taking a seat use the seat vocabulary', async ({baseURL}) => {
    const player = await connect(baseURL);

    player.send({type: 'enter-room', user: 'guest', name: 'E2E-protocol', ranking: 'no'});
    const entered = await player.next('enter-room');
    expect(entered).toMatchObject({status: 'waiting', joinable: true, isGuest: false});

    player.send({type: 'take-seat', state: emptyState});
    const seated = await player.next('take-seat');
    expect(seated.id).toBe(entered.clientId);

    player.close();
});

test('a second seat for the same player is refused', async ({baseURL}) => {
    const player = await connect(baseURL);
    player.send({type: 'enter-room', user: 'guest', name: 'E2E-protocol-twice', ranking: 'no'});
    await player.next('enter-room');

    player.send({type: 'take-seat', state: emptyState});
    await player.next('take-seat');
    player.send({type: 'take-seat', state: emptyState});

    expect((await player.next('status-error')).message).toBe('You already have a seat');
    player.close();
});

test('old message names get a reload notice instead of silence', async ({baseURL}) => {
    const player = await connect(baseURL);

    player.send({type: 'join-session', user: 'guest', name: 'E2E-protocol-old', ranking: 'no'});

    expect((await player.next('server-message')).msg).toContain('reload');
    player.close();
});
