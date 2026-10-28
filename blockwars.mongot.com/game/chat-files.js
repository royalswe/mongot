"use strict";
const path = require('node:path');

const directory = process.env.CHAT_DATA_DIR || path.resolve(__dirname, '..');

module.exports = {
    game: path.resolve(directory, 'gameChat.json'),
    lobby: path.resolve(directory, 'blockwarChat.json')
};
