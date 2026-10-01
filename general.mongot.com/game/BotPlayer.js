'use strict';

function BotPlayer(profile, id, color) {
    this.id = id;
    this.username = profile.username;
    this.botKey = profile.key;
    this.points = profile.points_general;
    this.color = color;
    this.ip = 'bot';
    this.isBot = true;
    this.aggression = profile.aggression;
    this.request = {headers: {'user-agent': 'General game bot'}};
    this.handlers = Object.create(null);
}

BotPlayer.prototype.on = function(eventName, handler) {
    this.handlers[eventName] = handler;
};

BotPlayer.prototype.serverAction = function(eventName) {
    const handler = this.handlers[eventName];
    if (handler) {
        handler.apply(null, Array.prototype.slice.call(arguments, 1));
    }
};

BotPlayer.prototype.removeAllListeners = function(eventName) {
    delete this.handlers[eventName];
};

BotPlayer.prototype.send = function() {};
BotPlayer.prototype.emit = function() {};
BotPlayer.prototype.disconnect = function() {};

module.exports = BotPlayer;