'use strict';
var chatCom = io(location.host + '/chat_com', {
    reconnection: true,
    reconnectionAttempts: Infinity,
    transports: ['websocket', 'polling']
});

chatCom.on('message', function (message) {
    var message = JSON.parse(message);
    var messages = document.getElementById('messages');
    messages.insertAdjacentHTML('beforeend', '<div class="' +
        message.type + '"><span class="name-'+message.color+'" >' +
        message.username + ':</span> ' +
        message.message + '</div>');
    chatNotifier();

    // Scroll down chatt automaticly
    messages.scrollTop = messages.scrollHeight;
});

chatCom.on('player_left', function (username) {
    document.getElementById('messages').insertAdjacentHTML('beforeend', '<div class="server-message">' + username + ' left the room</div>');
});

document.addEventListener('DOMContentLoaded', function () {
    var timeStamp = Date.now();

    document.getElementById('send').addEventListener('click', function (event) {
        event.preventDefault();
        if(timeStamp < Date.now()) {
            timeStamp = Date.now() + 1000;
            var message = document.getElementById('message').value;
            var cleanMessage = message.replace(/(<([^>]+)>)/ig,""); // remove scripts

            if (cleanMessage !== '') { // Prevent sending blank messages
                var data = {message: cleanMessage, type: 'userMessage'};
                chatCom.send(JSON.stringify(data));
                document.getElementById('message').value = '';
            }
        }
    });

    document.getElementById('message').addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
            document.getElementById('send').click();
        }
    });
    // show and hide toggle for chat
    document.querySelector('.slide-toggle').addEventListener('click', function () {
        var chatroom = document.getElementById('chatroom');
        var hidden = chatroom.classList.contains('hidden');
        chatroom.classList.toggle('hidden', !hidden);
        this.setAttribute('aria-expanded', String(hidden));

        this.classList.remove('chat-notifier-repeat');
    });

    if (window.matchMedia('(max-width: 480px)').matches) {
        document.getElementById('chatroom').classList.add('hidden');
        document.querySelector('.slide-toggle').setAttribute('aria-expanded', 'false');
        document.querySelector('.slide-toggle').classList.add('chat-notifier-repeat');
    }
});

function chatNotifier() {
    if (document.getElementById('chatroom').classList.contains('hidden')) {
        var toggle = document.querySelector('.slide-toggle');
        toggle.classList.add('chat-notifier');
        setTimeout(function () { // timeout is high to prevent spamming notifications
            toggle.classList.remove('chat-notifier');
        }, 3000);
    }
}