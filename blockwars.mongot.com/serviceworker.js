'use strict';
const express = require('express');

function validSubscription(subscription) {
    if (!subscription || typeof subscription.endpoint !== 'string' || subscription.endpoint.length > 2048) {
        return false;
    }
    let endpoint;
    try {
        endpoint = new URL(subscription.endpoint);
    } catch {
        return false;
    }
    const hosts = ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com', 'notify.windows.com'];
    const trusted = hosts.some(host => endpoint.hostname === host ||
        (host !== 'fcm.googleapis.com' && endpoint.hostname.endsWith('.' + host)));
    if (!trusted || endpoint.protocol !== 'https:' || endpoint.port || endpoint.username || endpoint.password || endpoint.hash) {
        return false;
    }
    const keys = subscription.keys;
    return keys && typeof keys.p256dh === 'string' && typeof keys.auth === 'string' &&
        /^[A-Za-z0-9_-]{87}=?$/.test(keys.p256dh) &&
        /^[A-Za-z0-9_-]{22}={0,2}$/.test(keys.auth) &&
        Buffer.from(keys.p256dh, 'base64url')[0] === 4;
}

module.exports = function createNotifications({
    model = require('../models').BwNotification,
    webpush = require('web-push'),
    env = process.env,
    origin,
    logger = console,
    now = Date.now
} = {}) {
    const router = express.Router();
    const settings = [env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY];
    const enabled = settings.every(Boolean);
    if (settings.some(Boolean) && !enabled) {
        throw new Error('Set all of VAPID_SUBJECT, VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to enable lobby push.');
    }
    if (enabled) {
        webpush.setVapidDetails(...settings);
    }
    const lastSent = new Map();

    router.get('/notifications/config', (req, res) => {
        res.set('Cache-Control', 'no-store');
        res.json({ enabled, publicKey: enabled ? env.VAPID_PUBLIC_KEY : null });
    });

    router.use('/notifications/subscription', (req, res, next) => {
        if (req.get('origin') !== origin) {
            return res.status(403).json({ error: 'Notification settings must be changed from this site.' });
        }
        if (!validSubscription(req.body && req.body.subscription)) {
            return res.status(400).json({ error: 'Invalid or unsupported push subscription.' });
        }
        next();
    });

    router.post('/notifications/subscription/status', async (req, res) => {
        try {
            const doc = await model.findOne({ subscription: JSON.stringify(req.body.subscription) });
            res.set('Cache-Control', 'no-store');
            res.json({ active: Boolean(doc && doc.active) });
        } catch (error) {
            logger.error('Failed to read notification settings:', error.message);
            res.status(500).json({ error: 'Could not read notification settings. Please try again.' });
        }
    });

    router.put('/notifications/subscription', async (req, res) => {
        if (!enabled) {
            return res.status(503).json({ error: 'Off-site notifications are not configured on the server yet.' });
        }
        try {
            const subscription = JSON.stringify(req.body.subscription);
            await model.findOneAndUpdate(
                { subscription },
                { subscription, username: req.user ? req.user.username : 'guest', active: true },
                { upsert: true }
            );
            res.json({ active: true });
        } catch (error) {
            logger.error('Failed to enable notifications:', error.message);
            res.status(500).json({ error: 'Could not save notification settings. Please try again.' });
        }
    });

    router.delete('/notifications/subscription', async (req, res) => {
        try {
            const subscription = JSON.stringify(req.body.subscription);
            await model.updateMany({ subscription }, { $set: { active: false } });
            lastSent.delete(subscription);
            res.json({ active: false });
        } catch (error) {
            logger.error('Failed to disable notifications:', error.message);
            res.status(500).json({ error: 'Could not disable notifications. Please try again.' });
        }
    });

    async function notifyArrival(username) {
        if (!enabled) { return; }
        const timestamp = now();
        for (const [key, sentAt] of lastSent) {
            if (timestamp - sentAt >= 60000) { lastSent.delete(key); }
        }
        const docs = await model.find({ active: true });
        await Promise.all(docs.map(async doc => {
            if (doc.username !== 'guest' && doc.username === username) { return; }
            if (lastSent.has(doc.subscription)) { return; }
            let subscription;
            try {
                subscription = JSON.parse(doc.subscription);
            } catch (error) {
                logger.warn('Discarding malformed legacy lobby push data:', error.name);
            }
            if (!validSubscription(subscription)) {
                logger.warn('Discarding an invalid legacy lobby push subscription.');
                await model.updateMany({ subscription: doc.subscription }, { $set: { active: false } });
                return;
            }
            lastSent.set(doc.subscription, timestamp);
            try {
                await webpush.sendNotification(subscription, JSON.stringify({
                    title: username + ' arrived in the Lobby'
                }), { TTL: 60, urgency: 'normal', topic: 'blockwars-lobby', timeout: 10000 });
            } catch (error) {
                if (error.statusCode === 404 || error.statusCode === 410) {
                    await model.updateMany({ subscription: doc.subscription }, { $set: { active: false } });
                    lastSent.delete(doc.subscription);
                } else {
                    logger.error('Lobby push delivery failed:', error.statusCode || error.name);
                }
            }
        }));
    }

    return { router, notifyArrival };
};
