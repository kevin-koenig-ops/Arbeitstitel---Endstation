// Bäume, Büsche, Steine und Häuser als echte 3D-Modelle (three.js) direkt auf der Karte.
//
// Eine eigene MapLibre-Ebene: Alle Bäume einer Art sind ein einziges „Instanced Mesh“,
// das bleibt auch mit Tausenden Bäumen flüssig. Die Häuser sind je Bild (Fassade, Dach)
// ein einziges Mesh. Alles teilt sich die Tiefe mit den Extrusionen der Karte (Autos,
// Schutt), verdeckt sich also richtig. Die Daten kommen aus map/decor.ts und map/houseMesh.ts.

import maplibregl from 'maplibre-gl';
import type { CustomLayerInterface, CustomRenderMethodInput, Map as MLMap } from 'maplibre-gl';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { LatLon } from '../core/types';
import type { TreeKind, TreeSpec } from './decor';
import { buildHome } from './homeModel';
import { buildHouses, FACADES, ROOF_KINDS, roofKey, type HouseSpec, type MatKey } from './houseMesh';
import type { PropSpec } from './landmarks';
import { drawSign } from './signArt';
// Alle Hausbilder (Wände, Dächer, Fensterbogen) als Adressen, Schlüssel = Dateiname ohne Endung
const HAUS_FILES = import.meta.glob<string>('../assets/textures/haus-*.webp', { eager: true, import: 'default' });
const hausTex = (name: string) => HAUS_FILES[`../assets/textures/${name}.webp`];
const HOUSE_TEX: Partial<Record<MatKey, string>> = { roofSnow: hausTex('haus-dach-ziegel'), win: hausTex('haus-fenster') };
for (const f of FACADES) HOUSE_TEX[f] = hausTex(`haus-wand-${f}`);
for (const k of ROOF_KINDS) HOUSE_TEX[roofKey(k)] = hausTex(`haus-dach-${k}`);

/** sRGB (0–1, auch etwas darüber) in lineare Farbe, wie three.js rechnet. */
function toLinear(c: number) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

type Part = { geo: THREE.BufferGeometry; color: string | null };

/** Geometrien in Metern, y nach oben, Fuß bei y = 0. color null = Farbe je Baum. */
function partsFor(kind: TreeKind): Part[] {
  const at = (g: THREE.BufferGeometry, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => {
    g.scale(sx, sy, sz);
    g.translate(x, y, z);
    return g;
  };
  switch (kind) {
    case 'leaf': {
      const crown = mergeGeometries([
        at(new THREE.IcosahedronGeometry(2.6, 1), 0, 5, 0, 1, 0.85, 1),
        at(new THREE.IcosahedronGeometry(1.8, 1), 0.9, 6.6, -0.5, 1, 0.9, 1),
        at(new THREE.IcosahedronGeometry(1.6, 1), -1.1, 5.9, 0.7),
      ]);
      return [
        { geo: at(new THREE.CylinderGeometry(0.24, 0.34, 3.4, 6), 0, 1.7, 0), color: '#6a4f36' },
        { geo: crown, color: null },
      ];
    }
    case 'pine': {
      const crown = mergeGeometries([
        at(new THREE.ConeGeometry(2.5, 3.6, 7), 0, 3.4, 0),
        at(new THREE.ConeGeometry(1.9, 3.2, 7), 0, 5.6, 0),
        at(new THREE.ConeGeometry(1.2, 2.8, 7), 0, 7.6, 0),
      ]);
      return [
        { geo: at(new THREE.CylinderGeometry(0.2, 0.3, 2.4, 6), 0, 1.2, 0), color: '#5a4230' },
        { geo: crown, color: null },
      ];
    }
    case 'birch': {
      const crown = mergeGeometries([at(new THREE.IcosahedronGeometry(1.9, 1), 0, 5.6, 0, 0.9, 1.25, 0.9), at(new THREE.IcosahedronGeometry(1.2, 1), 0.6, 7, 0.3)]);
      return [
        { geo: at(new THREE.CylinderGeometry(0.16, 0.22, 4.6, 6), 0, 2.3, 0), color: '#e2ddd0' },
        { geo: crown, color: null },
      ];
    }
    case 'dead': {
      const wood = mergeGeometries([
        at(new THREE.CylinderGeometry(0.16, 0.32, 6.5, 5), 0, 3.25, 0),
        at(new THREE.CylinderGeometry(0.06, 0.12, 2.6, 4).rotateZ(-0.8), 0.9, 4.6, 0),
        at(new THREE.CylinderGeometry(0.05, 0.1, 2.1, 4).rotateZ(0.9), -0.7, 5.4, 0.2),
        at(new THREE.CylinderGeometry(0.04, 0.08, 1.6, 4).rotateX(0.8), 0, 6, 0.5),
      ]);
      return [{ geo: wood, color: null }];
    }
    case 'bush':
      return [
        {
          geo: mergeGeometries([at(new THREE.IcosahedronGeometry(0.9, 1), 0, 0.6, 0, 1.2, 0.75, 1), at(new THREE.IcosahedronGeometry(0.6, 1), 0.6, 0.55, 0.3), at(new THREE.IcosahedronGeometry(0.55, 1), -0.5, 0.5, -0.3)]),
          color: null,
        },
      ];
    case 'rock':
      return [{ geo: at(new THREE.DodecahedronGeometry(0.8, 0), 0, 0.35, 0, 1.3, 0.6, 1), color: null }];
  }
}

/** Wie groß der Schatten unter einer Art ist (Radius in Metern bei Größe 1). */
const SHADOW_R: Record<TreeKind, number> = { leaf: 3, pine: 2.6, birch: 2.2, dead: 1.2, bush: 1.2, rock: 0.9 };
const KINDS: TreeKind[] = ['leaf', 'pine', 'birch', 'dead', 'bush', 'rock'];

export class TreeLayer implements CustomLayerInterface {
  readonly id = 'trees3d';
  readonly type = 'custom' as const;
  readonly renderingMode = '3d' as const;
  private map: MLMap | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.Camera();
  private group = new THREE.Group();
  private origin: maplibregl.MercatorCoordinate | null = null;
  private meterScale = 1;
  private pending: { trees: TreeSpec[]; center: LatLon } | null = null;
  private pendingHouses: { houses: HouseSpec[]; center: LatLon; props: PropSpec[] } | null = null;
  private signMats = new Map<string, THREE.Material>();
  private houses = new THREE.Group();
  /** Dein Zuhause (eigene Gruppe, liegt an seinem Ort, nicht an der Mitte der Details) */
  private home = new THREE.Group();
  private homeAt: { pos: LatLon; tier: number } | null = null;
  private houseMats = new Map<MatKey | 'shadow', THREE.Material>();
  private textures: THREE.Texture[] = [];
  private geos = new Map<TreeKind, Part[]>();
  private shadowGeo = new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2);
  private shadowMat = new THREE.MeshBasicMaterial({ color: '#2a2a1c', transparent: true, opacity: 0.22, depthWrite: false });
  private mats = new Map<string, THREE.Material>();

  /** minZoom: darunter sind die Bäume zu klein, dann wird nichts gezeichnet. */
  constructor(private minZoom = 0) {
    this.scene.add(new THREE.HemisphereLight('#fff6e2', '#5a5a3e', 1.35));
    const sun = new THREE.DirectionalLight('#fff0d4', 1.6);
    // Sonne von Süden oben (x = Osten, y = oben, z = Süden)
    sun.position.set(-3, 7, 5);
    this.scene.add(sun);
    this.scene.add(this.group);
    this.scene.add(this.houses);
    this.scene.add(this.home);
  }

  /** Dein Zuhause zeigen (oder entfernen); das Modell hängt von der Stufe ab. */
  setHome(pos: LatLon | null, tier: number) {
    const same = this.homeAt && pos && this.homeAt.tier === tier && this.homeAt.pos.lat === pos.lat && this.homeAt.pos.lon === pos.lon;
    this.homeAt = pos ? { pos, tier } : null;
    if (!this.map || same) return;
    for (const child of [...this.home.children]) {
      this.home.remove(child);
      (child as THREE.Mesh).geometry.dispose();
    }
    if (!pos) return this.map.triggerRepaint();
    if (!this.origin) this.setOrigin(pos);
    const { plain, roof } = buildHome(tier);
    for (const [key, m] of [
      ['plain', plain],
      ['roof-ziegel', roof],
    ] as const) {
      if (!m.pos.length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(m.pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(m.uv, 2));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(m.col.map(toLinear), 3));
      this.home.add(new THREE.Mesh(geo, this.houseMaterial(key)));
    }
    this.placeHome();
    this.map.triggerRepaint();
  }

  private placeHome() {
    if (!this.homeAt || !this.origin) return;
    const c = this.pendingHouses?.center ?? this.pending?.center ?? this.homeAt.pos;
    const kx = 111320 * Math.cos((c.lat * Math.PI) / 180);
    this.home.position.set((this.homeAt.pos.lon - c.lon) * kx, 0, -(this.homeAt.pos.lat - c.lat) * 111320);
  }

  onAdd(map: MLMap, gl: WebGLRenderingContext | WebGL2RenderingContext) {
    this.map = map;
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
    this.renderer.autoClear = false;
    if (this.pending) this.setTrees(this.pending.trees, this.pending.center);
    if (this.pendingHouses) this.setHouses(this.pendingHouses.houses, this.pendingHouses.center, this.pendingHouses.props);
    if (this.homeAt) {
      const h = this.homeAt;
      this.homeAt = null;
      this.setHome(h.pos, h.tier);
    }
  }

  /** Alle Häuser neu setzen (nach jedem Neuaufbau der Details, gleiche Mitte wie die Bäume). */
  setHouses(houses: HouseSpec[], center: LatLon, props: PropSpec[] = []) {
    this.pendingHouses = { houses, center, props };
    if (!this.map) return;
    for (const child of [...this.houses.children]) {
      this.houses.remove(child);
      (child as THREE.Mesh).geometry.dispose();
    }
    this.setOrigin(center);
    const { meshes, shadow, signs } = buildHouses(houses, props);
    for (const [key, m] of Object.entries(meshes) as [MatKey, (typeof meshes)[MatKey]][]) {
      if (!m.pos.length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(m.pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(m.uv, 2));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(m.col.map(toLinear), 3));
      this.houses.add(new THREE.Mesh(geo, this.houseMaterial(key)));
    }
    // Schilder: je Bild ein Mesh, das Bild malt signArt.ts
    for (const [key, m] of Object.entries(signs)) {
      if (!m.pos.length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(m.pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(m.uv, 2));
      this.houses.add(new THREE.Mesh(geo, this.signMaterial(key)));
    }
    if (shadow.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(shadow, 3));
      const mesh = new THREE.Mesh(geo, this.houseMaterial('shadow'));
      mesh.renderOrder = -1;
      this.houses.add(mesh);
    }
    this.map.triggerRepaint();
  }

  private houseMaterial(key: MatKey | 'shadow') {
    let mat = this.houseMats.get(key);
    if (mat) return mat;
    if (key === 'shadow') {
      // Weicher Bodenschatten der Häuser
      mat = new THREE.MeshBasicMaterial({ color: '#2a2a1c', transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide });
    } else {
      const url = HOUSE_TEX[key];
      let map: THREE.Texture | null = null;
      if (url) {
        map = new THREE.TextureLoader().load(url, () => this.map?.triggerRepaint());
        // Der Fensterbogen wird nicht gekachelt (sonst bluten die Ränder)
        if (key !== 'win') map.wrapS = map.wrapT = THREE.RepeatWrapping;
        map.colorSpace = THREE.SRGBColorSpace;
        map.anisotropy = Math.min(8, this.renderer?.capabilities.getMaxAnisotropy() ?? 1);
        this.textures.push(map);
      }
      mat = new THREE.MeshLambertMaterial({ map, vertexColors: true, flatShading: true, side: THREE.DoubleSide });
      // Schnee auf dem Dach: die Ziegel schimmern nur noch durch
      if (key === 'roofSnow') (mat as THREE.MeshLambertMaterial).emissive.set('#a2a4a5');
    }
    this.houseMats.set(key, mat);
    return mat;
  }

  private signMaterial(key: string) {
    let mat = this.signMats.get(key);
    if (mat) return mat;
    const tex = new THREE.CanvasTexture(drawSign(key));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(8, this.renderer?.capabilities.getMaxAnisotropy() ?? 1);
    this.textures.push(tex);
    // Schilder leuchten ein wenig, damit man sie auch im Schatten lesen kann
    mat = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide, emissive: '#3a3630', alphaTest: 0.5, flatShading: true });
    this.signMats.set(key, mat);
    return mat;
  }

  private setOrigin(center: LatLon) {
    this.origin = maplibregl.MercatorCoordinate.fromLngLat([center.lon, center.lat], 0);
    this.meterScale = this.origin.meterInMercatorCoordinateUnits();
    this.placeHome();
  }

  /** Alle Bäume neu setzen (nach jedem Neuaufbau der Details). */
  setTrees(trees: TreeSpec[], center: LatLon) {
    this.pending = { trees, center };
    if (!this.map) return;
    this.clear();
    this.setOrigin(center);
    const kx = 111320 * Math.cos((center.lat * Math.PI) / 180);
    const ky = 111320;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const color = new THREE.Color();

    // Schatten: flache, weiche Scheiben unter allem
    const shadows = new THREE.InstancedMesh(this.shadowGeo, this.shadowMat, trees.length);
    trees.forEach((t, i) => {
      const r = SHADOW_R[t.kind] * t.s;
      m.compose(new THREE.Vector3((t.lon - center.lon) * kx + r * 0.25, 0.05, -(t.lat - center.lat) * ky + r * 0.2), q.identity(), new THREE.Vector3(r, 1, r * 0.85));
      shadows.setMatrixAt(i, m);
    });
    shadows.renderOrder = -1;
    this.group.add(shadows);

    for (const kind of KINDS) {
      const list = trees.filter((t) => t.kind === kind);
      if (!list.length) continue;
      let parts = this.geos.get(kind);
      if (!parts) {
        parts = partsFor(kind);
        this.geos.set(kind, parts);
      }
      for (const part of parts) {
        const mesh = new THREE.InstancedMesh(part.geo, this.material(part.color), list.length);
        list.forEach((t, i) => {
          q.setFromAxisAngle(up, t.rot);
          m.compose(new THREE.Vector3((t.lon - center.lon) * kx, 0, -(t.lat - center.lat) * ky), q, new THREE.Vector3(t.s, t.s, t.s));
          mesh.setMatrixAt(i, m);
          if (!part.color) mesh.setColorAt(i, color.set(t.color));
        });
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        this.group.add(mesh);
      }
    }
    this.map.triggerRepaint();
  }

  private material(fixed: string | null) {
    const key = fixed ?? 'instanz';
    let mat = this.mats.get(key);
    if (!mat) {
      mat = new THREE.MeshLambertMaterial({ color: fixed ?? '#ffffff', flatShading: true });
      this.mats.set(key, mat);
    }
    return mat;
  }

  private clear() {
    for (const child of [...this.group.children]) {
      this.group.remove(child);
      (child as THREE.InstancedMesh).dispose?.();
    }
  }

  render(_gl: WebGLRenderingContext | WebGL2RenderingContext, args: CustomRenderMethodInput) {
    if (!this.renderer || !this.origin || !this.map || (!this.group.children.length && !this.houses.children.length && !this.home.children.length)) return;
    if (this.map.getZoom() < this.minZoom) return;
    const raw = (args as unknown as { defaultProjectionData?: { mainMatrix: ArrayLike<number> } }).defaultProjectionData?.mainMatrix ?? args.modelViewProjectionMatrix;
    const s = this.meterScale;
    const local = new THREE.Matrix4()
      .makeTranslation(this.origin.x, this.origin.y, this.origin.z)
      .scale(new THREE.Vector3(s, -s, s))
      .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
    this.camera.projectionMatrix = new THREE.Matrix4().fromArray(Array.from(raw)).multiply(local);
    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
  }

  onRemove() {
    this.clear();
    for (const parts of this.geos.values()) for (const p of parts) p.geo.dispose();
    for (const mat of this.mats.values()) mat.dispose();
    for (const child of this.houses.children) (child as THREE.Mesh).geometry.dispose();
    for (const mat of this.houseMats.values()) mat.dispose();
    for (const mat of this.signMats.values()) mat.dispose();
    for (const t of this.textures) t.dispose();
    this.shadowGeo.dispose();
    this.shadowMat.dispose();
    this.renderer = null;
    this.map = null;
  }
}
