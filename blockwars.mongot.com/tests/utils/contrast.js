'use strict';

function contrastRatio(locator) {
    return locator.evaluate(element => {
        const parse = css => {
            const [r, g, b, a = 1] = css.match(/[\d.]+/g).map(Number);
            return {r, g, b, a};
        };
        const luminance = ({r, g, b}) => {
            const channel = value => {
                value /= 255;
                return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
            };
            return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
        };
        const foreground = parse(getComputedStyle(element).color);
        let node = element;
        let background;
        while (node && !background) {
            const color = parse(getComputedStyle(node).backgroundColor);
            if (color.a >= 0.85) { background = color; }
            node = node.parentElement;
        }
        background = background || parse(getComputedStyle(document.documentElement).backgroundColor);
        const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
        return (light + 0.05) / (dark + 0.05);
    });
}

module.exports = {contrastRatio};
