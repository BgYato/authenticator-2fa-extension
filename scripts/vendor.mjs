// Copia jsQR desde node_modules a src/vendor (la extensión no puede cargar código remoto).
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', 'jsqr');
const dest = join(root, 'src', 'vendor');
mkdirSync(dest, { recursive: true });
copyFileSync(join(src, 'dist', 'jsQR.js'), join(dest, 'jsQR.js'));
copyFileSync(join(src, 'LICENSE'), join(dest, 'jsQR.LICENSE'));
console.log('jsQR copiado a src/vendor/');
