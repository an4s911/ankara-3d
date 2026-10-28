import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

// Golden hour: late-afternoon sun low in the west-south-west.
export const SUN = { elevation: 9.5, azimuth: 247 }; // degrees; azimuth clockwise from north

export function sunDirection() {
  const el = THREE.MathUtils.degToRad(SUN.elevation), az = THREE.MathUtils.degToRad(SUN.azimuth);
  // north = -Z, east = +X
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
}

export function createRenderer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.62;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);
  return renderer;
}

export function createSky(scene, renderer) {
  const sky = new Sky();
  sky.scale.setScalar(70000);
  const u = sky.material.uniforms;
  u.turbidity.value = 7.5;
  u.rayleigh.value = 2.4;
  u.mieCoefficient.value = 0.0065;
  u.mieDirectionalG.value = 0.86;
  u.sunPosition.value.copy(sunDirection());
  scene.add(sky);

  // Environment map from the same sky for reflections on glass / water / domes.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envSky = new Sky();
  envSky.scale.setScalar(1000);
  Object.assign(envSky.material.uniforms.turbidity, { value: u.turbidity.value });
  envSky.material.uniforms.rayleigh.value = u.rayleigh.value;
  envSky.material.uniforms.mieCoefficient.value = u.mieCoefficient.value;
  envSky.material.uniforms.mieDirectionalG.value = u.mieDirectionalG.value;
  envSky.material.uniforms.sunPosition.value.copy(sunDirection());
  envScene.add(envSky);
  // A warm ground plane so reflections of the lower hemisphere aren't black.
  const ground = new THREE.Mesh(new THREE.CircleGeometry(900, 16).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: '#7a6449' }));
  ground.position.y = -40;
  envScene.add(ground);
  const env = pmrem.fromScene(envScene, 0.02).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.55;
  return { sky, env };
}

export function createLights(scene) {
  const sun = new THREE.DirectionalLight('#ffb871', 5.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.00025;
  sun.shadow.normalBias = 0.6;
  const cam = sun.shadow.camera;
  cam.near = 10; cam.far = 12000;
  scene.add(sun, sun.target);

  const hemi = new THREE.HemisphereLight('#b9c8e6', '#6e5238', 0.75);
  scene.add(hemi);

  scene.fog = new THREE.FogExp2('#e2b98f', 0.000052);

  // Keep the shadow frustum centred on what the camera looks at, sized to the view distance.
  const dir = sunDirection();
  function update(target, viewDist) {
    const size = THREE.MathUtils.clamp(viewDist * 0.9, 250, 5000);
    cam.left = -size; cam.right = size; cam.top = size; cam.bottom = -size;
    cam.updateProjectionMatrix();
    // Snap to shadow texels to avoid shimmering while panning.
    const texel = (2 * size) / sun.shadow.mapSize.x;
    const t = target.clone();
    t.x = Math.round(t.x / texel) * texel;
    t.z = Math.round(t.z / texel) * texel;
    sun.target.position.copy(t);
    sun.position.copy(t).addScaledVector(dir, 6000);
    sun.shadow.normalBias = THREE.MathUtils.clamp(size / 900, 0.3, 4);
  }
  return { sun, hemi, update };
}

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uVignette: { value: 0.28 } },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uVignette; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      // warm golden-hour grade: lift reds in highlights, cool the shadows slightly
      float l = dot(c.rgb, vec3(0.299,0.587,0.114));
      c.rgb = mix(c.rgb, c.rgb * vec3(1.05, 1.0, 0.92), smoothstep(0.25, 0.9, l));
      c.rgb = mix(c.rgb, c.rgb * vec3(0.95, 0.98, 1.05), 1.0 - smoothstep(0.0, 0.35, l));
      // gentle S-curve
      c.rgb = mix(c.rgb, smoothstep(0.0, 1.0, c.rgb), 0.18);
      vec2 d = vUv - 0.5;
      c.rgb *= 1.0 - uVignette * dot(d, d) * 2.2;
      gl_FragColor = c;
    }`,
};

export function createComposer(renderer, scene, camera) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.32, 0.55, 0.92);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  composer.addPass(new ShaderPass(GradeShader));
  return { composer, bloom };
}
