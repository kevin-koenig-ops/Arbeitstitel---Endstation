// Wer spielt? Aktuell immer ein Gast mit zufälliger ID auf diesem Gerät.
//
// Später kommt hier ein GoogleAuth dazu (z. B. über Supabase oder Firebase).
// Der Rest des Spiels kennt nur das Interface und merkt den Wechsel nicht.
// Beim ersten Google-Login wird der Gast-Spielstand ins Konto übernommen.

import { readJson, writeJson } from './storage';

export interface User {
  id: string;
  kind: 'guest' | 'google';
  displayName?: string;
}

export interface AuthProvider {
  currentUser(): Promise<User>;
  /** Noch nicht umgesetzt: Gast-Konto mit einem echten Konto verknüpfen. */
  readonly canUpgrade: boolean;
}

const GUEST_KEY = 'endstation.guestId';

function randomId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return 'g-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

export class GuestAuth implements AuthProvider {
  readonly canUpgrade = false;

  async currentUser(): Promise<User> {
    let id = readJson<string>(GUEST_KEY);
    if (!id) {
      id = randomId();
      writeJson(GUEST_KEY, id);
    }
    return { id, kind: 'guest' };
  }
}
