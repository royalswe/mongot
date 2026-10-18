export default (document.cookie = 'cookiename=value');
import { useState } from '#lib/stores/state.svelte';

const states = useState();
// check with server if user is logged in, if so, set user in state;
fetch('https://localhost:5300/api/authenticate', {
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
		states.you = res;
		console.log('username:', res);
	})
	.catch((err) => {
		console.log('could not fetch user', err);
	});
