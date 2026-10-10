'use strict';

const { defineConfig } = require('@playwright/test');
const { COOKIE_SECRET, accounts } = require('./e2e/accounts');

module.exports = defineConfig({
    testDir: './e2e',
    fullyParallel: false,
    workers: 1,
    reporter: 'list',
    use: {
        baseURL: 'http://127.0.0.1:5182',
        browserName: 'chromium',
        viewport: { width: 1280, height: 800 }
    },
    webServer: {
        command: 'node app.js',
        url: 'http://127.0.0.1:5182/lobby',
        timeout: 30000,
        reuseExistingServer: false,
        env: {
            ...process.env,
            NODE_ENV: 'test',
            PORT: '5182',
            ROOM_CLEANUP_DELAY_MS: '3000',
            COOKIE_SECRET: COOKIE_SECRET,
            TEST_ACCOUNTS: JSON.stringify(accounts)
        }
    }
});