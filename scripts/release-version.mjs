import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function parseVersion(value) {
  if (typeof value !== 'string' || !stableVersion.test(value)) return null;
  const parts = value.split('.').map(Number);
  return parts.every(Number.isSafeInteger) ? parts : null;
}

function parseTag(value) {
  return typeof value === 'string' && value.startsWith('v') ? parseVersion(value.slice(1)) : null;
}

function compare(left, right) {
  for (let index = 0; index < 3; index++) {
    if (left[index] !== right[index]) return left[index] > right[index] ? 1 : -1;
  }
  return 0;
}

function highestAtLeast(tags, minimum) {
  let highest = null;
  for (const tag of tags) {
    const candidate = parseTag(tag);
    if (candidate && compare(candidate, minimum) >= 0 && (!highest || compare(candidate, highest) > 0)) {
      highest = candidate;
    }
  }
  return highest;
}

export function chooseReleaseTag({ baseVersion, tags = [], commitTags = [] } = {}) {
  const base = parseVersion(baseVersion);
  if (!base) throw new Error('package.version muss eine stabile Semver-Version mit sicheren Ganzzahlen sein (z. B. 1.0.0).');
  if (!Array.isArray(tags) || !Array.isArray(commitTags)) throw new TypeError('tags und commitTags müssen Arrays sein.');

  // Wiederholte Workflow-Ausführungen aktualisieren dasselbe Release am selben Commit.
  const existing = highestAtLeast(commitTags, base);
  if (existing) return `v${existing.join('.')}`;

  const highest = highestAtLeast(tags, base);
  if (!highest) return `v${base.join('.')}`;
  if (highest[2] === Number.MAX_SAFE_INTEGER) throw new Error('Die Patch-Version kann nicht sicher erhöht werden.');
  return `v${highest[0]}.${highest[1]}.${highest[2] + 1}`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length > 2) throw new Error('release-version akzeptiert keine Argumente.');
  const root = fileURLToPath(new URL('../', import.meta.url));
  const run = promisify(execFile);
  const [packageJson, allTags, currentTags] = await Promise.all([
    readFile(path.join(root, 'package.json'), 'utf8'),
    run('git', ['tag', '--list'], { cwd: root }),
    run('git', ['tag', '--points-at', 'HEAD'], { cwd: root }),
  ]);
  const lines = output => output.trim() ? output.trim().split(/\r?\n/) : [];
  const tag = chooseReleaseTag({
    baseVersion: JSON.parse(packageJson).version,
    tags: lines(allTags.stdout),
    commitTags: lines(currentTags.stdout),
  });
  process.stdout.write(`${tag}\n`);
}
