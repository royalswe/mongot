'use strict';
var lobbyChat = io(location.host + '/lobby_com', {
    reconnection: true,
    reconnectionAttempts: Infinity,
    forceNew: true,
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
        title = "inactivated player";
      }
      else{
        if (points < 900)
            img += "crown0.png";
        else if(points >= 900 && points < 1300)
            img += "crown1.png";
        else if(points >= 1300 && points < 1500)
            img += "crown2.png";
        else if(points >= 1500 && points < 1700)
            img += "crown3.png";
        else if(points >= 1700 && points < 1900)
            img += "crown4.png";
        else if(points >= 1900 && points < 2100)
            img += "crown5.png";
        else if(points >= 2100 && points < 2300)
            img += "crown6.png";
        else if(points >= 2300 && points < 2500)
            img += "crown7.png";
        else if(points >= 2500 && points < 2700)
            img += "crown8.png";
        else if(points >= 2700 && points < 2900)
            img += "crown9.png";
        else
            img += "crown10.png";
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



lobbyChat.on('message', function (message) {
    var message = JSON.parse(message);

    var localDate = new Date(message.timeStamp);
    var timeStamp = localDate.getDate()+'/'
        + (localDate.getMonth()+1)+' '
        + ('0' + localDate.getHours()).slice(-2)+ ':'
        + ('0' + localDate.getMinutes()).slice(-2);

    var newMessage = '<div class="new-message ' +
        message.type + '">' +
        '<span class="chat-timeStamp">' + timeStamp + '</span> ' +
        '<span class="name">' + message.username + ':</span> ' +
        '<span class="chat-message">' + message.message + '</span> ';
    if(user.god){
        newMessage += '<span class="remove-message" id="'+ message.index +'">Remove</span>';
    }
    newMessage += '</div>';
    $('#messages').append(newMessage);
    // Scroll down chatt automaticly
    $('#messages').scrollTop($('#messages')[0].scrollHeight);
});

lobbyChat.on('render_messages', function (messages) {
    $('#messages').empty();
    for (var i = 0; i < messages.length; i++) {
        var localDate = new Date(messages[i].timeStamp);
        var timeStamp = localDate.getDate()+'/'
            + (localDate.getMonth()+1)+' '
            + ('0' + localDate.getHours()).slice(-2)+ ':'
            + ('0' + localDate.getMinutes()).slice(-2);

        var newMessage = '<div class="new-message ' +
            messages[i].type + '">' +
            '<span class="chat-timeStamp">' + timeStamp + '</span> ' +
            '<span class="name">' + messages[i].username + ':</span> ' +
            '<span class="chat-message">' + messages[i].message + '</span> ';
        if(user.god){
            newMessage += '<span class="remove-message" id="'+ i +'">Remove</span>';
        }
        newMessage += '</div>';
        $('#messages').append(newMessage);
    }

    $('#messages').scrollTop($('#messages')[0].scrollHeight);
});

lobbyChat.on('serverMessage', function (message) {
    $('#messages').append('<div class="new-message server-message">' + message + '</div>');
});

lobbyChat.on('serverMessage', function (message) {
    $('#messages').append('<div class="new-message server-message">' + message + '</div>');
});

lobbyChat.emit('player_joined', {user:user});

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
            lobbyChat.send(JSON.stringify(data), user);
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
            lobbyChat.emit('remove_message', e.target.id, user);
        }
    });
});

