// chrome.storage mínimo en memoria para probar vault.js con Node.
function area() {
  let data = {};
  return {
    async get(keys) {
      if (keys == null) return structuredClone(data);
      const out = {};
      for (const k of [].concat(keys)) if (k in data) out[k] = structuredClone(data[k]);
      return out;
    },
    async set(obj) {
      Object.assign(data, structuredClone(obj));
    },
    async remove(keys) {
      for (const k of [].concat(keys)) delete data[k];
    },
    clear() {
      data = {};
    },
    raw: () => data,
  };
}

export function installChromeMock() {
  globalThis.chrome = { storage: { local: area(), session: area() } };
  return globalThis.chrome;
}
