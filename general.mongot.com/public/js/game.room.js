'use strict';
window.gameInfra = io(location.host + '/game_infra', {
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
window.roomName = decodeURI((RegExp("room" + '=' + '(.+?)(&|$)').exec(location.search) || [, null])[1]);
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
    const disconnectPopup = document.querySelector('.disconnect-popup');
    if (disconnectPopup) { disconnectPopup.closest('.modal-overlay').remove(); }
    if (roomName) { enterRoom(); }
});

gameInfra.on('disconnect', function() {
    disconnectedSound.play();
    window.onbeforeunload = function () { }; // Dont prompt if user disconnect

    let element = '<div class="modal-overlay"><div class="disconnect-popup"><span class="close-popup">X</span>';
    element += "<h1>Disconnected &#x2639;</h1><p>You drop connection and cannot see any activity anymore! Reload this window or reopen it to rejoin the game again.</p>";
    element += "</div></div>";
    document.body.insertAdjacentHTML('beforeend', element);

    document.querySelector('.modal-overlay').style.display = 'block';
});

gameInfra.on('bot_takeover', function (msg) {
    const reason = msg.reason === 'surrender' ? 'surrendered' : 'did not return';
    document.getElementById('messages').insertAdjacentHTML('beforeend', '<div class="server-message">' + msg.username + ' ' + reason + '. A bot now controls that faction.</div>');
});

// Guests and unverified accounts can play, but their matches are unranked.
// The server decides who you are; this starts from the page and is corrected by its 'identity' message.
window.identityKind = user === 'guest' ? 'guest' : (user.active ? 'verified' : 'unverified');

function rankNotice() {
    if (identityKind === 'guest') {
        return '<strong>Playing as a guest.</strong> Your games are unranked. <a href="https://mongot.com/login" target="_blank" rel="noopener">Log in</a> to earn rank.';
    }
    if (identityKind === 'unverified') {
        return '<strong>Email not verified.</strong> Your games are unranked. <a href="https://mongot.com/sendVerificationToken" target="_blank" rel="noopener">Send a new verification link</a> to earn rank.';
    }
    return '<strong>Ranked play.</strong> Your rating changes with the result when every player at the table is verified.';
}

window.mission = undefined;
window.phase = 'Waiting for players';
window.phaseMessage = undefined;
window.activePlayer = undefined;
window.playerEnabled = undefined;
window.gameUsername = user === 'guest' ? null : user.username;
window.canRematch = false;
window.GAME_SOUND_MUTED_KEY = 'general_game_room_sound_muted';
window.gameSoundsMuted = false;
try {
    gameSoundsMuted = localStorage.getItem(GAME_SOUND_MUTED_KEY) === 'true';
}
catch (error) { }
Howler.mute(gameSoundsMuted);

window.disconnectedSound = new Howl({src: ['sounds/disconnected.mp3']});
window.yourTurnSound = new Howl({src: ['sounds/notify-turn.mp3']});
window.gameOverSound = new Howl({src: ['sounds/game-over.mp3'], volume: 0.5});
window.joinGameSound = new Howl({src: ['sounds/player-joined.mp3'], volume: 0.5});

function updateGameSoundToggle() {
    const soundToggle = document.getElementById('toggle_game_sound');
    const soundIcon = document.getElementById('game_sound_icon');
    soundIcon.setAttribute('href', '/img/game/icons/options.sprite.svg?v=1#' + (gameSoundsMuted ? 'sound-off' : 'sound-on'));
    soundToggle.setAttribute('aria-pressed', String(gameSoundsMuted));
    soundToggle.setAttribute('aria-label', (gameSoundsMuted ? 'Unmute' : 'Mute') + ' game sounds');
    soundToggle.title = (gameSoundsMuted ? 'Unmute' : 'Mute') + ' game sounds';
}

const mapControlsToggle = document.getElementById('toggle_map_controls');
let mapControlsHidden = false;
try { mapControlsHidden = localStorage.getItem('general_map_controls_hidden') === 'true'; }
catch (error) {}

function updateMapControlsToggle() {
    document.querySelector('.svg-container').classList.toggle('map-controls-hidden', mapControlsHidden);
    document.querySelectorAll('.svg-container > .game-action-button:not(#toggle_map_controls)').forEach(function (button) {
        button.inert = mapControlsHidden;
    });
    const label = (mapControlsHidden ? 'Show' : 'Hide') + ' map controls';
    mapControlsToggle.setAttribute('aria-expanded', String(!mapControlsHidden));
    mapControlsToggle.setAttribute('aria-label', label);
    mapControlsToggle.title = label;
    mapControlsToggle.querySelector('use').setAttribute('href', '/img/game/icons/options.sprite.svg?v=4#controls-' + (mapControlsHidden ? 'expand' : 'collapse'));
}

mapControlsToggle.addEventListener('click', function () {
    mapControlsHidden = !mapControlsHidden;
    try { localStorage.setItem('general_map_controls_hidden', String(mapControlsHidden)); }
    catch (error) {}
    updateMapControlsToggle();
});
updateMapControlsToggle();

function territoryLabel(id) {
    const territory = mapData && mapData.countries[Number(id)];
    return territory && territory.name ? territory.name : 'Territory ' + (Number(id) + 1);
}

function actionDescription(action) {
    if (action.type === 'deploy') { return 'reinforced ' + territoryLabel(action.country) + ' (+' + action.units + ')'; }
    if (action.type === 'move') { return 'moved ' + action.units + ' from ' + territoryLabel(action.from) + ' to ' + territoryLabel(action.to); }
    if (action.type === 'attack') {
        return 'attacked ' + territoryLabel(action.to) + ' from ' + territoryLabel(action.from) +
            ' with ' + action.units + '; losses ' + action.attackerLost + '/' + action.defenderLost +
            (action.captured ? '; captured territory' : '');
    }
    return '';
}

function scrollGameActionsToLatest() {
    if (!document.getElementById('activity_autoscroll').checked) { return; }
    const list = document.getElementById('game_actions');
    list.scrollTop = list.scrollHeight;
}

document.getElementById('activity_autoscroll').addEventListener('change', scrollGameActionsToLatest);

function appendGameAction(action) {
    const list = document.getElementById('game_actions');
    const description = actionDescription(action);
    if (!description) { return; }
    const emptyMessage = list.querySelector('.activity-empty');
    if (emptyMessage) { emptyMessage.remove(); }

    const entry = document.createElement('li');
    entry.className = 'activity-entry';
    if (typeof getPlayerColorHex === 'function') {
        entry.style.setProperty('--action-color', getPlayerColorHex(action.color));
    }
    const actionButton = document.createElement('button');
    actionButton.type = 'button';
    actionButton.className = 'activity-entry-button';
    actionButton.setAttribute('aria-label', 'Highlight ' + (action.player || 'Player') + ': ' + description);
    const player = document.createElement('strong');
    player.textContent = action.player || 'Player';
    const details = document.createElement('span');
    details.textContent = description;
    actionButton.appendChild(player);
    actionButton.appendChild(details);
    actionButton.addEventListener('click', function () { highlightHistoryAction(action); });
    entry.appendChild(actionButton);
    list.appendChild(entry);
    while (list.children.length > 40) { list.firstElementChild.remove(); }
    scrollGameActionsToLatest();
}

function setGameActionHistory(actions) {
    const list = document.getElementById('game_actions');
    list.replaceChildren();
    if (!actions || !actions.length) {
        const emptyMessage = document.createElement('li');
        emptyMessage.className = 'activity-empty';
        emptyMessage.textContent = 'No actions recorded yet';
        list.appendChild(emptyMessage);
        return;
    }
    actions.forEach(appendGameAction);
}

window.chatTab = document.getElementById('show_chat');
window.activityTab = document.getElementById('show_activity');
window.chatPanel = document.getElementById('chat-panel');
window.activityPanel = document.getElementById('activity-panel');
function selectSidebarTab(selectedTab, moveFocus) {
    const showActivity = selectedTab === activityTab;
    chatTab.setAttribute('aria-selected', String(!showActivity));
    chatTab.tabIndex = showActivity ? -1 : 0;
    activityTab.setAttribute('aria-selected', String(showActivity));
    activityTab.tabIndex = showActivity ? 0 : -1;
    chatPanel.classList.toggle('is-active', !showActivity);
    activityPanel.classList.toggle('is-active', showActivity);
    chatPanel.hidden = showActivity;
    activityPanel.hidden = !showActivity;
    activityPanel.setAttribute('aria-hidden', String(!showActivity));
    if (showActivity) { scrollGameActionsToLatest(); }
    if (moveFocus) { selectedTab.focus(); }
}
chatTab.addEventListener('click', function () {
    selectSidebarTab(chatTab, false);
});
activityTab.addEventListener('click', function () {
    selectSidebarTab(activityTab, false);
});
document.querySelector('.sidebar-tabs').addEventListener('keydown', function (event) {
    const tabs = [chatTab, activityTab];
    const selectedIndex = tabs.indexOf(document.activeElement);
    if (selectedIndex < 0) { return; }
    const nextIndex = event.key === 'ArrowRight' ? (selectedIndex + 1) % tabs.length :
        event.key === 'ArrowLeft' ? (selectedIndex + tabs.length - 1) % tabs.length :
        event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : selectedIndex;
    if (nextIndex !== selectedIndex) {
        event.preventDefault();
        selectSidebarTab(tabs[nextIndex], true);
    }
});
selectSidebarTab(chatTab, false);
gameInfra.on('action_history', setGameActionHistory);
gameInfra.on('action_log', appendGameAction);

document.getElementById('toggle_game_sound').addEventListener('click', function () {
    gameSoundsMuted = !gameSoundsMuted;
    Howler.mute(gameSoundsMuted);
    try {
        localStorage.setItem(GAME_SOUND_MUTED_KEY, String(gameSoundsMuted));
    }
    catch (error) { }
    updateGameSoundToggle();
});
updateGameSoundToggle();


gameInfra.on('message', function (msg) {
    switch (msg.type) {
        case "serverMessage":
            document.getElementById('messages').insertAdjacentHTML('beforeend', '<div class="server-message">' + msg.message + '</div>');
            break;
        case "phase":
            phase = msg.message;
            phaseMessage = msg.phaseMsg
            if (typeof clearActionSelection === 'function') {
                clearActionSelection();
            }

                if (!document.querySelector('.show-mission, .show-gold')) { // Dont change game information if user watching gold
                    document.querySelector('.phase-message').innerHTML = '<div class="show-phase">Phase: ' + phase + '</div>';
                    document.querySelector('.phase-info').innerHTML = phaseMessage;
            }
            const image = document.getElementById('phase_img');
            const phaseIcon = {
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
            if (typeof updateTerritoryActionState === 'function') { updateTerritoryActionState(); }
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
            const tableIsWaiting = msg.status === 'open' || msg.status === 'waiting for players';
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
    const hasVoted = status.voters.indexOf(gameUsername) !== -1;
    const rematchButton = document.getElementById('rematch-button');
    rematchButton.disabled = hasVoted;
    rematchButton.textContent = hasVoted ? 'Waiting' : 'Rematch';
});

gameInfra.on('rematch_started', function () {
    const rematchPanel = document.getElementById('rematch-panel');
    if (rematchPanel) { rematchPanel.remove(); }
    document.getElementById('messages').replaceChildren();
    canRematch = true;
    mission = null;
    setGameActionHistory([]);
    phase = 'Waiting for players';
    document.querySelector('.phase-message').textContent = phase;
    document.querySelector('.phase-info').textContent = 'The next match is starting.';
});

gameInfra.on("start_countdown", function (timerInfo) {
    startTimer(timerInfo);
});

gameInfra.on("error", function (err) { // if there will be any errors then show it
    console.log(Date());
    console.log(phase);
    console.log(err);
});

window.countInterval = undefined;
gameInfra.on("game_countdown", function (bool) {
    if(bool){
        document.querySelector('.phase-message').innerHTML = '<span style="color:#4bff00">Be ready!</span>';
        document.querySelector('.phase-info').innerHTML = '<span style="color:#4bff00">The game starts in <b style="margin: 0px; color: #ff0" id="start_countdown">5</b> seconds.</span>';
        let i = 4;

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

window.countdown = undefined;
function startTimer(timerInfo) {
    const display = document.querySelector('#countdown');
    clearInterval(countdown);
    if (!timerInfo || timerInfo.deadline === null || timerInfo.deadline === undefined) {
        display.textContent = '';
        return;
    }
    const localDeadline = Date.now() + Math.max(0, timerInfo.deadline - timerInfo.serverTime);
    const renderCountdown = function () {
        const remaining = Math.max(0, Math.ceil((localDeadline - Date.now()) / 1000));
        const minutes = String(Math.floor(remaining / 60)).padStart(2, '0');
        const seconds = String(remaining % 60).padStart(2, '0');
        display.textContent = minutes + ':' + seconds;
        if (remaining === 0) { clearInterval(countdown); }
    };
    renderCountdown();
    countdown = setInterval(renderCountdown, 1000);
}

function showActivePlayer(msg) {
    playerEnabled = msg.bool;
    if (typeof updateTerritoryActionState === 'function') { updateTerritoryActionState(); }
    activePlayer = msg.player;
    const circle = document.getElementById('user_color');
    const text = document.getElementById('username_turn');
    circle.setAttribute('fill', 'url(#radial_' + msg.color + ')');
    text.textContent = msg.username;
}

document.addEventListener('mouseover', function (event) {
    const marker = event.target.closest('.svg-content > g.territory-marker');
    if (marker) { marker.style.cursor = playerEnabled ? 'pointer' : 'default'; }
});

function activateCountryMarker(marker, keyboardActivation) {
    if (!playerEnabled) { return; }
    const country = getCountry(marker.id);
    const click = marker.id;
    switch (phase) {
        case "Everyone deploy":
            if(Number.isInteger(Number(click)) && country && Number.isInteger(Number(country.owner))) {
                gameInfra.emit("everyone_deploy", parseInt(click), country.owner);
            }
            break;
        case "Deploy":
            if(Number.isInteger(Number(click)) && country && Number.isInteger(Number(country.owner))) {
                gameInfra.emit("deploy", parseInt(click), country.owner);
            }
            break;
        case "Battle":
            battle(click, marker, keyboardActivation);
            break;
        case "Tactical move":
            tacticalMove(click, marker, keyboardActivation);
            break;
        default:
            break;
    }
}

document.addEventListener('mousedown', function (event) {
    const marker = event.target.closest('.svg-content > g.territory-marker');
    if (marker) { activateCountryMarker(marker, false); }
});

function getCountry(country) {
    for (let i = 0; i < circles.length; i += 1) {
        if(circles[i].country.id === parseInt(country)){ return circles[i]; }
    }
}

gameInfra.on("list_of_players", function (playerList) {
    const playerListElement = document.getElementById('player_list');
    playerListElement.replaceChildren();

    Object.keys(playerList).forEach(function (key) {
        const value = playerList[key];
        const isUnranked = value.isGuest || value.isUnverified;
        const points = isUnranked ? 'Unranked' : value.points;

        let ipCounter = 0;
        for(let i = 0; i<playerList.length; i+=1){
            if(value.ip === playerList[i].ip){
                ipCounter += 1;
            }
        }

        let imgInfo;
        if (value.isGuest) {
            imgInfo = '<img src="img/users-icon.png" alt="guest" title="Guest (unranked)"/>';
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

        const rankImage = isUnranked ? '' : '<img src="img/rankings/' + rankIcon(points) + '"/>';
        const roomDiv = '<li class="player-name player-color-' + value.color + '">'+ imgInfo +'<span class="player-username">' + value.username + '</span>' +
            '<span class="player-points">' + points + rankImage + '</span></li>';
        playerListElement.insertAdjacentHTML('beforeend', roomDiv);
    });

    // The server decides this from everyone seated for the match, including players who have since left.
    const matchIsUnranked = playerList.length > 0 && playerList[0].matchRanked === false;
    const matchRank = document.getElementById('match_rank');
    matchRank.textContent = playerList.length === 0 ? '' : (matchIsUnranked ? 'Unranked match' : 'Ranked match');
    matchRank.classList.toggle('unranked', matchIsUnranked);
    matchRank.title = matchIsUnranked ? 'A guest or an unverified player is or was seated, so nobody\'s rating changes.' : 'Ratings change with the result.';
});

// choose color
gameInfra.on("choose_color", function (usedColors, colors, roomSettings) {
    document.querySelectorAll('.popup').forEach(function (popup) { popup.remove(); });

    let popup = '<div class="modal-overlay" aria-hidden="true"></div><div class="popup" role="dialog" aria-modal="true" aria-labelledby="choose-side-heading" tabindex="-1">'+
        '  <button type="button" class="close-popup" aria-label="Close color selection">X</button>' +
        '  <div class="pophead" id="choose-side-heading">Choose your side</div>'+
        '  <p class="rank-notice' + (identityKind === 'verified' ? '' : ' unranked') + '">' + rankNotice() + '</p>'+
        (roomSettings.isHost ? '<div class="host-settings"><label for="map_choice">Map</label><select id="map_choice"></select>'+
            '<label class="bot-choice"><input id="allow_bots" type="checkbox" ' + (roomSettings.allowBots ? 'checked' : '') + '> Allow bot opponents</label></div>' :
            '<p class="room-map-choice">Map: <strong class="room-map-name"></strong>' + (roomSettings.allowBots ? ' · Bots allowed' : ' · Human players only') + '</p>')+
        '  <div class="color-prompt">Choose a color</div>'+
        '  <div class="popbody">'+
        '    <ul>';
    for (const color of colors) {
        popup +='<div class="player-check">'+
            ' <input id="'+ color +'_player" type="checkbox" tabindex="-1"/>'+
            ' <label id="'+ color +'" for="'+ color +'_player" role="button" tabindex="0" aria-label="Join as '+ color +'" aria-keyshortcuts="Enter Space"></label>'+
            ' </div>';
    }
        popup += '</ul></div></div>';

    document.querySelector('.svg-container').insertAdjacentHTML('beforebegin', popup);
    document.querySelector('.modal-overlay').style.display = 'block';

    usedColors.forEach(function (value) {
        const usedColor = document.getElementById(value.color);
        if (usedColor) { usedColor.remove(); }
    });
    if (roomSettings.isHost) {
        roomSettings.maps.forEach(function (map) {
            const option = document.createElement('option');
            option.value = map.id;
            option.textContent = map.name;
            document.getElementById('map_choice').appendChild(option);
        });
        const mapChoice = document.getElementById('map_choice');
        mapChoice.value = roomSettings.mapId;
        mapChoice.addEventListener('change', function () {
            gameInfra.emit('preview_map', roomName, mapChoice.value);
        });
    }
    else {
        document.querySelector('.room-map-name').textContent = (roomSettings.maps.find(function(map) { return map.id === roomSettings.mapId; }) || {}).name || 'Original Map';
    }

    const popupDialog = document.querySelector('.popup');
    const popupFocusable = function () {
        return Array.from(popupDialog.querySelectorAll('button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex="0"]'))
            .filter(function (element) { return getComputedStyle(element).visibility !== 'hidden' && element.getClientRects().length > 0; });
    };
    popupDialog.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') {
            event.preventDefault();
            popupDialog.querySelector('.close-popup').click();
            return;
        }
        if (event.key !== 'Tab') { return; }
        const focusable = popupFocusable();
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!first || !last) { event.preventDefault(); return; }
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        }
        else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    });
    const initialColor = popupDialog.querySelector('.player-check label[role="button"]');
    const firstFocusable = initialColor || popupFocusable()[0];
    if (firstFocusable) { firstFocusable.focus(); }
});
// if player choosed color remove it
gameInfra.on("remove_color_popup", function (usedColors) {
    usedColors.forEach(function (value) {
        const usedColor = document.getElementById(value.color);
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
    const fadingNumber = '<span class="user-gold-withdraw">-' + gold + '</span>';
    document.querySelector('.user-gold').insertAdjacentHTML('beforeend', fadingNumber);
});

gameInfra.on("display_flag", function () {
    document.querySelector('.surrender-flag').classList.add('is-visible');
});

document.getElementById('next_turn').addEventListener('click', function () {
        gameInfra.emit("next_turn");
    });

document.addEventListener('keydown', function (event) {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) { return; }
    if (event.target.closest && event.target.closest('input, textarea, select, [contenteditable="true"]')) { return; }
    if (document.querySelector('.popup')) { return; }

    const key = event.key.toLowerCase();
    if (key === 'n') {
        event.preventDefault();
        document.getElementById('next_turn').click();
    }
    else if (key === 'g') {
        event.preventDefault();
        document.getElementById('show_gold').click();
    }
    else if (key === 'm') {
        event.preventDefault();
        document.getElementById('mission').click();
    }
    else if (key === 'a') {
        event.preventDefault();
        selectSidebarTab(activityTab, false);
    }
    else if (event.key === '/') {
        event.preventDefault();
        if (activityPanel.classList.contains('is-active')) { selectSidebarTab(chatTab, false); }
        const chatroom = document.getElementById('chatroom');
        if (chatroom.classList.contains('hidden')) { document.querySelector('.slide-toggle').click(); }
        document.getElementById('message').focus();
    }
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
        const label = event.target.closest('label');
        if (label.parentElement.classList.contains('player-check')) { // check if label has correct parent
            const mapSettings = {
                mapId: (document.getElementById('map_choice') || {}).value || (mapData && mapData.id) || 'original',
                allowBots: Boolean(document.getElementById('allow_bots') && document.getElementById('allow_bots').checked)
            };
            gameInfra.emit("join_game", roomName, label.id, mapSettings);
            document.querySelectorAll('.popup').forEach(function (popup) { popup.remove(); });
            document.querySelectorAll('.modal-overlay').forEach(function (overlay) { overlay.style.display = 'none'; });
        }
    }
});

document.getElementById('game_board').addEventListener('keydown', function (event) {
    const colorChoice = event.target.closest('.player-check label[role="button"]');
    if (!colorChoice || (event.key !== 'Enter' && event.key !== ' ')) { return; }
    event.preventDefault();
    colorChoice.click();
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
        const confirmSurrender = confirm('Do you really want to surrender and lose this game?');
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