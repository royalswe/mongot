export interface OnlineClient {
	username: string;
	isRegistered: boolean;
}

let list = $state<OnlineClient[]>([]);

export function useOnlineClients() {
	return {
		get list() {
			return list;
		},
		set list(value) {
			list = value;
		}
	};
}
