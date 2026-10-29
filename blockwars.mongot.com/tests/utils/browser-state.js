'use strict';

async function prepareVisitor(context, {baseURL, movementButtons = true, rulesRead = true}) {
    await context.addInitScript(({movementButtons, rulesRead}) => {
        if (rulesRead) { localStorage.setItem('rule-read', 'true'); }
        localStorage.setItem('toggle-sound', 'off');
        if (movementButtons && localStorage.getItem('touch-buttons') === null) {
            localStorage.setItem('touch-buttons', 'on');
        }
        localStorage.setItem('touch-hint-seen', 'yes');
    }, {movementButtons, rulesRead});
    // Do not load analytics/social widgets or contact external push services.
    await context.route('**/*', route => new URL(route.request().url()).origin === baseURL
        ? route.continue() : route.abort());
}

const uniqueRoom = label => `E2E-${label}-${require('node:crypto').randomUUID()}`;

module.exports = {prepareVisitor, uniqueRoom};
