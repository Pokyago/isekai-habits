// Publishes the app to GitHub Pages from this computer: builds it, and puts the built
// files on the gh-pages branch, which is what the page is served from.
// Run with: npm run pages
//
// Only the built app goes online. Habits and money stay on each person's own device.
import { execFileSync, execSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const git = (args, cwd = root) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

const remote = git(['remote', 'get-url', 'origin']);
const commit = git(['rev-parse', '--short', 'HEAD']);
const changed = git(['status', '--porcelain']) !== '';

console.log('Building…');
execSync('npm run build', { cwd: root, stdio: 'inherit' });

// The built files become the one commit of a fresh gh-pages branch, replacing the last publish.
const out = mkdtempSync(join(tmpdir(), 'isekai-pages-'));
try {
  cpSync(join(root, 'dist'), out, { recursive: true });
  // Tells GitHub to serve the files as they are.
  writeFileSync(join(out, '.nojekyll'), '');
  git(['init', '--quiet', '--initial-branch=gh-pages'], out);
  git(['config', 'user.name', git(['config', 'user.name'])], out);
  git(['config', 'user.email', git(['config', 'user.email'])], out);
  git(['config', 'core.autocrlf', 'false'], out);
  git(['add', '--all'], out);
  git(['commit', '--quiet', '-m', `Publish the app built from ${commit}${changed ? ' (with uncommitted changes)' : ''}`], out);
  console.log('Uploading…');
  execFileSync('git', ['push', '--force', remote, 'gh-pages'], { cwd: out, stdio: 'inherit' });
} finally {
  rmSync(out, { recursive: true, force: true });
}

const page = /github\.com[:/]([^/]+)\/(.+?)(\.git)?$/.exec(remote);
console.log(page ? `Published. It is live in about a minute at https://${page[1].toLowerCase()}.github.io/${page[2]}/` : 'Published.');
