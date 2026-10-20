<script lang="ts">
	import { useChat } from '#lib/stores/chat.svelte';
	import { send } from '#lib/ws';
	import { LOBBY_EVENT } from '$server/constants/events';
	import { onMount } from 'svelte';
	let message = '';
	let chatContainer: HTMLElement;
	const chat = useChat();

	const sendChat = () => {
		const trimmedMessage = message.trim();
		if (!trimmedMessage) return;
		send(LOBBY_EVENT.chat, { msg: trimmedMessage });
		message = '';
	};

	onMount(() => {
		const observer = new MutationObserver(() => {
			chatContainer.scrollTop = chatContainer.scrollHeight;
		});
		observer.observe(chatContainer, { childList: true });
		return () => observer.disconnect();
	});

	function formatDate(dateString: string) {
		const [datePart, timePart] = dateString.split(', ');
		const [day, month] = datePart.split('/');
		const [hours, minutes] = timePart.split(':');

		return `${month}/${day} ${hours}:${minutes}`;
	}
</script>

<div class="chat-messages flex flex-col">
	<ul class="chat-history overflow-y-auto" aria-label="Chat messages" bind:this={chatContainer}>
		{#each chat.messages as message, index (index)}
			<li class="chat-message">
				{#if message.datetime}
					<span class="chat-timestamp">
						<slot name="date" datetime={formatDate(message.datetime)}>
							{formatDate(message.datetime)}
						</slot>
					</span>
				{/if}
				{#if message.sender}
					<strong class="chat-sender">
						<slot name="sender" sender={message.sender}>{message.sender}:</slot>
					</strong>
				{/if}
				<slot name="message" message={message.message}>
					<span class="chat-text">{message.message}</span>
				</slot>
			</li>
		{/each}
	</ul>

	<form
		class="chat-footer flex gap-2"
		onsubmit={(event) => {
			event.preventDefault();
			sendChat();
		}}
	>
		<input
			type="text"
			bind:value={message}
			class="chat-input min-w-0 flex-1"
			aria-label="Chat message"
			placeholder="Write a message…"
			maxlength="500"
		/>

		<button type="submit" class="chat-submit" aria-label="Send chat message">
			<i class="fa fa-paper-plane" aria-hidden="true"></i>
		</button>
	</form>
</div>

<style>
	.chat-messages {
		display: flex;
		min-height: 0;
		flex-direction: column;
	}

	.chat-history {
		display: flex;
		min-height: 5rem;
		flex: 1 1 auto;
		flex-direction: column;
		gap: 0.55rem;
		overflow-y: auto;
		margin: 0;
		padding: 0.75rem;
		border: 1px solid var(--line);
		background: var(--ink);
		list-style: none;
		scrollbar-color: var(--line) var(--ink);
	}

	.chat-message {
		overflow-wrap: anywhere;
		color: var(--paper);
		font-size: 0.8rem;
		line-height: 1.5;
	}

	.chat-timestamp {
		margin-right: 0.45rem;
		color: #81988a;
		font-size: 0.65rem;
	}

	.chat-sender {
		margin-right: 0.35rem;
		color: var(--lime);
	}

	.chat-text {
		color: #d8e2da;
	}

	.chat-footer {
		display: flex;
		gap: 0.5rem;
		padding-top: 0.65rem;
	}

	.chat-input {
		width: 100%;
		min-width: 0;
		min-height: 2.8rem;
		padding: 0.6rem 0.75rem;
		border: 2px solid var(--line);
		background: var(--ink);
		color: var(--paper);
		font-size: 0.82rem;
	}

	.chat-input::placeholder {
		color: #879a8e;
	}

	.chat-submit {
		display: grid;
		width: 2.8rem;
		min-height: 2.8rem;
		flex: 0 0 auto;
		place-items: center;
		border: 2px solid var(--ink);
		background: var(--lime);
		box-shadow: 3px 3px 0 var(--mint);
		color: var(--ink);
		cursor: pointer;
	}

	.chat-submit:hover {
		background: #c0ff8d;
	}

	@media (max-width: 420px) {
		.chat-submit {
			width: 2.6rem;
		}
	}
</style>
