var UTILS = (function(){

    return {
        getCrownImg: function(points) {
            let img = "";
    
            if (points === null)
                img = "guest.png";
            else if (points < 900)
                img = "crown0.png";
            else if (points >= 900 && points < 1300)
                img = "crown1.png";
            else if (points >= 1300 && points < 1500)
                img = "crown2.png";
            else if (points >= 1500 && points < 1700)
                img = "crown3.png";
            else if (points >= 1700 && points < 1900)
                img = "crown4.png";
            else if (points >= 1900 && points < 2100)
                img = "crown5.png";
            else if (points >= 2100 && points < 2300)
                img = "crown6.png";
            else if (points >= 2300 && points < 2500)
                img = "crown7.png";
            else if (points >= 2500 && points < 2700)
                img = "crown8.png";
            else if (points >= 2700 && points < 2900)
                img = "crown9.png";
            else
                img = "crown10.png";    
    
            return img;
        },

        MODS: ["roYal", "svabben", "mlinde"],

        WORDFILTER: [
            "kuk",
            "kuken",
            "hora",
            "horunge",
            "fitta",
            "knulla",
            "knullare",
            "luder",
            "bög",
            "bögar",
            "rövhål",
            "cunt",
            "fuck",
            "fuck you",
            "dick",
            "cock",
            "pussy",
            "ashole"
        ],
    };
   
}());