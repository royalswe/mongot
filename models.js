'use strict';
var mongoose = require('mongoose');

var Schema = mongoose.Schema;
var ObjectId = Schema.ObjectId;

/**
 * User model
 */
module.exports.User = mongoose.model('User', new Schema({
    id: ObjectId,
    username: { type: String, unique: true, match: /^[a-z0-9_-]{2,16}$/i },
    email: { type: String, unique: true, sparse: true, set: toLower, match: /\S+@\S+\.\S+/ },
    password: { type: String },
    joined: { type: Date, default: Date() },
    points_general: { type: Number, default: 1600 },
    last_visit_general: { type: Date, default: Date() },
    games_lost_general: { type: Number, default: 0 },
    games_won_general: { type: Number, default: 0 },   
    points_bw: { type: Number, default: 1600 },
    last_visit_bw: { type: Date, default: Date() },
    games_lost_bw: { type: Number, default: 0 },
    games_won_bw: { type: Number, default: 0 },
    game_length_bw: { type: Number, default: 0 },
    ip: { type: String },
    country: { type: String },
    god: { type:Boolean, default: false},
    active: {type:Boolean, default: false},
    resetPasswordToken: String,
    resetPasswordExpires: Date,
    activationToken: String,
    activationTokenExpires: Date,
    wysiwyg: String
}, { timestamps: true }));

module.exports.Ips = mongoose.model('Ips', new Schema({
    ip: { type: String }
}));

module.exports.BwLog = mongoose.model('BwLog', new Schema({
    game_time: String,
    winner: String,
    players: String
}, { timestamps: true }));

module.exports.Games = mongoose.model('Games', new Schema({
    id: String,
    username: String,
    userAgent: String,
    gameTime: String,
    points: Number,
    players: Number,
    ip: String,
    won: Boolean,
    date: Date
}));

module.exports.BwNotification = mongoose.model('BwNotification', new Schema({
    username: String,
    subscription: String,
    active: {type:Boolean, default: true}
}, { timestamps: true }));

function toLower (str) {
    return str.toLowerCase();
}
