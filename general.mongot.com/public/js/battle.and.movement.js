'use strict';
/**
 * Battle
 */
var attackFrom;

function battle(latestClickedCountry, thisCountry) {

    var country = getCountry(latestClickedCountry);

    if (attackFrom && country && country.owner !== activePlayer) {

        var attackersCountry = getCountry(attackFrom);

        // Check that countries are neighbours and more than one unit
        if(country.country.neighbour.indexOf(attackersCountry.country.id) > -1 && attackersCountry.country.units > 1){
            showUnitBar(attackersCountry.country.units, latestClickedCountry);
            thisCountry.find("circle").css({"stroke-width": "2.5", "stroke": "lime"}); // Highlight clicked circle
        }
        else { drawMap(); } // Remove highlights

        attackFrom = null; // makes it possible to make a new country choise

        $('#unit_bar').submit(function () {
            gameInfra.emit('battle',
                parseInt(attackersCountry.country.id),
                parseInt(latestClickedCountry),
                parseInt(country.owner),
                parseInt($('#unit_output').val())); // number of attacking units
            $(".remove_unit_bar").remove();
            return false;
        });
    }

    if (country && country.owner === activePlayer)  {
        drawMap(); // Remove current highlight from circle
        $(".remove_unit_bar").remove();
        thisCountry.find("circle").css({"stroke-width": "2.5", "stroke": "white"}); // Highlight clicked circle
        attackFrom = latestClickedCountry;
    }
}

/**
 * Tactical movement
 */
var countryFrom;
function tacticalMove(latestClickedCountry, thisCountry) {

    var country = getCountry(latestClickedCountry);

    if (country.owner === activePlayer && countryFrom == null)  {
        drawMap(); // Remove current highlight from circle
        $(".remove_unit_bar").remove();
        thisCountry.find("circle").css({"stroke-width": "2.5", "stroke": "white"}); // Highlight clicked circle
        countryFrom = latestClickedCountry;
    }

    if (countryFrom && country.owner === activePlayer && latestClickedCountry !== countryFrom) {

        var fromCountry = getCountry(countryFrom);

        //Check that countries are neighbours and more than one unit
        if(country.country.neighbour.indexOf(fromCountry.country.id) > -1 && fromCountry.country.units > 1){
            showUnitBar(fromCountry.country.units, latestClickedCountry);
            thisCountry.find("circle").css({"stroke-width": "2.5", "stroke": "lime"}); // Highlight clicked circle
        }
        else { drawMap(); } // Remove highlights

        countryFrom = null; // makes it possible to make a new country choise
        $('#unit_bar').submit(function () {
            gameInfra.emit('tactical_move',
                parseInt(fromCountry.country.id),
                parseInt(latestClickedCountry),
                parseInt(country.owner),
                parseInt($('#unit_output').val())); // number of moving units
            $(".remove_unit_bar").remove();
            return false;
        });
    }
}

function showUnitBar(units, clickedCountry) {
    units -= 1;
    $('.remove_unit_bar').remove();

    if(isMobile) {
        $('.svg-container').after(
              '<div class="remove_unit_bar range-unit-bar"><form id="unit_bar">'
            + '<input type="range" id="unit_input" value="1" min="1" max="' + units + '" oninput="unit_output.value = unit_input.value">'
            + '<output id="unit_output">1</output>'
            + '<input type="submit" value="Send Units" id="send_units">'
            + '</form></div>');

        var rangeWidth =  units * 8;
        $('#unit_bar input[type="range"]').css('width', rangeWidth + '%');
    }
    else {
        var cy = $('#'+clickedCountry).find("circle").attr("cy");
        var cx = $('#'+clickedCountry).find("circle").attr("cx");

        var h = 859.25; //svg height
        var w = 1147.148; //svg width

        cy = parseInt(cy) - 135;
        cx = parseInt(cx) - 55;
        var top = (cy/h) * 100;
        var left = (cx/w) * 100;

        $('.svg-container').append(
            '<form class="remove_unit_bar input-unit-bar" id="unit_bar" style="top: '+ top +'%; left: '+ left +'%">'
            +'<input type="text" value="1" id="unit_output" class="example-color" autocomplete="off" min="1" max="' + units + '"/>'
            +'<input type="submit" value="V" id="send_units">'
            +'<input type="button" value="X" id="cancel_units">'
            +'</form>');

        var el = $('#unit_output');
        // add elements
        el.before('<span class="sub">-</span>');
        el.before('<span class="add">+</span>');

        // substract
        el.parent().on('click', '.sub', function () {
            if (el.val() > parseInt(el.attr('min')))
                el.val( function(i, oldval) { return --oldval; });
            else if (el.val() === '1')
                return el.val(units); // if 0 then return max value
        });
        // increment
        el.parent().on('click', '.add', function () {
            if (el.val() < parseInt(el.attr('max')))
                el.val( function(i, oldval) { return ++oldval; });
        });

        setTimeout(function() { // Timeout to make it work for safari
            $("#unit_output").focus().select();
        }, 0);

        // validate only integers
        $('#unit_output').keyup(function()
        {
            if (/\D/g.test(this.value)) {
                this.value = this.value.replace(/\D/g, '');
            }
            else if(this.value > units || this.value < 1){
                this.value = units;
            }
        });
    }

}

$('.svg-container').on('mousedown', '#cancel_units', function () {
    $('.remove_unit_bar').remove();
    drawMap();
});