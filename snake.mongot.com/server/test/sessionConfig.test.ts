import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';

const serverPackage = JSON.parse(
	readFileSync('package.json', 'utf8')
) as {
	config?: { cookie?: string };
	scripts: { dev: string };
};

describe('shared session configuration', () => {
	it('passes the configured shared secret as the COOKIE_SECRET value', () => {
		expect(serverPackage.config?.cookie).toBeTruthy();
		expect(serverPackage.config?.cookie).not.toMatch(/^COOKIE_SECRET=/);
		expect(serverPackage.scripts.dev).toMatch(
			/COOKIE_SECRET=\$npm_package_config_cookie/
		);
	});
});
