# Authenticator 2FA — extensión de navegador

Extensión de Chrome (Manifest V3) para ver tus códigos 2FA (TOTP/HOTP) desde el navegador.
Importa las cuentas desde el **QR de exportación de Google Authenticator**
(`otpauth-migration://`), desde QR/enlaces estándar `otpauth://` o con la clave a mano.

**Versión 1.0.0** · Hecho por [Andrés Yate](https://github.com/BgYato) · Licencia [MIT](LICENSE)

> **Nota:** Google no ofrece una API para leer los códigos de Authenticator asociados a la
> cuenta de Google (la sincronización es interna de la app). Por eso todas las extensiones
> de este tipo trabajan con el QR de exportación, igual que esta.

## Funcionalidades

- Importar el QR de exportación de Google Authenticator, también cuando son varios QR (lotes "1 de N").
- **Escanear en vivo con la cámara** del ordenador: pones el móvil delante y se van sumando los QR según pasas de uno a otro.
- Leer el QR de una imagen: subirla, arrastrarla, pegarla con Ctrl+V o **escanear la pestaña actual**.
- **Seleccionar zona**: marca a mano el recuadro del QR sobre una captura de la pestaña (útil si el QR es pequeño o hay varios en pantalla).
- Pegar un enlace `otpauth://` u `otpauth-migration://`, o meter la clave Base32 a mano.
- Códigos TOTP con cuenta atrás en anillo y HOTP con contador. SHA1/SHA256/SHA512, 6 u 8 dígitos.
- En los últimos 5 segundos se muestra también el código siguiente, para no tener que esperarlo.
- Cada servicio lleva un avatar con su inicial y un color fijo, para encontrarlo de un vistazo.
- Al usar un código, la propia fila confirma si se ha rellenado o copiado.
- Copiar el código con un clic, buscar, editar nombres y eliminar cuentas.
- Detección de duplicados al importar.
- **Bóveda cifrada:** AES-GCM 256 con una clave derivada de tu contraseña maestra (PBKDF2-SHA256, 600 000 iteraciones).
- Bloqueo automático configurable (5 min, 15 min, 1 h o al cerrar el navegador) y al bloquear la pantalla del equipo.
- Límite de intentos de contraseña: tras 5 fallos seguidos hay que esperar (30 s, que se duplican con cada fallo, hasta 15 min).
- Copia de seguridad cifrada para exportar y restaurar las cuentas.
- Exportar la copia y borrar todo piden la contraseña otra vez, aunque la extensión esté desbloqueada.
- **Cuentas del sitio abierto primero:** al abrir el popup en `github.com`, la cuenta de GitHub aparece arriba. Se deduce del nombre del servicio. Si usas una cuenta en una web que no reconoce, te pregunta si sugerirla ahí en adelante (y si dices que no, no vuelve a preguntar). También puedes asociar dominios en "Editar → Sitios".
- **Rellenar el código en la página:** al pulsar un código, si la web tiene un campo de código (`one-time-code`, una casilla por dígito o un campo llamado "código", "otp"…) se rellena directamente en vez de copiarse. No envía el formulario. Desactivable en Ajustes.
- **Aviso antiphishing:** si la web no es la de la cuenta pero se le parece (`g1thub.com`, `github-login.com`, `github.evil.com`) o la cuenta tiene sitios asociados y este no es ninguno, avisa antes de rellenar o copiar el código. Puedes cancelar, usarlo una vez o recordar el sitio.
- **Atajo de teclado** `Ctrl+Shift+Y` para abrir el popup (se cambia en `chrome://extensions/shortcuts`). Con la búsqueda enfocada, ↑ ↓ eligen la cuenta y Enter la usa: atajo → Enter → código puesto.
- El portapapeles se vacía unos segundos después de copiar (configurable). Opcionalmente, solo si todavía contiene el código, para no borrar lo que hayas copiado después.
- En la búsqueda, Esc limpia el texto.
- **Idiomas:** español, inglés, portugués y francés. Por defecto sigue el idioma del navegador (si no está disponible, inglés); se puede fijar otro en Ajustes → Idioma y se aplica al momento.
- Al final de Ajustes se muestra la versión instalada y el autor, con enlace a su GitHub.

## Instalación (modo desarrollador)

```bash
npm install        # descarga jsQR y lo copia a src/vendor/
npm test           # tests unitarios (vectores RFC 4226/6238 y decodificación de migración)
```

1. Abre `chrome://extensions`.
2. Activa **Modo de desarrollador**.
3. Pulsa **Cargar descomprimida** y elige esta carpeta (la que contiene `manifest.json`).
4. Fija la extensión en la barra de herramientas.

También funciona en Edge, Brave y otros navegadores basados en Chromium.

## Empaquetar y publicar

```bash
npm test           # comprobar que todo pasa antes de empaquetar
npm run package    # genera dist/authenticator-extension-<versión>.zip
```

El script (`scripts/package.sh`) toma la versión de `manifest.json` y mete en el zip solo lo
necesario: `manifest.json`, `LICENSE`, `_locales/`, `icons/` y `src/`. Necesita el comando `zip`.

**Probar el zip en local.** Chrome no instala un `.zip` directamente: descomprímelo y cárgalo
con **Cargar descomprimida** en `chrome://extensions`. Así compruebas que no falta ningún archivo.

```bash
unzip dist/authenticator-extension-1.0.0.zip -d ~/authenticator-1.0.0
```

**Publicar en la Chrome Web Store.**

1. Entra en el [Developer Dashboard](https://chrome.google.com/webstore/devconsole) (la primera vez
   hay que registrarse como desarrollador, con un pago único de 5 USD).
2. **Nuevo elemento** → sube el zip.
3. Completa la ficha (descripción, icono de 128 px, al menos una captura de 1280×800 o 640×400),
   la justificación de cada permiso y la URL de la política de privacidad.
4. **Enviar para revisión**.

**Nuevas versiones.** Sube `version` en `manifest.json` (y en `package.json`): 1.0.1 para
correcciones, 1.1.0 para funciones nuevas. La Web Store rechaza una versión igual o menor que
la publicada. Después `npm run package` y en el Dashboard **Paquete → Subir nuevo paquete**.

## Cómo exportar desde Google Authenticator

1. En el teléfono: Google Authenticator → menú ☰ → **Transferir cuentas** → **Exportar cuentas**.
2. Selecciona las cuentas → **Siguiente**. Se muestran uno o varios QR.
3. En la extensión pulsa **＋** y luego:
   - **📷 Usar la cámara**: se abre una pestaña con la cámara (la primera vez Chrome pide permiso).
     Pon el QR del móvil dentro del recuadro; si hay varios, pasa al siguiente en el móvil y se
     irán sumando solos. Cuando estén todos, pulsa **Importar**. **O bien**
   - haz una foto o captura del QR y súbela, arrástrala o pégala, **o**
   - abre la imagen en una pestaña del navegador y pulsa **Escanear pestaña**. Si no lo encuentra,
     pulsa **Seleccionar zona** y arrastra un recuadro sobre el QR; al leerlo vuelve sola a tu pestaña.
4. Si hay varios QR (p. ej. uno por pestaña), escanéalos uno a uno: cambia de pestaña, vuelve a
   abrir la extensión y pulsa **Escanear pestaña actual**. Lo ya leído se conserva aunque el
   popup se cierre, y se indica qué QR faltan ("QR leídos: 1, 3 de 3. Faltan: 2").
5. Revisa las cuentas detectadas y pulsa **Importar** (o **Cancelar** para descartar lo leído).

> Las capturas de pantalla del QR de exportación contienen **todos tus secretos**. Bórralas
> (también de la papelera y de la nube) cuando termines.

## Estructura

```
manifest.json          versión, autor (author) y enlace del proyecto (homepage_url)
LICENSE                licencia MIT
_locales/              nombre y descripción de la extensión en cada idioma (los usa Chrome)
icons/                 iconos de la extensión
src/background.js      service worker: autobloqueo, bloqueo con la pantalla y vaciado del portapapeles
src/offscreen/         documento oculto que vacía el portapapeles pasado el tiempo elegido
src/popup/             interfaz del popup (popup.html, popup.css)
  popup.js             arranque, creación de la bóveda, desbloqueo y navegación
  ui.js                estado compartido, vistas, confirmación de contraseña
  list.js              lista de códigos, teclado, relleno/copia, sugerencia por sitio
  import.js            vista "Añadir" (QR, enlaces, alta manual)
  edit.js              edición de cuentas
  settings.js          ajustes, copia de seguridad, borrado y línea de versión/autor
src/scan/              escáner con cámara en una pestaña propia; decodifica en un Web Worker
src/select/            selección manual de la zona del QR sobre una captura de la pestaña
src/ui/dom.js          utilidades de DOM compartidas (lista de importación, avisos)
src/ui/i18n-boot.js    carga el idioma y traduce el HTML antes de arrancar cada página
src/i18n/              textos de la interfaz: es.js (referencia), en.js, pt.js, fr.js
src/lib/
  base32.js            codificación Base32 de las claves
  totp.js              HOTP/TOTP con Web Crypto
  migration.js         decodificador del protobuf otpauth-migration de Google Authenticator
  otpauth.js           parseo/generación de enlaces otpauth://
  accounts.js          validación y normalización de cuentas
  vault.js             bóveda cifrada (chrome.storage.local + chrome.storage.session)
  qr.js                lectura de QR desde imágenes (jsQR, cargado solo al escanear)
  importer.js          importación acumulativa de varios QR (compartida popup/escáner)
  sites.js             qué cuentas corresponden a la web abierta
  autofill.js          rellenar el código en el campo de la página
  i18n.js              traducciones: t(), plurales e idioma elegido
src/vendor/jsQR.js     copiado por `npm install` (no editar)
scripts/               vendor.mjs (copia jsQR) y package.sh (zip para la Web Store)
test/                  tests con node:test (incluye un chrome.storage simulado)
```

## Idiomas

Los textos están en `src/i18n/<código>.js`. En el HTML se marcan con `data-i18n="clave"`
(también `data-i18n-placeholder`, `-title` y `-alt`); en JavaScript se usa `t('clave', { n })`.
Los valores `{ one, other }` son plurales y `{nombre}` se sustituye por el parámetro.
No se usa `chrome.i18n` para la interfaz porque solo sigue el idioma del navegador.

Para añadir un idioma:

1. Copia `src/i18n/es.js` como `src/i18n/<código>.js` y traduce los valores.
2. Regístralo en `DICTS` y `LANGUAGES` de `src/lib/i18n.js`.
3. Añade `_locales/<código>/messages.json` (nombre, descripción y atajo en la Web Store y `chrome://extensions`).
4. `npm test` comprueba que tenga las mismas claves, marcadores y plurales que el español.

## Modelo de seguridad

- Los secretos solo se guardan **cifrados** en `chrome.storage.local`. Sin la contraseña maestra no se pueden leer.
- Al desbloquear, la clave AES se guarda en `chrome.storage.session`: está solo en memoria,
  se borra al cerrar el navegador y los content scripts no tienen acceso. Así no tienes que
  escribir la contraseña cada vez que abres el popup, dentro del margen de autobloqueo.
- La extensión no hace peticiones de red ni carga código remoto. CSP estricta (`script-src 'self'`, sin iframes ni objetos).
- Permisos: `storage`, `activeTab` y `scripting` (escanear la pestaña, sugerir la cuenta y rellenar el código; solo en la pestaña donde pulsas el icono o el atajo, nunca en segundo plano), `alarms` e `idle` (autobloqueo y bloqueo con la pantalla), `offscreen` y `clipboardWrite` (vaciar el portapapeles tras copiar un código; configurable en Ajustes).
  Ninguno muestra advertencias al instalar.
  `clipboardRead` es **opcional**: solo se pide si activas "No borrar si después copias otra cosa" y se puede retirar desactivándolo. Se usa únicamente para comparar el portapapeles con el código copiado antes de vaciarlo.
- Un service worker borra la clave de la sesión en cuanto vence el tiempo de inactividad o se bloquea la pantalla,
  aunque no se abra el popup.
- Antes de usar un código se comprueba la web (`siteCheck` en `lib/sites.js`). Solo se considera fiable un dominio asociado a la cuenta o, si no tiene ninguno, que el emisor sea el nombre del dominio (`github.com` para «GitHub»). Si la cuenta tiene dominios asociados, solo valen esos. Si la web imita el nombre (subdominios, guiones o cambios como `1`→`i` y `rn`→`m`), se avisa antes de rellenar o copiar. Las webs sin relación con el nombre no se pueden distinguir y solo se ofrece asociarlas; asocia tus dominios en "Editar → Sitios" para la máxima protección.
- Tras 5 contraseñas incorrectas seguidas se impone una espera creciente.
- Las bóvedas antiguas con menos iteraciones de PBKDF2 se vuelven a cifrar con el valor actual al desbloquear.
- La copia de seguridad está cifrada con la contraseña maestra vigente al exportarla; no contiene secretos en claro.
- Exportar pide de nuevo la contraseña si no se ha escrito en los últimos 2 minutos; borrar todo la pide siempre. Así, alguien que use tu navegador desbloqueado un momento puede ver códigos, pero no llevarse las claves.
- La cámara no necesita permiso en el manifiesto: Chrome lo pide al abrir el escáner y se puede
  revocar desde el icono de la barra de direcciones. El vídeo se procesa en local y no se guarda.
  El escáner va en una pestaña porque el popup de una extensión no puede mostrar el aviso de permiso.
- La contraseña maestra **no se puede recuperar**. Si la olvidas, borra los datos y vuelve a importar.
- Tener el 2FA en el mismo equipo que tus contraseñas reduce la protección del "segundo factor".
  Úsalo con cabeza y mantén también Google Authenticator en el móvil.

## Ideas para siguientes versiones

- Generar QR `otpauth-migration` para devolver las cuentas al móvil.
- Reordenar cuentas y marcarlas como favoritas.
- Desbloqueo con passkey (WebAuthn PRF) en sistemas con Windows Hello o Touch ID.
- Sincronización cifrada entre navegadores con `chrome.storage.sync`.

## Autor y licencia

Hecho por **Andrés Yate** — [github.com/BgYato](https://github.com/BgYato).

Publicado bajo licencia [MIT](LICENSE). Incluye [jsQR](https://github.com/cozmo/jsQR)
(Apache 2.0) para leer los códigos QR.

Esta extensión no está afiliada ni respaldada por Google. «Google Authenticator» es una marca
de Google LLC y se menciona solo para indicar compatibilidad.
