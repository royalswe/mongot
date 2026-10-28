var UTILS = (function(){

    const keyCodes = {
        Backspace: 8, Tab: 9, Enter: 13, Shift: 16, Control: 17, Alt: 18,
        Pause: 19, CapsLock: 20, Escape: 27, ' ': 32, PageUp: 33,
        PageDown: 34, End: 35, Home: 36, ArrowLeft: 37, ArrowUp: 38,
        ArrowRight: 39, ArrowDown: 40, Insert: 45, Delete: 46,
        Meta: 91, ContextMenu: 93, NumLock: 144, ScrollLock: 145
    };
    const punctuationCodes = {
        Semicolon: 186, Equal: 187, Comma: 188, Minus: 189, Period: 190,
        Slash: 191, Backquote: 192, BracketLeft: 219, Backslash: 220,
        BracketRight: 221, Quote: 222, IntlBackslash: 226
    };
    const numpadCodes = {
        NumpadMultiply: 106, NumpadAdd: 107, NumpadSubtract: 109,
        NumpadDecimal: 110, NumpadDivide: 111
    };

    return {
        keyCode: function(event) {
            const { key, code } = event;
            if (Object.prototype.hasOwnProperty.call(keyCodes, key)) {
                if (key === 'Meta') { return event.keyCode || (code === 'MetaRight' ? 92 : 91); }
                return keyCodes[key];
            }
            if (/^Numpad[0-9]$/.test(code)) { return 96 + Number(code.slice(-1)); }
            if (Object.prototype.hasOwnProperty.call(numpadCodes, code)) { return numpadCodes[code]; }
            if (/^F([1-9]|1[0-9]|2[0-4])$/.test(key)) { return 111 + Number(key.slice(1)); }
            if (/^[a-zA-Z]$/.test(key)) { return key.toUpperCase().charCodeAt(0); }
            if (/^[0-9]$/.test(key)) { return key.charCodeAt(0); }
            if (/^Digit[0-9]$/.test(code)) { return 48 + Number(code.slice(-1)); }
            if (Object.prototype.hasOwnProperty.call(punctuationCodes, code)) {
                // Older saved bindings can use browser-specific punctuation codes (59, 61, 173).
                return event.keyCode || punctuationCodes[code];
            }
            // Some layouts and synthetic events do not identify their keys through key/code.
            return event.keyCode || 0;
        },

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