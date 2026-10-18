type Rooms = {
	name: string;
	status: string;
	clientIds: string[];
};

let list = $state<Rooms[]>([]);

export function useRooms() {
	return {
		get list() {
			return list;
		},
		set list(value) {
			list = value;
		}
	};
}
