import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';

export default {
  input: 'src/index.ts',
  external: ['zod-to-json-schema'],
  output: [
    {
      file: 'dist/fast-ai.global.js',
      format: 'iife',
      name: 'FastAI',
      sourcemap: true,
      globals: {
        'zod-to-json-schema': 'zodToJsonSchema',
      }
    },
    {
      file: 'dist/fast-ai.global.min.js',
      format: 'iife',
      name: 'FastAI',
      sourcemap: true,
      globals: {
        'zod-to-json-schema': 'zodToJsonSchema',
      },
      plugins: [terser()]
    }
  ],
  plugins: [
    typescript({ tsconfig: './tsconfig.json' })
  ]
};
