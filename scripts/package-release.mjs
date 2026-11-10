import { execFile } from 'node:child_process';
import { lstat, mkdir, readFile, readdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { buildFrontend } from './build-frontend.mjs';

const execFileAsync = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const release = path.join(root, 'release');
const dist = path.join(root, 'dist');
const files = ['app.js', 'index.html', 'style.css'];
const archivePath = path.join(dist, 'multiplayer-games.zip');

const zipScript = `
import pathlib, sys, zipfile
source, target = map(pathlib.Path, sys.argv[1:])
with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for name in ('index.html', 'app.js', 'style.css'):
        info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.create_system = 3
        info.external_attr = 0o100644 << 16
        archive.writestr(info, (source / name).read_bytes(), compresslevel=9)
`;

export async function packageRelease() {
  // Immer neu mit der öffentlichen Konfiguration bauen, auch nach einem lokalen Test-Build.
  const metafile = await buildFrontend();
  const actualFiles = (await readdir(release)).sort();
  if (JSON.stringify(actualFiles) !== JSON.stringify(files)) {
    throw new Error('Die Spielausgabe muss exakt index.html, app.js und style.css enthalten.');
  }
  for (const name of files) {
    const filename = path.join(release, name);
    if (!(await lstat(filename)).isFile()) throw new Error(`Keine reguläre Release-Datei: ${name}`);
    if ((await readFile(filename, 'utf8')).includes('127.0.0.1')) {
      throw new Error(`Lokale Test-Konfiguration in der Spielausgabe: ${name}`);
    }
  }

  await mkdir(dist, { recursive: true });
  const temporaryPath = path.join(dist, `.multiplayer-games-${process.pid}.zip`);
  try {
    await execFileAsync('python3', ['-c', zipScript, release, temporaryPath]);
    await rename(temporaryPath, archivePath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
  return { metafile, archivePath };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length > 2) throw new Error('package:release akzeptiert keine Argumente.');
  await packageRelease();
  console.log('Öffentliche Spielausgabe als dist/multiplayer-games.zip erstellt (genau drei Dateien).');
}
