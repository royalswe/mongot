const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const mail = require('../mail.json');
const models = require('../../models');
const app = require('../app');
const router = express.Router();

router.get('/register', function (req, res) {
    res.render('register.pug', { csrfToken: req.csrfToken() });

    // let ip = req.headers['x-forwarded-for'] ||
    //     req.connection.remoteAddress ||
    //     req.socket.remoteAddress ||
    //     req.connection.socket.remoteAddress;
    //
    // models.User.count({ip:ip}, function (err, count) {
    //     if(count > 1){
    //         req.flash('error', 'This ip address has reached the maximum allowed accounts. <a href="/contact">Contact staff if needed.</a>');
    //         return res.redirect('/');
    //     }
    // });
});

router.post('/register', reCAPTCHA, function (req, res) {
    models.User.findOne({ username: { '$regex': '^' + req.body.username + '$', $options: 'i' } }, function (err, doc) {
        if (doc) {
            return res.render('register.pug', { csrfToken: req.csrfToken(), username: req.body.username, email: req.body.email, error: 'Username ' + req.body.username + ' already exists' });
        }
        const hashedPassword = bcrypt.hashSync(req.body.password, bcrypt.genSaltSync(10));
        const user = new models.User({
            username: req.body.username,
            password: hashedPassword,
            joined: new Date()
        });
        if (req.body.email) { // if user added email
            user.email = req.body.email;
        }
        user.save(async function (err) {
            if (err) {
                let error = err;
                if (err.code === 11000) { // error 11000 means duplicate key error
                    let errorfield = err.keyValue?.email;
                    error = 'Sorry but ' + errorfield + ' already exists';
                }
                return res.render('register.pug', { csrfToken: req.csrfToken(), username: req.body.username, email: req.body.email, error: error });
            }
            app.createUserSession(req, res, user);
            if (!user.email) {
                req.flash('success', `${user.username} successfully created, contact us to update email if desired`);
                return res.redirect('/');
            }
            const error = await sendActivationToken(req, res, user)
            if (error) {
                req.flash('error', error);
                return res.render('register.pug', { csrfToken: req.csrfToken() });
            }
            req.flash('success', `An activation token has been sent to ${user.email}. Check your junk folder if not been sent.`);
            res.redirect('back');
        });

    });
});

router.get('/login', function (req, res) {
    res.render('login.pug', { csrfToken: req.csrfToken() });
});

router.post('/login', function (req, res) {
    models.User.findOne({ $or: [{ email: req.body.email }, { username: { '$regex': '^' + req.body.email + '$', $options: 'i' } }] }, function (err, user) {
        if (!user) {
            req.flash('error', 'The email or username does not exists');
            return res.redirect('back');
        } else {
            if (bcrypt.compareSync(req.body.password, user.password)) {
                app.createUserSession(req, res, user);
                res.redirect('/');
            } else {
                req.flash('error', 'Invalid email or password');
                return res.redirect('back');
            }
        }
    });
});

router.get('/logout', function (req, res) {
    req.session.reset(); // destroy session
    req.flash('success', 'You have successfully logged out');
    res.redirect('/');
});

router.get('/forgot', function (req, res) {
    res.render('forgot.pug', { csrfToken: req.csrfToken() });
});

router.post('/forgot', async function (req, res) {
    const token = crypto.randomBytes(20).toString('hex');

    const user = await models.User.findOne({ email: req.body.email }).then((doc) => {
        if (!doc) {
            req.flash('error', 'No account with that email address exists.');
            return res.redirect('/forgot');
        }
        doc.resetPasswordToken = token;
        doc.resetPasswordExpires = Date.now() + 86400000; // 24 hours

        return doc.save();
    })
        .then((user) => {
            const mailOptions = {
                api_key: mail.API_KEY,
                to: [user.email],
                sender: mail.FROM,
                subject: 'mongot.com Password Reset',
                text_body: 'You are receiving this because you (or someone else) have requested the reset of the password for your account.\n\n' +
                    'Please click on the following link, or paste this into your browser to complete the process:\n\n' +
                    'https://' + req.headers.host + '/reset/' + token + '\n\n' +
                    'If you did not request this, please ignore this email and your password will remain unchanged.\n'
            };

            fetch(mail.URL, {
                method: "POST",
                headers: { 'Content-Type': "application/json" },
                body: JSON.stringify(mailOptions)
            })
                .then((res) => {
                    if (res.status === 200) {
                        req.flash('info', 'An email has been sent to ' + user.email + ' with further instructions.');
                    }
                    else {
                        req.flash('error', res.status);
                    }
                }).catch((err) => {
                    console.log('sending forgott password email', err);
                    req.flash('error', err);
                }).finally(() =>
                    res.render('forgot.pug', { csrfToken: req.csrfToken() })
                );
        })
        .catch((err) => console.log('Forgot route:', err));
});

router.get('/sendVerificationToken', requireLogin, function (req, res) {
    models.User.findOne({ email: req.user.email }, async function (err, user) {
        if (!user) {
            req.flash('error', 'Could not find your account');
            return res.redirect('/');
        }
        else if (user.active) {
            req.flash('info', 'Your account is already activated');
            return res.redirect('/');
        }
        const error = await sendActivationToken(req, res, user);
        if (error) {
            req.flash('error', error);
        }
        else {
            req.flash('success', `An activation token has been sent to ${user.email}. Check your junk folder if not been sent.`);
        }
        res.redirect('back');

    });
});

router.get('/activation/:token', function (req, res) {
    models.User.findOne({ activationToken: req.params.token, activationTokenExpires: { $gt: Date.now() } }, function (err, user) {
        if (!user) {
            req.flash('error', 'Activation token is invalid or has expired.');
            return res.redirect('/');
        }

        user.activationToken = undefined;
        user.activationTokenExpires = undefined;
        user.active = 1;

        user.save(function (err) {
            if (err) {
                req.flash('error', 'Something wrong happened! could not activate account.');
                res.redirect('/');
            }
            else {
                req.flash('success', 'Your account is successfully activated.');
                res.redirect('/');
            }
        });

    });
});

router.get('/reset/:token', function (req, res) {
    models.User.findOne({ resetPasswordToken: req.params.token, resetPasswordExpires: { $gt: Date.now() } }, function (err, user) {
        if (!user) {
            req.flash('error', 'Password reset token is invalid or has expired.');
            return res.redirect('/forgot');
        }
        res.render('reset', { csrfToken: req.csrfToken() });
    });
});

router.post('/reset/:token', function (req, res) {

    models.User.findOne({ resetPasswordToken: req.params.token, resetPasswordExpires: { $gt: Date.now() } }).then((user) => {
        if (!user) {
            req.flash('error', 'Password reset token is invalid or has expired.');
            return res.redirect('back');
        }

        const hashedPassword = bcrypt.hashSync(req.body.password, bcrypt.genSaltSync(10));
        user.password = hashedPassword;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;

        return user.save();
    }).then((user) => {
        const mailOptions = {
            api_key: mail.API_KEY,
            to: [user.email],
            sender: mail.FROM,
            subject: 'Your password has been changed',
            text_body: 'Hello,\n\n' +
                'This is a confirmation that the password for your account ' + user.username + ' has just been changed at mongot.com.\n'
        };

        fetch(mail.URL, {
            method: "POST",
            headers: { 'Content-Type': "application/json" },
            body: JSON.stringify(mailOptions)
        })
            .then((res) => {
                if (res.status === 200) {
                    return req.flash('success', 'Success! Your password has been changed.');
                }
                req.flash('error', err);
            }).catch((err) => {
                req.flash('error', err);
                console.log('reset/token route:', err);
            }).finally(() => res.redirect('/login'));
    })
});

async function sendActivationToken(req, res, user) {
    if (!user.email) {
        req.flash('info', 'No email specified');
        return res.redirect('back');
    }

    const token = crypto.randomBytes(20).toString('hex');

    user.activationToken = token;
    user.activationTokenExpires = Date.now() + 86400000; // 24 hour

    await user.save(function (err) {
        return Error(err)
    });

    const mailOptions = {
        api_key: mail.API_KEY,
        to: [user.email],
        sender: mail.FROM,
        subject: 'Account activation',
        text_body:
            `You are receiving this because you (or someone else) have created an account on mongot.com.
            Activate your account by clicking the link below, or paste this into your browser to complete the process:
            https://${req.headers.host}/activation/${token}
            If you did not request this, please ignore this email.\n`
    };

    const response = await fetch(mail.URL, {
        method: "POST",
        headers: { 'Content-Type': "application/json" },
        body: JSON.stringify(mailOptions)
    })
        .then((res) => {
            if (res.status !== 200) {
                return res.status
            }
            return
        }).catch((err) => {
            return Error(err)
        });

    return response

}

function requireLogin(req, res, next) {
    if (req.user) {
        next();
    }
    else {
        res.redirect('/login');
    }
}

function reCAPTCHA(req, res, next) {
    if (req.body['g-recaptcha-response'] === undefined || req.body['g-recaptcha-response'] === '' || req.body['g-recaptcha-response'] === null) {
        return res.render('register.pug', { csrfToken: req.csrfToken(), error: "Something went wrong with reCAPTCHA" });
    }
    const secretKey = "6LfhkTkdAAAAAD9bg9-ogPXrw2qon1gJh3zXU1ls";

    const verificationURL = "https://www.google.com/recaptcha/api/siteverify?secret=" + secretKey + "&response=" + req.body['g-recaptcha-response'];

    fetch(verificationURL, {
        method: 'POST'
    })
        .then((response) => response.json())
        .then((body) => {
            if (body.success !== undefined && !body.success) {
                return res.render('register.pug', { csrfToken: req.csrfToken(), error: "Failed captcha verification" });
            }
            if (body.score < 0.5) {
                return res.render('register.pug', { csrfToken: req.csrfToken(), error: "captcha claims that you are a robot!" });
            }
            else {
                next();
            }
        })
        .catch((error) => {
            console.error('reCAPTCHA error:', error);
            return res.render('register.pug', { csrfToken: req.csrfToken(), error: error });
        });
}

module.exports = router;