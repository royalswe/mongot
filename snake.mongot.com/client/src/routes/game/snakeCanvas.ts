export function drawSnakeCell(
	context: CanvasRenderingContext2D,
	x: number,
	y: number,
	size: number,
	colors: string[]
) {
	if (!colors.length) return;

	const centerX = x * size + size / 2;
	const centerY = y * size + size / 2;
	const radius = size / 2 - 0.5;

	context.lineWidth = 1;
	context.strokeStyle = '#000000';
	if (colors.length === 1) {
		context.beginPath();
		context.arc(centerX, centerY, radius, 0, 2 * Math.PI);
		context.fillStyle = colors[0];
		context.fill();
		context.stroke();
		return;
	}

	for (let index = 0; index < colors.length; index++) {
		const startAngle = -Math.PI / 2 + (index * 2 * Math.PI) / colors.length;
		const endAngle = -Math.PI / 2 + ((index + 1) * 2 * Math.PI) / colors.length;
		context.beginPath();
		context.moveTo(centerX, centerY);
		context.arc(centerX, centerY, radius, startAngle, endAngle);
		context.closePath();
		context.fillStyle = colors[index];
		context.fill();
		context.stroke();
	}
}
