<script lang="ts">
	import { useState } from '#lib/stores/state.svelte';

	const states = useState();
	const clearErrors = () => {
		states.error = undefined;
	};
</script>

<div class="error-overlay">
	<dialog
		open
		class="error-dialog"
		aria-modal="true"
		aria-labelledby="error-title"
		aria-describedby="error-message"
		tabindex="-1"
	>
		<div class="error-heading">
			<span class="error-icon" aria-hidden="true"><i class="fa fa-exclamation"></i></span>
			<div>
				<p class="error-kicker">Something went wrong</p>
				<h2 id="error-title">We hit a snag.</h2>
			</div>
			<button class="close-error" type="button" aria-label="Dismiss error" onclick={clearErrors}>
				<i class="fa fa-times" aria-hidden="true"></i>
			</button>
		</div>
		<p id="error-message" class="error-message">{states.error}</p>
		<button class="dismiss-action" type="button" onclick={clearErrors}>
			Got it <i class="fa fa-arrow-right" aria-hidden="true"></i>
		</button>
	</dialog>
</div>

<style>
	.error-overlay {
		position: fixed;
		z-index: 10;
		inset: 0;
		display: grid;
		place-items: start center;
		overflow-y: auto;
		padding: max(1rem, 8vh) 1rem 1rem;
		background: rgb(3 9 7 / 82%);
		backdrop-filter: blur(5px);
	}

	.error-dialog {
		position: static;
		width: min(100%, 29rem);
		margin: 0;
		padding: 1.2rem;
		border: 2px solid var(--ink);
		background: var(--ink-raised);
		box-shadow: 7px 7px 0 var(--coral);
		color: var(--paper);
	}

	.error-heading {
		display: flex;
		align-items: center;
		gap: 0.85rem;
	}

	.error-icon {
		display: grid;
		width: 2.75rem;
		height: 2.75rem;
		flex: 0 0 auto;
		place-items: center;
		border: 2px solid var(--ink);
		background: var(--coral);
		color: var(--ink);
	}

	.error-kicker {
		margin: 0 0 0.15rem;
		color: var(--coral);
		font-size: 0.65rem;
		font-weight: 900;
		letter-spacing: 0.13em;
		text-transform: uppercase;
	}

	h2 {
		margin: 0;
		font-size: 1.3rem;
		font-weight: 1000;
		letter-spacing: -0.04em;
	}

	.close-error {
		display: grid;
		width: 2.5rem;
		height: 2.5rem;
		flex: 0 0 auto;
		place-items: center;
		margin-left: auto;
		border: 1px solid var(--line);
		background: var(--ink);
		color: var(--paper);
		cursor: pointer;
	}

	.close-error:hover {
		color: var(--coral);
	}

	.error-message {
		margin: 1.15rem 0;
		padding: 0.85rem;
		border: 1px solid var(--line);
		background: var(--ink);
		color: var(--paper);
		font-size: 0.9rem;
		line-height: 1.55;
		overflow-wrap: anywhere;
	}

	.dismiss-action {
		display: inline-flex;
		min-height: 2.7rem;
		align-items: center;
		gap: 0.5rem;
		padding: 0.55rem 0.8rem;
		border: 2px solid var(--ink);
		background: var(--lime);
		box-shadow: 3px 3px 0 var(--mint);
		color: var(--ink);
		font-weight: 900;
		cursor: pointer;
	}

	.dismiss-action:hover {
		background: #c0ff8d;
	}
</style>
