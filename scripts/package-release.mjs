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
const imagesArchivePath = path.join(dist, 'img.zip');

const zipScript = `
import pathlib, sys, zipfile
source, target = map(pathlib.Path, sys.argv[1:3])
with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for name in sys.argv[3:]:
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
  if (JSON.stringify(actualFiles) !== JSON.stringify([...files, 'img'].sort())) {
    throw new Error('Die Spielausgabe muss index.html, app.js, style.css und den img-Ordner enthalten.');
  }
  const imagePaths = Object.keys(metafile.outputs).filter(name => name.startsWith('release/img/')).map(name => name.slice('release/'.length)).sort();
  if (!imagePaths.length || imagePaths.some(name => !/^img\/[A-Za-z0-9_-]+\.png$/.test(name)) ||
      !(await lstat(path.join(release, 'img'))).isDirectory() ||
      JSON.stringify((await readdir(path.join(release, 'img'))).sort()) !== JSON.stringify(imagePaths.map(name => path.basename(name)))) {
    throw new Error('Der img-Ordner darf nur die vom Build erzeugten PNG-Bilder enthalten.');
  }
  for (const name of [...files, ...imagePaths]) {
    const filename = path.join(release, name);
    if (!(await lstat(filename)).isFile()) throw new Error(`Keine reguläre Release-Datei: ${name}`);
    if (files.includes(name) && (await readFile(filename, 'utf8')).includes('127.0.0.1')) {
      throw new Error(`Lokale Test-Konfiguration in der Spielausgabe: ${name}`);
    }
  }

  await mkdir(dist, { recursive: true });
  for (const [target, entries] of [[archivePath, ['index.html', 'app.js', 'style.css', ...imagePaths]], [imagesArchivePath, imagePaths]]) {
    const temporaryPath = `${target}.${process.pid}.tmp`;
    try {
      await execFileAsync('python3', ['-c', zipScript, release, temporaryPath, ...entries]);
      await rename(temporaryPath, target);
    } finally {
      await rm(temporaryPath, { force: true });
    }
  }
  return { metafile, archivePath, imagesArchivePath };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length > 2) throw new Error('package:release akzeptiert keine Argumente.');
  await packageRelease();
  console.log('Öffentliche Spielausgabe mit img-Ordner als dist/multiplayer-games.zip erstellt; Bilder zusätzlich in dist/img.zip.');
}
