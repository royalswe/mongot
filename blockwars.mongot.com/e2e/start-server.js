'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'blockwars-e2e-chat-'));
process.on('exit', () => fs.rmSync(directory, {recursive: true, force: true}));
process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));

for (const filename of ['gameChat.json', 'blockwarChat.json']) {
    fs.writeFileSync(path.join(directory, filename), '[]');
}
process.env.CHAT_DATA_DIR = directory;
// Browser tests must not use production push credentials or contact real subscribers.
delete process.env.VAPID_SUBJECT;
delete process.env.VAPID_PUBLIC_KEY;
delete process.env.VAPID_PRIVATE_KEY;

require('./stub-models');
require('../app');
