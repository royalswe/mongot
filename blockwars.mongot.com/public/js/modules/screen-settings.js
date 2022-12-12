var SCREEN = (function(){

    function isInFullScreen() {
    return (document.fullScreenElement && document.fullScreenElement !== null) ||
        (document.mozFullScreen || document.webkitIsFullScreen);
    }

    window.onresize = () => {
        setTimeout(SCREEN.resizeContent, 1000);
        SCREEN.resizeContent();
    };

    return {
        resizeViewPort: function (width, height) {
            if (window.outerWidth) {
                window.resizeTo(
                    width + (window.outerWidth - window.innerWidth),
                    height + (window.outerHeight - window.innerHeight)
                );
            }
        },

        toggleFullscreen: function () {
            let elem = document.documentElement;
        
            if (isInFullScreen()) {
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                } else if (document.mozCancelFullScreen) {
                    document.mozCancelFullScreen();
                } else if (document.webkitCancelFullScreen) {
                    document.webkitCancelFullScreen();
                } else if (document.msExitFullscreen) {
                    document.msExitFullscreen();
                } else {
                    return alert('Your browser do not support fullscreen');
                }
        
            }
            else {
                if (elem.requestFullscreen) {
                    elem.requestFullscreen();
                } else if (elem.webkitRequestFullscreen) {
                    elem.webkitRequestFullscreen();
                } else if (elem.mozRequestFullScreen) {
                    elem.mozRequestFullScreen();
                } else if (elem.msRequestFullscreen) {
                    elem.msRequestFullscreen();
                } else {
                    return alert('Your browser do not support fullscreen');
                }
            }
        },
        
        resizeContent: function () {
            document.getElementById("toggle_fullscreen").checked = isInFullScreen() ? false : true; // Toggle fullscreen icon
            const windowHeight = window.innerHeight;
            const windowWidth = window.innerWidth;
            const landscape = (windowHeight / 3) + windowHeight;
        
            if (windowHeight < windowWidth) {
                if (landscape > windowWidth) {
                    document.documentElement.style.width = '100%';
                }
                else {
                    document.documentElement.style.width = landscape + 'px';
                }
            }
            else {
                if ((windowHeight - windowWidth) < 60) {
                    const potrait = 0.8 * windowHeight;
                    document.documentElement.style.width = potrait + 'px';
                }
                else {
                    document.documentElement.style.width = '100%';
                }
            }
        }
    };
   
}());