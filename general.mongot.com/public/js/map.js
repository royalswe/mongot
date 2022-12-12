'use strict';
var circles = [];
var disabledCountries = [];
/**
 * Add nuke effect when attack
 */
gameInfra.on('nuke_country', function (id) {
    var circle = document.getElementsByTagName('circle')[id];
    circle.setAttribute("filter", "url(#explosion)");
    circle.setAttribute('r', 45);
    setTimeout(function() {
        circle.setAttribute('r', 20);
        circle.removeAttribute('filter','url(#explosion)');
    }, 600);
});

gameInfra.on('attacker_animation', function (id) {
    var circle = document.getElementsByTagName('circle')[id];
    circle.setAttribute("filter", "url(#cannon)");
    circle.setAttribute('r', 30);
    setTimeout(function() {
        circle.setAttribute('r', 20);
        circle.removeAttribute('filter','url(#cannon)');
    }, 600);
});

gameInfra.on('bounce_country', function (id) {
    var circle = document.getElementsByTagName('circle')[id];
    circle.classList.toggle('bounce');
    circle.setAttribute('r', 25);
    setTimeout(function() {
        circle.classList.toggle('bounce');
        circle.setAttribute('r', 20);
    }, 300);
});

gameInfra.on('render_map', function (data) {
    circles = [];
    /**
     * update map information to circle array
     */
    for (var category in data) {
        if (data.hasOwnProperty(category)) {

            for (var x = 0, j = data[category].countries.length; x < j; x++) {
                circles.push({
                    country: data[category].countries[x],
                    color: data[category].color,
                    owner: data[category].id
                });
            }
        }
    }
    drawMap();
});

gameInfra.on('render_no_army_map', function (data) {
    circles = [];
    for (var category in data) {
        if (data.hasOwnProperty(category)) {

            for (var x = 0, j = data[category].countries.length; x < j; x++) {
                data[category].countries[x].units = 1;
                circles.push({
                    country: data[category].countries[x],
                    color: data[category].color,
                    owner: data[category].id
                });
            }
        }
    }
});

gameInfra.on('render_map_everyone_deploy', function (data, playersData) {
    circles = [];
    /**
     * Render enemys starting values and then players values. Needed because show gold wont work otherwise.
     */
    for (var category in data) {
        if (data.hasOwnProperty(category)) {
            for (var x = 0, j = data[category].countries.length; x < j; x++) {
                data[category].countries[x].units = 1;
                circles.push({
                    country: data[category].countries[x],
                    color: data[category].color,
                    owner: data[category].id
                });
            }
        }
    }
    for (var category in playersData) {
        if (playersData.hasOwnProperty(category)) {
            for (var x = 0, j = playersData[category].countries.length; x < j; x++) {
                circles.push({
                    country: playersData[category].countries[x],
                    color: playersData[category].color,
                    owner: playersData[category].id
                });
            }
        }
    }
    drawMap();
});

gameInfra.on('render_disabled_countries', function (countries) {
    disabledCountries = [];

    for (var i = 0; i < countries.length; i++) {
        disabledCountries.push({
            id: countries[i].id,
            units: countries[i].units
        });
    }
});

function drawMap() {
    if($(".show-gold").is(':visible')) { return; } // dont render if user watching gold

    for (var i = 0; i < circles.length; i++) {
        var g = document.getElementsByTagName('g')[circles[i].country.id];
        var circle = document.getElementsByTagName('circle')[circles[i].country.id];
        var text = document.getElementsByTagName('text')[circles[i].country.id];
        circle.setAttribute('fill', 'url(#radial_'+ circles[i].color +')');
        circle.style['stroke-width'] = "0";
        text.textContent = circles[i].country.units
        text.setAttribute('fill', 'white');
        g.id = circles[i].country.id;
    }

    if(circles.length !== countriesGold.length){
        for (var i = 0; i < disabledCountries.length; i++) {
            var g = document.getElementsByTagName('g')[circles[i].country.id];
            var circle = document.getElementsByTagName('circle')[disabledCountries[i].id];
            var text = document.getElementsByTagName('text')[disabledCountries[i].id];
            circle.setAttribute('fill', 'grey');
            circle.style['stroke-width'] = "0.5";
            circle.style.stroke = "white";
            text.textContent = disabledCountries[i].units;
            text.setAttribute('fill', 'white');
            g.id = circles[i].country.id;
        }
    }
}

function drawGold() {
    for (var i = 0; i < countriesGold.length; i++) {
        var circle = document.getElementsByTagName('circle')[countriesGold[i].id];
        var text = document.getElementsByTagName('text')[countriesGold[i].id];
        circle.setAttribute('fill', 'gold');
        text.setAttribute('fill', 'black');
        text.textContent = countriesGold[i].gold;
    }
}
/**
 * Toggle 'Show gold' button
 */

$(function(){
    $('#show_gold').click(function () {
        $("button.clicked-btn").removeClass("clicked-btn");
        if($(".show-gold").is(':visible')) {
            $('.phase-message').html('<div class="show-phase">Phase: ' + phase + '</div>');
            $('.phase-info').html(phaseMessage);
            drawMap();
        }
        else {
            drawGold();
            $(this).addClass('clicked-btn');
            $('.phase-info').empty();
            $('.phase-message').html('<div class=show-gold>'+
                '<p>Europe: 10 gold </p>' +
                '<p>East europe: 10 gold </p>' +
                '<p>Asia: 8 gold </p>' +
                '<p>Middle east: 4 gold </p>' +
                '<p>Africa: 6 gold </p></div>');
        }
    });
});

var countriesGold = [
    { id: 0, gold: 2 }, { id: 1, gold: 2 }, { id: 2, gold: 2 }, { id: 3, gold: 2 }, { id: 4, gold: 2 }, { id: 5, gold: 1 },
    { id: 6, gold: 2 }, { id: 7, gold: 5 }, { id: 8, gold: 2 }, { id: 9, gold: 1 }, { id: 10, gold: 2 }, { id: 11, gold: 2 },
    { id: 12, gold: 2 }, { id: 13, gold: 2 }, { id: 14, gold: 2 }, { id: 15, gold: 5 }, { id: 16, gold: 2 }, { id: 17, gold: 2 },
    { id: 18, gold: 2 }, { id: 19, gold: 2 }, { id: 20, gold: 5 }, { id: 21, gold: 2 }, { id: 22, gold: 2 }, { id: 23, gold: 2 },
    { id: 24, gold: 5 }, { id: 25, gold: 2 }, { id: 26, gold: 2 }, { id: 27, gold: 2 }, { id: 28, gold: 2 }, { id: 29, gold: 2 },
    { id: 30, gold: 5 }, { id: 31, gold: 2 }, { id: 32, gold: 1 }
];
drawGold(); // Show gold when waiting

// Resize map
function resizeImage(){
    var mobileBool = (isMobile ? 32 : 0) // Mobile or not
    var winHeight = $(window).height() - $('#game_header').height() - mobileBool;
    var winWidth = $(window).width();
    if($('#chatroom').css('display') !== 'none') {
        winWidth -= $('#chatroom').width();
    }
    cont.css('height', 0.75 * el.width());

    if(cont.height() > winHeight){
        cont.css('height', winHeight);
    }
    if(isMobile){ return; }

    el.removeAttr("style");
    if(cont.height() < winHeight && cont.width() < winWidth ){
        cont.css('height', winHeight);
    }

    if(el.width() > cont.width()){
        el.css('width', 'auto');
    }
}

var isMobile = /Android|webOS|iPhone|iPad|iPod|Windows Phone|BlackBerry/i.test(navigator.userAgent) ? true : false;


$(window).resize(function() {
    resizeImage();
});

var el = $(".svg-container");
var cont = $(".svg-content");

resizeImage();


