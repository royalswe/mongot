document.addEventListener("DOMContentLoaded", function () {
    if ('WebSocket' in window && window.WebSocket.CLOSING === 2) {
        let connectionManager = new ConnectionManager(document);
        connectionManager.connect(((window.location.protocol === "https:") ? "wss://" : "ws://") + location.host + "/game");
    } else {
        alert('Your browser dont support websockets! Please change browser');
    }

    if (location.host === 'localhost:5090') {
        SCREEN.resizeViewPort(600, 730);
    }
    else {
        let windowHeight = screen.availHeight * 0.8; // 80% of available screen height
        let windowWidth = (windowHeight / 3) + windowHeight;
        SCREEN.resizeViewPort(windowWidth, windowHeight);
    }
    SCREEN.resizeContent();
});

window.addEventListener("keydown", function (e) {
    if (e.ctrlKey && e.keyCode == 67) { // ctrl + c
        let input = document.getElementById("message");
        (input === document.activeElement) ? input.blur() : input.focus(); // enable chat shortcut
    }
}, false);

document.getElementById("toggle_fullscreen").onchange = (e) =>{
    e.preventDefault();
    SCREEN.toggleFullscreen();
};

// Game.localTetris.arena.matrix[19].fill(1);
// [...tetrisManager.instances][0].block.score = 1000
