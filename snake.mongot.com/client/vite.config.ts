import { sveltekit } from '@sveltejs/kit/vite';
import type { UserConfig } from 'vite';
import adapter from '@sveltejs/adapter-static';
import mkcert from 'vite-plugin-mkcert';
import preprocess from 'svelte-preprocess';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));

const config: UserConfig = {
	resolve: {
		alias: {
			$models: resolve(projectRoot, '../server/src/models'),
			$server: resolve(projectRoot, '../server/src')
		}
	},
	plugins: [
		tailwindcss(),
		sveltekit({
			adapter: adapter({
				pages: 'build',
				assets: 'build',
				precompress: false,
				strict: true
			}),
			preprocess: [preprocess({ postcss: true })]
		}),
		...(process.env.CI ? [] : [mkcert()])
	]
};

export default config;
