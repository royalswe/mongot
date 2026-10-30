var TETRIS = (function(){
    const bevelledColours = {
        blocks: [null, '#b3004a', '#0099cc', '#00cc55', '#da00e6', '#cc6d00', '#e6c300', '#0051ff', '#00b30f'],
        borders: [null, '#FF0D72', '#0DC2FF', '#0DFF72', '#F538FF', '#FF8E0D', '#FFE138', '#3877FF', '#00ff17'],
        chat: ["#e01313", "#3d94f6", "orange", "#05d005", "#ce04ce", "#ffffff"]
    };

    return {
        specialName: function(specialID) {
            switch (specialID) {
                case 8:
                    return "Add row";
                case 9:
                    return "Remove row";
                case 10:
                    return "Earthquake";
                case 11:
                    return "Milkshake";
                case 12:
                    return "Specials away";
                case 13:
                    return "Shotgun";
                case 14:
                    return "Gravity";
                case 15:
                    return "Clear arena";
                case 16:
                    return "Switch Arena";
                case 17:
                    return "Monster";
                case 18:
                    return "Mini bomb";
                default:
                    return "";
            }
        },
        TilesHeight: 22,
        TilesWidth: 10,
        // Block colour index = block id (1 I, 2 L, 3 J, 4 O, 5 Z, 6 S, 7 T). Retro and classic blocks are bevelled, flat ones are plain squares.
        themes: {
            classic: {
                flat: false,
                bevel: true,
                field: '#333333',
                grid: '#3b3b3b',
                ...bevelledColours
            },
            flat: {
                flat: true,
                field: '#12161c',
                grid: '#1a212b',
                blocks: [null, '#ff3d7f', '#2dd4ff', '#2eea7a', '#e052ff', '#ff9a2e', '#ffd93d', '#4d8dff'],
                chat: ["#ff7b7b", "#6cb2ff", "#ffb347", "#4ade80", "#e879f9", "#ffffff"]
            },
            retro: {
                flat: false,
                field: '#0d0b26',
                grid: '#151236',
                ...bevelledColours
            },
        },
        //clas names
        playerReadyClass: "player-ready-status",
        //Client Status
        statusReady: "ready",
        statusWaiting: "waiting"
    };
   
}());



