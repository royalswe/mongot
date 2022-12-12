const express = require('express');
const router = express.Router();
const webpush = require("web-push");
const models = require('../models');

webpush.setVapidDetails(
    "mailto:blipmini@gmail.com",
    "BEjK-T4xq910AGfKQ09xIF_hCgBUTebFj2ZPaHilzouo8ca3kjJAmX4WjgQp8n8Yg02Bu5hwp97MLu0a14OP4RY",
    "DKXVoEGfQpXxVwcnYHag-UGkcg2eR7c_n-ABJgTcx7M"
);

/**
 * Subscribe for push notifications
 */
router.post("/subscribe", function (req, res) {
    const subscription = req.body.subscription;
    const user = req.body.username;

    models.BwNotification.findOneAndUpdate(
        {subscription: JSON.stringify(subscription)}, // find a document with that filter
        {username: user, subscription: JSON.stringify(subscription), active: true}, // document to insert when nothing was found
        {upsert: true, new: false}, // options
        function (err, doc) { // callback
            if (err) {
                console.log(err);
            } else {
                let payload = "Notification activated";

                if(doc){
                    doc.active = !doc.active;
                    if(doc.active === false){
                        payload = "Notification disabled";
                    }
                    doc.save();
                }
            
                webpush
                    .sendNotification(subscription, JSON.stringify({ title: payload }), {TTL:5})
                    .catch(err => console.error(err));  
            }
        }
    );

    // Send 201 - resource created
    res.status(201).json({});
});

router.post("/send-pw", function (req) {
    // Get pushSubscription object
    const user = req.body.username;
    const payload = JSON.stringify({ title: user + " arrived to the lobby"});
    
    models.BwNotification.find({active:true}).then(function(docs) { 
        docs.forEach(function(doc) {
            if(user !== "guest" && user === doc.username) return;
            webpush
            .sendNotification(JSON.parse(doc.subscription), payload, {TTL:5})
            .catch(err => console.error(err));        
        });
      }).catch(function(err) {
          if(err) console.log(err);
      });
});

module.exports = router;