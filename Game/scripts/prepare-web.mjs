// Kopiert alle Spieldateien in den Ordner "www" – das ist der Ordner, den die Android-App (Capacitor) einpackt.
// Aufruf:  node scripts/prepare-web.mjs   (oder: npm run prepare-web)
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'www');

if (!existsSync(join(root, 'libs', 'three.module.min.js'))) {
  console.error('\nFEHLER: libs/three.module.min.js fehlt.');
  console.error('Eine Android-App sollte ohne Internet laufen. Bitte die Datei ablegen (siehe README.md, Abschnitt "Three.js lokal ablegen").\n');
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const item of ['index.html', 'style.css', 'main.mjs', 'manifest.json', 'js', 'libs', 'assets']) {
  if (existsSync(join(root, item))) cpSync(join(root, item), join(out, item), { recursive: true });
}
console.log('Fertig: Ordner "www" ist bereit für Capacitor.');
