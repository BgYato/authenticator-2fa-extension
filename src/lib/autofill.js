// Rellena el código 2FA en la pestaña activa (solo tras pulsar el icono, gracias a activeTab).

/**
 * Se inyecta en la página: debe ser autocontenida (sin referencias externas).
 * Devuelve true si encontró un campo de código y lo rellenó. Nunca envía el formulario.
 */
function fillOtpInPage(code) {
  const HINT = /one.?time|otp|2fa|two.?factor|mfa|totp|token|verif|auth|security.?code|c[oó]digo|code|pin/i;
  const AVOID = /search|buscar|zip|postal|phone|tel[eé]fono|coupon|cup[oó]n|promo|captcha|e-?mail|correo|user|usuario|name|nombre/i;
  const TYPES = ['text', 'tel', 'number', 'password'];

  const usable = (el) => {
    if (el.disabled || el.readOnly || !TYPES.includes(el.type)) return false;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  const describe = (el) =>
    [el.name, el.id, el.placeholder, el.autocomplete, el.getAttribute('aria-label'),
      ...[...(el.labels || [])].map((l) => l.textContent)].join(' ');
  const setValue = (el, value) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    el.focus();
    setter.call(el, value); // compatible con React/Vue, que interceptan .value
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const inputs = [...document.querySelectorAll('input')].filter(usable);
  const n = code.length;

  // 1. El estándar: autocomplete="one-time-code".
  const standard = inputs.filter((el) => el.autocomplete === 'one-time-code');
  if (standard.length === 1 || (standard.length > 1 && standard.every((el) => el.maxLength === 1))) {
    if (standard.length === 1) setValue(standard[0], code);
    else standard.slice(0, n).forEach((el, i) => setValue(el, code[i]));
    return true;
  }

  // 2. Una casilla por dígito.
  const boxes = inputs.filter((el) => el.maxLength === 1 && el.type !== 'password');
  if (boxes.length >= n && boxes.length <= 8) {
    boxes.slice(0, n).forEach((el, i) => setValue(el, code[i]));
    return true;
  }

  // 3. Un campo que parece de código por su nombre, etiqueta o formato.
  const fitsLength = (el) => el.maxLength === -1 || (el.maxLength >= n && el.maxLength <= 12);
  const candidates = inputs.filter((el) => {
    if (!fitsLength(el)) return false;
    const text = describe(el);
    if (AVOID.test(text)) return false;
    if (HINT.test(text)) return true;
    return el.type !== 'password' && el.inputMode === 'numeric' && el.maxLength >= 6 && el.maxLength <= 8;
  });
  if (candidates.length === 1) {
    setValue(candidates[0], code);
    return true;
  }
  // Si hay varios, el que tenga el foco o, si no, el primero vacío.
  const target = candidates.find((el) => el === document.activeElement) || candidates.find((el) => !el.value);
  if (target) {
    setValue(target, code);
    return true;
  }
  return false;
}

/** Intenta rellenar el código; devuelve false si no hay campo o no hay acceso a la pestaña. */
export async function fillInTab(tabId, code) {
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      func: fillOtpInPage,
      args: [code],
    });
    return res?.result === true;
  } catch {
    return false; // página sin acceso (chrome://, Web Store, otra web tras navegar…)
  }
}
