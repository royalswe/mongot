'use strict';
var models = require('./models');

module.exports.cookieAuth = function(req, res, next){
    if(req.session && req.session.user) {
        models.User.findOne({ email: req.session.user.email }, { _id:0, password:0, activationToken:0, activationTokenExpires:0, wysiwyg:0  }, function(err, user) {
            if(user) {
                req.user = user; // user can be user directly in the templates
                req.session.user = user;  //refresh the session value
                res.locals.user = user; // session is now available in the templates
            }
            next();
        });
    }
    else {
        next();
    }
};