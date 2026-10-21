// Welche Figuren und Kulissen-Teile gezeigt werden: selbst gebaut („own“) oder aus einem
// fertigen Modellpaket („pack“, Stilprobe). Ohne three.js, damit die Oberfläche es setzen kann,
// bevor die 3D-Teile geladen sind.

export type ModelSet = 'own' | 'pack';

let current: ModelSet = 'pack';

export function setModelSet(s: ModelSet) {
  current = s;
}

export function modelSet(): ModelSet {
  return current;
}
