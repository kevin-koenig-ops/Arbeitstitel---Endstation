// Grafikstil (Polygon oder Comic). Ohne three.js, damit die Oberfläche ihn setzen kann,
// bevor die 3D-Teile geladen sind.

export type GraphicsStyle = 'poly' | 'comic';

let current: GraphicsStyle = 'poly';

export function setGraphicsStyle(s: GraphicsStyle) {
  current = s;
}

export function graphicsStyle(): GraphicsStyle {
  return current;
}
