window.gameInfra = io(location.host + '/game_infra', {
    reconnection: true,
    reconnectionAttempts: Infinity,
    transports: ['websocket', 'polling']
});

gameInfra.on("connect", function(){
    gameInfra.emit("get_rooms", {});
});
let playersArr;
gameInfra.on("rooms_list", function(rooms, players){
    let roomsTable = '';
    playersArr = players;
    document.querySelectorAll('#kick_out_room option:not(:first-child)').forEach(function (option) { option.remove(); });

    rooms.forEach(function (value) {

       const kickOutRoom = document.getElementById('kick_out_room');
       if(value.status === 'game in progress' && kickOutRoom){
           const option = document.createElement('option');
           option.value = value.name;
           option.textContent = value.name;
           kickOutRoom.appendChild(option);
       }

        const tableIsOpen = value.status === 'open' || value.status === 'waiting for players';
        let btnText;
        let btnClass;
        if(!tableIsOpen){
            btnText = value.status === 'rematch' ? 'watch / rematch' : 'watch game';
            btnClass = 'watch-btn';
        }
        else{
            btnText = 'join game';
            btnClass = 'join-btn';
        }
        roomsTable +='<tr><td>'
            + value.name + '</td><td>'
            + value.players + '/'+ value.startingPlayers +'</td><td>'
            + ({ original: 'Original Map', archipelago: 'Archipelago', frontier: 'The Marches', world: 'World', quick: 'Quick Test' }[value.mapId] || 'Original Map') + '</td><td>'
            + value.status +'</td><td>'
            + '<a href="/game?room='+ encodeURIComponent(value.name) +'" target="_blank" rel="noopener" id="'+ value.name +'" class="join-room '+ btnClass +'">' + btnText +'</a></td></tr>';
    });
    document.querySelector('#allrooms tbody').innerHTML = roomsTable;

    for(let i=0; i < players.length; i += 1){
        if(user.username === players[i].username){
            const roomLink = document.getElementById(players[i].room);
            if (roomLink) { roomLink.classList.add('disable-join-link'); }
        }
    }   
});
    
document.querySelector('#allrooms tbody').addEventListener('click', function (event) {
    const joinLink = event.target.closest('.join-room');
    if (joinLink) {
        event.preventDefault();
        redirectRoom(joinLink.id);
    }
});

const kickOutButton = document.getElementById('kick_out_btn');
if (kickOutButton) {
    kickOutButton.addEventListener('click', function () {
        gameInfra.emit("god_mode", {
            type: 'kick_player',
            room: document.getElementById('kick_out_room').value,
            player: document.getElementById('kick_out_player').value
        });
    });
}
// change players selection after room name
const kickOutRoom = document.getElementById('kick_out_room');
if (kickOutRoom) { kickOutRoom.addEventListener('change', function () {
    const playerSelect = document.getElementById('kick_out_player');
    playerSelect.querySelectorAll('option:not(:first-child)').forEach(function (option) { option.remove(); });
    for(let i=0; i < playersArr.length; i += 1){
        if(this.value === playersArr[i].room){
            const option = document.createElement('option');
            option.value = playersArr[i].username;
            option.textContent = playersArr[i].username;
            playerSelect.appendChild(option);
        }
    }
}); }

gameInfra.on("flash_message", function(message){
    const flashMessage = document.querySelector('.flash_message');
    flashMessage.textContent = message;
    flashMessage.style.display = 'block';
    flashMessage.style.opacity = '1';
    setTimeout(function () {
        flashMessage.style.transition = 'opacity 400ms';
        flashMessage.style.opacity = '0';
        setTimeout(function () {
            flashMessage.style.display = 'none';
            flashMessage.style.transition = '';
        }, 400);
    }, 2500);
});

// show and hide toggle for godmode
const adminToggle = document.querySelector('.admin-toggle');
if (adminToggle) { adminToggle.addEventListener('click', function () {
    const adminPanel = document.getElementById('admin_panel');
    adminPanel.hidden = !adminPanel.hidden;
    this.classList.toggle('active-btn');
}); }

function redirectRoom(roomName) {
    window.open("/game?room=" + roomName, "_blank", "width=835,height=523");
}



