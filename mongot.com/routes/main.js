const express = require('express');
const models = require('../../models');
const mail = require('../mail.json');
const router = express.Router();

router.get('/', function (req, res) {
    res.render('index.pug');
});

router.get('/donation', checkIfBanned, function (req, res) {
    res.render('donation.pug');
});

router.post('/profile', function (req, res) {
    models.User.findOne({ username: req.user.username }, function (err, user) {
        if (err) {
            req.flash('error', 'Something went wrong! could not save presentation');
        }
        else if (user) {
            user.wysiwyg = req.body.editor;
            user.save();
            req.flash('success', 'Presentation saved');
        }
        res.render('profile.pug', { csrfToken: req.csrfToken(), wysiwyg: user.wysiwyg });
    });
});

router.get('/profile', requireLogin, function (req, res) {
    models.User.findOne({ username: req.user.username }, function (err, user) {
        if (err) {
            req.flash('error', 'Something went wrong!');
        }
        res.render('profile.pug', { csrfToken: req.csrfToken(), wysiwyg: user.wysiwyg });
    });
});

router.get('/user/:username', checkIfBanned, function (req, res) {
    models.User.findOne({ username: { '$regex': '^' + req.params.username + '$', $options: 'i' } }, function (err, friend) {
        if (friend) {
            res.render('user.pug', { csrfToken: req.csrfToken(), friend: friend });
        }
        else {
            req.flash('info', 'Could not find user');
            res.render('index.pug');
        }
    });
});

router.get('/userlist', requireAdmin, function (req, res) {
    models.User.find().sort({ joined: -1 }).exec(function (err, docs) {
        res.render('userlist.pug', { users: docs });
    });
});

router.get('/contact', function (req, res) {
    res.render('contact.pug', { csrfToken: req.csrfToken() });
});

router.post('/contact', function (req, res) {
    let username = 'guest';
    console.log(typeof req.body.content, '|' ,req.body.agreement, 123);

    if (req.user) {
        username = req.user.username;
    }
    else if (req.body.content !== "" || req.body.agreement === 'on') {
        // Fields are hidden so this is a bot
        req.flash('error', 'BOT');
        return res.redirect('back');
    }
    const ip = req.headers['x-forwarded-for'] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        req.connection.socket.remoteAddress;

    const mailOptions = {
        api_key: mail.API_KEY,
        to: [mail.FROM],
        sender: mail.FROM,
        subject: 'Contact form mongot.com',
        html_body: req.body.text + '<br><b>Sent from: </b>' + req.body.from + '<br><b>ip: </b>' + ip + '<b> user: </b>' + username
    };

    fetch(mail.URL, {
        method: "POST",
        headers: { 'Content-Type': "application/json" },
        body: JSON.stringify(mailOptions)
    })
        .then((res) => {
            if(res.status === 200){
                req.flash('success', 'Your message has been successfully sent');
            }
            else{
                req.flash('error', 'Something went wrong! could not send message');
                console.log('contact email status code:', res.status);
                console.log(req.body.from, req.body.text, ip);
            }
        }).catch((err) => {
            console.log('could not send contact message', err);
        }).finally(() => res.redirect('back') );
});
/**
 * Redirect to login page if not logged in
 */
function requireLogin(req, res, next) {
    if (req.user) {
        if (!req.user.active) {
            req.flash('error', 'Your account is not activated, <a href="/sendVerificationToken">Send new activation link if needed</a>');
        }
        next();
    }
    else {
        res.redirect('/login');
    }
}

function requireAdmin(req, res, next) {
    if (req.user && req.user.god) {
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

    models.Ips.findOne({ ip: ip }, function (err, ips) {
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
