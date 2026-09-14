// Only these public assets are deployed. Secrets, server source and documentation stay out.
import { mkdir, copyFile, rm } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await mkdir('dist/assets', { recursive: true });
for (const file of ['index.html', 'styles.css', 'script.js', 'robots.txt', '_headers', '_routes.json']) {
  await copyFile(file, `dist/${file}`);
}
for (const file of ['vesper-logo.jpg', 'cormorant-garamond.ttf', 'Cormorant-Garamond-OFL.txt']) {
  await copyFile(`assets/${file}`, `dist/assets/${file}`);
}
