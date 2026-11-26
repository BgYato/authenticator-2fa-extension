# Privacy Policy — Authenticator 2FA

*Last updated: November 26, 2026* · [Versión en español](#política-de-privacidad--authenticator-2fa)

Authenticator 2FA is a browser extension that shows two-factor authentication (2FA) codes.
It is built so that your data never leaves your device.

## Data the extension handles

- **2FA accounts:** service name, account name and secret key of each account you import.
- **Settings:** language, auto-lock time, clipboard and autofill preferences, and the websites
  you associate with each account.

## How it is stored

- Accounts are stored **only on your device**, in the browser's local extension storage,
  **encrypted** with AES-GCM 256 using a key derived from your master password
  (PBKDF2-SHA256, 600,000 iterations).
- Your master password is never stored. While the extension is unlocked, the encryption key is
  kept in session memory and is deleted when it locks or the browser closes.
- Encrypted backups are only created when you export them, and they are saved wherever you choose.

## What the extension does NOT do

- It does not send any data to the developer or to any server. It makes no network requests.
- It does not use analytics, tracking, advertising or cookies.
- It does not sell, share or transfer data to third parties.
- It does not load remote code.

## Permissions

- **Camera:** only when you open the QR scanner, and only after the browser asks for your
  permission. The video is processed locally and never saved.
- **Current tab** (`activeTab`, `scripting`): only on the tab where you open the extension, to
  read a QR code shown on it, suggest the matching account and fill in the code. Never in the background.
- **Clipboard:** to copy a code and clear it after the time you choose. Reading the clipboard is
  optional and only used to check whether it still contains the copied code.
- **Storage, alarms, idle, offscreen:** to keep the encrypted vault, auto-lock it and clear the clipboard.

## Your control

You can delete all data at any time from *Settings → Delete all accounts and the password*, or by
uninstalling the extension.

## Contact

Questions or issues: [github.com/BgYato/authenticator-2fa-extension/issues](https://github.com/BgYato/authenticator-2fa-extension/issues)

---

# Política de privacidad — Authenticator 2FA

*Última actualización: 26 de noviembre de 2026*

Authenticator 2FA es una extensión de navegador que muestra códigos de verificación en dos pasos
(2FA). Está hecha para que tus datos no salgan nunca de tu equipo.

## Datos que maneja

- **Cuentas 2FA:** nombre del servicio, nombre de la cuenta y clave secreta de cada cuenta que importes.
- **Ajustes:** idioma, tiempo de autobloqueo, preferencias de portapapeles y autorrelleno, y los
  sitios web que asocies a cada cuenta.

## Cómo se guardan

- Las cuentas se guardan **solo en tu equipo**, en el almacenamiento local de la extensión,
  **cifradas** con AES-GCM 256 y una clave derivada de tu contraseña maestra
  (PBKDF2-SHA256, 600 000 iteraciones).
- La contraseña maestra no se guarda nunca. Mientras la extensión está desbloqueada, la clave de
  cifrado se mantiene en la memoria de la sesión y se borra al bloquearse o al cerrar el navegador.
- Las copias de seguridad cifradas solo se crean cuando las exportas, y se guardan donde tú elijas.

## Lo que la extensión NO hace

- No envía ningún dato al desarrollador ni a ningún servidor. No hace peticiones de red.
- No usa analítica, rastreo, publicidad ni cookies.
- No vende, comparte ni transfiere datos a terceros.
- No carga código remoto.

## Permisos

- **Cámara:** solo al abrir el escáner de QR y solo después de que el navegador te pida permiso.
  El vídeo se procesa en local y no se guarda.
- **Pestaña actual** (`activeTab`, `scripting`): solo en la pestaña donde abres la extensión, para
  leer un QR que se muestre en ella, sugerir la cuenta y rellenar el código. Nunca en segundo plano.
- **Portapapeles:** para copiar un código y vaciarlo pasado el tiempo que elijas. Leer el
  portapapeles es opcional y solo sirve para comprobar si todavía contiene el código copiado.
- **Almacenamiento, alarmas, inactividad, documento oculto:** para guardar la bóveda cifrada,
  bloquearla automáticamente y vaciar el portapapeles.

## Tu control

Puedes borrar todos los datos cuando quieras desde *Ajustes → Borrar todas las cuentas y la
contraseña*, o desinstalando la extensión.

## Contacto

Dudas o problemas: [github.com/BgYato/authenticator-2fa-extension/issues](https://github.com/BgYato/authenticator-2fa-extension/issues)
