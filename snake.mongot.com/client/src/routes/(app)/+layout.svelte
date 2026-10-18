<svelte:head>
	<link
		href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css"
		rel="stylesheet"
	/>
</svelte:head>

<header class="shadow-md py-4">
	<nav class="mx-auto flex justify-between px-4">
		<ul class="flex gap-x-6">
			<li>
				<a
					href="https://mongot.com"
					class="flex items-center text-white hover:text-blue-300 text-base font-bold transition"
				>
					<i class="fa fa-home mr-2" aria-hidden="true" role="img" aria-label="Home Icon"></i>
					Home
				</a>
			</li>
			<li>
				<a
					href="/lobby"
					class="flex items-center text-white hover:text-blue-300 text-base font-bold transition"
				>
					<i class="fa fa-globe mr-2" aria-hidden="true" role="img" aria-label="Globe Icon"></i>
					Lobby
				</a>
			</li>
			<li>
				<a
					href="/highscore"
					class="flex items-center text-white hover:text-blue-300 text-base font-bold transition"
				>
					<i class="fa fa-trophy mr-2" aria-hidden="true" role="img" aria-label="Trophy Icon"></i>
					High Score
				</a>
			</li>
		</ul>
		<ul class="flex gap-x-6">
			<li>
				<a
					href="https://mongot.com/register"
					class="flex items-center text-white hover:text-blue-300 text-base font-bold transition"
				>
					<i class="fa fa-user-plus mr-2" aria-hidden="true" role="img" aria-label="User Plus Icon"
					></i>
					Register
				</a>
			</li>
			<li>
				<a
					href="https://mongot.com/login"
					class="flex items-center text-white hover:text-blue-300 text-base font-bold transition"
				>
					<i class="fa fa-sign-in mr-2" aria-hidden="true" role="img" aria-label="Sign In Icon"></i>
					Login
				</a>
			</li>
		</ul>
	</nav>
</header>

<noscript>
	<p>We're sorry, but Snake doesn't work without JavaScript enabled. Please enable it</p>
</noscript>

<slot />

<style lang="postcss">
	:global([data-theme='royal']) {
		background-color: #48789b;
	}

	header {
		font-family: 'Varela Round', 'Lucida Grande', Helvetica, Arial, sans-serif;
	}
</style>
