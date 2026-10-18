/**
 * get parameter value from url
 * @param name
 * @param url
 * @returns
 */
export function getValueFromUrl(name: string, url = window.location.search) {
	return (url.match(new RegExp('[?&]' + name + '=([^&]+)')) || ['', null])[1];
}
