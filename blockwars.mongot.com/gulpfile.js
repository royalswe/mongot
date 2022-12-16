const { src, dest, watch, series, parallel } = require('gulp');
const imagemin = require('gulp-imagemin');
const concat = require('gulp-concat');
const uglify = require('gulp-uglify');
const babel = require('gulp-babel');
const mergeStream = require('merge-stream');
const cleanCSS = require('gulp-clean-css');

const jsDest = '../../mongot_prod/blockwars.mongot.com/public/js';
const jsServer = '../../mongot_prod/blockwars.mongot.com/game';
const jsDestDev = 'public/js/dist';

function jsDev() {
  return mergeStream(
    src(
      ['public/js/modules/utils.js', 'public/js/modules/tetris-utils.js', 'public/js/modules/screen-settings.js', 'public/js/connection-manager.js', 'public/js/tetris-manager.js',
       'public/js/tetris.js', 'public/js/events.js','public/js/arena.js','public/js/block.js','public/js/special.js','public/js/chat.js','public/js/zmain.js']
    )
      .pipe(babel({
          presets: ['@babel/preset-env'] // convert es6 to es5
      }))
      .pipe(concat('blockwars.min.js'))
      .pipe(uglify())
      .pipe(dest(jsDestDev)),

    src(['public/js/settings.js'])
      .pipe(babel({
          presets: ['@babel/preset-env'] // convert es6 to es5
      }))
      .pipe(concat('settings.js'))
      .pipe(uglify())
      .pipe(dest(jsDestDev)),

    src(['public/js/service-worker.js'])
      .pipe(babel({
          presets: ['@babel/preset-env'] // convert es6 to es5
      }))
      .pipe(concat('service-worker.js'))
      .pipe(uglify())
      .pipe(dest(jsDestDev)),

    src(['public/js/modules/utils.js', 'public/js/modules/notifications.js', 'public/js/lobby.js'])
      .pipe(babel({
          presets: ['@babel/preset-env'] // convert es6 to es5
      }))
      .pipe(concat('lobby.min.js'))
      .pipe(uglify())
      .pipe(dest(jsDestDev)),      
  );
}

function js() {
  return mergeStream(
    src(
      ['public/js/modules/utils.js', 'public/js/modules/tetris-utils.js', 'public/js/modules/screen-settings.js', 'public/js/connection-manager.js', 'public/js/tetris-manager.js',
       'public/js/tetris.js', 'public/js/events.js','public/js/arena.js','public/js/block.js','public/js/special.js','public/js/chat.js','public/js/zmain.js']
    )
      .pipe(babel({
          presets: ['@babel/preset-env'] // convert es6 to es5
      }))
      .pipe(concat('blockwars.min.js'))
      .pipe(uglify())
      .pipe(dest(jsDest)),

    src(['public/js/settings.js'])
      .pipe(babel({
          presets: ['@babel/preset-env']
      }))
      .pipe(concat('settings.js'))
      .pipe(uglify())
      .pipe(dest(jsDest)),

    src(['public/js/service-worker.js'])
      .pipe(babel({
          presets: ['@babel/preset-env'] // convert es6 to es5
      }))
      .pipe(concat('service-worker.js'))
      .pipe(uglify())
      .pipe(dest(jsDest)),

    src(['public/js/modules/utils.js', 'public/js/modules/notifications.js', 'public/js/lobby.js'])
      .pipe(babel({
          presets: ['@babel/preset-env'] // convert es6 to es5
      }))
      .pipe(concat('lobby.min.js'))
      .pipe(uglify())
      .pipe(dest(jsDest)),

    // move server js files
    src('game/*')
    .pipe(dest(jsServer)),

    src('game/ai/*')
    .pipe(dest(jsServer + '/ai'))
      
  );
}

const prod = '../../mongot_prod/blockwars.mongot.com';

function css() {
  return src('public/css/*.css')
    .pipe(cleanCSS())
    .pipe(dest(prod + '/public/css'));
}

function views() {
  return src('views/*.pug')
    .pipe(dest(prod + '/views'));
}

// Optimize Images
function img(){
  return src('public/img/*/**')
  .pipe(imagemin())
  .pipe(dest(prod + '/public/img/'))
};
  
exports.css = css;
exports.views = views;
exports.js = js;
exports.jsDev = jsDev;
exports.img = img;
exports.default = parallel(js, css, views, img);
