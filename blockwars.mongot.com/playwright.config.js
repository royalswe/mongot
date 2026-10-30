'use strict';

const { defineConfig, devices } = require('@playwright/test');
const { COOKIE_SECRET, accounts } = require('./tests/fixtures/accounts');

const PORT = 5283;
const ORIGIN = `http://localhost:${PORT}`;

module.exports = defineConfig({
    testDir: './tests/e2e',
    testMatch: '**/*.spec.js',
    fullyParallel: false,
    workers: 1,
    forbidOnly: !!process.env.CI,
    reporter: 'list',
    use: {
        baseURL: ORIGIN,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure'
    },
    projects: [
        {
            name: 'desktop',
            testIgnore: ['**/*.mobile.spec.js', '**/build/**'],
            use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } }
        },
        {
            name: 'phone-portrait',
            testMatch: ['**/*.mobile.spec.js', '**/*.shared.spec.js'],
            use: { ...devices['Pixel 7'] }
        },
        {
            name: 'phone-landscape',
            testMatch: ['**/*.mobile.spec.js', '**/*.shared.spec.js'],
            use: { ...devices['Pixel 7 landscape'] }
        },
        {
            name: 'build',
            testMatch: '**/build/*.spec.js',
            use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } }
        }
    ],
    webServer: {
        command: 'node tests/fixtures/start-server.js',
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
