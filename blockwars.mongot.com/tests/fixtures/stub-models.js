'use strict';

// Preloaded with `node -r` so the app runs without MongoDB: replaces the shared mongoose models
// with in-memory stand-ins that know only the TEST_ACCOUNTS.
const accounts = JSON.parse(process.env.TEST_ACCOUNTS || '{}');

function findAccount(query) {
    return Object.values(accounts).find(account =>
        (query.email && account.email === query.email) || (query.username && account.username === query.username));
}

const models = {
    User: {
        findOne(query, projection, callback) {
            callback = typeof projection === 'function' ? projection : callback;
            const account = findAccount(query);
            callback(null, account ? {...account, save(callback) { callback(null); }} : null);
        },
        updateOne: () => ({exec: () => Promise.resolve()}),
        find: () => ({or() { return this; }, sort() { return this; }, exec: (callback) => callback(null, [])})
    },
    Ips: {findOne: (query, callback) => callback(null, null)},
    BwLog: {create: () => Promise.resolve()}
};

const modelsPath = require.resolve('../../../models');
require.cache[modelsPath] = {id: modelsPath, filename: modelsPath, loaded: true, exports: models};
