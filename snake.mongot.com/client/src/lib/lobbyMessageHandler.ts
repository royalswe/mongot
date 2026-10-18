import { LOBBY_EVENT as EVENT } from '$server/constants/events';
import { useChat } from '#lib/stores/chat.svelte';
import { useRooms } from '#lib/stores/rooms.svelte';
import { useOnlineClients } from '#lib/stores/onlineClients.svelte';

const chat = useChat();
const rooms = useRooms();
const clients = useOnlineClients();

export function lobbyMessageHandler(msg: any) {
	switch (msg.type) {
		case EVENT.updateRooms:
			rooms.list = msg.msg;
			break;
		case EVENT.updateClients:
			clients.list = msg.msg;
			break;
		case EVENT.ratingsUpdated:
			clients.list = [...clients.list];
			break;
		case EVENT.chat:
			chat.add({ sender: msg.clientId, message: msg.msg, datetime: msg.datetime });
			break;
		case EVENT.updateChat: {
			const everyMessage = JSON.parse(msg.msg);
			// set each object in msg.msg to chat
			for (const ms of everyMessage) {
				chat.add(JSON.parse(ms));
			}
			break;
		}
		case EVENT.error:
			console.log('lobbyerror', msg);
			break;
		default:
			console.log('unknown emit from server', msg);
			break;
	}
}
