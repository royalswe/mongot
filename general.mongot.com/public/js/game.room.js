'use strict';
var gameInfra = io(location.host + '/game_infra', {
    reconnection: true,
    reconnectionAttempts: Infinity,
    transports: ['websocket', 'polling']
});

/**
 * Regex to parse out the value between room= and & or to the end of the content.
 * This way we can send url to a friend as an invite
 * @type {string}
 */
var roomName = decodeURI((RegExp("room" + '=' + '(.+?)(&|$)').exec(location.search) || [, null])[1]);
if (roomName) {
    document.title = roomName;

    gameInfra.emit("player_ready", user);
    gameInfra.emit('join_room', (roomName));
    gameInfra.emit('visitor', roomName);
}

gameInfra.on('disconnect', function() {
    disconnectedSound.play();
    window.onbeforeunload = function () { }; // Dont prompt if user disconnect

    var element = '<div class="modal-overlay"><div class="disconnect-popup"><span class="close-popup">X</span>';
    element += "<h1>Disconnected &#x2639;</h1><p>You drop connection and cannot see any activity anymore! Reload this window or reopen it to rejoin the game again.</p>";
    element += "</div></div>";
    $('body').append(element);

    $(".modal-overlay").css("display","block");
});

gameInfra.on('not_activated', function() {
    var element = '<div class="modal-overlay"><div class="disconnect-popup"><span class="close-popup">X</span>';
    element += "<h1>Activate your account &#x2639;</h1><p>Please check your email for activation link to be able to play.<br>" +
        "<a href='https://mongot.com/sendVerificationToken'>Send new activation link</a></p></div></div>";
    $('body').append(element);

    $(".modal-overlay").css("display","block");
});

var mission;
var phase = 'Waiting for players';
var phaseMessage;
var activePlayer;
var playerEnabled;

var disconnectedSound = new Howl({src: ['sounds/disconnected.mp3']});
var yourTurnSound = new Howl({src: ['sounds/notify-turn.mp3']});
var gameOverSound = new Howl({src: ['sounds/game-over.mp3'], volume: 0.5});
var joinGameSound = new Howl({src: ['sounds/player-joined.mp3'], volume: 0.5});


gameInfra.on('message', function (msg) {
    switch (msg.type) {
        case "serverMessage":
            $('#messages').append('<div class="server-message">' + msg.message + '</div>');
            break;
        case "phase":
            phase = msg.message;
            phaseMessage = msg.phaseMsg

            if($(".show-mission, .show-gold").length === 0) { // Dont change game information if user watching mission or gold
                $('.phase-message').html('<div class="show-phase">Phase: ' + phase + '</div>');
                $('.phase-info').html(phaseMessage);
            }
            var image = $("#phase_img");
            image.fadeOut(50, function () {
                image.attr("src", "img/game/phases/" + phase + ".png");
                image.fadeIn(50);
            });
            $(".remove_unit_bar").remove(); // if player didn't fulfill the attack or movement
            drawMap();
            break;
        case "attack":
            if($(".show-phase").is(':visible')) {
                $('.phase-info').html(msg.message);
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
            $('.user-gold').html('<span>Gold: </span>' + msg.gold);
            break;
        case "update_gold_income":
            $('.user-goldIncome').html('<span>Income: </span>' + msg.goldIncome);
            break;
        case "start_game":
            clearInterval(countInterval); // if countdown is active then disable it
            window.onbeforeunload = function () { return "Dude, are you sure you want to leave?"; }
            yourTurnSound.play(); // Notify player turn
            mission = msg.mission;
            break;
        case "player_rejoin":
            window.onbeforeunload = function () { return "Dude, are you sure you want to leave?"; }
            joinGameSound.play(); // Notify player turn
            mission = msg.mission;
            break;
        case "game_over":
            $('#messages').append('<div class="server-message">' + msg.message + '</div>');
            window.onbeforeunload = function () { }; // Dont prompt if user leaves
            gameOverSound.play();
            break;
        case "disconnect_player":
            gameInfra.emit("player_left", msg.id);
            break;
        default:
            console.log('SWITCH ERROR');
            break;
    }
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
        $('.phase-message').html('<span style="color:#4bff00">Be ready!</span>');
        $('.phase-info').html('<span style="color:#4bff00">The game starts in <b style="margin: 0px; color: #ff0" id="start_countdown">5</b> seconds.</span>');
        var i = 4;

        countInterval = setInterval(function() {
            $("#start_countdown").html(i);
            if (i === 0) {
                clearInterval(countInterval);
                gameInfra.emit("countdown_finished", roomName);
            }
            i--;
        }, 1000);
    }
    else {
        $('.phase-message').html('Oh no! player left the game');
        $('.phase-info').html('The game will start as soon new players have joined.');
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
    circle.setAttribute('fill', msg.color);
    text.textContent = msg.username;
}

$('g').mouseenter(function () { // change cursor if it is players turn
    if (playerEnabled)
        $(this).css('cursor', 'pointer');
    else
        $(this).css('cursor', 'default');
});

$('g').mousedown(function () {
    if (playerEnabled) {
        var country = getCountry(this.id);
        var click = this.id;
        switch (phase) {
            case "Everyone deploy":
                if($.isNumeric(click) && $.isNumeric(country.owner)) {
                    gameInfra.emit("everyone_deploy", parseInt(click), country.owner);
                }
                break;
            case "Deploy":
                if($.isNumeric(click) && $.isNumeric(country.owner)) {
                    gameInfra.emit("deploy", parseInt(click), country.owner);
                }
                break;
            case "Battle":
                battle(click, $(this));
                break;
            case "Tactical move":
                tacticalMove(click, $(this));
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
    $('#player_list').empty();

    $.each(playerList, function (key, value) {
        var points = value.points;

        var ipCounter = 0;
        for(var i = 0; i<playerList.length; i+=1){
            if(value.ip === playerList[i].ip){
                ipCounter += 1;
            }
        }

        if(ipCounter > 1){
            var imgInfo = '<img src="img/ip-icon.png" alt="duplicate IP address" title="duplicate IP address"/>';
        }
        else {
            var imgInfo = '<img src="img/users-icon.png" alt="normal user" title="normal user"/>';
        }
        if(MODS.indexOf(value.username) > -1){
            imgInfo = '<img src="img/moderator.png" alt="moderator" title="moderator"/>';
        }
        
        if (points < 900)
            var img = "crown0.png";
        else if(points >= 900 && points < 1300)
            var img = "crown1.png";
        else if(points >= 1300 && points < 1500)
            var img = "crown2.png";
        else if(points >= 1500 && points < 1700)
            var img = "crown3.png";
        else if(points >= 1700 && points < 1900)
            var img = "crown4.png";
        else if(points >= 1900 && points < 2100)
            var img = "crown5.png";
        else if(points >= 2100 && points < 2300)
            var img = "crown6.png";
        else if(points >= 2300 && points < 2500)
            var img = "crown7.png";
        else if(points >= 2500 && points < 2700)
            var img = "crown8.png";
        else if(points >= 2700 && points < 2900)
            var img = "crown9.png";
        else
            var img = "crown10.png";

        var roomDiv = '<li class="player-name" style="color: '+ value.color +' ">'+ imgInfo +'<span class="player-username">' + value.username + '</span>' +
            '<span class="player-points">' + points + '<img src="img/rankings/'+ img +'"/></span></li>';
        $('#player_list').append(roomDiv);
    });
});

// choose color
gameInfra.on("choose_color", function (usedColors, colors) {
    $('.popup').remove();

    var popup = '<div class="modal-overlay"></div><div class="popup">'+
        '  <span class="close-popup">X</span>' +
        '  <div class="pophead">Please choose a color to play with</div>'+
        '  <div class="popbody">'+
        '    <ul>';
    for (var i = 0; i < colors.length; i += 1) {
        popup +='<div class="player-check">'+
            ' <input id="'+ colors[i] +'_player" type="checkbox"/>'+
            ' <label id="'+ colors[i] +'" for="'+ colors[i] +'_player"></label>'+
            ' </div>';
    }
        popup += '</ul></div></div>';

    $('.svg-container').before(popup);
    $(".modal-overlay").css("display","block");
    
    $.each(usedColors, function (key, value) {
        $('#'+value.color).remove();
    });
});
// if player choosed color remove it
gameInfra.on("remove_color_popup", function (usedColors) {
    $.each(usedColors, function (key, value) {
        $('#'+value.color).remove();
    });
    joinGameSound.play();
});
// remove box when game starts for everyone
gameInfra.on("remove_color_popup_box", function () {
    $('.popup').remove();
    $(".modal-overlay").css("display","none");
});
// Show withdrawing gold effect
gameInfra.on("withdraw_gold_effect", function (gold) {
    var fadingNumber = '<span class="user-gold-withdraw">-' + gold + '</span>';
    $('.user-gold').append(fadingNumber);
});

gameInfra.on("display_flag", function () {
    $(".surrender-flag").css("display","block");
});

// Change window sise
var resizeViewPort = function(width, height) {
    if (window.outerWidth) {
        window.resizeTo(
            width + (window.outerWidth - window.innerWidth),
            height + (window.outerHeight - window.innerHeight)
        );
    }
};

resizeViewPort(835, 523);

$(function(){
    $('#next_turn').click(function () {
        gameInfra.emit("next_turn");
        false;
    });

    $('#game_board').on('click', 'label', function(e) {
        var x = $(this).parent();
        if (x.is('.player-check')) { // check if label has correct parent
            gameInfra.emit("join_game",roomName, e.target.id);
            $('.popup').remove();
            $(".modal-overlay").css("display","none");
        }
        false;
    });

    $('#mission').click(function () {
        $("button.clicked-btn").removeClass("clicked-btn");
        if($(".show-mission").is(':visible')) {
            $('.phase-message').html('<div class="show-phase">Phase: ' + phase + '</div>');
            $('.phase-info').html(phaseMessage);
        }
        else {
            $('.phase-message').html('<div class=show-mission>Game mission:</div>');
            $(this).addClass('clicked-btn');
            if(mission != null){
                $('.phase-info').html(mission.message);
            }
            else {
                $('.phase-info').html('Mission will be generated when the game begins.');
            }
            drawMap();
        }
    });

    $(".dice-log").click(function(){
        window.open("/dicelog?room=log-"+ roomName, "_blank", "width=220,height=575");
    });

    $(".surrender-flag").click(function(){
        var confirmSurrender = confirm('Do you really want to surrender and lose this game?');
        if(confirmSurrender){
            gameInfra.emit("surrender");
            $('.surrender-flag').remove();
        }

    });

    $('body').on('click', '.close-popup', function () {
        $('.disconnect-popup').remove();
        $('.popup').remove();
        $(".modal-overlay").css("display","none");
    });

});