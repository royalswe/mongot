let Special = function(tetris) {
    this.tetris = tetris;
    this.element = tetris.element;
    this.events = tetris.arena.events;
    this.matrix = tetris.arena.matrix;

    this.sendingSpecial = false;
    this.specialTube = [];
};

Special.prototype.clearSpecials = function(){
    this.specialTube = [];
    this.element.querySelector('.specials').innerHTML = "";
    this.element.querySelector('.current-special').innerHTML = "";
};

Special.prototype.updateSpecials = function(data) {
    this.specialTube.push.apply(this.specialTube, data.specials);

    for (let i = 0; i < data.specials.length; i += 1) {
        const img = document.createElement("img");
        img.src = "img/game/specials/" + data.specials[i] + ".gif";
        const specElem = this.element.querySelector('.specials');
        specElem.insertBefore(img, specElem.firstChild);
    }

    this.element.querySelector('.current-special').innerHTML = TETRIS.specialName(this.specialTube[0]);
    TOUCH.explainTargetingOnce();
};

Special.prototype.useSpecial = function(index) {
    const playerIndex = [0, KEY_BINDS.special1, KEY_BINDS.special2, KEY_BINDS.special3, KEY_BINDS.special4, KEY_BINDS.special5].indexOf(index);
    const arena = document.getElementsByClassName('client-name')[playerIndex-1];
    this.sendTo(arena ? arena.getAttribute("data-player") : null);
};

/**
 * Send the first queued special to a player (yourself included). Returns whether it was sent.
 */
Special.prototype.sendTo = function(playerId) {
    if(this.sendingSpecial){ // Dont send special faster than server can handle
        // if user send special to fast then let him know
        let li = document.createElement("li");
        li.innerHTML = "Wait for last special to be done!";
        li.className = "server-message";
        writeToLog(li);
        return false;
    }
    const special = this.specialTube[0];
    if (special == null || playerId == null) return false; // no specials or no player exist

    this.sendingSpecial = true;

    if(special === 16){ // remove top 4 rows before switch arena
        this.matrix[0].fill(0);this.matrix[1].fill(0);
        this.matrix[2].fill(0);this.matrix[3].fill(0);
        this.matrix[4].fill(0);
        this.events.emit('matrix', this.matrix);
    }

    this.events.emit('special', 'use-special', [special, playerId]);
    return true;
};

Special.prototype.removeSpecial = function(){
    this.specialTube.splice(0, 1); // remove first special
    this.sendingSpecial = false; // available to send special again;
    const elem = this.element.querySelector('.specials');
    elem.removeChild(elem.lastChild); // remove special img
    this.element.querySelector('.current-special').innerHTML = TETRIS.specialName(this.specialTube[0]); // update special name
};

Special.prototype.performSpecial = function(data, switchMatrix) {
    TOUCH.haptic('special');
    // display used special with the senders name then remove the element
    let span = document.createElement("div");
    span.className = "display-used-special";
    span.innerHTML = TETRIS.specialName(data.special) + '<span>' + data.clientId + '</span>';
    this.element.appendChild(span);

    setTimeout(function(){
        span.remove();
    }, 1100);

    if (!applySpecial(this.matrix, data.special, { switchMatrix })) {
        console.error('performSpecial ' + data);
    }

    this.events.emit('matrix', this.matrix); //updatePeer
};
