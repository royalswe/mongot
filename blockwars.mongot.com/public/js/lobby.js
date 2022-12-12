let Lobby = function(){
  let lobby = new WebSocket(((window.location.protocol === "https:") ? "wss://" : "ws://") + location.host + "/lobby");
  
  this.ws = lobby;

  lobby.addEventListener('open', () => {
    const msg = JSON.stringify({ type: "init_lobby", user: user });
    lobby.send(msg);
  });
  
  window.addEventListener('beforeunload', function () {
    lobby.close(); // close the connection when reload to prevent chrome bug
  });
  
  lobby.onclose = function () {
    setTimeout(function() {
      const elem = document.createElement("div");
      elem.innerText = 'Connectiond lost. Reload page to reconnect!';
      elem.className = 'dropped-connection';
  
      const header = document.getElementsByTagName("header")[0];
      header.parentNode.insertBefore(elem, header.nextSibling);
    }, 2000);
  };
  
  lobby.addEventListener('message', event => {
    const data = JSON.parse(event.data);
    
    switch(data.type){
        case 'userMessage':
          this.renderMessages([data.message]);
          break;
        case 'render_messages':
          this.renderMessages(data.messages);
          break;
        case 'render_rooms':
          this.renderRooms(data);
          break;
        case 'users_online':
          this.renderConnectedUsers(data.users);
          break;
        case 'user_notification':
          NOTIFICATION.userNotification(data);
          break;
    }
  });
  
  let timeStamp = Date.now();
  document.getElementById("send").onclick = function() {
    //Dont allow guest to chat
    // if(user === 'guest'){
    //     return $('#messages').append('<div class="new-message">' +
    //         '<span class="chat-message"><a href="/login">Login</a> to use the chat</span>' +
    //         '</div>');
    // }
    let message = document.getElementById("message").value;
    if(message.toUpperCase() === "ADD BOT"){
      return document.getElementById("messages").innerHTML +=
      '<div class="new-message">' +
        '<span class="chat-message">Not here! Join a game room and type Add bot</span>' +
      '</div>';
    }
  
    if (message.length > 400) {
      return document.getElementById("messages").innerHTML +=
        '<div class="new-message">' +
          '<span class="chat-message">Your text is too long</span>' +
        '</div>';
    }
  
    String.prototype.repeat = function(num) {
      return new Array(num + 1).join(this);
    };
  
    // iterate over all words
    for (let i = 0; i < UTILS.WORDFILTER.length; i += 1) {
      // Create a regular expression and make it global
      let pattern = new RegExp("\\b" + UTILS.WORDFILTER[i] + "\\b", "i");
      // Create a new string filled with '*'
      let replacement = "*".repeat(UTILS.WORDFILTER[i].length);
      message = message.replace(pattern, replacement);
    }
    let cleanMessage = message.replace(/</g, "&lt;").replace(/>/g, "&gt;"); // stringify < and >
  
    if (cleanMessage !== "") {
      // Prevent sending blank messages
      if (timeStamp < Date.now()) {
        timeStamp = Date.now() + 2000;
        let username = (user === 'guest') ? 'guest' : user.username;
        let data = { message: cleanMessage, type: "userMessage", user: username };
        lobby.send(JSON.stringify(data));
        document.getElementById("message").value = "";
      } else {
        document.getElementById("messages").innerHTML +=
          '<div class="new-message">' +
            '<span class="chat-message">You are writing to fast</span>' +
          '</div>';
      }
    }
    return false;
  };
  
  document.getElementById("message").addEventListener("keypress", function(e) {
    if (e.keyCode === 13 ) {
      document.getElementById("send").click();
    }
  });

};

Lobby.prototype.renderRooms = function(data) {
    const roomsData = data.rooms;
    
    // sort rooms by ranking
    roomsData.sort(function(a, b) {
      let rankA = a.ranking;
      let rankB = b.ranking;
      if (rankA < rankB) {
        return -1;
      }
      if (rankA > rankB) {
        return 1;
      }
      return 0;
    });

    let rooms = "";
    roomsData.forEach(function(value) {
      let roomStatus = "open";
      if(value.status === "waiting" && value.activePlayers.length > 0){
        roomStatus = "waiting for players";
      }
      else if(value.status === "running"){
        roomStatus = "game in progress";
      }

      let joinBtnClass = "join-btn";
      let playerList = "<td>";
      if(value.players.length > 0){
        playerList = "<td class='tooltip'>";
        let list = "<ul class='tooltiptext'>";

        for (let i = 0; i < value.players.length; i++) {
          const player = value.players[i];
          if(player.name === user.username){
            joinBtnClass += " disable-join-link";
          }
          if(player.points){
            list += `<li> <img src='img/rankings/${UTILS.getCrownImg(player.points)}'/> ${player.name}</li>`;
          }
          else{
            list += `<li> <img src='img/rankings/guest.png'/> ${player.name}</li>`;
          }
        }
        playerList += list + "</ul>";
      }

      rooms +=
        `<tr><td>
        ${value.name}
        </td>
        ${playerList}${value.activePlayers.length}/${value.players.length}
        </td><td>
        ${roomStatus}
        </td><td title='Ranked games are only for registered players'>
        ${value.ranking}
        </td><td>
        <button data-room="${value.name}" onclick="window.open('/game?room=${value.name}', '_blank', 'width=1000,height=740')" class="${joinBtnClass}">Join Room</button>
        </td></tr>`;
    });

    document.getElementsByTagName("tbody")[0].innerHTML = rooms;
};

Lobby.prototype.renderConnectedUsers = function(users) {

  let onlineList = document.getElementById("users_online");
  onlineList.innerHTML = '<p id="user_online_list">Users in lobby (' + users.length + ")</p>";
    
  document.title = "Lobby (" + users.length + ")";

  for (let i = 0; i < users.length; i++) {
    let points = users[i].points;
    let img = "rankings/";
    let title = points + " points";
    if (UTILS.MODS.indexOf(users[i].username) > -1) {
      title = "moderator: " + points + " points";
      img += "moderator.png";
    }
    else if(points === null) {
      title = "guest";
      img += "guest.png";
    }
    else{
      img += UTILS.getCrownImg(points);
    }

    if(points === null) {
      onlineList.innerHTML += `<p><img src="img/${img}" title="${title}" alt="${title}"/>${users[i].username}</p>`;
    }
    else{
      onlineList.innerHTML += `<a href="https://mongot.com/user/${users[i].username}"><img src="img/${img}" title="${title}" alt="${title}"/>${users[i].username}</a>`;
    }

  }
};

Lobby.prototype.renderMessages = function(messages) {
  let domMessages = document.getElementById("messages");

  if(messages.length > 1){
    domMessages.innerHTML = "";
  }

  for (let i = 0; i < messages.length; i++) {
    let localDate = new Date(messages[i].timeStamp);
    let timeStamp =
      localDate.getDate() +
      "/" +
      (localDate.getMonth() + 1) +
      " " +
      ("0" + localDate.getHours()).slice(-2) +
      ":" +
      ("0" + localDate.getMinutes()).slice(-2);

    let newMessage =
      '<div class="new-message ' +
      messages[i].type +
      '">' +
      '<span class="chat-timeStamp">' +
      timeStamp +
      "</span> " +
      '<span class="name">' +
      messages[i].username +
      ":</span> " +
      '<span class="chat-message">' +
      messages[i].message +
      "</span> ";
    if (user.god && messages.length > 1) {
      newMessage += '<span class="remove-message" onclick="removeMessage(\'' + i + '\')">Remove</span>';
    }
    newMessage += "</div>";
    domMessages.innerHTML += newMessage;
  }

  domMessages.scrollTop = domMessages.scrollHeight;
};

const lobby = new Lobby();
  
function removeMessage(id) {
  let removeMsg = confirm("Do you want to remove this message?");
  if (removeMsg) {    
    lobby.ws.send(JSON.stringify({type: 'remove_message', index: id, god: user.god}));
  }
}