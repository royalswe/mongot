'use strict';

const {expect} = require('@playwright/test');

class LobbyPage {
    constructor(page) {
        this.page = page;
        this.rooms = page.getByRole('table', {name: 'Available public Blockwars rooms'});
        // The legacy lobby chat/user list and notification help are not named regions.
        this.users = page.locator('#users_online');
        this.messages = page.locator('#messages');
        this.chatInput = page.getByPlaceholder('Enter your message here');
        this.alerts = page.locator('#lobby_notifications');
        this.notification = page.getByRole('checkbox', {name: 'Notify me when someone arrives in the Lobby'});
        this.helpToggle = page.getByText('How it works & limits', {exact: true});
        this.help = page.locator('#notification-help');
        this.notificationStatus = page.locator('#notification-status');
        this.notificationState = page.locator('#notification-state');
    }

    async goto() {
        await this.page.goto('/lobby', {waitUntil: 'domcontentloaded'});
        await expect(this.rooms.getByRole('button', {name: 'Join Room'}).first()).toBeVisible();
    }

    room(name) {
        return this.rooms.getByRole('row').filter({has: this.page.getByRole('cell', {name, exact: true})});
    }

    async join(row) {
        const popup = this.page.waitForEvent('popup');
        await row.getByRole('button', {name: 'Join Room'}).click();
        return popup;
    }
}

module.exports = {LobbyPage};
