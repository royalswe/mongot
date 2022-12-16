const express = require('express');
const nodemailer = require("nodemailer");
const models = require('../../models');
const config = require('../../config.json');
const router = express.Router();

router.get('/', function (req, res) {
    res.render('index.pug');
});

router.get('/donation', checkIfBanned, function (req, res) {
    res.render('donation.pug');
});

router.post('/profile', function (req, res) {
    models.User.findOne({ username: req.user.username }, function(err, user) {
        if(err){
            req.flash('error', 'Something went wrong! could not save presentation');
        }
        else if(user){
            user.wysiwyg = req.body.editor;
            user.save();
            req.flash('success', 'Presentation saved');
        }
        res.render('profile.pug', {csrfToken: req.csrfToken(), wysiwyg: user.wysiwyg});
    });
});

router.get('/profile', requireLogin, function (req, res) {
    models.User.findOne({ username: req.user.username }, function(err, user) {
        if(err){
            req.flash('error', 'Something went wrong!');
        }
        res.render('profile.pug', {csrfToken: req.csrfToken(), wysiwyg: user.wysiwyg});
    });
});

router.get('/user/:username', checkIfBanned, function (req, res) {
    models.User.findOne({ username: { '$regex': '^' + req.params.username + '$',$options:'i' }} , function(err, friend) {
        if(friend){
            res.render('user.pug', {csrfToken: req.csrfToken(), friend: friend});
        }
        else{
            req.flash('info', 'Could not find user');
            res.render('index.pug');
        }
    });
});

router.get('/userlist', requireAdmin, function (req, res) {
    models.User.find().sort({joined: -1}).exec(function(err, docs){
        res.render('userlist.pug', {users: docs});
    });
});

router.get('/contact', function (req, res) {
    res.render('contact.pug', { csrfToken: req.csrfToken() });
});

router.post('/contact', function (req, res) {
    let username = 'guest';
    if(req.user){
        username = req.user.username;
    }
    else if(typeof req.body.content !== 'undefined' || req.body.agreement === 'on'){
        // Fields are hidden so this is a bot
        return res.redirect('/');
    }

    const ip = req.headers['x-forwarded-for'] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        req.connection.socket.remoteAddress;

    const transporter = nodemailer.createTransport({
        service: 'Gmail',
        auth: {
            user: config.EMAIL,
            pass: config.EMAIL_SECRET
        }
    });
    const mailOptions = {
        from: req.body.from,
        to: config.EMAIL,
        subject: 'Contact form mongot.com',
        text: req.body.text + ' Sent from: ' + req.body.from, // plaintext body
        html: req.body.text + '<br><b>Sent from: </b>'+ req.body.from +'<br><b>ip: </b>' + ip + '<b> user: </b>' + username// html body
    };

    // send mail with defined transport object
    transporter.sendMail(mailOptions, function(error){
        if(error){
            req.flash('error', 'Something went wrong! could not send message');
        }
        else {
            req.flash('success', 'Your message has been successfully sent');
        }
        return res.redirect('back');
    });
});
/**
 * Redirect to login page if not logged in
 */
function requireLogin(req, res, next) {
    if(req.user) {
        if(!req.user.active) {
            req.flash('error', 'Your account is not activated, <a href="/sendVerificationToken">Send new activation link if needed</a>');
        }
        next();
    }
    else {
        res.redirect('/login');
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
