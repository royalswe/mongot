const express = require('express');
const models = require('../../models');
const router = express.Router();
const fs = require('fs');
const chatFiles = require('../game/chat-files');

router.get('/', function (req, res) {
    res.render('index.pug');
});

router.get('/lobby', function (req, res, next) {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const renderLobby = () => res.render('lobby.pug', {bodyClass: 'lobby-body'});

    if(req.user){
        models.User.findOne({ username: req.user.username }, function(err, user) {
            if (err) { return next(err); }
            if(user){
                user.last_visit_bw = new Date();
                user.ip = ip;
                return user.save(function(err) {
                    if (err) { return next(err); }
                    renderLobby();
                });
            }
            renderLobby();
        });
        return;
    }
    renderLobby();
});

router.get('/game', checkIfBanned, function (req, res) {
    res.render('game.pug');
});

router.get('/rules', function (req, res) {
    res.render('rules.pug');
});

router.get('/highscore', function (req, res, next) {
    models.User.find().or([{games_lost_bw: { $gt: 0 }}, {games_won_bw: { $gt: 0 }}]).sort({points_bw: -1}).exec(function(err, docs){
        if (err) { return next(err); }
        res.render('highscore.pug', {highscores: docs});
    });
});

router.get('/gamelog', requireAdmin, function (req, res, next) {
    models.BwLog.find().exec(function(err, docs){
        if (err) { return next(err); }
        res.render('gamelog.pug', {logs: docs});
    });
});

function renderGameChat(req, res, next) {
    fs.readFile(chatFiles.game, function (err, data) {
        if (err) { return next(err); }
        let messages;
        try {
            messages = JSON.parse(data);
        } catch (error) {
            return next(error);
        }
        res.render('gamechat.pug', {messages});
    });
}

router.get('/gamechat', requireAdmin, renderGameChat);

router.get('/erasechat', requireAdmin, function (req, res, next) {
    fs.writeFile(chatFiles.game, '[]', function (err) {
        if (err) { return next(err); }
        renderGameChat(req, res, next);
    });
});

function requireAdmin(req, res, next) {
    if(req.user && req.user.god) {
        next();
    }
    else {
        res.redirect('/');
    }
}

function checkIfBanned(req, res, next) {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        
    models.Ips.findOne({ ip: ip }, function(err, ips) {
        if (err) { return next(err); }
        if (ips) {
            req.flash('info', 'You are banned!');
            res.redirect('/');
        }
        else {
            next();
        }
    });
}

module.exports = router;