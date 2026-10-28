import * as THREE from 'three';
import { buildAnitkabir } from './anitkabir.js';
import { buildKale } from './kale.js';
import { buildKocatepe } from './kocatepe.js';
import { buildAtakule } from './atakule.js';
import { buildGenclikParki } from './genclikParki.js';
import { buildUlus } from './ulus.js';
import { LANDMARKS } from '../data/landmarkInfo.js';

const BUILDERS = {
  ulus: buildUlus,
  kale: buildKale,
  genclik: buildGenclikParki,
  anitkabir: buildAnitkabir,
  kocatepe: buildKocatepe,
  atakule: buildAtakule,
};

// Builds every landmark; returns [{ ...info, group, anchor, focus, update, camera }]
export function buildLandmarks(ctx) {
  return LANDMARKS.map((info) => {
    const built = BUILDERS[info.id](ctx);
    built.group.traverse((o) => { o.userData.landmarkId = info.id; });
    return { ...info, ...built, camera: heroCamera(built.focus, info.view) };
  });
}

// Camera position for a view given as azimuth (deg, clockwise from north), elevation and distance.
export function heroCamera(focus, { azimuth, elevation, distance }) {
  const az = THREE.MathUtils.degToRad(azimuth), el = THREE.MathUtils.degToRad(elevation);
  const offset = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).multiplyScalar(distance);
  return { position: focus.clone().add(offset), target: focus.clone() };
}
