let Chat = function(document, connectionManager) {
    this.document = document;
    this.cm = connectionManager;
    this.events = new Events();

    let timeStamp = Date.now();

    document.getElementById("send").addEventListener('click', () => { sendMessage(); }, false);
    document.getElementById("message").addEventListener("keydown", function(e) {
        if(e.key === 'Enter' && !e.isComposing){
            sendMessage();
        }
    }, false);

    let sendMessage = () => {
        if(timeStamp < Date.now()) {
            timeStamp = Date.now() + 2000;
            
            const message = document.getElementById("message");
            const cleanMessage = message.value.replace(/</g, "&lt;").replace(/>/g, "&gt;"); // stringify < and >
            if (cleanMessage.length > 400) {
                const messages = document.getElementById('messages');
                messages.innerHTML +=
                  '<div style="color:#ffff00">' +
                    '<span class="chat-message">Please do not spam</span>' +
                  '</div>';
                // Scroll down chatt automaticly
                messages.scrollTop = messages.scrollHeight;
            }
            else if (cleanMessage !== '') { // Prevent sending blank messages
                let data = {message: cleanMessage, type: 'state-chat'};
                this.cm.send(data);
                message.value = '';
            }


        }
    };

};

Chat.prototype.message = function(message){
    let colorNr = 0;
    let arenas = document.getElementsByClassName('arena');
    for (let i = 0; i < arenas.length; i += 1) {
        let playerName = arenas[i].querySelector('.client-name');

        if(playerName.getAttribute("data-player") === message.clientId) { break; }
        colorNr++;
    }

    const msg = '<div class="' +
        message.type + '"><span style="color:'+ THEME.get().chat[colorNr] +'" >' +
        message.clientId + ':</span> ' +
        message.message + '</div>';

    document.getElementById("messages").innerHTML += msg;

    // Scroll down chatt automaticly
    const messages = document.getElementById('messages');
    messages.scrollTop = messages.scrollHeight;
    LAYOUT.noteChatMessage();
};

Chat.prototype.serverMessage = function(data){
    data.class = (typeof data.class !== 'undefined') ?  data.class : "server-message";

    const msg = '<div class="'+ data.class +'">'+ data.msg +'</div>';
    document.getElementById("messages").innerHTML += msg;

    // Scroll down chatt automaticly
    const messages = document.getElementById('messages');
    messages.scrollTop = messages.scrollHeight;
    LAYOUT.noteChatMessage();
};
