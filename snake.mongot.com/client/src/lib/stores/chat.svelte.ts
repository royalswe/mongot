type Message = {
	datetime?: string;
	sender?: string;
	message: string;
};

function add(value: Message) {
	if (messages) {
		messages = [...messages, value];
	} else {
		messages = [value];
	}
	return messages;
}

let messages = $state<Message[]>([]);

export function useChat() {
	return {
		get messages() {
			return messages;
		},
		set messages(value) {
			messages = value;
		},
		add
	};
}
