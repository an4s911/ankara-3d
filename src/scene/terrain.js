import * as THREE from 'three';

// Height field access for both the detailed city grid and the wide outer grid.
export class Terrain {
  constructor(meta) {
    this.meta = meta;
    // base64 Int16 decimetres → Float32 metres
    const bin = atob(meta.heights);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const dm = new Int16Array(bytes.buffer);
    this.heights = new Float32Array(dm.length);
    for (let i = 0; i < dm.length; i++) this.heights[i] = dm[i] / 10;
    this.inner = meta.inner;
    this.outer = meta.outer;
  }

  _sample(g, x, z) {
    const fx = Math.min(g.nx - 1.0001, Math.max(0, (x - g.minX) / g.step));
    const fz = Math.min(g.nz - 1.0001, Math.max(0, (z - g.minZ) / g.step));
    const i = Math.floor(fx), j = Math.floor(fz), ax = fx - i, az = fz - j;
    const h = this.heights, o = g.offset, nx = g.nx;
    const h00 = h[o + j * nx + i], h10 = h[o + j * nx + i + 1];
    const h01 = h[o + (j + 1) * nx + i], h11 = h[o + (j + 1) * nx + i + 1];
    // Match the triangulation used by PlaneGeometry (diagonal from (i,j+1) to (i+1,j)).
    if (ax + az <= 1) return h00 + (h10 - h00) * ax + (h01 - h00) * az;
    return h11 + (h01 - h11) * (1 - ax) + (h10 - h11) * (1 - az);
  }

  inInner(x, z) {
    const g = this.inner;
    return x >= g.minX && x <= g.maxX && z >= g.minZ && z <= g.maxZ;
  }

  heightAt(x, z) {
    return this.inInner(x, z) ? this._sample(this.inner, x, z) : this._sample(this.outer, x, z);
  }

  // Sea-level elevation (for the info overlay).
  elevationAt(x, z) {
    return this.heightAt(x, z) + this.meta.baseElevation;
  }

  _gridGeometry(g, transform) {
    const w = g.maxX - g.minX, d = g.maxZ - g.minZ;
    const geo = new THREE.PlaneGeometry(w, d, g.nx - 1, g.nz - 1);
    geo.rotateX(-Math.PI / 2);
    geo.translate(g.minX + w / 2, 0, g.minZ + d / 2);
    const pos = geo.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      const i = k % g.nx, j = Math.floor(k / g.nx);
      let y = this.heights[g.offset + j * g.nx + i];
      if (transform) y = transform(pos.getX(k), pos.getZ(k), y);
      pos.setY(k, y);
    }
    geo.computeVertexNormals();
    return geo;
  }

  buildInnerMesh(groundTexture) {
    const g = this.inner;
    const geo = this._gridGeometry(g);
    // UVs for the painted ground texture (u east, v north).
    const uv = geo.attributes.uv;
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const nrm = geo.attributes.normal;
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k), z = pos.getZ(k);
      uv.setXY(k, (x - g.minX) / (g.maxX - g.minX), 1 - (z - g.minZ) / (g.maxZ - g.minZ));
      // Slight darkening on steep slopes (exposed rock / shadowed gullies).
      const slope = 1 - nrm.getY(k);
      const s = 1 - Math.min(0.25, slope * 1.6);
      colors[k * 3] = s; colors[k * 3 + 1] = s * 0.98; colors[k * 3 + 2] = s * 0.95;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    // Skirt: drop the outermost ring of vertices so no gap shows against the outer terrain.
    for (let k = 0; k < pos.count; k++) {
      const i = k % g.nx, j = Math.floor(k / g.nx);
      if (i === 0 || j === 0 || i === g.nx - 1 || j === g.nz - 1) pos.setY(k, pos.getY(k) - 25);
    }
    const mat = new THREE.MeshStandardMaterial({
      map: groundTexture, vertexColors: true, roughness: 0.95, metalness: 0,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = 'terrain-inner';
    return mesh;
  }

  buildOuterMesh() {
    const g = this.outer, inner = this.inner;
    // Inside the city rectangle the outer surface sinks below the detailed terrain.
    const geo = this._gridGeometry(g, (x, z, y) => {
      const dx = Math.max(inner.minX - x, 0, x - inner.maxX);
      const dz = Math.max(inner.minZ - z, 0, z - inner.maxZ);
      const d = Math.hypot(dx, dz);
      return d < 1 ? y - 12 : d < 300 ? y - 12 * (1 - d / 300) : y;
    });
    const pos = geo.attributes.position;
    const nrm = geo.attributes.normal;
    const colors = new Float32Array(pos.count * 3);
    const steppe = new THREE.Color('#b59a6c'), dry = new THREE.Color('#9d8a63'), urban = new THREE.Color('#a9a197');
    const c = new THREE.Color();
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k), z = pos.getZ(k);
      const n = Math.sin(x * 0.0021) * Math.cos(z * 0.0017) * 0.5 + Math.sin(x * 0.0007 + z * 0.0009) * 0.5;
      c.copy(steppe).lerp(dry, 0.5 + n * 0.5);
      // Ankara's sprawl continues for kilometres around downtown.
      const r = Math.hypot(x, z);
      const urb = Math.max(0, Math.min(1, (13000 - r) / 5000)) * (0.65 + 0.35 * n);
      c.lerp(urban, urb * 0.8);
      const slope = 1 - nrm.getY(k);
      c.multiplyScalar(1 - Math.min(0.3, slope * 2));
      colors.set([c.r, c.g, c.b], k * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
    mesh.receiveShadow = true;
    mesh.name = 'terrain-outer';
    return mesh;
  }
}

export async function loadTerrain(base) {
  const meta = await fetch(`${base}data/terrain.json`).then((r) => r.json());
  return new Terrain(meta);
}
