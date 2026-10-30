const CANVAS = (function () {
    return {
        /**
         * Sizes the canvas backing store to what is displayed (CSS width x device pixel ratio) so it
         * stays sharp on dense screens. Drawing code keeps its logical coordinates through `setup`,
         * which re-applies the logical transform. Returns false when nothing needed to change.
         */
        fit: function (canvas, ctx, logicalWidth, logicalHeight, setup) {
            const cssWidth = canvas.clientWidth;
            if (!cssWidth) { return false; } // not laid out yet

            const scale = Math.max(0.25, cssWidth * (window.devicePixelRatio || 1) / logicalWidth);
            const width = Math.round(logicalWidth * scale);
            const height = Math.round(logicalHeight * scale);
            if (canvas.width === width && canvas.height === height) { return false; }

            canvas.width = width; // resets the context state
            canvas.height = height;
            ctx.setTransform(scale, 0, 0, scale, 0, 0);
            setup(ctx);
            return true;
        }
    };
})();
