'use strict';
var chatCom = io(location.host + '/chat_com', {
    reconnection: true,
    reconnectionAttempts: Infinity,
    transports: ['websocket', 'polling']
});

chatCom.on('message', function (message) {
    var message = JSON.parse(message);
    $('#messages').append('<div class="' +
        message.type + '"><span class="name-'+message.color+'" >' +
        message.username + ':</span> ' +
        message.message + '</div>');
    chatNotifier();

    // Scroll down chatt automaticly
    $('#messages').scrollTop($('#messages')[0].scrollHeight);
});

chatCom.on('player_left', function (username) {
    $('#messages').append('<div class="server-message">' + username + ' left the room</div>'); 
});

$(function(){
    var timeStamp = Date.now();

    $('#send').click(function () {
        if(timeStamp < Date.now()) {
            timeStamp = Date.now() + 1000;
            var message = $('#message').val();
            var cleanMessage = message.replace(/(<([^>]+)>)/ig,""); // remove scripts

            if (cleanMessage !== '') { // Prevent sending blank messages
                var data = {message: cleanMessage, type: 'userMessage'};
                chatCom.send(JSON.stringify(data));
                $('#message').val('');
            }
        }
        return false;
    });

    $('#message').on('keypress', function (e) {
        if(e.keyCode === 13){
            $('#send').click();
        }
    });
    // show and hide toggle for chat
    $(".slide-toggle").click(function(){
        $("#chatroom").animate({
            width: "toggle"
        });

        $('.svg-container').toggleClass("big-map");
        $('.slide-toggle').toggleClass("slide-toggle-close");
        $(".slide-toggle").removeClass("chat-notifier-repeat");
        resizeImage();
    });

    if ($(window).width() < 480) {
        $("#chatroom").css("display","none");
        $("#chatroom").animate({
            width: "toggle"
        }, {
            complete: function() {
                $(".slide-toggle").addClass("chat-notifier-repeat");
            }
        });
        resizeImage();
    }

});

function chatNotifier() {
    if($('#chatroom').css('display') === 'none') {
        $(".slide-toggle").addClass("chat-notifier");
        setTimeout(function () { // timeout is high to prevent spamming notifications
            $(".slide-toggle").removeClass("chat-notifier");
        }, 3000);
    }
}