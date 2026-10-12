'use strict';

// Highlights a marker as the origin ('from') or destination ('to') of an attack or move; drawMap clears it.
function markSelected(thisCountry, role, color) {
    var circle = thisCountry.querySelector('circle');
    circle.classList.add('marker-' + role);
    if (role === 'to' && color) {
        circle.classList.add('marker-color-' + color);
        if (typeof getPlayerColorHex === 'function') {
            circle.style.setProperty('--marker-to-color', getPlayerColorHex(color));
        }
    }
}

function sendUnitsOnSubmit(eventName, fromId, toId, toOwner) {
    document.getElementById('unit_bar').addEventListener('submit', function (event) {
        event.preventDefault();
        gameInfra.emit(eventName, parseInt(fromId, 10), parseInt(toId, 10), parseInt(toOwner, 10), parseInt(document.getElementById('unit_output').value, 10));
        document.querySelectorAll('.remove_unit_bar').forEach(function (bar) { bar.remove(); });
        clearActionSelection();
        drawMap();
    });
}

function clearActionSelection() {
    attackFrom = null;
    countryFrom = null;
    clearRouteSelection();
    removeAimTank();
}

function actionTargets(sourceId, action) {
    var source = getCountry(sourceId);
    if (!source || source.country.units <= 1) { return []; }
    return source.country.neighbour.filter(function (neighborId) {
        var neighbor = getCountry(neighborId);
        if (!neighbor) { return false; }
        return action === 'battle' ? neighbor.owner !== activePlayer : neighbor.owner === activePlayer;
    });
}

function selectActionOrigin(id, marker, action) {
    var targets = actionTargets(id, action);
    if (!targets.length) {
        clearActionSelection();
        drawMap();
        return;
    }
    clearRouteSelection();
    drawMap();
    document.querySelectorAll('.remove_unit_bar').forEach(function (bar) { bar.remove(); });
    markSelected(marker, 'from');
    if (action === 'battle') {
        attackFrom = id;
        showAimTank(id, targets);
    }
    else { countryFrom = id; }
    showRouteSelection(id, targets);
}

/**
 * Battle
 */
var attackFrom;

function battle(latestClickedCountry, thisCountry) {
    latestClickedCountry = Number(latestClickedCountry);
    var country = getCountry(latestClickedCountry);
    if (!country) { return; }
    if (country.owner === activePlayer) {
        if (attackFrom === latestClickedCountry) {
            clearActionSelection();
            drawMap();
            return;
        }
        selectActionOrigin(latestClickedCountry, thisCountry, 'battle');
        return;
    }
    if (attackFrom == null) { return; }

    var attackersCountry = getCountry(attackFrom);
    if (!attackersCountry || actionTargets(attackFrom, 'battle').indexOf(latestClickedCountry) === -1) { return; }
    var fromId = attackFrom;
    showUnitBar(attackersCountry.country.units, latestClickedCountry);
    markSelected(thisCountry, 'to', country.color);
    lockAimTank(latestClickedCountry);
    showRouteSelection(fromId, [latestClickedCountry], latestClickedCountry);
    attackFrom = null;
    sendUnitsOnSubmit('battle', fromId, latestClickedCountry, country.owner);
}

/**
 * Tactical movement
 */
var countryFrom;
function tacticalMove(latestClickedCountry, thisCountry) {
    latestClickedCountry = Number(latestClickedCountry);
    var country = getCountry(latestClickedCountry);
    if (!country || country.owner !== activePlayer) { return; }
    if (countryFrom == null) {
        selectActionOrigin(latestClickedCountry, thisCountry, 'tactical_move');
        return;
    }
    if (latestClickedCountry === countryFrom) {
        clearActionSelection();
        drawMap();
        return;
    }

    var fromCountry = getCountry(countryFrom);
    if (actionTargets(countryFrom, 'tactical_move').indexOf(latestClickedCountry) === -1) {
        return;
    }

    var fromId = countryFrom;
    showUnitBar(fromCountry.country.units, latestClickedCountry);
    markSelected(thisCountry, 'to');
    showRouteSelection(fromId, [latestClickedCountry], latestClickedCountry);
    countryFrom = null;
    sendUnitsOnSubmit('tactical_move', fromId, latestClickedCountry, country.owner);
}

function showUnitBar(units, clickedCountry) {
    units -= 1;
    document.querySelectorAll('.remove_unit_bar').forEach(function (bar) { bar.remove(); });

    document.querySelector('.svg-container').insertAdjacentHTML('beforeend',
        '<form class="remove_unit_bar input-unit-bar" id="unit_bar">'
        + '<button type="button" class="sub" aria-label="Decrease units">-</button>'
        + '<input type="text" inputmode="numeric" value="1" id="unit_output" aria-label="Units to send" autocomplete="off" min="1" max="' + units + '">'
        + '<button type="button" class="add" aria-label="Increase units">+</button>'
        + '<input type="range" id="unit_input" aria-label="Units to send" value="1" min="1" max="' + units + '">'
        + '<button type="submit" id="send_units" aria-label="Send units"><span class="desktop-unit-label">V</span><span class="mobile-unit-label">Send Units</span></button>'
        + '<button type="button" id="cancel_units" aria-label="Cancel">X</button>'
        + '</form>');

    var output = document.getElementById('unit_output');
    var slider = document.getElementById('unit_input');
    output.form.dataset.countryId = clickedCountry;
    output.form.addEventListener('click', function (event) {
        if (event.target.matches('.sub')) {
            output.value = String(Number(output.value) > 1 ? Number(output.value) - 1 : units);
        }
        if (event.target.matches('.add')) {
            output.value = String(Math.min(units, Number(output.value) + 1));
        }
        slider.value = output.value;
    });
    output.addEventListener('input', function () {
        output.value = String(Math.max(1, Math.min(units, Number(output.value.replace(/\D/g, '')) || 1)));
        slider.value = output.value;
    });
    slider.addEventListener('input', function () {
        output.value = slider.value;
    });
    positionUnitBar();
}

function positionUnitBar() {
    var form = document.getElementById('unit_bar');
    if (!form) { return; }
    var board = document.getElementById('game_board');
    var map = document.querySelector('.svg-container');
    if (board.getBoundingClientRect().width <= 720) {
        if (form.parentNode !== board) { board.appendChild(form); }
        return;
    }
    if (form.parentNode !== map) { map.appendChild(form); }
    var target = document.getElementById(form.dataset.countryId).querySelector('circle').getBoundingClientRect();
    var container = map.getBoundingClientRect();
    var bounds = form.getBoundingClientRect();
    form.style.setProperty('--unit-bar-top', Math.max(0, Math.min(container.height - bounds.height, target.top - container.top - bounds.height - 8)) + 'px');
    form.style.setProperty('--unit-bar-left', Math.max(0, Math.min(container.width - bounds.width, target.left - container.left - bounds.width / 2 + 12)) + 'px');
}

document.getElementById('game_board').addEventListener('click', function (event) {
    if (!event.target.closest('#cancel_units')) { return; }
    document.querySelectorAll('.remove_unit_bar').forEach(function (bar) { bar.remove(); });
    clearActionSelection();
    drawMap();
});