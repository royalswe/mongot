import autoprefixer from 'autoprefixer';
import postcssPresetEnv from 'postcss-preset-env';

export default {
	plugins: [
		postcssPresetEnv({
			stage: 2,
			features: {
				'nesting-rules': true,
				'custom-media-queries': true,
				'media-query-ranges': true
			}
		}),
		autoprefixer
	]
};
