// Bewegtes Wasser im Zuhause (der See): Ein paar Wellen laufen übereinander. Helle Kämme
// ziehen über die Fläche (gemalt wie auf der Karte), der Himmel spiegelt sich, und wo eine
// Welle zur Sonne kippt, blitzt es kurz auf. Alles passiert im Shader, die Fläche bleibt
// ein einziges Rechteck.

import * as THREE from 'three';

/** Gemeinsame Werte aller Wasserflächen. */
const U = {
  uWaterTime: { value: 0 },
  uWaterSun: { value: new THREE.Vector3(-0.5, 0.85, 0.35).normalize() },
  uWaterSky: { value: new THREE.Color('#9fb4b8') },
  uWaterSunColor: { value: new THREE.Color('#ffe0b0') },
  uWaterCrest: { value: new THREE.Color('#86aaa9') },
};

/** Spiegelungen bleiben im Farbton des Wassers, nur heller. */
const SKY_TINT = new THREE.Color('#7fa3ab');

/** Jedes Bild: Zeit in Sekunden. */
export function setWaterTime(t: number) {
  U.uWaterTime.value = t;
}

/** Bei Tageszeit- oder Wetterwechsel: Sonnenrichtung und wie hell der Himmel ist (0 bis 1). */
export function setWaterLight(sunDir: THREE.Vector3, sunColor: THREE.Color, sky: THREE.Color, brightness: number) {
  U.uWaterSun.value.copy(sunDir).normalize();
  U.uWaterSunColor.value.copy(sunColor).multiplyScalar(brightness);
  U.uWaterSky.value.copy(sky).lerp(SKY_TINT, 0.65).multiplyScalar(brightness);
}

const GLSL = `
varying vec3 vWaterPos;
uniform float uWaterTime;
uniform vec3 uWaterSun;
uniform vec3 uWaterSky;
uniform vec3 uWaterSunColor;
uniform vec3 uWaterCrest;

// Eine Welle: Richtung d, Wellenzahl f (pro Meter), Höhe a (Meter), Tempo s.
// Liefert die Steigung (für die Normale) und in z die Höhe.
vec3 waterWave(vec2 p, float t, vec2 d, float f, float a, float s) {
  d = normalize(d);
  float ph = dot(d, p) * f + t * s;
  return vec3(d * (a * f * cos(ph)), a * sin(ph));
}
vec3 waterSum(vec2 p, float t) {
  return waterWave(p, t, vec2(0.8, 0.6), 0.9, 0.05, 1.1)
       + waterWave(p, t, vec2(-0.5, 0.85), 1.7, 0.03, 1.6)
       + waterWave(p, t, vec2(0.2, -1.0), 3.1, 0.018, 2.3)
       + waterWave(p, t, vec2(-0.9, -0.3), 5.3, 0.011, 3.1);
}
// Helle Kämme: zwei Lagen Rauschen, die langsam gegeneinander treiben. In eine Richtung
// gestreckt, damit lange, flache Wellenkämme entstehen statt Tupfen (0 bis 1).
float wHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float wNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(wHash(i), wHash(i + vec2(1.0, 0.0)), f.x), mix(wHash(i + vec2(0.0, 1.0)), wHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float waterCrest(vec2 p, float t) {
  vec2 q = vec2(p.x * 0.8 + p.y * 0.35, p.y * 2.6 - p.x * 0.6);
  float n = wNoise(q * 1.2 + vec2(t * 0.22, t * 0.08)) * 0.6 + wNoise(q * 2.7 - vec2(t * 0.15, -t * 0.2)) * 0.4;
  return smoothstep(0.64, 0.8, n);
}
`;

export function waterMaterial(color = '#2f4a52'): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.2, metalness: 0.05 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWaterPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n\tvWaterPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${GLSL}`)
      // Farbe: Wellentäler etwas dunkler, helle Kämme darüber
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
	vec3 wSum = waterSum(vWaterPos.xz, uWaterTime);
	diffuseColor.rgb *= 0.9 + 1.2 * wSum.z;
	diffuseColor.rgb = mix(diffuseColor.rgb, uWaterCrest, 0.5 * waterCrest(vWaterPos.xz, uWaterTime));`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
	vec3 wNormal = normalize(vec3(-wSum.x, 1.0, -wSum.y));
	normal = normalize((viewMatrix * vec4(wNormal, 0.0)).xyz);`,
      )
      // Himmel spiegelt sich (bei flachem Blick mehr), Sonne funkelt auf den Wellen
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
	{
		vec3 wView = normalize(cameraPosition - vWaterPos);
		float wFres = pow(1.0 - max(dot(wNormal, wView), 0.0), 4.0);
		totalEmissiveRadiance += uWaterSky * (0.02 + 0.3 * wFres);
		vec3 wRefl = reflect(-wView, wNormal);
		float wSpark = pow(max(dot(wRefl, uWaterSun), 0.0), 120.0);
		totalEmissiveRadiance += uWaterSunColor * wSpark * 1.4;
	}`,
      );
  };
  mat.customProgramCacheKey = () => 'wasser-wellen-3';
  return mat;
}
