<header class="site-header">
	<nav class="site-nav" aria-label="Main navigation">
		<a class="brand-mark" href="/" aria-label="Snake home">
			<span class="brand-icon" aria-hidden="true"><i class="fa fa-bolt"></i></span>
			<span>BLIP.SE <b>SNAKE</b></span>
		</a>
		<ul class="site-links">
			<li>
				<a href="/" aria-label="Home"
					><i class="fa fa-home" aria-hidden="true"></i><span>Home</span></a
				>
			</li>
			<li>
				<a href="/lobby"><i class="fa fa-globe" aria-hidden="true"></i><span>Lobby</span></a>
			</li>
			<li>
				<a href="/highscore"
					><i class="fa fa-trophy" aria-hidden="true"></i><span>High scores</span></a
				>
			</li>
		</ul>
		<ul class="account-links">
			<li>
				<a href="https://mongot.com/register"
					><i class="fa fa-user-plus" aria-hidden="true"></i> Sign up</a
				>
			</li>
			<li>
				<a href="https://mongot.com/login"
					><i class="fa fa-sign-in" aria-hidden="true"></i> Log in</a
				>
			</li>
		</ul>
	</nav>
</header>

<noscript>
	<p>We're sorry, but Snake doesn't work without JavaScript enabled. Please enable it</p>
</noscript>

<slot />

<style lang="postcss">
	.site-header {
		position: relative;
		z-index: 5;
		border-bottom: 2px solid var(--line);
		background: rgb(10 21 18 / 88%);
		box-shadow: 0 4px 0 rgb(5 11 9 / 70%);
		backdrop-filter: blur(12px);
	}

	.site-nav {
		display: flex;
		min-height: 4.5rem;
		max-width: 1440px;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin: 0 auto;
		padding: 0.75rem clamp(1rem, 4vw, 3.5rem);
	}

	.brand-mark {
		display: inline-flex;
		align-items: center;
		gap: 0.7rem;
		color: var(--paper);
		font-size: 0.8rem;
		font-weight: 900;
		letter-spacing: 0.12em;
		text-decoration: none;
		white-space: nowrap;
	}

	.brand-mark b {
		color: var(--lime);
	}

	.brand-icon {
		display: grid;
		width: 2rem;
		height: 2rem;
		place-items: center;
		border: 2px solid var(--ink);
		background: var(--lime);
		box-shadow: 3px 3px 0 var(--mint);
		color: var(--ink);
	}

	.site-links,
	.account-links {
		display: flex;
		align-items: center;
		gap: clamp(0.35rem, 2vw, 1.4rem);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.site-links a,
	.account-links a {
		display: inline-flex;
		min-height: 2.6rem;
		align-items: center;
		gap: 0.5rem;
		padding: 0.45rem 0.65rem;
		border: 1px solid transparent;
		color: var(--muted);
		font-size: 0.875rem;
		font-weight: 800;
		text-decoration: none;
		transition:
			color 150ms ease,
			background 150ms ease,
			border-color 150ms ease,
			transform 150ms ease;
	}

	.site-links a:hover,
	.account-links a:hover {
		transform: translateY(-2px);
		border-color: var(--line);
		background: var(--ink-raised);
		color: var(--lime);
	}

	.site-links i,
	.account-links i {
		color: var(--mint);
	}

	.account-links a {
		color: var(--paper);
	}

	.account-links li:first-child a {
		color: var(--muted);
	}

	@media (max-width: 720px) {
		.site-nav {
			flex-wrap: wrap;
			justify-content: center;
		}

		.brand-mark {
			margin-right: auto;
		}

		.account-links {
			margin-left: auto;
		}
	}

	@media (max-width: 480px) {
		.site-nav {
			gap: 0.25rem 0.5rem;
			padding: 0.6rem 0.75rem;
		}

		.brand-mark {
			margin: 0 auto 0 0;
		}

		.site-links {
			order: 3;
			width: 100%;
			justify-content: space-between;
		}

		.site-links a {
			min-height: 2.25rem;
			gap: 0.35rem;
			padding: 0.25rem 0.4rem;
			font-size: 0.78rem;
		}

		.account-links {
			gap: 0.1rem;
		}

		.account-links a {
			padding: 0.35rem;
			font-size: 0.75rem;
		}
	}
</style>
