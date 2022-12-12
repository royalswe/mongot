var TETRIS = (function(){

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
        //clas names
        playerReadyClass: "player-ready-status",
        //Client Status
        statusReady: "ready",
        statusWaiting: "waiting"
    };
   
}());



