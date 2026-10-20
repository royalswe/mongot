<script lang="ts">
	import { connect } from '#lib/ws';
	import { onMount, tick } from 'svelte';
	import { useRooms } from '#lib/stores/rooms.svelte';
	import { useOnlineClients } from '#lib/stores/onlineClients.svelte';
	import { crownImage, fetchRatings } from '#lib/rankings';
	import Chat from '../../chat.svelte';

	const rooms = useRooms();
	const clients = useOnlineClients();
	let ratings = $state<Record<string, number>>({});
	let mounted = $state(false);

	$effect(() => {
		const usernames = clients.list
			.filter((client) => client.isRegistered)
			.map((client) => client.username);
		let current = true;
		void fetchRatings(usernames)
			.then((nextRatings) => {
				if (current) ratings = nextRatings;
			})
			.catch((error: unknown) => console.error('Could not load player ratings:', error));
		return () => {
			current = false;
		};
	});

	onMount(() => {
		mounted = true;
		connect(
			'wss://' +
				location.hostname +
				(location.hostname === 'localhost' ? ':5300' : '') +
				'/api/lobby'
		);
	});

	let boardWidth = $state('46');
	let boardHeight = $state('30');
	const validBoardSize = $derived(
		Number.isInteger(Number(boardWidth)) &&
			Number.isInteger(Number(boardHeight)) &&
			Number(boardWidth) >= 10 &&
			Number(boardHeight) >= 10
	);

	let showModal = $state(false);
	let dialogElement = $state.raw<HTMLDialogElement | undefined>(undefined);
	let returnFocus: HTMLElement | null = null;

	async function openRoomDialog(event: MouseEvent) {
		returnFocus = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
		showModal = true;
		await tick();
		dialogElement?.querySelector<HTMLInputElement>('input')?.focus();
	}

	async function closeRoomDialog() {
		showModal = false;
		await tick();
		returnFocus?.focus();
	}

	function handleDialogKeydown(event: KeyboardEvent) {
		if (!showModal) return;
		if (event.key === 'Escape') {
			event.preventDefault();
			void closeRoomDialog();
			return;
		}
		if (event.key !== 'Tab' || !dialogElement) return;

		const focusable = dialogElement.querySelectorAll<HTMLElement>(
			'button:not(:disabled), input:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])'
		);
		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last?.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first?.focus();
		}
	}

	function generateRoomName() {
		const adjectives = [
			'Doctor',
			'Cool',
			'Drunken',
			'Bloody',
			'Lame',
			'Rough',
			'Happy',
			'Sad',
			'Crazy',
			'Bitter',
			'Silent',
			'Dark',
			'Lingering',
			'Shy',
			'Psycho',
			'Mad',
			'Insane'
		];
		const animals = [
			'Wolf',
			'Blackhand',
			'Liama',
			'Thunder',
			'Christ',
			'Sloth',
			'Troll',
			'Grinch',
			'Beast',
			'Admiral',
			'Warrior',
			'General',
			'Dragonfly',
			'Stormrage'
		];
		let name: string;
		do {
			const randomNumber1 = Math.floor(Math.random() * adjectives.length);
			const randomNumber2 = Math.floor(Math.random() * animals.length);
			name = adjectives[randomNumber1] + '-' + animals[randomNumber2];
		} while (rooms.list?.some((room) => room.name === name));

		return name;
	}

	function createGame() {
		if (!validBoardSize) return;
		const roomName = generateRoomName();
		const url = `/game?room=${roomName}&board=${boardWidth}:${boardHeight}`;
		window.open(url, '_blank', 'width=1200,height=1000');
		void closeRoomDialog();
	}

	function joinGame(roomName: string) {
		const url = `/game?room=${roomName}`;
		window.open(url, '_blank', 'width=1200,height=1000');
	}
</script>

<svelte:head>
	<title>Snake lobby · Blip.se</title>
	<meta name="description" content="Find a Snake match, join a room, or make your own arena." />
</svelte:head>

<main class="lobby-layout">
	<section class="lobby-main" aria-labelledby="lobby-title">
		<div class="lobby-intro">
			<div>
				<p class="eyebrow"><span class="status-dot"></span> Multiplayer matchmaking</p>
				<h1 id="lobby-title">Find your <span>arena.</span></h1>
				<p>Join a live room or set the board and call your own match.</p>
			</div>
			<button
				class="action-primary create-room"
				type="button"
				disabled={!mounted}
				onclick={openRoomDialog}
			>
				<i class="fa fa-plus" aria-hidden="true"></i>
				Create room
			</button>
		</div>

		<section class="room-browser" aria-labelledby="room-list-title">
			<div class="section-heading">
				<div>
					<p class="section-kicker">Choose a room</p>
					<h2 id="room-list-title">Open arenas</h2>
				</div>
				<span class="room-count">
					<i class="fa fa-globe" aria-hidden="true"></i>
					{rooms.list?.length ?? 0}
					{rooms.list?.length === 1 ? 'room' : 'rooms'}
				</span>
			</div>

			{#if rooms.list?.length < 1}
				<div class="empty-rooms">
					<div class="empty-icon"><i class="fa fa-map-o" aria-hidden="true"></i></div>
					<h3>No open arenas yet</h3>
					<p>Make the first room, choose your board size, and invite others in.</p>
					<button class="action-primary" type="button" disabled={!mounted} onclick={openRoomDialog}>
						<i class="fa fa-plus" aria-hidden="true"></i> Create the first room
					</button>
				</div>
			{:else}
				<div class="room-grid">
					{#each rooms.list as room (room.name)}
						<article class="room-card">
							<div class="room-card-heading">
								<div class="room-name">
									<span class="room-icon" aria-hidden="true"><i class="fa fa-th-large"></i></span>
									<h3>{room.name}</h3>
								</div>
								<span class={`room-status status-${room.status}`} aria-label={room.status}>
									<span class="status-dot"></span>
									{room.status === 'count-down'
										? 'Starting'
										: room.status === 'running'
											? 'In progress'
											: 'Waiting'}
								</span>
							</div>
							<div class="room-facts">
								<span title={`${room.seatedCount} of ${room.seatCapacity} seats occupied`}>
									<i class="fa fa-users" aria-hidden="true"></i>
									{room.seatedCount}/{room.seatCapacity} seats
								</span>
								{#if room.botCount > 0}
									<span title={`${room.botCount} ${room.botCount === 1 ? 'bot' : 'bots'}`}>
										<i class="fa fa-android" aria-hidden="true"></i>
										{room.botCount}
										{room.botCount === 1 ? 'bot' : 'bots'}
									</span>
								{/if}
								<span
									title={`${room.spectatorCount} ${room.spectatorCount === 1 ? 'spectator' : 'spectators'}`}
								>
									<i class="fa fa-eye" aria-hidden="true"></i>
									{room.spectatorCount} watching
								</span>
								<span class="room-mode"><i class="fa fa-flag-o" aria-hidden="true"></i> Casual</span
								>
							</div>
							<button class="join-room" type="button" onclick={() => joinGame(room.name)}>
								Join room <i class="fa fa-arrow-right" aria-hidden="true"></i>
							</button>
						</article>
					{/each}
				</div>
			{/if}
		</section>

		<p class="lobby-footnote">
			<i class="fa fa-lightbulb-o" aria-hidden="true"></i>
			Choose a seat when you join. Spectators can watch and chat while a match is in progress.
		</p>
	</section>

	<aside class="community-rail" aria-label="Lobby community">
		<section class="community-panel chat-panel" aria-labelledby="chat-title">
			<div class="panel-title">
				<div>
					<p class="section-kicker">Room-wide</p>
					<h2 id="chat-title"><i class="fa fa-comments" aria-hidden="true"></i> Lobby chat</h2>
				</div>
				<span class="online-indicator" aria-label="Live chat">
					<span class="status-dot"></span> Live
				</span>
			</div>
			<Chat>
				<span slot="date" class="chat-date" let:datetime>{datetime}</span>
				<span slot="sender" class="chat-sender" let:sender>{sender}:</span>
			</Chat>
		</section>

		<section class="community-panel online-panel" aria-labelledby="online-title">
			<div class="panel-title">
				<div>
					<p class="section-kicker">Around the game</p>
					<h2 id="online-title"><i class="fa fa-users" aria-hidden="true"></i> Online</h2>
				</div>
				<span class="online-count">{clients.list.length}</span>
			</div>
			{#if clients.list.length}
				<ul class="online-list">
					{#each clients.list as client (client.username)}
						<li>
							<span class="online-avatar" aria-hidden="true">
								{client.username.slice(0, 1).toUpperCase()}
							</span>
							<span class="online-name">
								{#if client.isRegistered && ratings[client.username.toLowerCase()] !== undefined}
									{@const rating = ratings[client.username.toLowerCase()]}
									<img src={crownImage(rating)} alt="Crown rank" title={`Rating ${rating}`} />
								{/if}
								{client.username}
							</span>
							<span class="online-dot" aria-label="Online"></span>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="online-empty">No one else is in the lobby yet.</p>
			{/if}
		</section>
	</aside>
</main>

{#if showModal}
	<div class="modal-backdrop">
		<dialog
			open
			class="create-dialog"
			aria-modal="true"
			aria-labelledby="modal-title"
			bind:this={dialogElement}
		>
			<div class="dialog-heading">
				<div class="dialog-icon"><i class="fa fa-th-large" aria-hidden="true"></i></div>
				<div>
					<p class="section-kicker">Set the scene</p>
					<h2 id="modal-title">Create an arena</h2>
				</div>
				<button
					class="icon-button"
					type="button"
					aria-label="Close create room dialog"
					onclick={closeRoomDialog}
				>
					<i class="fa fa-times" aria-hidden="true"></i>
				</button>
			</div>
			<p class="dialog-copy">Choose a board size. You can invite players after your room opens.</p>
			<div class="board-size-fields">
				<label>
					<span>Width</span>
					<div class="input-with-unit">
						<input
							type="number"
							name="boardWidth"
							id="boardWidth"
							bind:value={boardWidth}
							min="10"
							step="1"
							required
						/>
						<span>cells</span>
					</div>
				</label>
				<span class="dimension-divider" aria-hidden="true">×</span>
				<label>
					<span>Height</span>
					<div class="input-with-unit">
						<input
							type="number"
							name="boardHeight"
							id="boardHeight"
							bind:value={boardHeight}
							min="10"
							step="1"
							required
						/>
						<span>cells</span>
					</div>
				</label>
			</div>
			<p class="field-hint">Both dimensions must be whole numbers of at least 10.</p>
			{#if !validBoardSize}
				<p class="validation-message" role="alert">
					Board width and height must be whole numbers of at least 10.
				</p>
			{/if}
			<div class="dialog-actions">
				<button class="action-secondary" type="button" onclick={closeRoomDialog}> Cancel </button>
				<button
					class="action-primary"
					type="button"
					disabled={!validBoardSize}
					onclick={createGame}
				>
					Create room <i class="fa fa-arrow-right" aria-hidden="true"></i>
				</button>
			</div>
		</dialog>
	</div>
{/if}

<svelte:window onkeydown={handleDialogKeydown} />

<style>
	.lobby-layout {
		display: grid;
		max-width: 1500px;
		grid-template-columns: minmax(0, 1fr) minmax(280px, 340px);
		gap: clamp(1.5rem, 3vw, 2.75rem);
		margin: 0 auto;
		padding: clamp(1.5rem, 4vw, 3.5rem);
	}

	.lobby-main {
		min-width: 0;
	}

	.lobby-intro {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: 1.5rem;
		margin-bottom: 2rem;
	}

	.eyebrow,
	.section-kicker {
		margin: 0 0 0.6rem;
		color: var(--mint);
		font-size: 0.72rem;
		font-weight: 900;
		letter-spacing: 0.13em;
		text-transform: uppercase;
	}

	.eyebrow {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		color: var(--muted);
	}

	.status-dot {
		display: inline-block;
		width: 0.55rem;
		height: 0.55rem;
		flex: 0 0 auto;
		border-radius: 50%;
		background: var(--lime);
		box-shadow: 0 0 0 4px rgb(168 243 107 / 12%);
	}

	h1,
	h2,
	h3,
	p {
		margin-top: 0;
	}

	h1 {
		margin-bottom: 0.65rem;
		color: var(--paper);
		font-size: clamp(2.25rem, 5vw, 4rem);
		font-weight: 1000;
		letter-spacing: -0.065em;
		line-height: 0.98;
	}

	h1 span {
		color: var(--lime);
	}

	.lobby-intro p:last-child {
		margin-bottom: 0;
		color: var(--muted);
		line-height: 1.6;
	}

	button {
		font: inherit;
	}

	.action-primary,
	.action-secondary {
		display: inline-flex;
		min-height: 3rem;
		align-items: center;
		justify-content: center;
		gap: 0.65rem;
		padding: 0.7rem 1rem;
		border: 2px solid var(--ink);
		box-shadow: 4px 4px 0 #050b09;
		font-size: 0.9rem;
		font-weight: 900;
		text-decoration: none;
		transition:
			transform 140ms ease,
			box-shadow 140ms ease,
			background-color 140ms ease;
	}

	.action-primary {
		background: var(--lime);
		color: var(--ink);
		cursor: pointer;
	}

	.action-primary:hover:not(:disabled) {
		transform: translate(-2px, -2px);
		box-shadow: 6px 6px 0 #050b09;
		background: #bdff8e;
	}

	.action-primary:active:not(:disabled) {
		transform: translate(2px, 2px);
		box-shadow: 2px 2px 0 #050b09;
	}

	.action-primary:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	.action-secondary {
		border-color: var(--line);
		background: var(--ink-soft);
		color: var(--paper);
		cursor: pointer;
	}

	.create-room {
		flex: 0 0 auto;
	}

	.room-browser,
	.community-panel {
		border: 2px solid var(--ink);
		background: var(--ink-raised);
		box-shadow: var(--shadow-hard);
	}

	.room-browser {
		padding: clamp(1rem, 2vw, 1.5rem);
	}

	.section-heading,
	.panel-title {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	.section-heading {
		margin-bottom: 1.2rem;
	}

	.section-heading h2,
	.panel-title h2 {
		margin: 0;
		color: var(--paper);
		font-size: 1.4rem;
		font-weight: 900;
		letter-spacing: -0.03em;
	}

	.section-kicker {
		margin-bottom: 0.35rem;
		font-size: 0.65rem;
	}

	.room-count,
	.online-count {
		display: inline-flex;
		min-width: 2rem;
		min-height: 2rem;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.35rem 0.7rem;
		border: 1px solid var(--line);
		background: var(--ink);
		color: var(--muted);
		font-size: 0.75rem;
		font-weight: 800;
		white-space: nowrap;
	}

	.room-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 270px), 1fr));
		gap: 1rem;
	}

	.room-card {
		display: flex;
		min-width: 0;
		flex-direction: column;
		gap: 1rem;
		padding: 1rem;
		border: 2px solid var(--line);
		background: #142b23;
		box-shadow: 3px 3px 0 #050b09;
		transition:
			transform 140ms ease,
			border-color 140ms ease,
			box-shadow 140ms ease;
	}

	.room-card:hover {
		transform: translate(-1px, -1px);
		border-color: var(--mint);
		box-shadow: 5px 5px 0 #050b09;
	}

	.room-card-heading,
	.room-name,
	.room-facts,
	.join-room {
		display: flex;
		align-items: center;
	}

	.room-card-heading {
		justify-content: space-between;
		gap: 0.75rem;
	}

	.room-name {
		min-width: 0;
		gap: 0.65rem;
	}

	.room-icon,
	.dialog-icon {
		display: grid;
		width: 2.5rem;
		height: 2.5rem;
		flex: 0 0 auto;
		place-items: center;
		border: 2px solid var(--ink);
		background: var(--lime);
		box-shadow: 3px 3px 0 var(--mint);
		color: var(--ink);
	}

	.room-name h3 {
		overflow: hidden;
		margin: 0;
		color: var(--paper);
		font-size: 1rem;
		font-weight: 900;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.room-status {
		display: inline-flex;
		flex: 0 0 auto;
		align-items: center;
		gap: 0.45rem;
		padding: 0.35rem 0.5rem;
		border: 1px solid var(--line);
		color: var(--muted);
		font-size: 0.67rem;
		font-weight: 900;
		text-transform: uppercase;
	}

	.room-status .status-dot {
		width: 0.4rem;
		height: 0.4rem;
		box-shadow: none;
	}

	.status-running .status-dot {
		background: var(--mint);
	}

	.status-count-down .status-dot {
		background: var(--amber);
	}

	.room-facts {
		flex-wrap: wrap;
		gap: 0.6rem 1rem;
		color: var(--muted);
		font-size: 0.75rem;
	}

	.room-facts span {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
	}

	.room-facts i {
		color: var(--mint);
	}

	.room-mode {
		color: var(--amber);
	}

	.join-room {
		min-height: 2.7rem;
		justify-content: space-between;
		gap: 0.6rem;
		margin-top: auto;
		padding: 0.6rem 0.75rem;
		border: 2px solid var(--ink);
		background: var(--mint);
		box-shadow: 3px 3px 0 var(--ink);
		color: var(--ink);
		font-weight: 900;
		cursor: pointer;
		transition:
			transform 140ms ease,
			box-shadow 140ms ease,
			background-color 140ms ease;
	}

	.join-room:hover {
		transform: translate(-1px, -1px);
		box-shadow: 4px 4px 0 var(--ink);
		background: #83f0ba;
	}

	.empty-rooms {
		display: grid;
		min-height: 15rem;
		justify-items: center;
		align-content: center;
		padding: 1.5rem;
		border: 2px dashed var(--line);
		text-align: center;
	}

	.empty-icon {
		display: grid;
		width: 3.5rem;
		height: 3.5rem;
		place-items: center;
		margin-bottom: 0.85rem;
		border: 2px solid var(--ink);
		background: var(--ink-soft);
		box-shadow: 3px 3px 0 var(--mint);
		color: var(--lime);
		font-size: 1.3rem;
	}

	.empty-rooms h3 {
		margin-bottom: 0.45rem;
		color: var(--paper);
		font-size: 1.15rem;
	}

	.empty-rooms p {
		max-width: 24rem;
		margin-bottom: 1.2rem;
		color: var(--muted);
		line-height: 1.5;
	}

	.lobby-footnote {
		display: flex;
		align-items: flex-start;
		gap: 0.65rem;
		margin: 1rem 0 0;
		color: var(--muted);
		font-size: 0.8rem;
		line-height: 1.6;
	}

	.lobby-footnote i {
		margin-top: 0.25rem;
		color: var(--amber);
	}

	.community-rail {
		display: flex;
		min-width: 0;
		flex-direction: column;
		gap: 1rem;
	}

	.community-panel {
		min-width: 0;
		padding: 1rem;
	}

	.panel-title {
		margin-bottom: 1rem;
	}

	.panel-title h2 {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		font-size: 1.1rem;
	}

	.panel-title h2 i {
		color: var(--lime);
		font-size: 0.95rem;
	}

	.online-indicator {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		color: var(--mint);
		font-size: 0.7rem;
		font-weight: 900;
		text-transform: uppercase;
	}

	.online-indicator .status-dot,
	.online-dot {
		width: 0.45rem;
		height: 0.45rem;
		box-shadow: none;
	}

	:global(.lobby-chat-container .chat-messages ul) {
		height: 18rem;
		margin: 0;
		padding: 0.75rem;
		border: 1px solid var(--line);
		background: var(--ink);
	}

	:global(.lobby-chat-container .chat-footer) {
		margin-top: 0.75rem;
	}

	.chat-date {
		color: #7f9588;
		font-size: 0.68rem;
	}

	.chat-sender {
		color: var(--lime);
		font-weight: 900;
	}

	.online-count {
		border-radius: 50%;
		color: var(--lime);
	}

	.online-list {
		display: grid;
		max-height: 17rem;
		gap: 0.2rem;
		overflow: auto;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.online-list li {
		display: flex;
		min-height: 2.8rem;
		align-items: center;
		gap: 0.65rem;
		padding: 0.35rem 0.45rem;
		border-bottom: 1px solid rgb(53 79 67 / 55%);
	}

	.online-avatar {
		display: grid;
		width: 1.9rem;
		height: 1.9rem;
		flex: 0 0 auto;
		place-items: center;
		border: 1px solid var(--line);
		background: var(--ink-soft);
		color: var(--mint);
		font-size: 0.8rem;
		font-weight: 900;
	}

	.online-name {
		display: flex;
		min-width: 0;
		align-items: center;
		gap: 0.35rem;
		overflow: hidden;
		color: var(--paper);
		font-size: 0.85rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.online-name img {
		width: 1.15rem;
		height: 1.15rem;
		object-fit: contain;
	}

	.online-dot {
		flex: 0 0 auto;
		margin-left: auto;
		border-radius: 50%;
		background: var(--mint);
	}

	.online-empty {
		margin: 0;
		color: var(--muted);
		font-size: 0.85rem;
	}

	.modal-backdrop {
		position: fixed;
		z-index: 20;
		inset: 0;
		display: grid;
		place-items: center;
		overflow-y: auto;
		padding: 1rem;
		background: rgb(3 9 7 / 78%);
		backdrop-filter: blur(5px);
	}

	.create-dialog {
		position: relative;
		width: min(100%, 32rem);
		max-width: none;
		max-height: none;
		margin: 0;
		padding: clamp(1.25rem, 4vw, 2rem);
		border: 3px solid var(--ink);
		background: var(--paper);
		box-shadow: 8px 8px 0 var(--lime);
		color: var(--ink);
	}

	.dialog-heading {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.dialog-icon {
		width: 3rem;
		height: 3rem;
	}

	.dialog-heading h2 {
		margin: 0;
		font-size: 1.5rem;
		font-weight: 1000;
		letter-spacing: -0.04em;
	}

	.dialog-heading .section-kicker {
		color: #34794d;
	}

	.icon-button {
		display: grid;
		width: 2.7rem;
		height: 2.7rem;
		place-items: center;
		margin-left: auto;
		border: 2px solid var(--ink);
		background: transparent;
		color: var(--ink);
		cursor: pointer;
	}

	.icon-button:hover {
		background: #e1e6d9;
	}

	.dialog-copy {
		margin: 1rem 0 1.4rem;
		color: #4f6257;
		line-height: 1.6;
	}

	.board-size-fields {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
		align-items: end;
		gap: 0.75rem;
	}

	.board-size-fields label > span {
		display: block;
		margin-bottom: 0.45rem;
		font-size: 0.8rem;
		font-weight: 900;
	}

	.input-with-unit {
		display: flex;
		min-width: 0;
		align-items: center;
		border: 2px solid #9aa99c;
		background: #fffef7;
	}

	.input-with-unit:focus-within {
		border-color: #28784b;
		box-shadow: 0 0 0 3px rgb(64 215 140 / 25%);
	}

	.input-with-unit input {
		width: 100%;
		min-width: 0;
		height: 3rem;
		padding: 0.5rem 0.65rem;
		border: 0;
		outline: 0;
		background: transparent;
		color: var(--ink);
		font-size: 1.1rem;
		font-weight: 900;
	}

	.input-with-unit > span {
		padding-right: 0.65rem;
		color: #65776a;
		font-size: 0.7rem;
		white-space: nowrap;
	}

	.dimension-divider {
		padding-bottom: 0.8rem;
		color: #728276;
		font-weight: 900;
	}

	.field-hint,
	.validation-message {
		margin: 0.75rem 0 0;
		font-size: 0.78rem;
		line-height: 1.5;
	}

	.field-hint {
		color: #617367;
	}

	.validation-message {
		padding: 0.6rem 0.75rem;
		border-left: 3px solid var(--coral);
		background: #ffebe5;
		color: #8c3427;
		font-weight: 800;
	}

	.dialog-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.75rem;
		margin-top: 1.5rem;
	}

	.dialog-actions .action-secondary {
		border-color: #bac5b7;
		background: transparent;
		box-shadow: none;
		color: var(--ink);
	}

	@media (max-width: 900px) {
		.lobby-layout {
			grid-template-columns: 1fr;
		}

		.community-rail {
			display: grid;
			grid-template-columns: minmax(0, 1.35fr) minmax(220px, 0.8fr);
			align-items: start;
		}
	}

	@media (max-width: 620px) {
		.lobby-layout {
			gap: 1.25rem;
			padding: 1.25rem 0.9rem 2rem;
		}

		.lobby-intro {
			align-items: flex-start;
			flex-direction: column;
			margin-bottom: 1.25rem;
		}

		.create-room {
			width: 100%;
		}

		.room-browser {
			padding: 0.9rem;
		}

		.room-grid {
			grid-template-columns: 1fr;
		}

		.community-rail {
			grid-template-columns: 1fr;
		}

		:global(.lobby-chat-container .chat-messages ul) {
			height: 14rem;
		}
	}

	@media (max-width: 390px) {
		.room-card-heading {
			align-items: flex-start;
			flex-direction: column;
		}

		.board-size-fields {
			gap: 0.4rem;
		}

		.input-with-unit > span {
			display: none;
		}

		.dialog-actions {
			flex-direction: column-reverse;
		}

		.dialog-actions > button {
			width: 100%;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.action-primary,
		.room-card,
		.join-room {
			transition: none;
		}
	}
</style>
