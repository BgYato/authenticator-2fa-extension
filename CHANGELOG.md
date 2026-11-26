# Cambios

## 1.0.1 — 2026-11-26

Primera versión publicada en la Chrome Web Store.

- El enlace del proyecto (`homepage_url`, y el nombre del autor en Ajustes) apunta ahora al
  repositorio en lugar del perfil de GitHub.
- Política de privacidad (`PRIVACY.md`) para la ficha de la Web Store.
- Registro de cambios (`CHANGELOG.md`).

## 1.0.0 — 2026-11-26

Versión inicial.

- Importación del QR de exportación de Google Authenticator (también en varios lotes), de QR y
  enlaces `otpauth://` y alta manual de la clave.
- Lectura de QR con la cámara, desde imagen, desde la pestaña actual o seleccionando una zona.
- Códigos TOTP y HOTP (SHA1/SHA256/SHA512, 6 u 8 dígitos).
- Bóveda cifrada con AES-GCM 256 y PBKDF2-SHA256 (600 000 iteraciones), autobloqueo y límite
  de intentos.
- Relleno del código en la página, aviso antiphishing y sugerencia de la cuenta según el sitio.
- Vaciado automático del portapapeles, atajo de teclado y copia de seguridad cifrada.
- Interfaz en español, inglés, portugués y francés.
