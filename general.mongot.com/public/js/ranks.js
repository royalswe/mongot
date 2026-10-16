// Crown image for a rating; used by the browser (global) and by the High Score view (Node).
const RANK_THRESHOLDS = [900, 1300, 1500, 1700, 1900, 2100, 2300, 2500, 2700, 2900];
if (typeof window !== 'undefined') { window.RANK_THRESHOLDS = RANK_THRESHOLDS; }

function rankIcon(points) {
    let tier = 0;
    while (tier < RANK_THRESHOLDS.length && points >= RANK_THRESHOLDS[tier]) { tier += 1; }
    return 'crown' + tier + '.png';
}

if (typeof module !== 'undefined') { module.exports = rankIcon; }
