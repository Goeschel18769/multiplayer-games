import { build } from 'esbuild';
import { rm, mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const frontend = path.join(root, 'frontend');
// Fest bestimmtes Ziel: weder CLI-Argumente noch Konfiguration dürfen es ändern.
const release = path.join(root, 'release');
const configPath = path.join(frontend, 'src/config.js');
const localConfigPath = path.join(root, 'tests/fixtures/frontend-local-config.js');

export async function buildFrontend({ localTest = false } = {}) {
  await rm(release, { recursive: true, force: true });
  await mkdir(release);
  const result = await build({
    absWorkingDir: root,
    entryPoints: ['frontend/src/app.js'],
    bundle: true, platform: 'browser', format: 'iife', splitting: false,
    outfile: 'release/app.js', target: ['es2020'],
    metafile: true, sourcemap: false, legalComments: 'none',
    plugins: localTest ? [{
      name: 'isolated-local-test-config',
      setup(builder) {
        builder.onResolve({ filter: /config\.js$/ }, args => {
          if (path.resolve(args.resolveDir, args.path) === configPath) return { path: localConfigPath };
        });
      },
    }] : [],
  });
  for (const input of Object.keys(result.metafile.inputs)) {
    const absolute = path.resolve(root, input);
    if (!absolute.startsWith(frontend + path.sep) && !(localTest && absolute === localConfigPath)) {
      throw new Error(`Unerlaubte Build-Eingabe: ${input}`);
    }
  }
  await Promise.all(['index.html', 'style.css'].map(name => copyFile(path.join(frontend, name), path.join(release, name))));
  return result.metafile;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--local-test') || args.length > 1) throw new Error('Erlaubt ist ausschließlich --local-test für lokale Prüfungen.');
  await buildFrontend({ localTest: args.includes('--local-test') });
  console.log(args.length ? 'Lokaler Test-Build in release/ (127.0.0.1:8789).' : 'Öffentlicher Frontend-Build in release/ erstellt.');
}
