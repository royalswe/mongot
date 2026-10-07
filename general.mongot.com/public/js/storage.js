var WORDFILTER = [
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
];

var MODS = ["roYal", "svabben", "mlinde"];

// Random id kept in the browser; the server turns it into a stable guest name.
function getGuestId() {
    var devGuestId = new URLSearchParams(window.location.search).get('devGuestId');
    if (devGuestId) { return devGuestId; }

    var guestId;
    try {
        guestId = localStorage.getItem('general_guest_id');
        if (!guestId) {
            guestId = window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() :
                Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
            localStorage.setItem('general_guest_id', guestId);
        }
    }
    catch (error) {
        guestId = Date.now().toString(36) + Math.random().toString(36).slice(2);
    }
    return guestId;
}