const { src, dest, watch, series, parallel } = require('gulp');
const imagemin = require('gulp-imagemin');
const uglify = require('gulp-uglify');
const concat = require('gulp-concat');
const babel = require('gulp-babel');
const cleanCSS = require('gulp-clean-css');

const PROD = process.env.GULP_DEST || '../../mongot_prod/general.mongot.com';

// Minify and concate scripts
function jsGame() {
    return src(['public/js/storage.js', 'public/js/ranks.js', 'public/js/chat.js', 'public/js/game.room.js', 'public/js/map.js', 'public/js/battle.and.movement.js'])
        .pipe(babel({
            presets: ['@babel/preset-env']
        }))
        .pipe(concat('compress.js'))
        .pipe(uglify())
        .pipe(dest(PROD + '/public/js'));
};

function jsLobby(){
    return src(['public/js/storage.js', 'public/js/ranks.js', 'public/js/lobby.js', 'public/js/lobby.chat.js', 'public/js/notifications.js'])
        .pipe(babel({
            presets: ['@babel/preset-env']
        }))    
        .pipe(concat('lobby.min.js'))
        .pipe(uglify())
        .pipe(dest(PROD + '/public/js'));
};

// Config and chat history (config.json, *Chat.json) stay as they are on the server.
function moveServerJs(){
    return src(['app.js', 'sockets.js', 'serviceworker.js', 'routes/*.js', 'game/*.js'], {base: '.'})
    .pipe(dest(PROD))
};

// Minify and concate scripts
// Dont forget to add: g circle{r:25} in game.board.css, before the last }
function css(){
    return src('public/css/*.css')
        .pipe(cleanCSS())
        .pipe(dest(PROD + '/public/css'));
};

function fonts(){
    return src('public/fonts/*')
        .pipe(dest(PROD + '/public/fonts'));
};

// Copy All HTML files
function views(){
    return src('views/*.pug')
        .pipe(dest(PROD + '/views'));
};

// Optimize Images
function img(){
    return src('public/img/*/**')
    .pipe(imagemin())
    .pipe(dest(PROD + '/public/img/'))
};

exports.jsGame = jsGame;
exports.jsLobby = jsLobby;
exports.moveServerJs = moveServerJs;
exports.css = css;
exports.fonts = fonts;
exports.views = views;
exports.img = img;
exports.default = parallel(jsGame, jsLobby, moveServerJs, css, fonts, views, img);
