import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, writeFile, cp, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildFrontend } from '../../scripts/build-frontend.mjs';

test('Release-Vertrag: drei portable Assets, geschlossener IIFE-Build, isolierte lokale Konfiguration', async () => {
  const copy = await mkdtemp(path.join(tmpdir(), 'multiplayer-release-check-'));
  try {
    const local = await buildFrontend({ localTest: true });
    assert.equal(local.outputs['release/app.js'].imports.length, 0);
    assert.ok(Object.keys(local.inputs).includes('tests/fixtures/frontend-local-config.js'));
    assert.match(await readFile('release/app.js', 'utf8'), /http:\/\/127\.0\.0\.1:8789/);
    await writeFile('release/stale-file.txt', 'Entfernen beim nächsten Build');
    const production = await buildFrontend();
    assert.deepEqual((await readdir('release')).sort(), ['app.js','index.html','style.css']);
    assert.equal(production.outputs['release/app.js'].imports.length, 0);
    assert.ok(Object.keys(production.inputs).every(input => input.startsWith('frontend/')));
    const bundle = await readFile('release/app.js', 'utf8');
    assert.match(bundle, /https:\/\/multiplayer-games\.haldimann-joel\.workers\.dev/);
    assert.ok(!bundle.includes('127.0.0.1'));
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
  } finally { await rm(copy, { recursive: true, force: true }); }
});
