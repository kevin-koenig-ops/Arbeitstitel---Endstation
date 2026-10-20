// Kleine, fehlertolerante Hülle um localStorage. In privaten Fenstern oder
// eingebetteten Ansichten kann der Zugriff fehlschlagen; dann läuft das Spiel
// trotzdem, nur ohne Speichern.

const memory = new Map<string, string>();

export function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key) ?? memory.get(key) ?? null;
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    const raw = memory.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }
}

export function writeJson(key: string, value: unknown): void {
  const raw = JSON.stringify(value);
  memory.set(key, raw);
  try {
    localStorage.setItem(key, raw);
  } catch {
    /* nur im Speicher */
  }
}

export function removeKey(key: string): void {
  memory.delete(key);
  try {
    localStorage.removeItem(key);
  } catch {
    /* egal */
  }
}
