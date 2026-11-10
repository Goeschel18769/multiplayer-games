import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseReleaseTag } from '../../scripts/release-version.mjs';

test('Release-Version startet bei package.version und ignoriert fremde oder instabile Tags', () => {
  assert.equal(chooseReleaseTag({ baseVersion: '1.0.0' }), 'v1.0.0');
  assert.equal(chooseReleaseTag({
    baseVersion: '2.0.0',
    tags: ['v1.99.9', 'release-8.0.0', '3.0.0', 'v3.0.0-beta.1', 'v3.0.0+build', 'v03.0.0', null],
  }), 'v2.0.0');
  assert.equal(chooseReleaseTag({ baseVersion: '0.0.0' }), 'v0.0.0');
});

test('Release-Version erhöht den höchsten passenden stabilen Tag numerisch um einen Patch', () => {
  assert.equal(chooseReleaseTag({ baseVersion: '1.0.0', tags: ['v1.0.0'] }), 'v1.0.1');
  assert.equal(chooseReleaseTag({ baseVersion: '1.0.0', tags: ['v1.9.99', 'v1.10.2', 'v1.10.10'] }), 'v1.10.11');
  assert.equal(chooseReleaseTag({ baseVersion: '1.0.0', tags: ['v3.0.1', 'v2.99.99'] }), 'v3.0.2');
});

test('Rerun verwendet den höchsten passenden Tag am aktuellen Commit erneut', () => {
  assert.equal(chooseReleaseTag({
    baseVersion: '1.0.0', tags: ['v1.0.2', 'v2.0.0'], commitTags: ['v1.0.1', 'v1.0.2', 'v9.0.0-rc.1'],
  }), 'v1.0.2');
  assert.equal(chooseReleaseTag({
    baseVersion: '2.0.0', tags: ['v1.0.2'], commitTags: ['v1.0.2'],
  }), 'v2.0.0');
});

test('Basis ist strikt, ohne führende Nullen, und auf sichere Ganzzahlen begrenzt', () => {
  for (const baseVersion of [undefined, null, '', 'v1.0.0', '01.0.0', '1.01.0', '1.0.01', '1.0', '1.0.0\n', '1.0.0-beta', '1.0.0+build', '9007199254740992.0.0']) {
    assert.throws(() => chooseReleaseTag({ baseVersion }), /package\.version/);
  }
  assert.equal(chooseReleaseTag({ baseVersion: '9007199254740991.0.0' }), 'v9007199254740991.0.0');
  assert.throws(() => chooseReleaseTag(), /package\.version/);
});

test('Unsichere Tags werden ignoriert und ein Patch-Überlauf bricht ab', () => {
  assert.equal(chooseReleaseTag({ baseVersion: '1.0.0', tags: ['v9007199254740992.0.0', 'v1.0.9007199254740992'] }), 'v1.0.0');
  assert.throws(() => chooseReleaseTag({ baseVersion: '1.0.0', tags: ['v1.0.9007199254740991'] }), /Patch-Version/);
  assert.equal(chooseReleaseTag({
    baseVersion: '1.0.0', tags: ['v1.0.9007199254740991'], commitTags: ['v1.0.9007199254740991'],
  }), 'v1.0.9007199254740991');
  assert.throws(() => chooseReleaseTag({ baseVersion: '1.0.0', tags: 'v1.0.0' }), TypeError);
});
