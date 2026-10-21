// Erkennt, ob das Spiel als installierte Android-App läuft (Capacitor) statt im Browser.
// Capacitor legt dafür in der App ein globales Objekt `Capacitor` an.

export function isNativeApp(): boolean {
  try {
    const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    return !!cap?.isNativePlatform?.();
  } catch {
    return false;
  }
}
