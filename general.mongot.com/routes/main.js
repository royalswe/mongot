let express = require('express');
let models = require('../../models');
let fs = require('fs');
let router = express.Router();

router.get('/', function (req, res) {
    res.render('index.pug');
});

router.get('/game', checkIfBanned, function (req, res) {
    res.render('game.pug');
});

router.get('/dicelog', function (req, res) {
    res.render('dicelog.pug');
});

router.get('/lobby', checkIfBanned, function (req, res) {
    const ip = req.headers['x-forwarded-for'] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        req.connection.socket.remoteAddress;

    if(req.user){
        models.User.findOne({ username: req.user.username }, function(err, user) {
            if(user){
                user.last_visit_general = new Date();
                user.ip = ip;
                user.save();
            }
        });
        if(!req.user.active) {
            req.flash('error', 'Your account is not activated. <a href="https://mongot.com/sendVerificationToken">Send new activation link if needed</a>');
        }
    }
    else {
        req.flash('error', ' <a href="https://mongot.com/register">Register</a> new account or  <a href="https://mongot.com/login">login</a> to play! Otherwise you can only watch games.');
    }
    res.render('lobby.pug');
});

router.get('/rules', function (req, res) {
    res.render('rules.pug');
});

router.get('/highscore', function (req, res) {
    models.User.find().limit(30).sort({points_general: -1}).exec(function(err, docs){
        res.render('highscore.pug', {highscores: docs});
    });
});

router.get('/userlist', requireAdmin, function (req, res) {
    models.User.find().sort({joined: -1}).exec(function(err, docs){
        res.render('userlist.pug', {users: docs});
    });
});

router.get('/gamechat', requireAdmin, function (req, res) {
    fs.readFile( 'gameChat.json', function (err, data) {
        if (err) {
            // throw err;
        }
        res.render('gamechat.pug', {messages: JSON.parse(data)});
    });
});

router.get('/erasechat', requireAdmin, function (req, res) {
   fs.writeFile('gameChat.json', '[]', function () {
       fs.readFile( 'gameChat.json', function (err, data) {
           if (err) {
               //throw err;
           }
           res.render('gamechat.pug', {messages: JSON.parse(data)});
       });
   });
});

/**
 * Redirect to login page if not logged in
 */
function requireLogin(req, res, next) {
    if(req.user) {
        if(!req.user.active) {
            req.flash('error', 'Your account is not activated, <a href="https://mongot.com/sendVerificationToken">Send new activation link if needed</a>');
        }
        next();
    }
    else {
        res.redirect('/');
    }
}

function requireAdmin(req, res, next) {
    if(req.user && req.user.god) {
        next();
    }
    else {
        res.redirect('/');
    }
}

function checkIfBanned(req, res, next) {
    const ip = req.headers['x-forwarded-for'] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        req.connection.socket.remoteAddress;

    models.Ips.findOne({ ip: ip }, function(err, ips) {
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
