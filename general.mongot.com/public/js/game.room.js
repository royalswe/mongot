'use strict';
var gameInfra = io(location.host + '/game_infra', {
    reconnection: true,
    reconnectionAttempts: Infinity,
    auth: user === 'guest' ? {guestId: getGuestId()} : {},
    transports: ['websocket', 'polling']
});

/**
 * Regex to parse out the value between room= and & or to the end of the content.
 * This way we can send url to a friend as an invite
 * @type {string}
 */
var roomName = decodeURI((RegExp("room" + '=' + '(.+?)(&|$)').exec(location.search) || [, null])[1]);
function enterRoom() {
    gameInfra.emit("player_ready");
    gameInfra.emit('join_room', (roomName));
    gameInfra.emit('visitor', roomName);
}

if (roomName) {
    document.title = roomName;
    enterRoom();
}

// Socket.IO reconnects with a brand-new server socket, so identity and room must be sent again.
gameInfra.io.on('reconnect', function () {
    var disconnectPopup = document.querySelector('.disconnect-popup');
    if (disconnectPopup) { disconnectPopup.closest('.modal-overlay').remove(); }
    if (roomName) { enterRoom(); }
});

gameInfra.on('disconnect', function() {
    disconnectedSound.play();
    window.onbeforeunload = function () { }; // Dont prompt if user disconnect

    var element = '<div class="modal-overlay"><div class="disconnect-popup"><span class="close-popup">X</span>';
    element += "<h1>Disconnected &#x2639;</h1><p>You drop connection and cannot see any activity anymore! Reload this window or reopen it to rejoin the game again.</p>";
    element += "</div></div>";
    document.body.insertAdjacentHTML('beforeend', element);

    document.querySelector('.modal-overlay').style.display = 'block';
});

gameInfra.on('bot_takeover', function (msg) {
    var reason = msg.reason === 'surrender' ? 'surrendered' : 'did not return';
    document.getElementById('messages').insertAdjacentHTML('beforeend', '<div class="server-message">' + msg.username + ' ' + reason + '. A bot now controls that faction.</div>');
});

// Guests and unverified accounts can play, but their matches are unranked.
// The server decides who you are; this starts from the page and is corrected by its 'identity' message.
var identityKind = user === 'guest' ? 'guest' : (user.active ? 'verified' : 'unverified');

function rankNotice() {
    if (identityKind === 'guest') {
        return '<strong>Playing as a guest.</strong> Your games are unranked. <a href="https://mongot.com/login" target="_blank" rel="noopener">Log in</a> to earn rank.';
    }
    if (identityKind === 'unverified') {
        return '<strong>Email not verified.</strong> Your games are unranked. <a href="https://mongot.com/sendVerificationToken" target="_blank" rel="noopener">Send a new verification link</a> to earn rank.';
    }
    return '<strong>Ranked play.</strong> Your rating changes with the result when every player at the table is verified.';
}

var mission;
var phase = 'Waiting for players';
var phaseMessage;
var activePlayer;
var playerEnabled;
var gameUsername = user === 'guest' ? null : user.username;
var canRematch = false;

var disconnectedSound = new Howl({src: ['sounds/disconnected.mp3']});
var yourTurnSound = new Howl({src: ['sounds/notify-turn.mp3']});
var gameOverSound = new Howl({src: ['sounds/game-over.mp3'], volume: 0.5});
var joinGameSound = new Howl({src: ['sounds/player-joined.mp3'], volume: 0.5});


gameInfra.on('message', function (msg) {
    switch (msg.type) {
        case "serverMessage":
            document.getElementById('messages').insertAdjacentHTML('beforeend', '<div class="server-message">' + msg.message + '</div>');
            break;
        case "phase":
            phase = msg.message;
            phaseMessage = msg.phaseMsg

                if (!document.querySelector('.show-mission, .show-gold')) { // Dont change game information if user watching gold
                    document.querySelector('.phase-message').innerHTML = '<div class="show-phase">Phase: ' + phase + '</div>';
                    document.querySelector('.phase-info').innerHTML = phaseMessage;
            }
            var image = document.getElementById('phase_img');
            var phaseIcon = {
                'Everyone deploy': 'everyone-deploy',
                'Deploy': 'deploy',
                'Battle': 'battle',
                'Tactical move': 'tactical-move',
                'Game over': 'game-over'
            }[phase] || 'waiting';
            image.style.opacity = '0';
            setTimeout(function () {
                image.src = '/img/game/icons/' + phaseIcon + '.svg';
                image.style.opacity = '1';
            }, 50);
            document.querySelectorAll('.remove_unit_bar').forEach(function (bar) { bar.remove(); }); // if player didn't fulfill the attack or movement
            drawMap();
            break;
        case "identity":
            gameUsername = msg.username;
            identityKind = msg.isGuest ? 'guest' : (msg.isUnverified ? 'unverified' : 'verified');
            break;
        case "attack":
            if (document.querySelector('.show-phase')) {
                document.querySelector('.phase-info').innerHTML = msg.message;
            }
            break;
        case "current_player":
            showActivePlayer(msg);
            break;
        case "enable_player": // makes it possible for user to interact with the game
            playerEnabled = msg.bool;
            if(phase !== 'Game over'){ yourTurnSound.play(); } // Notify player turn
            break;
        case "update_gold":
            document.querySelector('.user-gold').innerHTML = '<span>Gold: </span>' + msg.gold;
            break;
        case "update_gold_income":
            document.querySelector('.user-goldIncome').innerHTML = '<span>Income: </span>' + msg.goldIncome;
            break;
        case "start_game":
            clearInterval(countInterval); // if countdown is active then disable it
            document.getElementById('start_bots').style.display = 'none';
            canRematch = true;
            window.onbeforeunload = function () { return "Dude, are you sure you want to leave?"; }
            yourTurnSound.play(); // Notify player turn
            mission = msg.mission;
            break;
        case "player_rejoin":
            canRematch = true;
            window.onbeforeunload = function () { return "Dude, are you sure you want to leave?"; }
            joinGameSound.play(); // Notify player turn
            mission = msg.mission;
            break;
        case "room_settings":
            var tableIsWaiting = msg.status === 'open' || msg.status === 'waiting for players';
            document.getElementById('start_bots').style.display = tableIsWaiting && msg.host === gameUsername && msg.allowBots ? '' : 'none';
            break;
        case "game_over":
            document.getElementById('messages').insertAdjacentHTML('beforeend', '<div class="server-message">' + msg.message + '</div>');
            window.onbeforeunload = function () { }; // Dont prompt if user leaves
            gameOverSound.play();
            if (canRematch && !document.getElementById('rematch-panel')) {
                document.querySelector('.svg-container').insertAdjacentHTML('beforeend', '<div id="rematch-panel"><div><strong>Match complete</strong><span id="rematch-status">Ready for another round?</span></div><button id="rematch-button" type="button">Rematch</button></div>');
            }
            break;
        default:
            console.log('SWITCH ERROR');
            break;
    }
});

gameInfra.on('rematch_status', function (status) {
    document.getElementById('rematch-status').textContent = 'Rematch ready: ' + status.votes + ' of ' + status.required;
    var hasVoted = status.voters.indexOf(gameUsername) !== -1;
    var rematchButton = document.getElementById('rematch-button');
    rematchButton.disabled = hasVoted;
    rematchButton.textContent = hasVoted ? 'Waiting' : 'Rematch';
});

gameInfra.on('rematch_started', function () {
    var rematchPanel = document.getElementById('rematch-panel');
    if (rematchPanel) { rematchPanel.remove(); }
    document.getElementById('messages').replaceChildren();
    canRematch = true;
    mission = null;
    phase = 'Waiting for players';
    document.querySelector('.phase-message').textContent = phase;
    document.querySelector('.phase-info').textContent = 'The next match is starting.';
});

gameInfra.on("start_countdown", function () {
    startTimer();
});

gameInfra.on("error", function (err) { // if there will be any errors then show it
    console.log(Date());
    console.log(phase);
    console.log(err);
});

var countInterval;
gameInfra.on("game_countdown", function (bool) {
    if(bool){
        document.querySelector('.phase-message').innerHTML = '<span style="color:#4bff00">Be ready!</span>';
        document.querySelector('.phase-info').innerHTML = '<span style="color:#4bff00">The game starts in <b style="margin: 0px; color: #ff0" id="start_countdown">5</b> seconds.</span>';
        var i = 4;

        countInterval = setInterval(function() {
            document.getElementById('start_countdown').textContent = i;
            if (i === 0) {
                clearInterval(countInterval);
                gameInfra.emit("countdown_finished", roomName);
            }
            i--;
        }, 1000);
    }
    else {
        document.querySelector('.phase-message').textContent = 'Oh no! player left the game';
        document.querySelector('.phase-info').textContent = 'The game will start as soon new players have joined.';
    }
});

gameInfra.on("clear_game_countdown", function () { // clear game countdown for everyone
    clearInterval(countInterval);
});

var countdown
function startTimer() {
    var display = document.querySelector('#countdown');
    var twoMinutes = 120;
    var timer = twoMinutes, minutes, seconds;
    clearInterval(countdown);
    countdown = setInterval(function () {
        minutes = parseInt(timer / 60, 10)
        seconds = parseInt(timer % 60, 10);

        minutes = minutes < 10 ? "0" + minutes : minutes;
        seconds = seconds < 10 ? "0" + seconds : seconds;

        display.textContent = minutes + ":" + seconds;

        if (--timer < 0) { clearInterval(countdown); }
    }, 1000);
}

function showActivePlayer(msg) {
    playerEnabled = msg.bool;
    activePlayer = msg.player;
    var circle = document.getElementById('user_color');
    var text = document.getElementById('username_turn');
    circle.setAttribute('fill', 'url(#radial_' + msg.color + ')');
    text.textContent = msg.username;
}

document.addEventListener('mouseover', function (event) {
    var marker = event.target.closest('.svg-content > g.territory-marker');
    if (marker) { marker.style.cursor = playerEnabled ? 'pointer' : 'default'; }
});

document.addEventListener('mousedown', function (event) {
    var marker = event.target.closest('.svg-content > g.territory-marker');
    if (!marker) { return; }
    if (playerEnabled) {
        var country = getCountry(marker.id);
        var click = marker.id;
        switch (phase) {
            case "Everyone deploy":
                if(Number.isInteger(Number(click)) && Number.isInteger(Number(country.owner))) {
                    gameInfra.emit("everyone_deploy", parseInt(click), country.owner);
                }
                break;
            case "Deploy":
                if(Number.isInteger(Number(click)) && Number.isInteger(Number(country.owner))) {
                    gameInfra.emit("deploy", parseInt(click), country.owner);
                }
                break;
            case "Battle":
                battle(click, marker);
                break;
            case "Tactical move":
                tacticalMove(click, marker);
                break;
            default:
                break;
        }
    }
    return;
});

function getCountry(country) {
    for (var i = 0; i < circles.length; i += 1) {
        if(circles[i].country.id === parseInt(country)){ return circles[i]; }
    }
}

gameInfra.on("list_of_players", function (playerList) {
    var playerListElement = document.getElementById('player_list');
    playerListElement.replaceChildren();

    Object.keys(playerList).forEach(function (key) {
        var value = playerList[key];
        var isUnranked = value.isGuest || value.isUnverified;
        var points = isUnranked ? 'Unranked' : value.points;

        var ipCounter = 0;
        for(var i = 0; i<playerList.length; i+=1){
            if(value.ip === playerList[i].ip){
                ipCounter += 1;
            }
        }

        if (value.isGuest) {
            var imgInfo = '<img src="img/users-icon.png" alt="guest" title="Guest (unranked)"/>';
        }
        else if (value.isUnverified) {
            imgInfo = '<img src="img/users-icon.png" alt="unverified player" title="Email not verified (unranked)"/>';
        }
        else if(ipCounter > 1){
            imgInfo = '<img src="img/ip-icon.png" alt="duplicate IP address" title="duplicate IP address"/>';
        }
        else {
            imgInfo = '<img src="img/users-icon.png" alt="normal user" title="normal user"/>';
        }
        if (value.isBot) {
            imgInfo = '<span class="bot-badge" title="Computer-controlled player">BOT</span>';
        }
        else if(MODS.indexOf(value.username) > -1){
            imgInfo = '<img src="img/moderator.png" alt="moderator" title="moderator"/>';
        }

        var rankImage = isUnranked ? '' : '<img src="img/rankings/' + rankIcon(points) + '"/>';
        var roomDiv = '<li class="player-name player-color-' + value.color + '">'+ imgInfo +'<span class="player-username">' + value.username + '</span>' +
            '<span class="player-points">' + points + rankImage + '</span></li>';
        playerListElement.insertAdjacentHTML('beforeend', roomDiv);
    });

    // The server decides this from everyone seated for the match, including players who have since left.
    var matchIsUnranked = playerList.length > 0 && playerList[0].matchRanked === false;
    var matchRank = document.getElementById('match_rank');
    matchRank.textContent = playerList.length === 0 ? '' : (matchIsUnranked ? 'Unranked match' : 'Ranked match');
    matchRank.classList.toggle('unranked', matchIsUnranked);
    matchRank.title = matchIsUnranked ? 'A guest or an unverified player is or was seated, so nobody\'s rating changes.' : 'Ratings change with the result.';
});

// choose color
gameInfra.on("choose_color", function (usedColors, colors, roomSettings) {
    document.querySelectorAll('.popup').forEach(function (popup) { popup.remove(); });

    var popup = '<div class="modal-overlay"></div><div class="popup">'+
        '  <span class="close-popup" aria-label="Close">X</span>' +
        '  <div class="pophead">Choose your side</div>'+
        '  <p class="rank-notice' + (identityKind === 'verified' ? '' : ' unranked') + '">' + rankNotice() + '</p>'+
        (roomSettings.isHost ? '<div class="host-settings"><label for="map_choice">Map</label><select id="map_choice"></select>'+
            '<label class="bot-choice"><input id="allow_bots" type="checkbox" ' + (roomSettings.allowBots ? 'checked' : '') + '> Allow bot opponents</label></div>' :
            '<p class="room-map-choice">Map: <strong class="room-map-name"></strong>' + (roomSettings.allowBots ? ' · Bots allowed' : ' · Human players only') + '</p>')+
        '  <div class="color-prompt">Choose a color</div>'+
        '  <div class="popbody">'+
        '    <ul>';
    for (var i = 0; i < colors.length; i += 1) {
        popup +='<div class="player-check">'+
            ' <input id="'+ colors[i] +'_player" type="checkbox"/>'+
            ' <label id="'+ colors[i] +'" for="'+ colors[i] +'_player"></label>'+
            ' </div>';
    }
        popup += '</ul></div></div>';

    document.querySelector('.svg-container').insertAdjacentHTML('beforebegin', popup);
    document.querySelector('.modal-overlay').style.display = 'block';

    usedColors.forEach(function (value) {
        var usedColor = document.getElementById(value.color);
        if (usedColor) { usedColor.remove(); }
    });
    if (roomSettings.isHost) {
        roomSettings.maps.forEach(function (map) {
            var option = document.createElement('option');
            option.value = map.id;
            option.textContent = map.name;
            document.getElementById('map_choice').appendChild(option);
        });
        document.getElementById('map_choice').value = roomSettings.mapId;
    }
    else {
        document.querySelector('.room-map-name').textContent = (roomSettings.maps.find(function(map) { return map.id === roomSettings.mapId; }) || {}).name || 'Original Map';
    }
});
// if player choosed color remove it
gameInfra.on("remove_color_popup", function (usedColors) {
    usedColors.forEach(function (value) {
        var usedColor = document.getElementById(value.color);
        if (usedColor) { usedColor.remove(); }
    });
    joinGameSound.play();
});
// remove box when game starts for everyone
gameInfra.on("remove_color_popup_box", function () {
    document.querySelectorAll('.popup').forEach(function (popup) { popup.remove(); });
    document.querySelectorAll('.modal-overlay').forEach(function (overlay) { overlay.style.display = 'none'; });
});
// Show withdrawing gold effect
gameInfra.on("withdraw_gold_effect", function (gold) {
    var fadingNumber = '<span class="user-gold-withdraw">-' + gold + '</span>';
    document.querySelector('.user-gold').insertAdjacentHTML('beforeend', fadingNumber);
});

gameInfra.on("display_flag", function () {
    document.querySelector('.surrender-flag').style.display = 'block';
});

document.getElementById('next_turn').addEventListener('click', function () {
        gameInfra.emit("next_turn");
    });

document.getElementById('start_bots').addEventListener('click', function () {
        gameInfra.emit('start_with_bots', roomName);
        this.disabled = true;
        this.textContent = 'Starting';
    });

document.getElementById('game_board').addEventListener('click', function (event) {
    if (event.target.closest('#rematch-button')) {
        gameInfra.emit('rematch', roomName);
        event.target.closest('#rematch-button').disabled = true;
        event.target.closest('#rematch-button').textContent = 'Waiting';
    }

    if (event.target.closest('label')) {
        var label = event.target.closest('label');
        if (label.parentElement.classList.contains('player-check')) { // check if label has correct parent
            var mapSettings = {
                mapId: (document.getElementById('map_choice') || {}).value || (mapData && mapData.id) || 'original',
                allowBots: Boolean(document.getElementById('allow_bots') && document.getElementById('allow_bots').checked)
            };
            gameInfra.emit("join_game", roomName, label.id, mapSettings);
            document.querySelectorAll('.popup').forEach(function (popup) { popup.remove(); });
            document.querySelectorAll('.modal-overlay').forEach(function (overlay) { overlay.style.display = 'none'; });
        }
    }
});

document.getElementById('mission').addEventListener('click', function () {
        document.querySelectorAll('button.clicked-btn').forEach(function (button) { button.classList.remove('clicked-btn'); });
        if (document.querySelector('.show-mission')) {
            document.querySelector('.phase-message').innerHTML = '<div class="show-phase">Phase: ' + phase + '</div>';
            document.querySelector('.phase-info').innerHTML = phaseMessage;
        }
        else {
            document.querySelector('.phase-message').innerHTML = '<div class=show-mission>Game mission:</div>';
            this.classList.add('clicked-btn');
            if(mission != null){
                document.querySelector('.phase-info').innerHTML = mission.message;
            }
            else {
                document.querySelector('.phase-info').textContent = 'Mission will be generated when the game begins.';
            }
            drawMap();
        }
    });

document.querySelector('.dice-log').addEventListener('click', function () {
        window.open("/dicelog?room=log-"+ roomName, "_blank", "width=220,height=575");
    });

document.querySelector('.surrender-flag').addEventListener('click', function () {
        var confirmSurrender = confirm('Do you really want to surrender and lose this game?');
        if(confirmSurrender){
            gameInfra.emit("surrender");
            this.remove();
        }

    });

document.body.addEventListener('click', function (event) {
    if (event.target.closest('.close-popup')) {
        document.querySelectorAll('.disconnect-popup, .popup').forEach(function (popup) { popup.remove(); });
        document.querySelectorAll('.modal-overlay').forEach(function (overlay) { overlay.style.display = 'none'; });
    }
    });