'use strict';

async function touchInput(page) {
    const client = await page.context().newCDPSession(page);
    const send = (type, x, y, timestamp) => client.send('Input.dispatchTouchEvent', {
        type, timestamp, touchPoints: type === 'touchEnd' ? [] : [{x, y}]
    });
    return {
        down: (x, y) => send('touchStart', x, y),
        up: () => send('touchEnd'),
        async drag([x0, y0], [x1, y1], duration = 100) {
            const start = Date.now() / 1000;
            await send('touchStart', x0, y0, start);
            for (let i = 1; i <= 10; i++) {
                await send('touchMove', x0 + (x1 - x0) * i / 10, y0 + (y1 - y0) * i / 10,
                    start + duration * i / 10000);
            }
            await send('touchEnd', undefined, undefined, start + duration / 1000);
        },
        close: () => client.detach()
    };
}

module.exports = {touchInput};
