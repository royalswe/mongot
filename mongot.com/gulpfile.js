const { src, dest, watch, series, parallel } = require('gulp');
const cleanCSS = require('gulp-clean-css');
const imagemin = require('gulp-imagemin');

const prod = '../../mongot_prod/mongot.com';

function css() {
  return src('public/css/*.css')
    .pipe(cleanCSS())
    .pipe(dest(prod + '/public/css'));
}

function resources() {
  return src('public/resources/*')
    .pipe(cleanCSS())
    .pipe(dest(prod + '/public/resources'));
}

function views() {
  return src('views/*.pug')
    .pipe(dest(prod + '/views'));
}

function routes() {
  return src('routes/*')
    .pipe(dest(prod + '/routes'));
}

function img() {
	return src('public/img/*')
		.pipe(imagemin())
		.pipe(dest(prod + '/public/img'))
}

function json() {
  return src('package.json')
    .pipe(dest(prod + '/'));
}
  
exports.css = css;
exports.routes = routes;
exports.views = views;
exports.img = img;
exports.resources = resources;
exports.json = json;
exports.default = parallel(css, routes, views, img, resources, json);
