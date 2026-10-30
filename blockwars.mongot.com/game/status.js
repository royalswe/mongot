const status = Object.freeze({
    session: {
        waiting: "waiting",
        running: "running"
    },
    client: {
        seated: "seated",
        ready: "ready"
    }
});

module.exports = status;