'use strict';
var circles = [];
var disabledCountries = [];
var countriesGold = [];
var mapContinents = [];
var mapData;

gameInfra.on('map_info', function (map) {
    mapData = map;
    countriesGold = map.countries.map(function (country) {
        return { id: country.id, gold: country.gold };
    });
    mapContinents = map.continents;

    var svg = document.querySelector('.svg-content');
    svg.dataset.mapId = map.id;
    $('#map_title').text(map.name);
    svg.classList.remove('map-archipelago', 'map-frontier', 'map-world', 'map-quick');
    ensureTerritoryMarkers(map.countries.length);
    if (map.positions) {
        svg.classList.add('map-' + map.theme);
        svg.style.backgroundImage = 'none';
        applyMapPositions(map);
        drawConnections(map);
    }
    else {
        svg.style.backgroundImage = '';
        document.querySelectorAll('.map-connection, .map-connection-casing').forEach(function (line) { line.remove(); });
    }

    if (circles.length === 0) {
        drawGold();
    }
});

function territoryGroups() {
    return Array.prototype.filter.call(document.querySelectorAll('.svg-content > g'), function (group) {
        if (group.querySelector('circle') && group.querySelector('text')) {
            group.classList.add('territory-marker');
            return true;
        }
        return false;
    });
}

function ensureTerritoryMarkers(count) {
    var svg = document.querySelector('.svg-content');
    var groups = territoryGroups();
    var insertBefore = svg.querySelector(':scope > filter, :scope > defs');
    while (groups.length < count) {
        var group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        var circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        var text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        group.classList.add('territory-marker');
        circle.setAttribute('r', 20);
        text.setAttribute('text-anchor', 'middle');
        group.appendChild(circle);
        group.appendChild(text);
        svg.insertBefore(group, insertBefore);
        groups.push(group);
    }
    groups.forEach(function (group, id) {
        group.style.display = id < count ? '' : 'none';
        group.classList.remove('route-selected');
    });
}

function applyMapPositions(map) {
    var groups = territoryGroups();
    map.positions.forEach(function (position, id) {
        var group = groups[id];
        if (!group) { return; }
        var circle = group.querySelector('circle');
        var text = group.querySelector('text');
        circle.style.transition = 'none'; // otherwise cx/cy slide in from the original layout
        circle.setAttribute('cx', position.x);
        circle.setAttribute('cy', position.y);
        circle.getBoundingClientRect();
        circle.style.transition = '';
        text.setAttribute('x', position.x);
        text.setAttribute('y', position.y + 7);
        group.id = id;
        var title = group.querySelector('title') || document.createElementNS('http://www.w3.org/2000/svg', 'title');
        title.textContent = map.countries[id].name || 'Territory ' + (id + 1);
        if (!title.parentNode) { group.insertBefore(title, group.firstChild); }
    });
}

function drawConnections(map) {
    document.querySelectorAll('.map-connection, .map-connection-casing').forEach(function (line) { line.remove(); });
    var svg = document.querySelector('.svg-content');
    var routeKey = function (link) { return Math.min(link[0], link[1]) + '-' + Math.max(link[0], link[1]); };
    var seaRoutes = (map.seaLinks || []).map(routeKey);
    var wrapRoutes = (map.wrapLinks || []).map(routeKey);
    var boardWidth = svg.viewBox.baseVal.width;
    var casings = document.createDocumentFragment();
    var routes = document.createDocumentFragment();

    map.countries.forEach(function (country) {
        country.neighbour.forEach(function (neighborId) {
            if (neighborId <= country.id) { return; }
            var from = map.positions[country.id];
            var to = map.positions[neighborId];
            var key = country.id + '-' + neighborId;
            var isSea = seaRoutes.indexOf(key) > -1;
            var segments = [[from, to]];
            if (wrapRoutes.indexOf(key) > -1) {
                // Drawn as two stubs leaving opposite board edges, as if the map wrapped around.
                var shift = from.x < to.x ? boardWidth : -boardWidth;
                segments = [[from, {x: to.x - shift, y: to.y}], [to, {x: from.x + shift, y: from.y}]];
                isSea = true;
            }
            segments.forEach(function (segment) {
                [['map-connection-casing', casings], ['map-connection' + (isSea ? ' map-sea' : ''), routes]].forEach(function (style) {
                    var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                    line.setAttribute('class', style[0]);
                    line.dataset.a = country.id;
                    line.dataset.b = neighborId;
                    line.setAttribute('x1', segment[0].x);
                    line.setAttribute('y1', segment[0].y);
                    line.setAttribute('x2', segment[1].x);
                    line.setAttribute('y2', segment[1].y);
                    style[1].appendChild(line);
                });
            });
        });
    });
    svg.insertBefore(routes, svg.firstChild);
    svg.insertBefore(casings, svg.firstChild);
}

// Hovering a territory shows where it connects and which neighbours are enemies (red) or friends (green).
function clearRouteHighlight() {
    document.querySelector('.svg-content').classList.remove('route-focus');
    document.querySelectorAll('.map-connection.active, .map-connection-casing.active').forEach(function (line) { line.classList.remove('active'); });
    document.querySelectorAll('.map-reach-ring').forEach(function (ring) { ring.remove(); });
}

function highlightRoutes(id) {
    clearRouteHighlight();
    if (!mapData || !mapData.positions || !mapData.countries[id]) { return; }
    var svg = document.querySelector('.svg-content');
    var hovered = getCountry(id);
    svg.classList.add('route-focus');
    document.querySelectorAll('.map-connection, .map-connection-casing').forEach(function (line) {
        if (Number(line.dataset.a) === id || Number(line.dataset.b) === id) { line.classList.add('active'); }
    });
    mapData.countries[id].neighbour.forEach(function (neighborId) {
        var neighbor = getCountry(neighborId);
        var position = mapData.positions[neighborId];
        var ring = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
        var relation = !hovered || !neighbor ? '' : (hovered.owner === neighbor.owner ? ' friendly' : ' enemy');
        ring.setAttribute('class', 'map-reach-ring' + relation);
        ring.setAttribute('cx', position.x);
        ring.setAttribute('cy', position.y);
        ring.setAttribute('rx', 27);
        ring.setAttribute('ry', 27);
        svg.appendChild(ring);
    });
}

$(document).on('mouseenter', '.svg-content > g.territory-marker', function () { highlightRoutes(parseInt(this.id, 10)); });
$(document).on('mouseleave', '.svg-content > g.territory-marker', clearRouteHighlight);
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

// Flattens the server's per-player territory lists into one marker list.
function collectCircles(players, oneUnitEach) {
    var list = [];
    Object.keys(players).forEach(function (key) {
        var player = players[key];
        player.countries.forEach(function (country) {
            if (oneUnitEach) { country.units = 1; }
            list.push({country: country, color: player.color, owner: player.id});
        });
    });
    return list;
}

gameInfra.on('render_map', function (data) {
    circles = collectCircles(data, false);
    drawMap();
});

gameInfra.on('render_no_army_map', function (data) {
    circles = collectCircles(data, true);
});

// Enemies first with one unit each, then your own real numbers; show gold relies on this order.
gameInfra.on('render_map_everyone_deploy', function (data, playersData) {
    circles = collectCircles(data, true).concat(collectCircles(playersData, false));
    drawMap();
});

var PLAYER_COLOR_HEX = {
    red: '#d33a2c',
    blue: '#2d5fa8',
    orange: '#ee9a1c',
    green: '#3e8b3c',
    purple: '#7c4b9e',
    black: '#3b3632'
};

function getPlayerColorHex(color) {
    return PLAYER_COLOR_HEX[color] || color || '#7fdc5a';
}

gameInfra.on('render_disabled_countries', function (countries) {
    disabledCountries = [];

    for (var i = 0; i < countries.length; i++) {
        disabledCountries.push({
            id: countries[i].id,
            units: countries[i].units,
            defeatedColor: countries[i].defeatedColor
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
        circle.classList.remove('disabled-country', 'marker-from', 'marker-to',
            'marker-color-red', 'marker-color-blue', 'marker-color-orange',
            'marker-color-green', 'marker-color-purple', 'marker-color-black');
        circle.style.removeProperty('--marker-to-color');
        text.textContent = circles[i].country.units;
        text.setAttribute('fill', 'white');
        g.id = circles[i].country.id;
    }

    if(circles.length !== countriesGold.length){
        for (var i = 0; i < disabledCountries.length; i++) {
            var g = document.getElementsByTagName('g')[circles[i].country.id];
            var circle = document.getElementsByTagName('circle')[disabledCountries[i].id];
            var text = document.getElementsByTagName('text')[disabledCountries[i].id];
            circle.setAttribute('fill', '#a39a8b');
            circle.classList.add('disabled-country');
            if (disabledCountries[i].defeatedColor) {
                circle.classList.add('marker-to', 'marker-color-' + disabledCountries[i].defeatedColor);
                circle.style.setProperty('--marker-to-color', getPlayerColorHex(disabledCountries[i].defeatedColor));
            }
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
        circle.setAttribute('fill', '#e8a820');
        text.setAttribute('fill', '#231d17');
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
            var regionIncome = mapContinents.map(function (region) {
                return '<p>' + region.continent + ': ' + region.gold + ' gold</p>';
            }).join('');
            $('.phase-message').html('<div class="show-gold">' + regionIncome + '</div>');
        }
    });
});

drawGold();

// Resize map
function resizeImage(){
    var mobileBool = (isMobile ? 32 : 0) // Mobile or not
    var winHeight = $(window).height() - $('#game_header').outerHeight() - mobileBool;
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


