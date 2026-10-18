<script module lang="ts">
	export const prerender = true;
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import { useSnakes } from '#lib/stores/snakes.svelte';
	import { BOARD } from '#lib/constants';
	import { drawSnakeCell } from './snakeCanvas';

	let { parentWidth, parentHeight } = $props();

	const snakes = useSnakes();
	const board = BOARD;
	let grid: { width: number; height: number };
	let canvas: HTMLCanvasElement;
	let ctx: CanvasRenderingContext2D;
	let backgroundCanvas: HTMLCanvasElement;

	function calculateAspectRatioFit() {
		const ratio = Math.min(
			(parentWidth as number) / board.width,
			(parentHeight as number) / board.height
		);
		return { width: board.width * ratio, height: board.height * ratio };
	}

	onMount(() => {
		const context = canvas.getContext('2d');
		if (context) {
			ctx = context;
		} else {
			throw new Error('Unable to get 2D context from canvas');
		}

		backgroundCanvas = document.createElement('canvas');
		drawCanvas();

		const resizeObserver = new ResizeObserver(drawCanvas);
		if (canvas.parentElement) resizeObserver.observe(canvas.parentElement);

		return () => {
			resizeObserver.disconnect();
		};
	});
	$effect(() => {
		const currentSnakes = snakes.state;
		drawSnakes(currentSnakes);
	});

	function drawCanvas() {
		if (!ctx || !backgroundCanvas || !board.width || !board.height) return;
		grid = calculateAspectRatioFit();
		if (!Number.isFinite(grid.width) || !Number.isFinite(grid.height)) return;

		const w = Math.max(1, Math.round(grid.width));
		const h = Math.max(1, Math.round(grid.height));
		grid = { width: w, height: h };

		ctx.canvas.width = w;
		ctx.canvas.height = h;
		backgroundCanvas.width = w;
		backgroundCanvas.height = h;
		const background = backgroundCanvas.getContext('2d');
		if (!background) throw new Error('Unable to get 2D background context');

		background.fillStyle = '#1F2A39';
		background.fillRect(0, 0, w, h);

		background.beginPath();
		background.fillStyle = '#263445';
		for (let column = 0; column < board.width; column++) {
			for (let row = 0; row < board.height; row++) {
				if ((row % 2 === 0 && column % 2 === 1) || (row % 2 === 1 && column % 2 === 0)) {
					background.rect(
						(column * w) / board.width,
						(row * h) / board.height,
						w / board.width,
						h / board.height
					);
				}
			}
		}
		background.fill();
		drawSnakes(snakes.state);
	}

	function drawSnakes(states: typeof snakes.state) {
		if (!ctx || !backgroundCanvas || !grid) return;
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		ctx.drawImage(backgroundCanvas, 0, 0);
		if (!states) return;

		const cells = new Map<string, { x: number; y: number; colors: string[] }>();
		for (const state of states) {
			for (const cell of state.snake) {
				const cellKey = `${cell.x},${cell.y}`;
				const occupied = cells.get(cellKey) ?? { ...cell, colors: [] };
				if (!occupied.colors.includes(state.color)) occupied.colors.push(state.color);
				cells.set(cellKey, occupied);
			}
		}

		for (const cell of cells.values()) {
			const size = grid.width / (states[0]?.grid.x ?? BOARD.width);
			drawSnakeCell(ctx, cell.x, cell.y, size, cell.colors);
		}
	}
</script>

<canvas bind:this={canvas}></canvas>
