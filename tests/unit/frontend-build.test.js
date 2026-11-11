import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, writeFile, cp, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { buildFrontend } from '../../scripts/build-frontend.mjs';
import { packageRelease } from '../../scripts/package-release.mjs';

test('Release-Vertrag: portable Bilder im img-Ordner, vollständige ZIP-Downloads und isolierte lokale Konfiguration', async () => {
  const imageNames = ['battleship-preview-naval.png', 'connect-four-preview.png', 'tic-tac-toe-preview.png'];
  const images = imageNames.map(name => `img/${name}`);
  const expectedFiles = ['app.js', 'index.html', 'style.css', ...images].sort();
  const copy = await mkdtemp(path.join(tmpdir(), 'multiplayer-release-check-'));
  try {
    const local = await buildFrontend({ localTest: true });
    assert.ok(local.outputs['release/app.js'].imports.every(item => item.kind === 'file-loader'));
    assert.ok(Object.keys(local.inputs).includes('tests/fixtures/frontend-local-config.js'));
    assert.match(await readFile('release/app.js', 'utf8'), /http:\/\/127\.0\.0\.1:8789/);
    await writeFile('release/stale-file.txt', 'Entfernen beim nächsten Build');
    await writeFile('release/img/stale-image.png', 'Altes Bild ebenfalls entfernen');
    // Packaging und Build bleiben im selben sequenziellen Test: kein paralleles Überschreiben von release/.
    const { metafile: production, archivePath, imagesArchivePath } = await packageRelease();
    assert.deepEqual((await readdir('release')).sort(), ['app.js','img','index.html','style.css']);
    assert.deepEqual((await readdir('release/img')).sort(), imageNames);
    assert.deepEqual(production.outputs['release/app.js'].imports.map(item => item.path).sort(), images.map(name => `release/${name}`));
    assert.ok(production.outputs['release/app.js'].imports.every(item => item.kind === 'file-loader'));
    assert.ok(Object.keys(production.inputs).every(input => input.startsWith('frontend/')));
    assert.ok(Object.keys(production.inputs).includes('frontend/src/assets/tic-tac-toe-preview.png'));
    assert.ok(Object.keys(production.inputs).includes('frontend/src/assets/connect-four-preview.png'));
    assert.ok(Object.keys(production.inputs).includes('frontend/src/assets/battleship-preview-naval.png'));
    const bundle = await readFile('release/app.js', 'utf8');
    assert.match(bundle, /https:\/\/multiplayer-games\.haldimann-joel\.workers\.dev/);
    assert.ok(!bundle.includes('127.0.0.1'));
    assert.ok(!bundle.includes('data:image/'));
    assert.ok(!/\bimport\s*(?:\(|["'{*])/.test(bundle));
    const imageReferences = [...bundle.matchAll(/["'](\.\/img\/[^"']+\.png)["']/g)].map(match => match[1]);
    assert.deepEqual(imageReferences.map(name => name.slice(2)).sort(), images);
    await cp('release', copy, { recursive: true });
    const html = await readFile(path.join(copy, 'index.html'), 'utf8');
    assert.ok(!/type\s*=\s*["']module["']/.test(html));
    const assets = [...html.matchAll(/<(?:link|script)\b[^>]*\b(?:href|src)=["']([^"']+)["']/g)].map(match => match[1]);
    assert.deepEqual(assets.sort(), ['./app.js','./style.css']);
    for (const asset of [...assets, ...imageReferences]) {
      const url = new URL(asset, `file://${copy}/index.html`);
      assert.equal(url.protocol, 'file:');
      assert.ok(url.pathname.startsWith(copy + '/'));
      await access(url);
    }
    for (const name of imageNames) {
      assert.deepEqual(await readFile(path.join(copy, 'img', name)), await readFile(path.join('frontend/src/assets', name)));
    }
    assert.ok(!/@import|url\s*\(/i.test(await readFile(path.join(copy, 'style.css'), 'utf8')));
    const { stdout } = await promisify(execFile)('python3', ['-c', `
import hashlib, json, sys, zipfile
print(json.dumps([[{'name': entry.filename, 'hash': hashlib.sha256(archive.read(entry)).hexdigest(), 'directory': entry.is_dir()} for entry in archive.infolist()] for archive in map(zipfile.ZipFile, sys.argv[1:])]))
`, archivePath, imagesArchivePath]);
    const [entries, imageEntries] = JSON.parse(stdout);
    assert.deepEqual(entries.map(entry => entry.name).sort(), expectedFiles);
    assert.deepEqual(imageEntries.map(entry => entry.name).sort(), images);
    for (const archiveEntries of [entries, imageEntries]) for (const entry of archiveEntries) {
      assert.equal(entry.directory, false);
      const hash = createHash('sha256').update(await readFile(path.join(copy, entry.name))).digest('hex');
      assert.equal(entry.hash, hash, `${entry.name} im ZIP entspricht exakt dem öffentlichen Build`);
    }
  } finally { await rm(copy, { recursive: true, force: true }); }
});
