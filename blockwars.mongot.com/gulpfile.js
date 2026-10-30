const { src, dest, parallel } = require('gulp');
const { pipeline } = require('node:stream/promises');
const concat = require('gulp-concat');
const uglify = require('gulp-uglify');
const babel = require('gulp-babel');
const cleanCSS = require('gulp-clean-css');

const prod = '../../mongot_prod/blockwars.mongot.com';
const stage = 'build';
const gameScripts = [
  'public/js/modules/utils.js', 'public/js/modules/canvas-fit.js',
  'public/js/modules/layout.js', 'public/js/modules/gestures.js', 'public/js/modules/handling.js',
  'public/js/modules/touch.js', 'public/js/modules/a11y.js',
  'public/js/modules/tetris-utils.js', 'public/js/modules/theme.js',
  'public/js/modules/screen-settings.js', 'public/js/connection-manager.js',
  'public/js/tetris-manager.js', 'public/js/events.js', 'public/js/arena.js',
  'public/js/block.js', 'game/special-rules.js', 'public/js/special.js',
  'public/js/tetris.js', 'public/js/chat.js', 'public/js/zmain.js'
];
const lobbyScripts = [
  'public/js/modules/utils.js', 'public/js/modules/notifications.js', 'public/js/lobby.js'
];

function bundle(files, filename, output) {
  return pipeline(
    src(files), babel({ presets: ['@babel/preset-env'] }),
    concat(filename), uglify(), dest(output)
  );
}

function bundleTasks(output) {
  return [
    bundle(gameScripts, 'blockwars.min.js', output),
    bundle(['public/js/settings.js'], 'settings.js', output),
    bundle(['public/js/service-worker.js'], 'service-worker.js', output),
    bundle(lobbyScripts, 'lobby.min.js', output)
  ];
}

function bundles(output) {
  return Promise.all(bundleTasks(output));
}

function javascript(output) {
  return Promise.all([
    ...bundleTasks(output + '/public/js'),
    // Templates also load individual scripts; keep them beside the legacy bundles.
    pipeline(src(['public/js/**/*.js', '!public/js/dist/**', '!public/js/settings.js', '!public/js/service-worker.js']),
      dest(output + '/public/js')),
    pipeline(src('game/**/*.js'), dest(output + '/game'))
  ]);
}

function backendFiles(output) {
  return pipeline(
    src(['app.js', 'serviceworker.js', 'routes/**/*.js'], { base: '.' }),
    dest(output + '/')
  );
}

function styles(output) {
  return pipeline(src('public/css/*.css'), cleanCSS(), dest(output + '/public/css'));
}

function templates(output) {
  return pipeline(src('views/*.pug'), dest(output + '/views'));
}

function fontFiles(output) {
  return pipeline(src('public/fonts/*', { encoding: false }), dest(output + '/public/fonts'));
}

async function images(output) {
  const [{ default: imagemin }, ...plugins] = await Promise.all([
    import('gulp-imagemin'), import('imagemin-gifsicle'), import('imagemin-mozjpeg'),
    import('imagemin-optipng'), import('imagemin-svgo')
  ]);
  return pipeline(
    src('public/img/**/*', { encoding: false }),
    imagemin(plugins.map(plugin => plugin.default())),
    dest(output + '/public/img')
  );
}

function resources(output) {
  return pipeline(
    src(['public/resources/**/*', 'public/sounds/**/*', 'public/manifest.webmanifest'], { base: 'public', encoding: false }),
    dest(output + '/public')
  );
}

function js() { return javascript(prod); }
function jsDev() { return bundles('public/js/dist'); }
function css() { return styles(prod); }
function views() { return templates(prod); }
function fonts() { return fontFiles(prod); }
function img() { return images(prod); }
function assets() { return resources(prod); }
function backend() { return backendFiles(prod); }

exports.css = css;
exports.views = views;
exports.js = js;
exports.jsDev = jsDev;
exports.img = img;
exports.fonts = fonts;
exports.assets = assets;
exports.backend = backend;
exports.default = parallel(js, css, views, img, fonts, assets, backend);
exports.stage = parallel(
  function stageBackend() { return backendFiles(stage); },
  function stageJs() { return javascript(stage); },
  function stageCss() { return styles(stage); },
  function stageViews() { return templates(stage); },
  function stageImages() { return images(stage); },
  function stageFonts() { return fontFiles(stage); },
  function stageAssets() { return resources(stage); }
);
