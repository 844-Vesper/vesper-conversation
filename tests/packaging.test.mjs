import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

test('the deployment contains only intended public assets and resolves local links', async () => {
  execFileSync(process.execPath, ['build.mjs']);
  const files = (await readdir('dist', { recursive: true })).filter(file => file !== 'assets').sort();
  assert.deepEqual(files, [
    '_headers', '_routes.json', 'assets/Cormorant-Garamond-OFL.txt',
    'assets/cormorant-garamond.ttf', 'assets/vesper-mark.svg',
    'index.html', 'robots.txt', 'script.js', 'styles.css', 'tokens.css',
  ].sort());
  const html = await readFile('dist/index.html', 'utf8');
  const css = (await readFile('dist/styles.css', 'utf8')) + (await readFile('dist/tokens.css', 'utf8'));
  for (const match of `${html}\n${css}`.matchAll(/(?:src=|href=|url\()["'](\/[^"']+)/g)) {
    await readFile(`dist${match[1]}`);
  }
  assert.match(html, /<meta name="robots" content="noindex, nofollow, noarchive">/);
  assert.match(await readFile('dist/robots.txt', 'utf8'), /User-agent: \*\s+Disallow: \//);
  assert.match(html, /id="scheduling-state"[^>]* hidden/);
  assert.match(html, /id="confirmation-state"[^>]* hidden/);
  assert.doesNotMatch(html, /<script[^>]+src="https?:/);
});
