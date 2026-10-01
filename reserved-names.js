'use strict';

// Names that real accounts must not use because the game hands them to guests and bots.
const BOT_NAMES = ['scout', 'raider', 'warden'];

module.exports = function isReservedName(name) {
    const lower = String(name || '').toLowerCase();
    return lower === 'guest' || lower.startsWith('guest-') || lower.startsWith('relief-') || BOT_NAMES.includes(lower);
};
