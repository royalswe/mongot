'use strict';
var lobbyChat = io(location.host + '/lobby_com', {
    reconnection: true,
    reconnectionAttempts: Infinity,
    forceNew: true,
    auth: user === 'guest' ? {guestId: getGuestId()} : {},
    transports: ['websocket', 'polling']
});

lobbyChat.on('users_online', function (users, guests) {
    var onlineList = document.getElementById("users_online");
    onlineList.innerHTML = '<p id="user_online_list">'+ users.length +' Player'+ (users.length === 1 ? "":"s") +' and '+ guests +' guest'+ (guests === 1 ? "":"s") +' in lobby</p>';
      
    document.title = "Lobby (" + users.length + ")";
    
    for (var i = 0; i < users.length; i++) {
      var points = users[i].points;
      var img = "rankings/";
      var title = points + " points";
      if (MODS.indexOf(users[i].username) > -1) {
        img += "moderator.png";
        title = "moderator";
      }
      else if(users[i].activated === false) {
        img += "guest.png";
        title = "email not verified (unranked)";
      }
      else{
        img += rankIcon(points);
      }

      if(points === null) {
        onlineList.innerHTML += '<p><img src="img/' + img + '" title="'+ title +'" alt="'+ title +'"/>' + users[i].username + "</p>";
      }
      else{
        onlineList.innerHTML += '<a href="https://mongot.com/user/'+ users[i].username +'"><img src="img/' + img + '" title="'+ title +'" alt="'+ title +'"/>' + users[i].username + "</a>";
      }
    }
});

function toggleNotificationPermissions(input) {
    if (!("Notification" in window)) {
        return alert("Sorry but your browser does not support desktop notification");
    }
    else if (Notification.permission === 'granted') {
        localStorage.setItem('notification-permissions', input.checked ? 'granted' : 'denied');
    }
    else if (Notification.permission === 'denied') {
        localStorage.setItem('notification-permissions', 'denied');
        input.checked = false;
    }
    else if (Notification.permission === 'default') {
        Notification.requestPermission(function(choice) {
            if (choice === 'granted') {
                localStorage.setItem('notification-permissions', input.checked ? 'granted' : 'denied');
            } else {
                localStorage.setItem('notification-permissions', 'denied');
                input.checked = false;
            }
        });
    }
}

if (("Notification" in window) && getNotificationPermissions() === 'granted') { // check checkbox if notification is granted
    $('#toggle_notification').prop('checked', true);
}

function getNotificationPermissions() {
    if (Notification.permission === 'granted') {
        return localStorage.getItem('notification-permissions');
    } else {
        return Notification.permission;
    }
}

function escapeHtml(value) {
    return $('<div>').text(String(value == null ? '' : value)).html();
}


function chatMessageHtml(message, removeId) {
    var date = new Date(message.timeStamp);
    var timeStamp = date.getDate() + '/' + (date.getMonth() + 1) + ' ' +
        ('0' + date.getHours()).slice(-2) + ':' + ('0' + date.getMinutes()).slice(-2);
    var html = '<div class="new-message ' + message.type + '">' +
        '<span class="chat-timeStamp">' + timeStamp + '</span> ' +
        '<span class="name">' + escapeHtml(message.username) + ':</span> ' +
        '<span class="chat-message">' + escapeHtml(message.message) + '</span> ';
    if (user.god) {
        html += '<span class="remove-message" id="' + removeId + '">Remove</span>';
    }
    return html + '</div>';
}

function scrollChatToBottom() {
    $('#messages').scrollTop($('#messages')[0].scrollHeight);
}

lobbyChat.on('message', function (json) {
    var message = JSON.parse(json);
    $('#messages').append(chatMessageHtml(message, message.index));
    scrollChatToBottom();
});

lobbyChat.on('render_messages', function (messages) {
    $('#messages').html(messages.map(chatMessageHtml).join(''));
    scrollChatToBottom();
});

lobbyChat.emit('player_joined');

var timeStamp = Date.now();
$('#send').click(function () {
    //Dont allow guest to chat
    // if(user === 'guest'){
    //     return $('#messages').append('<div class="new-message">' +
    //         '<span class="chat-message"><a href="/login">Login</a> to use the chat</span>' +
    //         '</div>');
    // }
    var message = $('#message').val();
    
    if(message.length > 400){
        return $('#messages').append('<div class="new-message">' +
            '<span class="chat-message">Your text is too long</span>' +
            '</div>');
    }

    String.prototype.repeat = function(num){
        return new Array(num + 1).join(this);
    };

    // iterate over all words
    for(var i=0; i<WORDFILTER.length; i+= 1){
        // Create a regular expression and make it global
        var pattern = new RegExp('\\b' + WORDFILTER[i] + '\\b', 'i');
        // Create a new string filled with '*'
        var replacement = '*'.repeat(WORDFILTER[i].length);
        message = message.replace(pattern, replacement);
    }
    var cleanMessage = message.replace(/(<([^>]+)>)/ig,""); // remove scripts

    if(cleanMessage !== ''){ // Prevent sending blank messages
        if(timeStamp < Date.now()){
            timeStamp = Date.now()+2000;
            var data = { message: cleanMessage, type: 'userMessage' };
            lobbyChat.send(JSON.stringify(data));
            $('#message').val('');
        }
        else{
            $('#messages').append('<div class="new-message">' +
                '<span class="chat-message">You are writing to fast</span>' +
                '</div>');
        }
    }
    false;
});

$('#message').on('keypress', function (e) {
    if(e.keyCode === 13){
        $('#send').click();
    }
});

$(function(){
    var PlayerArrivedSound = new Howl({src: ['sounds/join-lobby.mp3']});

    var arrivedTimestamp = Date.now();
    lobbyChat.on('user_notification', function (data) {
        if (getNotificationPermissions() === 'granted' && arrivedTimestamp < Date.now()) {
            arrivedTimestamp = Date.now()+60000;
            spawnNotification('img/users-icon.png', data);
        }
    });

    function spawnNotification(theIcon, theTitle) {
        var options = {
            icon: theIcon,
        }
        var n = new Notification(theTitle, options);
        PlayerArrivedSound.play();
        setTimeout(n.close.bind(n), 3000);
    }

    $('#messages').on('click', '.remove-message', function (e) {
        var removeMsg = confirm('Do you want to remove this message?');
        if(removeMsg){
            lobbyChat.emit('remove_message', parseInt(e.target.id, 10));
        }
    });
});

