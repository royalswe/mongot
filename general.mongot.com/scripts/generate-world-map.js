'use strict';
// Regenerates public/img/game/maps/world.svg from the World map data in game/maps.js.
// Run after changing World positions or links: npm run map:world
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const maps = require('../game/maps');

const OUTPUT = path.join(__dirname, '../public/img/game/maps/world.svg');
const FONT_DATA = fs.readFileSync(path.join(__dirname, '../public/fonts/BarlowCondensed-700.woff2')).toString('base64');
const W = 1147.148, H = 859.25, R = 50, MARKER = 23, FRAME = 16;
const FONT = 14, LINE = 15, TAG_FONT = 17;
const INK = '#231d17', PAPER = '#fbf5e6', MUSTARD = '#e8a820';

const palette = {
    'North America': {fill: '#f0cf7a', label: [300, 40]},
    'South America': {fill: '#eaa27f', label: [215, 815]},
    'Europe': {fill: '#a9c1dd', label: [590, 36]},
    'Africa': {fill: '#ddb07c', label: [560, 815]},
    'Asia': {fill: '#b3cf92', label: [855, 565]},
    'Australia': {fill: '#c7abd3', label: [1020, 822]}
};

const world = maps.get('world');
const pos = world.positions;
const key = (a, b) => Math.min(a, b) + '-' + Math.max(a, b);
const sea = new Set((world.seaLinks || []).map(([a, b]) => key(a, b)));
const wrap = new Set((world.wrapLinks || []).map(([a, b]) => key(a, b)));
const esc = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const f = (n) => Math.round(n * 10) / 10;

function labelLines(name) {
    const space = name.indexOf(' ');
    return space === -1 ? [[name]] : [[name.slice(0, space), name.slice(space + 1)], [name]];
}

const tagText = (region) => ({ name: region.continent.toUpperCase(), bonus: ' +' + region.gold });

async function measureLabels() {
    const texts = [...new Set(world.countries.flatMap((country) => labelLines(country.name).flat()))];
    const tags = world.continents.map((region) => tagText(region).name + tagText(region).bonus);
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage();
        await page.setContent(`<style>@font-face{font-family:Retro;font-weight:700;src:url(data:font/woff2;base64,${FONT_DATA})}</style>`);
        return await page.evaluate(async ({ texts, tags, font, tagFont }) => {
            await document.fonts.load(font);
            const context = document.createElement('canvas').getContext('2d');
            const measure = (list, css) => {
                context.font = css;
                return Object.fromEntries(list.map((text) => [text, Math.ceil(context.measureText(text).width)]));
            };
            return Object.assign(measure(texts, font), measure(tags, tagFont));
        }, { texts, tags, font: `700 ${FONT}px Retro`, tagFont: `700 ${TAG_FONT}px Retro` });
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

// Land: disks around territories joined by thick strokes and triangles along land links; sea links stay open water.
function landGeometry(ids, radius, color) {
    const inGroup = new Set(ids);
    const land = (a, b) => inGroup.has(b) && world.countries[a].neighbour.includes(b) && !sea.has(key(a, b));
    const parts = ids.map((id) => `<circle stroke="none" cx="${pos[id].x}" cy="${pos[id].y}" r="${radius}"/>`);
    ids.forEach((a) => ids.forEach((b) => {
        if (b > a && land(a, b)) {
            parts.push(`<line x1="${pos[a].x}" y1="${pos[a].y}" x2="${pos[b].x}" y2="${pos[b].y}"/>`);
            ids.forEach((c) => {
                if (c > b && land(a, c) && land(b, c)) {
                    parts.push(`<polygon points="${[a, b, c].map((id) => pos[id].x + ',' + pos[id].y).join(' ')}"/>`);
                }
            });
        }
    }));
    return `<g fill="${color}" stroke="${color}" stroke-width="${radius * 1.5}" stroke-linecap="round" stroke-linejoin="round">${parts.join('')}</g>`;
}

// Territory borders are Voronoi cells among the continent's own territories.
function clip(polygon, point, other) {
    const nx = other.x - point.x, ny = other.y - point.y;
    const c = (other.x * other.x + other.y * other.y - point.x * point.x - point.y * point.y) / 2;
    const inside = (p) => p.x * nx + p.y * ny <= c;
    const out = [];
    polygon.forEach((p, i) => {
        const q = polygon[(i + 1) % polygon.length];
        if (inside(p)) { out.push(p); }
        if (inside(p) !== inside(q)) {
            const t = (c - p.x * nx - p.y * ny) / ((q.x - p.x) * nx + (q.y - p.y) * ny);
            out.push({x: p.x + t * (q.x - p.x), y: p.y + t * (q.y - p.y)});
        }
    });
    return out;
}

function cell(id, ids) {
    return ids.reduce((polygon, other) => other === id ? polygon : clip(polygon, pos[id], pos[other]),
        [{x: -50, y: -50}, {x: W + 50, y: -50}, {x: W + 50, y: H + 50}, {x: -50, y: H + 50}]);
}

function segmentHitsBox(a, b, box) {
    const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 3);
    for (let i = 0; i <= steps; i += 1) {
        const x = a.x + (b.x - a.x) * i / steps, y = a.y + (b.y - a.y) * i / steps;
        if (x > box.x1 && x < box.x2 && y > box.y1 && y < box.y2) { return true; }
    }
    return false;
}

const overlap = (r, s) => r.x1 < s.x2 && s.x1 < r.x2 && r.y1 < s.y2 && s.y1 < r.y2;

function build(widths) {
    const masks = [];
    const land = world.continents.map((region, index) => {
        const colors = palette[region.continent];
        masks.push(`    <mask id="land${index}" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}">${landGeometry(region.countries, R, '#fff')}</mask>`);
        const cells = region.countries.map((id) => `<polygon points="${cell(id, region.countries).map((p) => f(p.x) + ',' + f(p.y)).join(' ')}"/>`).join('');
        return [
            `  ${landGeometry(region.countries, R + 3, INK)}`,
            `  <g mask="url(#land${index})" fill="${colors.fill}" stroke="${INK}" stroke-width="1.5" stroke-opacity=".55">${cells}</g>`
        ].join('\n');
    }).join('\n');

    // Labels must clear routes, markers, other labels and the in-game dice, flag and round indicator.
    const blocked = [
        {x1: 0, x2: 195, y1: 0, y2: 70},
        {x1: 890, x2: W, y1: 0, y2: 48}
    ];
    pos.forEach((p) => blocked.push({x1: p.x - MARKER, x2: p.x + MARKER, y1: p.y - MARKER, y2: p.y + MARKER}));
    const placed = [];
    const fits = (box) => box.x1 > FRAME && box.x2 < W - FRAME && box.y1 > FRAME && box.y2 < H - FRAME &&
        !blocked.some((other) => overlap(box, other)) &&
        !placed.some((other) => overlap(box, other)) &&
        !segments.some(([a, b]) => segmentHitsBox(a, b, box));
    const boxOf = (o) => {
        const x1 = o.anchor === 'middle' ? o.x - o.w / 2 : o.anchor === 'start' ? o.x : o.x - o.w;
        return {x1, x2: x1 + o.w, y1: o.top, y2: o.top + o.h};
    };

    const names = world.countries.map((country) => {
        const p = pos[country.id];
        const options = [];
        labelLines(country.name).forEach((lines) => {
            const w = Math.max(...lines.map((line) => widths[line])) + 6;
            const h = lines.length * LINE;
            [25, 36].forEach((gap) => [0, -14, 14, -28, 28].forEach((dx) => options.push(
                {lines, anchor: 'middle', x: p.x + dx, top: p.y + gap, w, h},
                {lines, anchor: 'middle', x: p.x + dx, top: p.y - gap - h, w, h}
            )));
            options.push(
                {lines, anchor: 'start', x: p.x + 27, top: p.y - h / 2, w, h},
                {lines, anchor: 'end', x: p.x - 27, top: p.y - h / 2, w, h},
                {lines, anchor: 'start', x: p.x + 18, top: p.y + 18, w, h},
                {lines, anchor: 'end', x: p.x - 18, top: p.y + 18, w, h},
                {lines, anchor: 'start', x: p.x + 18, top: p.y - 18 - h, w, h},
                {lines, anchor: 'end', x: p.x - 18, top: p.y - 18 - h, w, h}
            );
            const near = [];
            for (let dx = -64; dx <= 64; dx += 4) {
                for (let dy = -64; dy <= 64; dy += 4) {
                    near.push({lines, anchor: 'middle', x: p.x + dx, top: p.y + dy - h / 2, w, h, d: Math.hypot(dx, dy)});
                }
            }
            near.sort((a, b) => a.d - b.d).forEach((o) => options.push(o));
        });
        const choice = options.find((o) => fits(boxOf(o)));
        if (!choice) { throw new Error('No free spot for the label of ' + country.name + '; move nearby territories apart.'); }
        placed.push(boxOf(choice));
        const baseline = choice.top + FONT - 1;
        return `    <text x="${f(choice.x)}" y="${f(baseline)}"${choice.anchor === 'middle' ? '' : ` text-anchor="${choice.anchor}"`}>` +
            choice.lines.map((line, index) => index === 0 ? esc(line) : `<tspan x="${f(choice.x)}" dy="${LINE}">${esc(line)}</tspan>`).join('') + '</text>';
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

measureLabels().then((widths) => {
    fs.writeFileSync(OUTPUT, build(widths));
    console.log('Wrote ' + path.relative(process.cwd(), OUTPUT));
}).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
