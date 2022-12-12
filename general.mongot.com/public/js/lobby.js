var gameInfra = io(location.host + '/game_infra', {
    reconnection: true,
    reconnectionAttempts: Infinity,
    transports: ['websocket', 'polling']
});

gameInfra.on("connect", function(){
    gameInfra.emit("get_rooms", {});
});
var playersArr;
gameInfra.on("rooms_list", function(rooms, players){
    var roomsTable;
    playersArr = players;
    $('#kick_out_room').children('option:not(:first)').remove();

    $.each(rooms, function (key, value) {

       if(value.status === 'game in progress'){
           $('#kick_out_room') // add to kickout list
               .append($("<option></option>")
               .attr("value",value.name)
               .text(value.name));
       }

        if(value.status === 'game in progress' || user === 'guest'){
            var btnText = 'watch game';
            var btnClass = 'watch-btn';
        }
        else{
            var btnText = 'join game';
            var btnClass = 'join-btn';
        }
        roomsTable +='<tr><td>'
            + value.name + '</td><td>'
            + value.players + '/'+ value.startingPlayers +'</td>><td>'
            + value.status +'</td><td>'
            + '<a id="'+ value.name +'" class="join-room '+ btnClass +'">' + btnText +'</a></td></tr>';
    });
    $('#allrooms tbody').empty();
    $('#allrooms tbody').append(roomsTable);

    for(var i=0; i < players.length; i += 1){
        if(user.username === players[i].username){
            $('#'+players[i].room).addClass('disable-join-link');
        }
    }
});
    
$('#allrooms tbody').on("click", ".join-room", function(e){
    redirectRoom(e.target.id);
});

$('#kick_out_btn').click(function () {
    gameInfra.emit("god_mode", {type: 'kick_player', room: $('#kick_out_room').val(), player: $('#kick_out_player').val(), user: user});
});
// change players selection after room name
$('#kick_out_room').on('change', function() {
    $('#kick_out_player').children('option:not(:first)').remove();
    for(var i=0; i < playersArr.length; i += 1){
        if(this.value === playersArr[i].room){
            $('#kick_out_player')
                .append($("<option></option>")
                .attr("value",playersArr[i].username)
                .text(playersArr[i].username));
        }
    }
})

gameInfra.on("flash_message", function(message){
    $('.flash_message').text(message).fadeIn('normal', function() {
        $(this).delay(2500).fadeOut();
    });
});

// show and hide toggle for godmode
$(".admin-toggle").click(function(){
    $("#admin_panel").toggle( "slow" );
    $(".admin-toggle").toggleClass('active-btn');
});

function redirectRoom(roomName) {
    window.open("/game?room=" + roomName, "_blank", "width=835,height=523");
}



