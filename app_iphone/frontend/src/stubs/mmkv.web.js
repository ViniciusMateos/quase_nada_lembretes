/**
 * Stub web do react-native-mmkv.
 * Usa localStorage como backend de persistência no browser.
 * API compatível com o uso em AuthContext.js (getString, set, delete, contains, clearAll).
 * Ver ADR-003 na arquitetura para a decisão de usar localStorage vs outras alternativas.
 */

export class MMKV {
  getString(key) {
    try {
      return localStorage.getItem(key) ?? undefined;
    } catch {
      return undefined;
    }
  }

  set(key, value) {
    try {
      localStorage.setItem(key, String(value));
    } catch {
      // localStorage indisponível (modo privado extremo) — falha silenciosa
    }
  }

  delete(key) {
    try {
      localStorage.removeItem(key);
    } catch {}
  }

  contains(key) {
    try {
      return localStorage.getItem(key) !== null;
    } catch {
      return false;
    }
  }

  clearAll() {
    try {
      localStorage.clear();
    } catch {}
  }
}
