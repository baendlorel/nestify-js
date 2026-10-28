import './scripts/common/path-join.js';
import { defineConfig } from 'tsdown';
import funcMacro from 'rollup-plugin-func-macro';
import { replacePlugin } from './scripts/replace.js';

const lib = process.env.LIB_DIR!;
const root = import.meta.dirname;
const packDir = root.join('packages');

export default defineConfig({
  cwd: lib,
  entry: [{ index: lib.join('src', 'index.ts') }], // { cli: 'src/cli/index.ts' }
  outDir: 'dist',
  format: ['esm', 'cjs'],
  deps: {
    neverBundle: ['node-cron', /^fastify/, /^@fastify/, /^@nestify\//],
  },
  tsconfig: root.join('tsconfig.build.json'),
  dts: true,
  sourcemap: false,
  alias: {
    '@core/': packDir.join('core', 'src'),
    '@schema/': packDir.join('schema', 'src'),
    '@swagger/': packDir.join('swagger', 'src'),
    '@tests/': root.join('tests'),
  },
  minify: true,
  plugins: [replacePlugin(), funcMacro()],
});
