let Events = function () {
    this._listeners = new Set();
};

Events.prototype.listen = function (name, callback) {
    this._listeners.add({
        name,
        callback
    });
};

Events.prototype.emit = function (name, ...data) {
    this._listeners.forEach((listener) => {
        if (listener.name === name) {
            listener.callback(...data);
        }
    });
};