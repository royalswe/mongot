'use strict';
window.circles = [];
window.disabledCountries = [];
window.countriesGold = [];
window.mapContinents = [];
window.mapData = undefined;
window.routeSelection = null;

gameInfra.on('map_info', function (map) {
    clearRouteSelection();
    mapData = map;
    countriesGold = map.countries.map(function (country) {
        return { id: country.id, gold: country.gold };
    });
    mapContinents = map.continents;

    const svg = document.querySelector('.svg-content');
    svg.dataset.mapId = map.id;
    svg.classList.remove('map-archipelago', 'map-frontier', 'map-world', 'map-original', 'map-quick');
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
    const svg = document.querySelector('.svg-content');
    const groups = territoryGroups();
    const insertBefore = svg.querySelector(':scope > filter, :scope > defs');
    while (groups.length < count) {
        let group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        let circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        let text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
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
        group.setAttribute('role', 'button');
        group.setAttribute('tabindex', id === 0 ? '0' : '-1');
        group.setAttribute('aria-keyshortcuts', 'ArrowUp ArrowDown ArrowLeft ArrowRight Enter Space');
        group.setAttribute('aria-label', mapData && mapData.countries[id] ? mapData.countries[id].name || 'Territory ' + (id + 1) : 'Territory ' + (id + 1));
    });
    updateTerritoryActionState();
}

function updateTerritoryActionState() {
    territoryGroups().forEach(function (group) {
        group.setAttribute('aria-disabled', String(!playerEnabled));
    });
}

function applyMapPositions(map) {
    const groups = territoryGroups();
    map.positions.forEach(function (position, id) {
        const group = groups[id];
        if (!group) { return; }
        const circle = group.querySelector('circle');
        const text = group.querySelector('text');
        circle.style.transition = 'none'; // otherwise cx/cy slide in from the original layout
        circle.setAttribute('cx', position.x);
        circle.setAttribute('cy', position.y);
        circle.getBoundingClientRect();
        circle.style.transition = '';
        text.setAttribute('x', position.x);
        circle.setAttribute('r', 20);
        text.style.removeProperty('font-size');
        text.setAttribute('y', position.y + 7);
        group.id = id;
        const title = group.querySelector('title') || document.createElementNS('http://www.w3.org/2000/svg', 'title');
        title.textContent = map.countries[id].name || 'Territory ' + (id + 1);
        group.setAttribute('aria-label', title.textContent + ' territory');
        if (!title.parentNode) { group.insertBefore(title, group.firstChild); }
    });
}

function drawConnections(map) {
    clearRouteSelection();
    document.querySelectorAll('.map-connection, .map-connection-casing').forEach(function (line) { line.remove(); });
    const svg = document.querySelector('.svg-content');
    const routeKey = function (link) { return Math.min(link[0], link[1]) + '-' + Math.max(link[0], link[1]); };
    const seaRoutes = (map.seaLinks || []).map(routeKey);
    const wrapRoutes = (map.wrapLinks || []).map(routeKey);
    const boardWidth = svg.viewBox.baseVal.width;
    const casings = document.createDocumentFragment();
    const routes = document.createDocumentFragment();

    map.countries.forEach(function (country) {
        country.neighbour.forEach(function (neighborId) {
            if (neighborId <= country.id) { return; }
            const from = map.positions[country.id];
            const to = map.positions[neighborId];
            const key = country.id + '-' + neighborId;
            let isSea = seaRoutes.indexOf(key) > -1;
            let segments = [[from, to]];
            if (wrapRoutes.indexOf(key) > -1) {
                // Drawn as two stubs leaving opposite board edges, as if the map wrapped around.
                const shift = from.x < to.x ? boardWidth : -boardWidth;
                segments = [[from, {x: to.x - shift, y: to.y}], [to, {x: from.x + shift, y: from.y}]];
                isSea = true;
            }
            const routeClass = isSea ? 'map-sea' : 'map-land';
            segments.forEach(function (segment) {
                [['map-connection-casing ' + routeClass, casings], ['map-connection ' + routeClass, routes]].forEach(function (style) {
                    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
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

function clearRouteElements() {
    document.querySelector('.svg-content').classList.remove('route-focus');
    document.querySelector('.svg-content').classList.remove('route-selection');
    document.querySelectorAll('.map-connection.route-preview, .map-connection-casing.route-preview, .map-connection.route-legal, .map-connection-casing.route-legal, .map-connection.active, .map-connection-casing.active').forEach(function (line) {
        line.classList.remove('route-preview', 'route-legal', 'active');
    });
    document.querySelectorAll('.map-reach-ring').forEach(function (ring) { ring.remove(); });
}

function clearRouteSelection() {
    routeSelection = null;
    clearRouteElements();
}

function appendReachRings(originId, targetIds) {
    const svg = document.querySelector('.svg-content');
    const origin = getCountry(originId);
    targetIds.forEach(function (neighborId) {
        const neighbor = getCountry(neighborId);
        const position = mapData.positions[neighborId];
        const ring = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
        const relation = !origin || !neighbor ? '' : (origin.owner === neighbor.owner ? ' friendly' : ' enemy');
        ring.setAttribute('class', 'map-reach-ring' + relation);
        ring.setAttribute('cx', position.x);
        ring.setAttribute('cy', position.y);
        ring.setAttribute('rx', 27);
        ring.setAttribute('ry', 27);
        svg.appendChild(ring);
    });
}

function showRouteSelection(originId, targetIds, activeTargetId) {
    originId = Number(originId);
    targetIds = targetIds.map(Number);
    if (activeTargetId !== undefined && activeTargetId !== null) { activeTargetId = Number(activeTargetId); }
    if (!mapData || !mapData.positions || !mapData.countries[originId]) {
        clearRouteSelection();
        return;
    }
    routeSelection = {originId: originId, targetIds: targetIds.slice(), activeTargetId: activeTargetId};
    clearRouteElements();
    const svg = document.querySelector('.svg-content');
    svg.classList.add('route-focus', 'route-selection');
    document.querySelectorAll('.map-connection, .map-connection-casing').forEach(function (line) {
        const a = Number(line.dataset.a), b = Number(line.dataset.b);
        const targetId = a === originId ? b : b === originId ? a : null;
        if (targetId === null || targetIds.indexOf(targetId) === -1) { return; }
        line.classList.add('route-legal');
        if (targetId === activeTargetId) { line.classList.add('active'); }
    });
    appendReachRings(originId, targetIds);
}

// Hover previews every adjacent territory; a selected action keeps priority over hover.
function highlightRoutes(id) {
    if (routeSelection) { return; }
    clearRouteElements();
    if (!mapData || !mapData.positions || !mapData.countries[id]) { return; }
    const svg = document.querySelector('.svg-content');
    svg.classList.add('route-focus');
    document.querySelectorAll('.map-connection, .map-connection-casing').forEach(function (line) {
        if ((Number(line.dataset.a) === id || Number(line.dataset.b) === id) && line.classList.contains('map-land')) {
            line.classList.add('route-preview');
        }
    });
    appendReachRings(id, mapData.countries[id].neighbour);
}

function clearRouteHighlight() {
    if (routeSelection) { return; }
    clearRouteElements();
}

window.historyHighlightTimer = undefined;
function highlightHistoryAction(action) {
    clearTimeout(historyHighlightTimer);
    document.querySelectorAll('.history-highlight').forEach(function (element) {
        element.classList.remove('history-highlight');
    });

    const territoryIds = action.type === 'deploy' ? [action.country] : [action.from, action.to];
    territoryIds.forEach(function (id) {
        const marker = document.getElementById(String(id));
        if (marker && marker.classList.contains('territory-marker')) { marker.classList.add('history-highlight'); }
    });

    if (action.from !== undefined && action.to !== undefined) {
        document.querySelectorAll('.map-connection, .map-connection-casing').forEach(function (line) {
            const a = Number(line.dataset.a), b = Number(line.dataset.b);
            if ((a === Number(action.from) && b === Number(action.to)) || (a === Number(action.to) && b === Number(action.from))) {
                line.classList.add('history-highlight');
            }
        });
    }

    historyHighlightTimer = setTimeout(function () {
        document.querySelectorAll('.history-highlight').forEach(function (element) {
            element.classList.remove('history-highlight');
        });
    }, 2000);
}

document.addEventListener('mouseover', function (event) {
    const marker = event.target.closest('.svg-content > g.territory-marker');
    if (marker && !marker.contains(event.relatedTarget)) { highlightRoutes(parseInt(marker.id, 10)); }
});
document.addEventListener('mouseout', function (event) {
    const marker = event.target.closest('.svg-content > g.territory-marker');
    if (marker && !marker.contains(event.relatedTarget)) { clearRouteHighlight(); }
});
/**
 * Attack effects: a tank aims from the attacking territory, fires a shell and the target explodes.
 */
window.SVG_NS = 'http://www.w3.org/2000/svg';
window.BARREL_LENGTH = 26;
window.TANK_SCALE = 1.5;
window.aimTank = null;

function svgElement(name, attributes, parent) {
    const element = document.createElementNS(SVG_NS, name);
    Object.keys(attributes).forEach(function (key) { element.setAttribute(key, attributes[key]); });
    if (parent) { parent.appendChild(element); }
    return element;
}

function markerCenter(id) {
    const circle = document.getElementsByTagName('circle')[id];
    return {x: Number(circle.getAttribute('cx')), y: Number(circle.getAttribute('cy'))};
}

// Appended last so territory circles keep their tag-order indexes.
function createTank(id) {
    const center = markerCenter(id);
    const y = center.y - 36 < 20 ? center.y + 36 : center.y - 36; // tracks rest on the marker edge, clear of its unit count
    const country = getCountry(id);
    const tank = svgElement('g', {class: 'attack-tank', transform: 'translate(' + center.x + ' ' + y + ') scale(' + TANK_SCALE + ')'});
    tank.style.setProperty('--tank-color', getPlayerColorHex(country && country.color));
    svgElement('rect', {class: 'tank-tread', x: -19, y: 3, width: 38, height: 10, rx: 5}, tank);
    svgElement('rect', {class: 'tank-hull', x: -16, y: -5, width: 32, height: 11, rx: 3}, tank);
    const turret = svgElement('g', {class: 'tank-turret'}, tank);
    const recoil = svgElement('g', {class: 'tank-recoil'}, turret);
    svgElement('rect', {class: 'tank-barrel', x: 4, y: -2.5, width: BARREL_LENGTH - 4, height: 5, rx: 1.5}, recoil);
    svgElement('circle', {class: 'tank-dome', r: 8}, turret);
    tank.pivot = {x: center.x, y: y - 3 * TANK_SCALE};
    document.querySelector('.svg-content').appendChild(tank);
    return tank;
}

function aimTurret(tank, point) {
    const angle = Math.atan2(point.y - tank.pivot.y, point.x - tank.pivot.x);
    tank.querySelector('.tank-turret').setAttribute('transform', 'translate(0 -3) rotate(' + (angle * 180 / Math.PI) + ')');
    return angle;
}

function showAimTank(fromId, targetIds) {
    removeAimTank();
    aimTank = createTank(fromId);
    if (targetIds.length) { aimTurret(aimTank, markerCenter(targetIds[0])); }
}

function lockAimTank(targetId) {
    if (!aimTank) { return; }
    aimTank.locked = true;
    aimTurret(aimTank, markerCenter(targetId));
}

function removeAimTank() {
    if (aimTank) { aimTank.remove(); }
    aimTank = null;
}

document.querySelector('.svg-content').addEventListener('mousemove', function (event) {
    if (!aimTank || aimTank.locked) { return; }
    const point = this.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    aimTurret(aimTank, point.matrixTransform(this.getScreenCTM().inverse()));
});

function showBlast(id, size) {
    const svg = document.querySelector('.svg-content');
    const center = markerCenter(id);
    const blast = svgElement('g', {class: 'map-blast', transform: 'translate(' + center.x + ' ' + center.y + ') scale(' + (size || 1) + ')'}, svg);
    const fade = {easing: 'ease-out', fill: 'both'};
    const spikes = [];
    for (let k = 0; k < 24; k += 1) {
        let radius = k % 2 ? 20 : 36 + Math.random() * 8;
        spikes.push((Math.cos(k * Math.PI / 12) * radius).toFixed(1) + ',' + (Math.sin(k * Math.PI / 12) * radius).toFixed(1));
    }

    svgElement('polygon', {class: 'blast-burst', points: spikes.join(' ')}, blast).animate(
        [{transform: 'scale(.2) rotate(0deg)', opacity: 1}, {transform: 'scale(1.2) rotate(12deg)', opacity: 1, offset: .5}, {transform: 'scale(1.4) rotate(20deg)', opacity: 0}], Object.assign({duration: 460}, fade));
    svgElement('circle', {class: 'blast-ring', r: 18}, blast).animate(
        [{transform: 'scale(.4)', opacity: .9}, {transform: 'scale(3.4)', opacity: 0}], Object.assign({duration: 560}, fade));
    svgElement('circle', {class: 'blast-fire', r: 24}, blast).animate(
        [{transform: 'scale(.2)', opacity: 1}, {transform: 'scale(1.5)', opacity: 1, offset: .45}, {transform: 'scale(1.8)', opacity: 0}], Object.assign({duration: 520}, fade));
    svgElement('circle', {class: 'blast-core', r: 13}, blast).animate(
        [{transform: 'scale(.3)', opacity: 1}, {transform: 'scale(1.4)', opacity: 0}], Object.assign({duration: 300}, fade));

    for (let i = 0; i < 3; i += 1) {
        svgElement('circle', {class: 'blast-smoke', cx: (i - 1) * 13, cy: -3, r: 12}, blast).animate(
            [{transform: 'translate(0, 0) scale(.5)', opacity: 0}, {transform: 'translate(0, -8px) scale(1.1)', opacity: .65, offset: .3}, {transform: 'translate(0, -26px) scale(1.7)', opacity: 0}],
            Object.assign({duration: 950, delay: 300}, fade));
    }
    for (let j = 0; j < 10; j += 1) {
        let angle = (j / 10) * Math.PI * 2 + Math.random() * .5;
        let distance = 44 + Math.random() * 24;
        svgElement('rect', {class: 'blast-debris', x: -3, y: -3, width: 6, height: 6}, blast).animate(
            [{transform: 'translate(0, 0) rotate(0deg)', opacity: 1}, {transform: 'translate(' + Math.cos(angle) * distance + 'px, ' + Math.sin(angle) * distance + 'px) rotate(' + (180 + Math.random() * 360) + 'deg)', opacity: 0}],
            Object.assign({duration: 520 + Math.random() * 200}, fade));
    }

    const marker = document.getElementsByTagName('g')[id];
    marker.animate([{transform: 'translate(0, 0)'}, {transform: 'translate(-3px, 2px)'}, {transform: 'translate(3px, -2px)'}, {transform: 'translate(-2px, -1px)'}, {transform: 'translate(0, 0)'}], {duration: 300});
    setTimeout(function () { blast.remove(); }, 1100);
}

gameInfra.on('attack_animation', function (fromId, toId) {
    const svg = document.querySelector('.svg-content');
    const tank = createTank(fromId);
    const target = markerCenter(toId);
    const angle = aimTurret(tank, target);
    const muzzle = {x: tank.pivot.x + Math.cos(angle) * BARREL_LENGTH * TANK_SCALE, y: tank.pivot.y + Math.sin(angle) * BARREL_LENGTH * TANK_SCALE};
    const travel = {x: target.x - muzzle.x, y: target.y - muzzle.y};
    const flightTime = Math.min(420, 160 + Math.hypot(travel.x, travel.y) * .8);

    tank.querySelector('.tank-recoil').animate([{transform: 'translateX(0)'}, {transform: 'translateX(-7px)', offset: .2}, {transform: 'translateX(0)'}], {duration: 360, easing: 'ease-out'});
    const flash = svgElement('circle', {class: 'muzzle-flash', cx: muzzle.x, cy: muzzle.y, r: 8}, svg);
    flash.animate([{transform: 'scale(.4)', opacity: 1}, {transform: 'scale(1.7)', opacity: 0}], {duration: 180, easing: 'ease-out', fill: 'forwards'}).onfinish = function () { flash.remove(); };

    const shell = svgElement('circle', {class: 'tank-shell', cx: muzzle.x, cy: muzzle.y, r: 3.5}, svg);
    shell.animate([{transform: 'translate(0, 0)'}, {transform: 'translate(' + travel.x + 'px, ' + travel.y + 'px)'}], {duration: flightTime, easing: 'ease-in', fill: 'forwards'}).onfinish = function () {
        shell.remove();
        showBlast(toId);
    };
    tank.animate([{opacity: 1}, {opacity: 0}], {duration: 250, delay: flightTime + 500, fill: 'forwards'}).onfinish = function () { tank.remove(); };
});

// Defenders that hold out fire back at the attacking territory.
gameInfra.on('nuke_country', function (id) {
    showBlast(id, .7);
});

function bounceMarker(id) {
    const circle = document.getElementsByTagName('circle')[id];
    circle.classList.toggle('bounce');
    circle.setAttribute('r', 25);
    setTimeout(function() {
        circle.classList.toggle('bounce');
        circle.setAttribute('r', 20);
    }, 300);
}

// Labels sit directly in the svg: a group holding circle and text would be mistaken for a territory.
function showUnitLabel(id, text, kind) {
    const center = markerCenter(id);
    const label = svgElement('text', {class: 'unit-change ' + kind, x: center.x, y: center.y - 28}, document.querySelector('.svg-content'));
    label.textContent = text;
    label.animate([
        {transform: 'translate(0, 8px)', opacity: 0},
        {transform: 'translate(0, 0)', opacity: 1, offset: .2},
        {transform: 'translate(0, -24px)', opacity: 0}
    ], {duration: 1000, easing: 'ease-out', fill: 'both'}).onfinish = function () { label.remove(); };
}

gameInfra.on('bounce_country', function (id) {
    bounceMarker(id);
    showUnitLabel(id, '+1', 'gain');
});

function routeKind(fromId, toId) {
    const isRoute = function (link) { return (link[0] === fromId && link[1] === toId) || (link[0] === toId && link[1] === fromId); };
    if (!mapData) { return 'land'; }
    if ((mapData.wrapLinks || []).some(isRoute)) { return 'wrap'; }
    return (mapData.seaLinks || []).some(isRoute) ? 'sea' : 'land';
}

// Drawn facing right around (0, 0); the convoy animation rotates it onto the route.
function createVehicle(kind, color) {
    const vehicle = svgElement('g', {class: 'convoy-vehicle'});
    vehicle.style.setProperty('--convoy-color', color);
    if (kind === 'sea') {
        svgElement('path', {class: 'convoy-body', d: 'M-12 -1 L12 -1 L7 6 L-7 6 Z'}, vehicle);
        svgElement('rect', {class: 'convoy-cab', x: -5, y: -7, width: 8, height: 6}, vehicle);
        return vehicle;
    }
    svgElement('rect', {class: 'convoy-body', x: -11, y: -7, width: 14, height: 10, rx: 1.5}, vehicle);
    svgElement('rect', {class: 'convoy-cab', x: 3, y: -4, width: 7, height: 7, rx: 1.5}, vehicle);
    svgElement('circle', {class: 'convoy-wheel', cx: -6, cy: 4, r: 2.6}, vehicle);
    svgElement('circle', {class: 'convoy-wheel', cx: 6, cy: 4, r: 2.6}, vehicle);
    return vehicle;
}

gameInfra.on('move_animation', function (fromId, toId, units) {
    const svg = document.querySelector('.svg-content');
    const from = markerCenter(fromId);
    const to = markerCenter(toId);
    const kind = routeKind(fromId, toId);
    showUnitLabel(fromId, '-' + units, 'loss');

    const arrive = function () {
        bounceMarker(toId);
        showUnitLabel(toId, '+' + units, 'gain');
    };
    if (kind === 'wrap') { return arrive(); } // the route leaves one board edge, so there is no path to drive along

    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const degrees = angle * 180 / Math.PI;
    const flip = Math.abs(degrees) > 90 ? -1 : 1; // keeps vehicles upright when driving left
    const edge = {x: Math.cos(angle) * 24, y: Math.sin(angle) * 24};
    const start = {x: from.x + edge.x, y: from.y + edge.y};
    const end = {x: to.x - edge.x, y: to.y - edge.y};
    const duration = Math.max(450, Math.min(800, Math.hypot(end.x - start.x, end.y - start.y) * 1.6));
    const count = Math.min(5, Math.ceil(units / 3));
    const country = getCountry(fromId);
    const color = getPlayerColorHex(country && country.color);
    const place = function (point) {
        return 'translate(' + point.x + 'px, ' + point.y + 'px) rotate(' + degrees + 'deg) scale(1.6, ' + (1.6 * flip) + ')';
    };

    for (let i = 0; i < count; i += 1) {
        let vehicle = createVehicle(kind, color);
        svg.appendChild(vehicle);
        let drive = vehicle.animate([
            {transform: place(start), opacity: 0},
            {opacity: 1, offset: .15},
            {opacity: 1, offset: .85},
            {transform: place(end), opacity: 0}
        ], {duration: duration, delay: i * 110, easing: 'ease-in-out', fill: 'both'});
        drive.onfinish = (function (element, isLast) {
            return function () {
                element.remove();
                if (isLast) { arrive(); }
            };
        })(vehicle, i === count - 1);
    }
});

// Flattens the server's per-player territory lists into one marker list.
function collectCircles(players, oneUnitEach) {
    const list = [];
    Object.keys(players).forEach(function (key) {
        const player = players[key];
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

window.PLAYER_COLOR_HEX = {
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

    for (let i = 0; i < countries.length; i++) {
        disabledCountries.push({
            id: countries[i].id,
            units: countries[i].units,
            defeatedColor: countries[i].defeatedColor
        });
    }
});

function drawMap() {
    if (document.querySelector('.show-gold')) { return; } // dont render if user watching gold

    for (let i = 0; i < circles.length; i++) {
        let g = document.getElementsByTagName('g')[circles[i].country.id];
        let circle = document.getElementsByTagName('circle')[circles[i].country.id];
        let text = document.getElementsByTagName('text')[circles[i].country.id];
        circle.setAttribute('fill', 'url(#radial_'+ circles[i].color +')');
        circle.classList.remove('disabled-country', 'marker-from', 'marker-to',
            'marker-color-red', 'marker-color-blue', 'marker-color-orange',
            'marker-color-green', 'marker-color-purple', 'marker-color-black');
        circle.style.removeProperty('--marker-to-color');
        text.textContent = circles[i].country.units;
        text.setAttribute('fill', 'white');
        g.id = circles[i].country.id;
        g.setAttribute('aria-label', (mapData && mapData.countries[circles[i].country.id] && mapData.countries[circles[i].country.id].name || 'Territory ' + (circles[i].country.id + 1)) + ', ' + circles[i].country.units + ' units');
    }

    if(circles.length !== countriesGold.length){
        for (let i = 0; i < disabledCountries.length; i++) {
            let g = document.getElementsByTagName('g')[circles[i].country.id];
            let circle = document.getElementsByTagName('circle')[disabledCountries[i].id];
            let text = document.getElementsByTagName('text')[disabledCountries[i].id];
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
    updateTerritoryActionState();
}

function moveTerritoryFocus(current, key) {
    const directions = {ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1]};
    const direction = directions[key];
    const sourceCircle = current.querySelector('circle');
    const sourceX = Number(sourceCircle.getAttribute('cx'));
    const sourceY = Number(sourceCircle.getAttribute('cy'));
    let best = null;
    let bestScore = Infinity;

    territoryGroups().forEach(function (candidate) {
        if (candidate === current || candidate.style.display === 'none') { return; }
        const circle = candidate.querySelector('circle');
        const dx = Number(circle.getAttribute('cx')) - sourceX;
        const dy = Number(circle.getAttribute('cy')) - sourceY;
        const forward = dx * direction[0] + dy * direction[1];
        if (forward <= 0) { return; }
        const cross = Math.abs(dx * direction[1] - dy * direction[0]);
        const score = Math.hypot(dx, dy) + cross * 1.5;
        if (score < bestScore) {
            best = candidate;
            bestScore = score;
        }
    });

    if (!best) { return; }
    territoryGroups().forEach(function (group) { group.setAttribute('tabindex', group === best ? '0' : '-1'); });
    best.focus();
}

const svgContent = document.querySelector('.svg-content');
let keyboardNavigationPending = false;

document.addEventListener('keydown', function (event) {
    if (event.key === 'Tab') {
        keyboardNavigationPending = true;
        return;
    }
    if (event.target.closest && event.target.closest('.svg-content > g.territory-marker')) {
        svgContent.classList.add('keyboard-navigation');
    }
});

document.addEventListener('pointerdown', function () {
    keyboardNavigationPending = false;
    svgContent.classList.remove('keyboard-navigation');
});

function focusTerritory(id, keyboardFocus) {
    const marker = document.getElementById(String(id));
    if (!marker || !marker.classList.contains('territory-marker')) { return; }
    svgContent.classList.toggle('keyboard-navigation', Boolean(keyboardFocus));
    territoryGroups().forEach(function (group) { group.setAttribute('tabindex', group === marker ? '0' : '-1'); });
    marker.focus({preventScroll: true});
}

document.querySelector('.svg-content').addEventListener('focusin', function (event) {
    if (event.target === svgContent && keyboardNavigationPending) {
        const firstMarker = territoryGroups().find(function (group) { return group.style.display !== 'none'; });
        if (firstMarker) { focusTerritory(firstMarker.id, true); }
        keyboardNavigationPending = false;
        return;
    }
    const marker = event.target.closest('.svg-content > g.territory-marker');
    if (marker) {
        territoryGroups().forEach(function (group) { group.setAttribute('tabindex', group === marker ? '0' : '-1'); });
        if (keyboardNavigationPending) { svgContent.classList.add('keyboard-navigation'); }
    }
    keyboardNavigationPending = false;
});

document.querySelector('.svg-content').addEventListener('keydown', function (event) {
    const marker = event.target.closest('.svg-content > g.territory-marker');
    if (!marker) { return; }
    svgContent.classList.add('keyboard-navigation');
    if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        activateCountryMarker(marker, true);
    }
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();
        moveTerritoryFocus(marker, event.key);
    }
});

function drawGold() {
    for (let i = 0; i < countriesGold.length; i++) {
        let circle = document.getElementsByTagName('circle')[countriesGold[i].id];
        let text = document.getElementsByTagName('text')[countriesGold[i].id];
        circle.setAttribute('fill', '#e8a820');
        text.setAttribute('fill', '#231d17');
        text.textContent = countriesGold[i].gold;
    }
}
/**
 * Toggle 'Show gold' button
 */

document.getElementById('show_gold').addEventListener('click', function () {
        document.querySelectorAll('button.clicked-btn').forEach(function (button) { button.classList.remove('clicked-btn'); });
        if (document.querySelector('.show-gold')) {
            document.querySelector('.phase-message').innerHTML = '<div class="show-phase">Phase: ' + phase + '</div>';
            document.querySelector('.phase-info').innerHTML = phaseMessage;
            drawMap();
        }
        else {
            drawGold();
            this.classList.add('clicked-btn');
            document.querySelector('.phase-info').replaceChildren();
            const regionIncome = mapContinents.map(function (region) {
                return '<p>' + region.continent + ': ' + region.gold + ' gold</p>';
            }).join('');
            document.querySelector('.phase-message').innerHTML = '<div class="show-gold">' + regionIncome + '</div>';
        }
});

drawGold();

// Resize map
function resizeImage(){
    const container = document.querySelector('.svg-container');
    const content = document.querySelector('.svg-content');
    const bounds = container.getBoundingClientRect();
    const viewBox = content.viewBox.baseVal;
    const scale = Math.max(0, Math.min(bounds.width / viewBox.width, bounds.height / viewBox.height));
    content.style.width = viewBox.width * scale + 'px';
    content.style.height = viewBox.height * scale + 'px';
    if (typeof positionUnitBar === 'function') { positionUnitBar(); }
}

new ResizeObserver(resizeImage).observe(document.querySelector('.svg-container'));

resizeImage();


