import { cp, mkdir } from 'node:fs/promises';
import { build } from 'esbuild';

await mkdir('dist', { recursive: true });
await cp('public', 'dist', { recursive: true });
await build({
  entryPoints: ['src/app.js', 'src/studio-entry.js'],
  outdir: 'dist/v3',
  bundle: true,
  format: 'esm',
  minify: true,
});

await build({
  entryPoints: { app: 'src/v4-app.js' },
  outdir: 'dist/v4',
  bundle: true,
  format: 'esm',
  minify: true,
});
