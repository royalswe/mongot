import eslintJs from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import prettier from 'eslint-config-prettier';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';

export default [
	{
		ignores: [
			'.DS_Store',
			'node_modules/**',
			'build/**',
			'.svelte-kit/**',
			'package',
			'.env',
			'.env.*',
			'!.env.example',
			'pnpm-lock.yaml',
			'package-lock.json',
			'yarn.lock'
		]
	},
	eslintJs.configs.recommended,
	{ rules: { 'no-unused-vars': 'off' } },
	...svelte.configs['flat/base'],
	{
		files: ['**/*.{ts,tsx,mts,cts}'],
		languageOptions: { parser: tsParser },
		plugins: { '@typescript-eslint': tsPlugin },
		rules: {
			...tsPlugin.configs.recommended.rules,
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/ban-ts-comment': ['error', { 'ts-ignore': 'allow-with-description' }]
		}
	},
	{
		files: ['**/*.svelte'],
		languageOptions: { parserOptions: { parser: tsParser } }
	},
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node,
				$state: 'readonly',
				$derived: 'readonly',
				$effect: 'readonly',
				$props: 'readonly'
			}
		}
	},
	...svelte.configs['flat/prettier'],
	{
		files: ['**/*.svelte.ts'],
		languageOptions: { parser: tsParser }
	},
	prettier
];
