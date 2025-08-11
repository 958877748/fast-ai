import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';

export default {
  input: 'src/index.ts',
  output: [
    {
      file: 'dist/fast-ai.global.js',
      format: 'iife',
      name: 'FastAI',
      sourcemap: true
    },
    {
      file: 'dist/fast-ai.global.min.js',
      format: 'iife',
      name: 'FastAI',
      sourcemap: true,
      plugins: [terser()]
    }
  ],
  plugins: [
    typescript({ tsconfig: './tsconfig.json' })
  ]
};
