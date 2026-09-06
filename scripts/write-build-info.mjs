import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

const commitPattern = /^[a-f0-9]{7,40}$/i;
const environmentCandidates = [
  process.env.EDGEONE_COMMIT_SHA,
  process.env.PAGES_COMMIT_SHA,
  process.env.COMMIT_SHA,
  process.env.GITHUB_SHA,
  process.env.CI_COMMIT_SHA,
];

function checkedCommit(value) {
  const candidate = String(value || '').trim();
  return commitPattern.test(candidate) ? candidate.toLowerCase() : '';
}

function currentCommit() {
  const fromEnvironment = environmentCandidates.map(checkedCommit).find(Boolean);
  if (fromEnvironment) return fromEnvironment;

  try {
    return checkedCommit(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }));
  } catch {
    return '';
  }
}

const commit = currentCommit();
const contents = `window.__MYPLANTS_BUILD__ = Object.freeze(${JSON.stringify({ commit })});\n`;
await writeFile(new URL('../build-info.js', import.meta.url), contents, 'utf8');
console.log(commit ? `Generated build information for ${commit.slice(0, 7)}.` : 'Generated build information without a commit identifier.');
