let TetrisManager = function (documnet) {
    this.document = documnet;
    this.template = documnet.querySelector('#player_template');
    this.loacalTemplate = documnet.querySelector('#local_template');
};

// Create empty arenas
TetrisManager.prototype.initArenas = function(){
    for (let i = 0; i < 5; i++) {
        let element = document.importNode(this.template.content, true).children[0];
        this.document.getElementById('arena_container').appendChild(element);
    }
};

TetrisManager.prototype.createLocalPlayer = function () {
    if(this.document.querySelector('.arena.local')){
        //log if local player exist
        let li = document.createElement("li");
        li.innerHTML = "you allready have an local instance!";
        document.getElementById("game_log").appendChild(li);

        this.document.querySelector('.arena.local').remove();
    }
    else{
        this.document.querySelector('.arena.open').remove();
    }

    const element = this.document.importNode(this.loacalTemplate.content, true).children[0];
    const tetris = new Tetris(element);
    //this.instances.push(tetris);

    const sibling = this.document.getElementsByClassName('arena')[2];
    sibling.parentNode.insertBefore(tetris.element, sibling);
    return tetris;
};

TetrisManager.prototype.createPlayer = function () {
    const element = this.document.importNode(this.template.content, true).children[0];

    const tetris = new Tetris(element);
    tetris.element.className = "arena closed";

    // replace new arena with an open
    const sibling = this.document.getElementsByClassName('arena open')[0];
    sibling.parentNode.insertBefore(tetris.element, sibling);
    sibling.remove();
    //this.instances.push(tetris);

    // if localplayer exist then place it in the middle
    const localTetris = this.document.getElementsByClassName('arena local')[0];
    const localPos = this.document.getElementsByClassName('arena')[2];
    
    if(localTetris && localTetris !== localPos){
        console.log('The arena moved');
        localPos.parentNode.insertBefore(localTetris, localPos);
    }

    return tetris;
};

/**
 * Remove arena and add a new on the same place
 */
TetrisManager.prototype.removePlayer = function (tetris, gamestatus) {
    let element = document.importNode(this.template.content, true).children[0];
    tetris.element.parentNode.insertBefore(element, tetris.element);
    tetris.element.remove();

    if(gamestatus === 'running'){
        element.querySelector(".tetris").classList.add("empty-arena");
        let span = document.createElement("span");
        span.className = "gameover loser";
        span.innerHTML = "GAME OVER";
        element.appendChild(span);
    }
    else{
        let span = document.createElement("span");
        span.innerHTML = "Seat open";
        span.className = "open-seat";
        element.appendChild(span);
    }
};