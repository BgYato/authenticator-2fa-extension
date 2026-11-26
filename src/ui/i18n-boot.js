// Carga el idioma elegido y traduce el HTML estático antes de que arranque la página.
// Lo importa dom.js con await de nivel superior: cualquier módulo de interfaz que use
// dom.js espera a que el idioma esté listo.

import { initI18n, applyI18n } from '../lib/i18n.js';

await initI18n();
applyI18n();
