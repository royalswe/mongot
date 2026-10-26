'use strict';

const { defineConfig, devices } = require('@playwright/test');
const { COOKIE_SECRET, accounts } = require('./e2e/accounts');

const PORT = 5283;
const ORIGIN = `http://localhost:${PORT}`;

module.exports = defineConfig({
    testDir: './e2e',
    testMatch: '**/*.spec.js',
    fullyParallel: false,
    workers: 1,
    reporter: 'list',
    use: {
        baseURL: ORIGIN
    },
    projects: [
        {
            name: 'desktop',
            testIgnore: '**/*.mobile.spec.js',
            use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } }
        },
        {
            name: 'phone-portrait',
            testMatch: '**/*.mobile.spec.js',
            use: { ...devices['Pixel 7'] }
        },
        {
            name: 'phone-landscape',
            testMatch: '**/*.mobile.spec.js',
            use: { ...devices['Pixel 7 landscape'] }
        }
    ],
    webServer: {
        command: 'node -r ./e2e/stub-models.js app.js',
        url: `${ORIGIN}/lobby`,
        timeout: 30000,
        reuseExistingServer: false,
        env: {
            ...process.env,
            PORT: String(PORT),
            DOMAIN: ORIGIN, // the game sockets only accept this origin
            COOKIE_SECRET: COOKIE_SECRET,
            TEST_ACCOUNTS: JSON.stringify(accounts)
        }
    }
});
