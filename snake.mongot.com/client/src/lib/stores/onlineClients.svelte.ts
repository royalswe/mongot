let list = $state([]);

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
