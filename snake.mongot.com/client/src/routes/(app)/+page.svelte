<main class="landing">
	<section class="hero-copy" aria-labelledby="landing-title">
		<p class="eyebrow"><span class="status-dot"></span> Multiplayer arcade · Blip.se</p>
		<h1 id="landing-title">One more<br /><span>square.</span></h1>
		<p class="hero-intro">
			A fast, head-to-head Snake game. Grab space, outlast the other snakes, and don't run out of
			room.
		</p>

		<div class="hero-actions">
			<button
				class="action action-primary"
				type="button"
				onclick={() =>
					window.open('/game?room=quick&board=46:30', '_blank', 'width=1200,height=1000')}
			>
				<i class="fa fa-play" aria-hidden="true"></i>
				Quick game
				<i class="fa fa-external-link" aria-hidden="true"></i>
			</button>
			<a class="action action-secondary" href="/lobby">
				<i class="fa fa-globe" aria-hidden="true"></i>
				Browse lobby
			</a>
		</div>

		<div class="how-to-play">
			<div class="section-label"><span>01</span> The short version</div>
			<div class="how-to-grid">
				<div>
					<i class="fa fa-arrows" aria-hidden="true"></i>
					<span>Steer with arrow keys or touch controls.</span>
				</div>
				<div>
					<i class="fa fa-crosshairs" aria-hidden="true"></i>
					<span>Claim space and avoid every snake.</span>
				</div>
				<div>
					<i class="fa fa-trophy" aria-hidden="true"></i>
					<span>Be the last snake standing.</span>
				</div>
			</div>
		</div>
	</section>

	<aside class="hero-art" aria-label="Illustration of snakes weaving across a game board">
		<div class="art-sticker"><i class="fa fa-bolt" aria-hidden="true"></i> Keep moving</div>
		<div class="board-frame">
			<div class="board-caption">
				<span>ARENA 04</span>
				<span class="live-label"><span class="status-dot"></span> LIVE</span>
			</div>
			<svg class="snake-art" viewBox="0 0 560 390" role="img" aria-hidden="true">
				<defs>
					<pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
						<path d="M 40 0 L 0 0 0 40" fill="none" stroke="#355044" stroke-width="2" />
					</pattern>
				</defs>
				<rect width="560" height="390" fill="#10251f" />
				<rect width="560" height="390" fill="url(#grid)" />
				<path
					d="M80 300 H160 V220 H280 V140 H400 V60 H480"
					fill="none"
					stroke="#a8f36b"
					stroke-width="34"
					stroke-linecap="square"
					stroke-linejoin="round"
				/>
				<path
					d="M480 300 H400 V260 H320"
					fill="none"
					stroke="#59e5a3"
					stroke-width="30"
					stroke-linecap="square"
					stroke-linejoin="round"
				/>
				<path d="M461 60 H499" stroke="#0a1512" stroke-width="5" />
				<circle cx="520" cy="140" r="14" fill="#ff8e78" />
				<circle cx="80" cy="300" r="18" fill="#ffc46b" stroke="#0a1512" stroke-width="5" />
				<circle cx="320" cy="260" r="5" fill="#0a1512" />
				<circle cx="320" cy="260" r="2" fill="#f4f3e9" />
			</svg>
			<div class="board-footer">
				<span><i class="fa fa-circle" aria-hidden="true"></i> 4 seats</span>
				<span>46 × 30 GRID</span>
			</div>
		</div>
		<div class="art-note"><span>NO BRAKES.</span> Just good turns.</div>
	</aside>
</main>

<style>
	.landing {
		display: grid;
		min-height: calc(100svh - 4.5rem);
		max-width: 1440px;
		grid-template-columns: minmax(0, 1fr) minmax(320px, 0.9fr);
		align-items: center;
		gap: clamp(2rem, 5vw, 6rem);
		margin: 0 auto;
		padding: clamp(2.5rem, 7vh, 5.5rem) clamp(1rem, 6vw, 6rem);
		overflow: hidden;
	}

	.hero-copy {
		position: relative;
		z-index: 1;
		max-width: 42rem;
	}

	.eyebrow,
	.section-label,
	.board-caption,
	.board-footer,
	.art-note {
		font-size: 0.75rem;
		font-weight: 900;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	.eyebrow {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		margin: 0 0 1.5rem;
		color: var(--muted);
	}

	.status-dot {
		display: inline-block;
		width: 0.6rem;
		height: 0.6rem;
		flex: 0 0 auto;
		border-radius: 50%;
		background: var(--lime);
		box-shadow: 0 0 0 4px rgb(168 243 107 / 13%);
	}

	h1 {
		margin: 0;
		color: var(--paper);
		font-size: clamp(4.5rem, 10vw, 8.5rem);
		font-weight: 1000;
		letter-spacing: -0.09em;
		line-height: 0.83;
	}

	h1 span {
		color: var(--lime);
		text-shadow: 4px 4px 0 #3b8a5a;
	}

	.hero-intro {
		max-width: 34rem;
		margin: 2rem 0 0;
		color: #c2d0c8;
		font-size: clamp(1.05rem, 1.6vw, 1.3rem);
		line-height: 1.7;
	}

	.hero-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		margin-top: 2rem;
	}

	.action {
		display: inline-flex;
		min-height: 3.7rem;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		padding: 0.85rem 1.25rem;
		border: 2px solid var(--ink);
		box-shadow: var(--shadow-hard);
		font-size: 0.95rem;
		font-weight: 900;
		text-decoration: none;
		transition:
			transform 140ms ease,
			box-shadow 140ms ease,
			background-color 140ms ease;
	}

	.action:hover {
		transform: translate(-2px, -2px);
		box-shadow: 7px 7px 0 #050b09;
	}

	.action:active {
		transform: translate(3px, 3px);
		box-shadow: 2px 2px 0 #050b09;
	}

	.action-primary {
		background: var(--lime);
		color: var(--ink);
		cursor: pointer;
	}

	.action-primary:hover {
		background: #bcff88;
	}

	.action-primary .fa-external-link {
		margin-left: 0.25rem;
		font-size: 0.75rem;
		opacity: 0.65;
	}

	.action-secondary {
		border-color: var(--line);
		background: var(--ink-raised);
		color: var(--paper);
	}

	.action-secondary:hover {
		background: var(--ink-soft);
	}

	.how-to-play {
		margin-top: clamp(2.25rem, 5vh, 4rem);
		padding-top: 1.25rem;
		border-top: 2px solid var(--line);
	}

	.section-label {
		margin-bottom: 1rem;
		color: var(--muted);
	}

	.section-label span {
		margin-right: 0.5rem;
		color: var(--mint);
	}

	.how-to-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 1rem;
	}

	.how-to-grid div {
		display: grid;
		gap: 0.65rem;
		color: var(--muted);
		font-size: 0.82rem;
		line-height: 1.55;
	}

	.how-to-grid i {
		color: var(--lime);
		font-size: 1.1rem;
	}

	.hero-art {
		position: relative;
		width: 100%;
		max-width: 600px;
		justify-self: end;
		padding: 1.25rem 0.75rem 2.5rem;
	}

	.board-frame {
		position: relative;
		padding: 1rem;
		border: 3px solid var(--ink);
		background: var(--paper);
		box-shadow: 10px 10px 0 var(--lime);
		transform: rotate(1.5deg);
	}

	.board-caption,
	.board-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		color: var(--ink);
	}

	.board-caption {
		padding: 0.1rem 0.2rem 0.85rem;
	}

	.live-label {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		color: #31754d;
	}

	.live-label .status-dot {
		width: 0.5rem;
		height: 0.5rem;
	}

	.snake-art {
		display: block;
		width: 100%;
		height: auto;
		border: 3px solid var(--ink);
	}

	.board-footer {
		padding: 0.85rem 0.2rem 0.05rem;
		font-size: 0.65rem;
	}

	.board-footer span:first-child {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.board-footer .fa {
		color: var(--coral);
		font-size: 0.6rem;
	}

	.art-sticker {
		position: absolute;
		z-index: 1;
		top: -0.2rem;
		right: -0.5rem;
		padding: 0.8rem 1rem;
		border: 2px solid var(--ink);
		background: var(--coral);
		box-shadow: 4px 4px 0 var(--ink);
		color: var(--ink);
		font-size: 0.8rem;
		font-weight: 1000;
		letter-spacing: 0.04em;
		transform: rotate(7deg);
	}

	.art-note {
		position: absolute;
		right: 0;
		bottom: 0.3rem;
		color: var(--muted);
		font-size: 0.68rem;
	}

	.art-note span {
		color: var(--lime);
	}

	@media (max-width: 1000px) {
		.landing {
			grid-template-columns: minmax(0, 1fr) minmax(260px, 0.8fr);
			gap: 2rem;
		}

		.how-to-grid {
			grid-template-columns: 1fr;
			gap: 0.6rem;
		}

		.how-to-grid div {
			grid-template-columns: 1.25rem 1fr;
			align-items: center;
		}
	}

	@media (max-width: 720px) {
		.landing {
			min-height: initial;
			grid-template-columns: 1fr;
			gap: 2rem;
			padding: 3rem 1.25rem;
		}

		.hero-art {
			max-width: 520px;
			justify-self: center;
		}

		h1 {
			font-size: clamp(4.2rem, 17vw, 7rem);
		}

		.how-to-grid {
			grid-template-columns: repeat(3, minmax(0, 1fr));
			gap: 0.75rem;
		}

		.how-to-grid div {
			grid-template-columns: 1fr;
			align-content: start;
		}
	}

	@media (max-width: 480px) {
		.landing {
			padding: 2.25rem 1rem 3rem;
		}

		.hero-intro {
			margin-top: 1.5rem;
		}

		.hero-actions {
			display: grid;
			grid-template-columns: 1fr;
			gap: 0.8rem;
		}

		.action {
			width: 100%;
		}

		.how-to-grid {
			gap: 0.55rem;
		}

		.how-to-grid div {
			font-size: 0.75rem;
		}

		.board-frame {
			padding: 0.6rem;
			box-shadow: 6px 6px 0 var(--lime);
		}

		.art-sticker {
			right: 0;
			font-size: 0.7rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.action {
			transition: none;
		}
	}
</style>
