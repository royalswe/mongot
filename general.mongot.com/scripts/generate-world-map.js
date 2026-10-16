'use strict';
// Regenerates public/img/game/maps/world.svg from game/maps.js and Risk_board.svg.
// Run after changing World positions or links: npm run map:world
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const maps = require('../game/maps');

const OUTPUT = path.join(__dirname, '../public/img/game/maps/world.svg');
const SOURCE = path.join(__dirname, './Risk_board.svg');
const FONT_DATA = fs.readFileSync(path.join(__dirname, '../public/fonts/BarlowCondensed-700.woff2')).toString('base64');
const W = 1147.148, H = 859.25, LABEL_GAP = 2, FRAME = 16;
const FONT = 14, LINE = 15, TAG_FONT = 17;
const INK = '#231d17', PAPER = '#fbf5e6', MUSTARD = '#e8a820';

const palette = {
    'North America': {fill: '#f0cf7a', label: [330, 405]},
    'South America': {fill: '#eaa27f', label: [215, 815]},
    'Europe': {fill: '#a9c1dd', label: [590, 58]},
    'Africa': {fill: '#ddb07c', label: [560, 815]},
    'Asia': {fill: '#b3cf92', label: [994, 350]},
    'Australia': {fill: '#c7abd3', label: [1020, 822]}
};

const world = maps.get('world');
const pos = world.positions;
const key = (a, b) => Math.min(a, b) + '-' + Math.max(a, b);
const wrap = new Set((world.wrapLinks || []).map(([a, b]) => key(a, b)));
const esc = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const f = (n) => Math.round(n * 10) / 10;

function labelLines(name) {
    const space = name.indexOf(' ');
    return space === -1 ? [[name]] : [[name.slice(0, space), name.slice(space + 1)], [name]];
}

function displayName(name) {
    return name.replace(/^(Northern|Southern|Western|Eastern)(?= )/, (direction) => ({
        Northern: 'N.', Southern: 'S.', Western: 'W.', Eastern: 'E.'
    })[direction]);
}

const tagText = (region) => ({ name: region.continent.toUpperCase(), bonus: ' +' + region.gold });

async function measureLabels() {
    const texts = [...new Set(world.countries.flatMap((country) => labelLines(displayName(country.name)).flat()))];
    const tags = world.continents.map((region) => tagText(region).name + tagText(region).bonus);
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage();
        await page.setContent(`<style>@font-face{font-family:Retro;font-weight:700;src:url(data:font/woff2;base64,${FONT_DATA})}</style>`);
        const widths = await page.evaluate(async ({ texts, tags, font, tagFont }) => {
            await document.fonts.load(font);
            const context = document.createElement('canvas').getContext('2d');
            const measure = (list, css) => {
                context.font = css;
                return Object.fromEntries(list.map((text) => [text, Math.ceil(context.measureText(text).width)]));
            };
            return Object.assign(measure(texts, font), measure(tags, tagFont));
        }, { texts, tags, font: `700 ${FONT}px Retro`, tagFont: `700 ${TAG_FONT}px Retro` });

        const sourcePage = await browser.newPage();
        await sourcePage.setContent(fs.readFileSync(SOURCE, 'utf8'));
        const geography = await sourcePage.evaluate(() => {
            const root = document.querySelector('svg');
            const layer = document.querySelector('#layer4');
            const groupMatrix = layer.transform.baseVal.consolidate().matrix;
            const paths = [...document.querySelectorAll('#layer4 path[id]')];
            return {
                width: parseFloat(root.getAttribute('width')),
                height: parseFloat(root.getAttribute('height')),
                matrix: [groupMatrix.a, groupMatrix.b, groupMatrix.c, groupMatrix.d, groupMatrix.e, groupMatrix.f],
                paths: Object.fromEntries(paths.map((path) => {
                    return [path.id, path.getAttribute('d')];
                }))
            };
        });
        await sourcePage.addStyleTag({content: `@font-face{font-family:Retro;font-weight:700;src:url(data:font/woff2;base64,${FONT_DATA})}`});
        const labels = await sourcePage.evaluate(({countries, positions}) => {
            const root = document.querySelector('svg');
            const layer = document.querySelector('#layer4');
            const matrix = layer.transform.baseVal.consolidate().matrix;
            const scaleX = 1147.148 / parseFloat(root.getAttribute('width'));
            const scaleY = 859.25 / parseFloat(root.getAttribute('height'));
            const context = document.createElement('canvas').getContext('2d');
            const partitions = (words, lines) => {
                if (lines === 1) { return [[words.join(' ')]]; }
                const output = [];
                for (let end = 1; end <= words.length - lines + 1; end += 1) {
                    partitions(words.slice(end), lines - 1).forEach((rest) => {
                        output.push([words.slice(0, end).join(' ')].concat(rest));
                    });
                }
                return output;
            };
            const insideBox = (path, box) => {
                for (let x = box.x1; x <= box.x2; x += 2) {
                    for (let y = box.y1; y <= box.y2; y += 2) {
                        const local = new DOMPoint(x / scaleX - matrix.e, y / scaleY - matrix.f);
                        if (!path.isPointInFill(local)) { return false; }
                    }
                }
                return true;
            };
            const labelLines = (name) => {
                const space = name.indexOf(' ');
                return space === -1 ? [[name]] : [[name.slice(0, space), name.slice(space + 1)], [name]];
            };
            const territoryPaths = [...document.querySelectorAll('#layer4 path[id]')].map((path) => ({id: path.id, path}));
            return countries.map((country) => {
                const key = country.name === 'Yakutsk' ? 'yakursk' : country.name.toLowerCase().replace(/ /g, '_');
                const path = document.querySelector(`#layer4 #${key}`);
                const bounds = path.getBBox();
                const x1 = (bounds.x + matrix.e) * scaleX, x2 = (bounds.x + bounds.width + matrix.e) * scaleX;
                const y1 = (bounds.y + matrix.f) * scaleY, y2 = (bounds.y + bounds.height + matrix.f) * scaleY;
                const marker = positions[country.id];
                const centers = [];
                for (let y = y1 + 2; y <= y2 - 2; y += 2) {
                    for (let x = x1 + 2; x <= x2 - 2; x += 2) {
                        centers.push({x, y, distance: Math.hypot(x - marker.x, y - marker.y)});
                    }
                }
                centers.sort((a, b) => a.distance - b.distance);
                const words = country.displayName.split(' ');
                const layouts = [];
                for (let count = 1; count <= Math.min(3, words.length); count += 1) {
                    partitions(words, count).forEach((lines) => layouts.push(lines));
                }
                const options = [];
                const callouts = [];
                for (const size of [14, 12, 10, 9, 8, 7, 6]) {
                    context.font = `700 ${size}px Retro`;
                    const measured = layouts.map((lines) => ({
                        lines,
                        width: Math.max(...lines.map((line) => context.measureText(line).width)) + 4,
                        height: lines.length * size * 1.05 + 4
                    })).filter((layout) => layout.width < x2 - x1 && layout.height < y2 - y1)
                        .sort((a, b) => a.lines.length - b.lines.length || a.width - b.width);
                    for (const layout of measured) {
                        let found = 0;
                        for (const center of centers) {
                            const box = {
                                x1: center.x - layout.width / 2,
                                x2: center.x + layout.width / 2,
                                y1: center.y - layout.height / 2,
                                y2: center.y + layout.height / 2
                            };
                            if (box.x1 < x1 || box.x2 > x2 || box.y1 < y1 || box.y2 > y2 || !insideBox(path, box)) { continue; }
                            options.push({x: center.x, top: box.y1, w: layout.width, h: layout.height,
                                lines: layout.lines, fontSize: size, lineHeight: size * 1.05});
                            found += 1;
                            if (found === 1000) { break; }
                        }
                    }
                }
                const foreignPaths = territoryPaths.filter((entry) => entry.path !== path);
                for (const size of [12, 10, 9, 8, 7, 6]) {
                    context.font = `700 ${size}px Retro`;
                    labelLines(country.displayName).forEach((lines) => {
                        const width = Math.max(...lines.map((line) => context.measureText(line).width)) + 4;
                        const height = lines.length * size * 1.05 + 4;
                        for (let dy = -80; dy <= 80; dy += 8) {
                            for (let dx = -80; dx <= 80; dx += 8) {
                                if (!dx && !dy) { continue; }
                                const x = marker.x + dx, centerY = marker.y + dy;
                                const box = {x1: x - width / 2, x2: x + width / 2,
                                    y1: centerY - height / 2, y2: centerY + height / 2};
                                if (box.x1 < 16 || box.x2 > 1131 || box.y1 < 16 || box.y2 > 843) { continue; }
                                let touchesForeignLand = false;
                                for (let px = box.x1; px <= box.x2 && !touchesForeignLand; px += 4) {
                                    for (let py = box.y1; py <= box.y2 && !touchesForeignLand; py += 4) {
                                        const point = new DOMPoint(px / scaleX - matrix.e, py / scaleY - matrix.f);
                                        touchesForeignLand = foreignPaths.some((entry) => entry.path.isPointInFill(point));
                                    }
                                }
                                if (!touchesForeignLand) {
                                    callouts.push({x, top: box.y1, w: width, h: height, lines, fontSize: size,
                                        lineHeight: size * 1.05, distance: Math.hypot(dx, dy)});
                                }
                            }
                        }
                    });
                }
                return {inside: options, callouts};
            });
        }, {countries: world.countries.map(({id, name}) => ({id, name, displayName: displayName(name)})), positions: pos});
        return {widths, geography, labels};
    } finally {
        await browser.close();
    }
}

// Wrap links are drawn as two stubs leaving opposite board edges, like the client does.
const segments = [];
world.countries.forEach((country) => country.neighbour.forEach((other) => {
    if (other <= country.id) { return; }
    const a = pos[country.id], b = pos[other];
    if (wrap.has(key(country.id, other))) {
        const shift = a.x < b.x ? W : -W;
        segments.push([a, {x: b.x - shift, y: b.y}], [b, {x: a.x + shift, y: a.y}]);
    } else {
        segments.push([a, b]);
    }
}));

function segmentHitsBox(a, b, box) {
    const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 3);
    for (let i = 0; i <= steps; i += 1) {
        const x = a.x + (b.x - a.x) * i / steps, y = a.y + (b.y - a.y) * i / steps;
        if (x > box.x1 && x < box.x2 && y > box.y1 && y < box.y2) { return true; }
    }
    return false;
}

const overlap = (r, s) => r.x1 < s.x2 && s.x1 < r.x2 && r.y1 < s.y2 && s.y1 < r.y2;

function build(widths, geography) {
    const masks = [];
    const [matrixA, matrixB, matrixC, matrixD, matrixE, matrixF] = geography.matrix;
    const transform = [W / geography.width * matrixA, H / geography.height * matrixB,
        W / geography.width * matrixC, H / geography.height * matrixD,
        W / geography.width * matrixE, H / geography.height * matrixF].map((value) => Number(value.toFixed(6))).join(' ');
    const land = world.continents.map((region, index) => {
        const colors = palette[region.continent];
        const shapes = region.countries.map((id) => {
            const country = world.countries[id];
            const key = country.name === 'Yakutsk' ? 'yakursk' : country.name.toLowerCase().replace(/ /g, '_');
            const shape = geography.paths[key];
            if (!shape) { throw new Error('No reference outline for ' + country.name + '.'); }
            return {id, d: shape};
        });
        const paths = shapes.map((shape) => `<path d="${shape.d}" transform="matrix(${transform})" clip-rule="evenodd"/>`).join('');
        const borders = shapes.map((shape) => `<path data-territory-id="${shape.id}" d="${shape.d}" transform="matrix(${transform})"/>`).join('');
        masks.push(`    <clipPath id="land${index}" clipPathUnits="userSpaceOnUse">${paths}</clipPath>`);
        return [
            `  <rect width="${W}" height="${H}" fill="${colors.fill}" clip-path="url(#land${index})"/>`,
            `  <g clip-path="url(#land${index})" fill="none" stroke="${INK}" stroke-width="1.5" stroke-opacity=".55" stroke-linejoin="round">${borders}</g>`
        ].join('\n');
    }).join('\n');

    // Keep labels inside their territory when possible; otherwise place them only over open water.
    const blocked = [{x1: 0, x2: 195, y1: 0, y2: 70}, {x1: 890, x2: W, y1: 0, y2: 48}];
    const placed = [];
    const labelLeaders = [];
    const fits = (box, avoidRoutes = true) => box.x1 > FRAME && box.x2 < W - FRAME && box.y1 > FRAME && box.y2 < H - FRAME &&
        !blocked.some((other) => overlap(box, other)) &&
        !pos.some((p) => {
            const dx = Math.max(box.x1 - p.x, 0, p.x - box.x2);
            const dy = Math.max(box.y1 - p.y, 0, p.y - box.y2);
            return Math.hypot(dx, dy) < (p.radius || 20) + LABEL_GAP;
        }) &&
        !placed.some((other) => overlap(box, other)) &&
        (!avoidRoutes || !segments.some(([a, b]) => segmentHitsBox(a, b, box)));
    const names = world.countries.map((country) => {
        const labels = geography.labels[country.id];
        const boxOf = (o) => ({x1: o.x - o.w / 2, x2: o.x + o.w / 2, y1: o.top, y2: o.top + o.h});
        let choice = labels.inside.find((o) => fits(boxOf(o), false));
        let isCallout = false;
        if (!choice) {
            choice = labels.callouts.find((o) => fits(boxOf(o), false));
            isCallout = true;
        }
        if (!choice) {
            throw new Error('No free label spot for ' + country.name + '; adjust nearby map positions.');
        }
        const box = boxOf(choice);
        placed.push(box);
        if (isCallout) {
            const position = pos[country.id];
            const targetX = choice.x, targetY = choice.top + choice.h / 2;
            const dx = targetX - position.x, dy = targetY - position.y;
            const length = Math.hypot(dx, dy);
            const scale = Math.min((position.radius + 2) / length,
                Math.abs(dx) < 1 ? Infinity : choice.w / 2 / Math.abs(dx),
                Math.abs(dy) < 1 ? Infinity : choice.h / 2 / Math.abs(dy));
            const x1 = position.x + dx / length * (position.radius + 2);
            const y1 = position.y + dy / length * (position.radius + 2);
            const x2 = targetX - dx * scale;
            const y2 = targetY - dy * scale;
            labelLeaders.push(`<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${PAPER}" stroke-width="4"/>` +
                `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${INK}" stroke-width="1"/>`);
        }
        const baseline = choice.top + choice.fontSize;
        return `    <text data-territory-label="${country.id}"${isCallout ? ' data-callout="true"' : ''} x="${f(choice.x)}" y="${f(baseline)}" font-size="${choice.fontSize}">` +
            choice.lines.map((line, index) => index === 0 ? esc(line) : `<tspan x="${f(choice.x)}" dy="${f(choice.lineHeight)}">${esc(line)}</tspan>`).join('') + '</text>';
    }).join('\n');

    // Each continent gets an ink tag like a printed board legend: name plus its bonus.
    const continentLabels = world.continents.map((region) => {
        const [x, y] = palette[region.continent].label;
        const tag = tagText(region);
        const w = widths[tag.name + tag.bonus] + 16;
        const box = {x1: x - w / 2, x2: x + w / 2, y1: y - 18, y2: y + 7};
        if (!fits(box)) { throw new Error('The ' + region.continent + ' label collides; adjust its palette position.'); }
        placed.push(box);
        return `    <rect x="${f(box.x1)}" y="${box.y1}" width="${w}" height="25" fill="${INK}"/>` +
            `<text x="${x}" y="${y}">${esc(tag.name)}<tspan fill="${MUSTARD}">${esc(tag.bonus)}</tspan></text>`;
    }).join('\n');

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
  <defs>
    <style>@font-face{font-family:Retro;font-weight:700;src:url(data:font/woff2;base64,${FONT_DATA})}</style>
    <pattern id="halftone" width="10" height="10" patternUnits="userSpaceOnUse">
      <circle cx="5" cy="5" r="1.3" fill="${INK}" fill-opacity=".13"/>
    </pattern>
${masks.join('\n')}
  </defs>
  <rect width="${W}" height="${H}" fill="#8dbab6"/>
  <rect width="${W}" height="${H}" fill="url(#halftone)"/>
${land}
    <g fill="none" stroke-linecap="round" pointer-events="none">${labelLeaders.join('')}</g>
  <g font-family="Retro, Arial Narrow, sans-serif" font-size="${FONT}" font-weight="700" text-anchor="middle" fill="${INK}" stroke="${PAPER}" stroke-width="3" stroke-linejoin="round" paint-order="stroke">
${names}
  </g>
  <g font-family="Retro, Arial Narrow, sans-serif" font-size="${TAG_FONT}" font-weight="700" text-anchor="middle" fill="${PAPER}">
${continentLabels}
  </g>
  <rect x="4" y="4" width="${f(W - 8)}" height="${f(H - 8)}" fill="none" stroke="${INK}" stroke-width="8"/>
  <rect x="11" y="11" width="${f(W - 22)}" height="${f(H - 22)}" fill="none" stroke="${PAPER}" stroke-width="2"/>
</svg>
`;
}

measureLabels().then(({widths, geography, labels}) => {
    geography.labels = labels;
    fs.writeFileSync(OUTPUT, build(widths, geography));
    console.log('Wrote ' + path.relative(process.cwd(), OUTPUT));
}).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
