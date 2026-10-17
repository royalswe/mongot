'use strict';

// Highlights a marker as the origin ('from') or destination ('to') of an attack or move; drawMap clears it.
function markSelected(thisCountry, role, color) {
    const circle = thisCountry.querySelector('circle');
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
        const form = event.currentTarget;
        const returnFocusId = eventName === 'battle' ? form.dataset.originCountryId : form.dataset.countryId;
        const keyboardFocus = form.classList.contains('keyboard-focus-visible');
        gameInfra.emit(eventName, parseInt(fromId, 10), parseInt(toId, 10), parseInt(toOwner, 10), parseInt(document.getElementById('unit_output').value, 10));
        document.querySelectorAll('.remove_unit_bar').forEach(function (bar) { bar.remove(); });
        clearActionSelection();
        drawMap();
        focusTerritory(returnFocusId, keyboardFocus);
    });
}

function clearActionSelection() {
    attackFrom = null;
    countryFrom = null;
    clearRouteSelection();
    removeAimTank();
}

function actionTargets(sourceId, action) {
    const source = getCountry(sourceId);
    if (!source || source.country.units <= 1) { return []; }
    return source.country.neighbour.filter(function (neighborId) {
        const neighbor = getCountry(neighborId);
        if (!neighbor) { return false; }
        return action === 'battle' ? neighbor.owner !== activePlayer : neighbor.owner === activePlayer;
    });
}

function selectActionOrigin(id, marker, action) {
    const targets = actionTargets(id, action);
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
window.attackFrom = undefined;

function battle(latestClickedCountry, thisCountry, keyboardActivation) {
    latestClickedCountry = Number(latestClickedCountry);
    const country = getCountry(latestClickedCountry);
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

    const attackersCountry = getCountry(attackFrom);
    if (!attackersCountry || actionTargets(attackFrom, 'battle').indexOf(latestClickedCountry) === -1) { return; }
    const fromId = attackFrom;
    showUnitBar(attackersCountry.country.units, latestClickedCountry, keyboardActivation, fromId);
    markSelected(thisCountry, 'to', country.color);
    lockAimTank(latestClickedCountry);
    showRouteSelection(fromId, [latestClickedCountry], latestClickedCountry);
    attackFrom = null;
    sendUnitsOnSubmit('battle', fromId, latestClickedCountry, country.owner);
}

/**
 * Tactical movement
 */
window.countryFrom = undefined;
function tacticalMove(latestClickedCountry, thisCountry, keyboardActivation) {
    latestClickedCountry = Number(latestClickedCountry);
    const country = getCountry(latestClickedCountry);
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

    const fromCountry = getCountry(countryFrom);
    if (actionTargets(countryFrom, 'tactical_move').indexOf(latestClickedCountry) === -1) {
        if (actionTargets(latestClickedCountry, 'tactical_move').length) {
            selectActionOrigin(latestClickedCountry, thisCountry, 'tactical_move');
        }
        return;
    }

    const fromId = countryFrom;
    showUnitBar(fromCountry.country.units, latestClickedCountry, keyboardActivation, fromId);
    markSelected(thisCountry, 'to');
    showRouteSelection(fromId, [latestClickedCountry], latestClickedCountry);
    countryFrom = null;
    sendUnitsOnSubmit('tactical_move', fromId, latestClickedCountry, country.owner);
}

function showUnitBar(units, clickedCountry, keyboardActivation, originCountryId) {
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

    const output = document.getElementById('unit_output');
    const slider = document.getElementById('unit_input');
    output.readOnly = window.matchMedia('(pointer: coarse)').matches;
    output.inputMode = output.readOnly ? 'none' : 'numeric';
    const form = output.form;
    output.form.dataset.countryId = clickedCountry;
    output.form.dataset.originCountryId = originCountryId;
    form.classList.add(keyboardActivation ? 'keyboard-focus-visible' : 'suppress-focus-ring');
    let typed = '';
    const typeUnits = function (key) {
        typed = key === 'Backspace' ? typed.slice(0, -1) : typed + key;
        if (Number(typed) > units) { typed = key === 'Backspace' ? '' : key; }
        if (typed === '0') { typed = ''; }
        output.value = String(Math.max(1, Math.min(units, Number(typed) || 1)));
        slider.value = output.value;
    };
    const changeUnits = function (amount) {
        typed = '';
        const current = Number(output.value) || 1;
        output.value = String(amount > 0 ? Math.min(units, current + 1) : (current > 1 ? current - 1 : units));
        slider.value = output.value;
    };
    form.addEventListener('click', function (event) {
        if (event.target.matches('.sub')) { changeUnits(-1); }
        if (event.target.matches('.add')) { changeUnits(1); }
    });
    form.addEventListener('pointerdown', function () {
        form.classList.remove('keyboard-focus-visible');
        form.classList.add('suppress-focus-ring');
    });
    form.addEventListener('keydown', function (event) {
        form.classList.remove('suppress-focus-ring');
        form.classList.add('keyboard-focus-visible');
        if (/^[0-9]$/.test(event.key) || event.key === 'Backspace') {
            event.preventDefault();
            typeUnits(event.key);
        }
        else if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
            event.preventDefault();
            changeUnits(1);
        }
        else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
            event.preventDefault();
            changeUnits(-1);
        }
        else if (event.key === 'Escape') {
            event.preventDefault();
            document.getElementById('cancel_units').click();
        }
        else if (event.key === ' ' || event.key === 'Enter') {
            event.preventDefault();
            form.requestSubmit();
        }
    });
    output.addEventListener('input', function () {
        output.value = String(Math.max(1, Math.min(units, Number(output.value.replace(/\D/g, '')) || 1)));
        slider.value = output.value;
    });
    slider.addEventListener('input', function () {
        typed = '';
        output.value = slider.value;
    });
    positionUnitBar();
    setTimeout(function () {
        if (document.getElementById('unit_output') === output && (!output.readOnly || keyboardActivation)) {
            output.focus({preventScroll: true});
        }
    }, 0);
}

function positionUnitBar() {
    const form = document.getElementById('unit_bar');
    if (!form) { return; }
    const board = document.getElementById('game_board');
    const map = document.querySelector('.svg-container');
    if (board.getBoundingClientRect().width <= 720) {
        if (form.parentNode !== board) { board.appendChild(form); }
        return;
    }
    if (form.parentNode !== map) { map.appendChild(form); }
    const target = document.getElementById(form.dataset.countryId).querySelector('circle').getBoundingClientRect();
    const container = map.getBoundingClientRect();
    const bounds = form.getBoundingClientRect();
    form.style.setProperty('--unit-bar-top', Math.max(0, Math.min(container.height - bounds.height, target.top - container.top - bounds.height - 8)) + 'px');
    form.style.setProperty('--unit-bar-left', Math.max(0, Math.min(container.width - bounds.width, target.left - container.left - bounds.width / 2 + 12)) + 'px');
}

document.getElementById('game_board').addEventListener('click', function (event) {
    if (!event.target.closest('#cancel_units')) { return; }
    const form = document.getElementById('unit_bar');
    const returnFocusId = form && (phase === 'Battle' ? form.dataset.originCountryId : form.dataset.countryId);
    const keyboardFocus = form && form.classList.contains('keyboard-focus-visible');
    document.querySelectorAll('.remove_unit_bar').forEach(function (bar) { bar.remove(); });
    clearActionSelection();
    drawMap();
    if (returnFocusId !== null && returnFocusId !== undefined) { focusTerritory(returnFocusId, keyboardFocus); }
});

document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape' || event.defaultPrevented) { return; }
    if (!document.getElementById('unit_bar')) { return; }
    event.preventDefault();
    document.getElementById('cancel_units').click();
});