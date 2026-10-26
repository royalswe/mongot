"use strict";
const models = require('../../models');

function logError(err) {
    console.log(err);
}

exports.recordGameLength = (username, ms) =>
    models.User.updateOne({ username, game_length_bw: { $lt: ms } }, { $set: { game_length_bw: ms } }).exec().catch(logError);

exports.recordLoss = (username, pointsLost) =>
    models.User.updateOne({ username }, { $inc: { points_bw: -pointsLost, games_lost_bw: 1 } }).exec().catch(logError);

exports.recordWin = (username, pointsWon) =>
    models.User.updateOne({ username }, { $inc: { points_bw: pointsWon, games_won_bw: 1 } }).exec().catch(logError);

exports.logGame = (entry) => models.BwLog.create(entry).catch(logError);
