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

test('Release-Vertrag: drei portable Assets, öffentlicher ZIP-Download, isolierte lokale Konfiguration', async () => {
  const copy = await mkdtemp(path.join(tmpdir(), 'multiplayer-release-check-'));
  try {
    const local = await buildFrontend({ localTest: true });
    assert.equal(local.outputs['release/app.js'].imports.length, 0);
    assert.ok(Object.keys(local.inputs).includes('tests/fixtures/frontend-local-config.js'));
    assert.match(await readFile('release/app.js', 'utf8'), /http:\/\/127\.0\.0\.1:8789/);
    await writeFile('release/stale-file.txt', 'Entfernen beim nächsten Build');
    // Packaging und Build bleiben im selben sequenziellen Test: kein paralleles Überschreiben von release/.
    const { metafile: production, archivePath } = await packageRelease();
    assert.deepEqual((await readdir('release')).sort(), ['app.js','index.html','style.css']);
    assert.equal(production.outputs['release/app.js'].imports.length, 0);
    assert.ok(Object.keys(production.inputs).every(input => input.startsWith('frontend/')));
    assert.ok(Object.keys(production.inputs).includes('frontend/src/assets/tic-tac-toe-preview.png'));
    assert.ok(Object.keys(production.inputs).includes('frontend/src/assets/connect-four-preview.png'));
    assert.ok(Object.keys(production.inputs).includes('frontend/src/assets/battleship-preview.png'));
    const bundle = await readFile('release/app.js', 'utf8');
    assert.match(bundle, /https:\/\/multiplayer-games\.haldimann-joel\.workers\.dev/);
    assert.ok(!bundle.includes('127.0.0.1'));
    assert.match(bundle, /data:image\/png;base64,/);
    assert.ok(!/\bimport\s*(?:\(|["'{*])/.test(bundle));
    await cp('release', copy, { recursive: true });
    const html = await readFile(path.join(copy, 'index.html'), 'utf8');
    assert.ok(!/type\s*=\s*["']module["']/.test(html));
    const assets = [...html.matchAll(/<(?:link|script)\b[^>]*\b(?:href|src)=["']([^"']+)["']/g)].map(match => match[1]);
    assert.deepEqual(assets.sort(), ['./app.js','./style.css']);
    for (const asset of assets) {
      const url = new URL(asset, `file://${copy}/index.html`);
      assert.equal(url.protocol, 'file:');
      assert.ok(url.pathname.startsWith(copy + '/'));
      await access(url);
    }
    assert.ok(!/@import|url\s*\(/i.test(await readFile(path.join(copy, 'style.css'), 'utf8')));
    const { stdout } = await promisify(execFile)('python3', ['-c', `
import hashlib, json, sys, zipfile
with zipfile.ZipFile(sys.argv[1]) as archive:
    print(json.dumps([{'name': entry.filename, 'hash': hashlib.sha256(archive.read(entry)).hexdigest(), 'directory': entry.is_dir()} for entry in archive.infolist()]))
`, archivePath]);
    const entries = JSON.parse(stdout);
    assert.deepEqual(entries.map(entry => entry.name).sort(), ['app.js', 'index.html', 'style.css']);
    for (const entry of entries) {
      assert.equal(entry.directory, false);
      const hash = createHash('sha256').update(await readFile(path.join(copy, entry.name))).digest('hex');
      assert.equal(entry.hash, hash, `${entry.name} im ZIP entspricht exakt dem öffentlichen Build`);
    }
  } finally { await rm(copy, { recursive: true, force: true }); }
});
