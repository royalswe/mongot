import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

export default defineConfig({
	testDir: './tests',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: 'html',
	use: {
		baseURL: 'http://localhost:4174',
		trace: 'on-first-retry'
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] }
		}
	],
	webServer: [
		{
			command: 'pnpm exec vite dev --host localhost --port 4174 --strictPort',
			url: 'http://localhost:4174',
			env: { CI: 'true' },
			reuseExistingServer: false,
			timeout: 120_000
		},
		{
			command: 'pnpm run dev',
			cwd: fileURLToPath(new URL('../server', import.meta.url)),
			url: 'https://127.0.0.1:5300/api/user',
			ignoreHTTPSErrors: true,
			reuseExistingServer: !process.env.CI,
			timeout: 120_000
		}
	]
});
