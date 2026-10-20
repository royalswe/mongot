type Rooms = {
	name: string;
	status: string;
	seatedCount: number;
	botCount: number;
	spectatorCount: number;
	seatCapacity: number;
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
