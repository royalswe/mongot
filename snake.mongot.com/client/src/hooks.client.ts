import { useState } from '#lib/stores/state.svelte';

const states = useState();
fetch('/api/authenticate', {
	method: 'POST',
	credentials: 'include'
})
	.then((res) => {
		if (res.ok) {
			return res.text();
		} else {
			return Promise.reject(res);
		}
	})
	.then((res) => {
		states.accountUsername = res && res !== 'guest' ? res : null;
	})
	.catch((err) => {
		states.accountUsername = null;
		console.log('could not fetch user', err);
	});
