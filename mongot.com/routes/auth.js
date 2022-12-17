const express = require('express');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const async = require('async');
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
    models.User.findOne({ username: { '$regex': '^' + req.body.username + '$', $options: 'i' } }, function (err, user) {
        if (user) {
            return res.render('register.pug', { csrfToken: req.csrfToken(), username: req.body.username, email: req.body.email, error: 'Username ' + req.body.username + ' already exists' });
        }
        else {
            const hashedPassword = bcrypt.hashSync(req.body.password, bcrypt.genSaltSync(10));
            const user = new models.User({
                username: req.body.username,
                password: hashedPassword,
                joined: new Date()
            });
            if (req.body.email) { // if user added email
                user.email = req.body.email;
            }
            user.save(function (err) {
                if (err) {
                    let error = err;
                    if (err.code === 11000) { // error 11000 means duplicate key error
                        let errorfield = err.keyValue?.email;
                        error = 'Sorry but ' + errorfield + ' already exists';
                    }
                    return res.render('register.pug', { csrfToken: req.csrfToken(), username: req.body.username, email: req.body.email, error: error });
                }
                else {
                    app.createUserSession(req, res, user);
                    if (!user.email) {
                        req.flash('success', `${user.username} successfully created, contact us to update email if desired`);
                        return res.redirect('/');
                    }
                    sendActivationToken(req, res, user);
                }
            });

        }
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

router.post('/forgot', function (req, res) {
    async.waterfall([
        function (done) {
            crypto.randomBytes(20, function (err, buf) {
                const token = buf.toString('hex');
                done(err, token);
            });
        },
        function (token, done) {
            models.User.findOne({ email: req.body.email }, function (err, user) {
                if (!user) {
                    req.flash('error', 'No account with that email address exists.');
                    return res.redirect('/forgot');
                }
                user.resetPasswordToken = token;
                user.resetPasswordExpires = Date.now() + 86400000; // 24 hours

                user.save(function (err) {
                    done(err, token, user);
                });
            });
        },
        function (token, user, done) {
            const smtpTransport = nodemailer.createTransport({
                service: 'Gmail',
                auth: {
                    user: config.EMAIL,
                    pass: config.EMAIL_SECRET
                }
            });
            const mailOptions = {
                to: user.email,
                from: config.EMAIL,
                subject: 'mongot.com Password Reset',
                text: 'You are receiving this because you (or someone else) have requested the reset of the password for your account.\n\n' +
                    'Please click on the following link, or paste this into your browser to complete the process:\n\n' +
                    'https://' + req.headers.host + '/reset/' + token + '\n\n' +
                    'If you did not request this, please ignore this email and your password will remain unchanged.\n'
            };
            smtpTransport.sendMail(mailOptions, function (err) {
                if (!err) req.flash('info', 'An email has been sent to ' + user.email + ' with further instructions.');
                done(err, 'done');
            });
        }
    ], function (err) {
        if (err) {
            req.flash('error', err);
            return res.render('forgot.pug', { csrfToken: req.csrfToken() });
        }
        res.redirect('/forgot');
    });
});

router.get('/sendVerificationToken', requireLogin, function (req, res) {
    models.User.findOne({ email: req.user.email }, function (err, user) {
        if (!user) {
            req.flash('error', 'Could not find your account');
            res.redirect('/');
        }
        else if (user.active) {
            req.flash('info', 'Your account is already activated');
            res.redirect('/');
        }
        else {
            sendActivationToken(req, res, user);
        }
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
    async.waterfall([
        function (done) {
            models.User.findOne({ resetPasswordToken: req.params.token, resetPasswordExpires: { $gt: Date.now() } }, function (err, user) {
                if (!user) {
                    req.flash('error', 'Password reset token is invalid or has expired.');
                    return res.redirect('back');
                }

                const hashedPassword = bcrypt.hashSync(req.body.password, bcrypt.genSaltSync(10));
                user.password = hashedPassword;
                user.resetPasswordToken = undefined;
                user.resetPasswordExpires = undefined;

                user.save(function (err) {
                    if (err) {
                        req.flash('error', 'Something wrong happened! could not update password.');
                        return res.redirect('back');
                    }
                    done(err, user);
                });
            });
        },
        function (user, done) {
            const smtpTransport = nodemailer.createTransport({
                service: 'Gmail',
                auth: {
                    user: config.EMAIL,
                    pass: config.EMAIL_SECRET
                }
            });
            const mailOptions = {
                to: user.email,
                from: config.EMAIL,
                subject: 'Your password has been changed',
                text: 'Hello,\n\n' +
                    'This is a confirmation that the password for your account ' + user.username + ' has just been changed at mongot.com.\n'
            };
            smtpTransport.sendMail(mailOptions, function (err) {
                req.flash('success', 'Success! Your password has been changed.');
                done(err);
            });
        }
    ], function () {
        res.redirect('/login');
    });
});

async function sendActivationToken(req, res, user) {
    if (!user.email) {
        req.flash('info', 'No email specified, you will not be able to play general');
        return res.redirect('back');
    }

    async.waterfall([
        function (done) {
            crypto.randomBytes(20, function (err, buf) {
                const token = buf.toString('hex');
                done(err, token);
            });
        },
        function (token, done) {
            user.activationToken = token;
            user.activationTokenExpires = Date.now() + 86400000; // 24 hour

            user.save(function (err) {
                done(err, token, user);
            });
        },
        function (token, info, done) {
            const mailOptions = {
                to: user.email,
                from: mail.FROM,
                subject: 'Account activation',
                text: `You are receiving this because you (or someone else) have created an account on mongot.com.
                    Activate your account by clicking the link below, or paste this into your browser to complete the process:
                    https://${req.headers.host}/activation/${token}
                    If you did not request this, please ignore this email.\n`
            };

            fetch(mail.URL, {
                method: "POST",
                headers: { 'Content-Type': "application/json" },
                body: JSON.stringify(mailOptions)
            })
                .then((res) => {
                    console.log(res);
                    req.flash('success', `An activation token has been sent to ${user.email}. Check your junk folder if not been sent.`);
                    done('done')
                }).catch((err) => {
                    req.flash('error', err);
                    done(err, 'done');
                });
        }
    ], function (err) {
        if (err) {
            return res.render('register.pug', { csrfToken: req.csrfToken() });
        }
        res.redirect('back');
    });
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