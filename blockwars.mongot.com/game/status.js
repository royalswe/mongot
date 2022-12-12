const status = Object.freeze({
    session: {
        waiting: "waiting",
        running: "running"
    },
    client: {
        joined: "joined",
        ready: "ready"
    }
});

module.exports = status;