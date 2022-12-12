'use strict';

const EventEmitter = require('events').EventEmitter;

module.exports = class MockClient extends EventEmitter {

  constructor() {
    super();

    this.STATUS = {
      CONNECTING: 0,
      OPENED: 1,
      CLOSED: 3
    };

    this.readyState = this.STATUS.CONNECTING;
    //this.messages = [];
  }

  send(message) {
    //this.messages.push(message);
    this.emit('mock-msg', message);
  }

  open() {
    this.readyState = this.STATUS.OPENED;
  }

  close(code, reason) {
    this.readyState = this.STATUS.CLOSED;
    this.emit('close', { closeCode: code, reason: reason });
  }

};