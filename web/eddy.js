// Eddy-current drag of a row of disc magnets moving along a conducting strip.
//
// Thin-sheet, low-speed model, solved numerically on the real strip width:
//
//   In the magnet's frame the strip moves at speed v. The motional EMF drives a
//   current J = sigma (v x B - grad phi) in the plane of the sheet. Charge cannot
//   leave the strip, so div J = 0 inside and J.n = 0 on its two long edges. That
//   gives a Poisson problem for phi with Neumann edges, solved exactly on a grid
//   with cosine transforms (the 5-point Neumann Laplacian is diagonal in DCT-II).
//   Drag = dissipated power / v, so the damping coefficient is
//
//       c = sigma * sum over sheet layers dt * integral |J/(sigma v)|^2 dA.
//
//   Bz in the sheet: the exact off-axis field of each cylinder magnet (two charged
//   faces, integrated numerically), plus its mirror image when steel sits right
//   behind the sheet (the steel rail or the steel door plate), which doubles the
//   normal field at the steel surface. Magnets may alternate N/S along the row.
//
// Valid while v << 2 / (mu0 sigma t) (13.7 m/s for 2 mm copper); the caller adds
// the usual 1 / (1 + (v/vc)^2) roll-off. The solver is checked against the exact
// result for a point dipole over a wide thin sheet, c = 3 mu0^2 m^2 sigma t / (128 pi h^4)
// (see selfTest()).
(function (global) {
  'use strict';
  const MU0 = 4e-7 * Math.PI;

  // ---- Gauss-Legendre nodes on [-1, 1]
  function gaussLegendre(n) {
    const x = new Float64Array(n), w = new Float64Array(n);
    for (let i = 0; i < Math.ceil(n / 2); i++) {
      let z = Math.cos((Math.PI * (i + 0.75)) / (n + 0.5)), pp = 0;
      for (let it = 0; it < 100; it++) {
        let p1 = 1, p2 = 0;
        for (let j = 1; j <= n; j++) { const p3 = p2; p2 = p1; p1 = ((2 * j - 1) * z * p2 - (j - 1) * p3) / j; }
        pp = (n * (z * p1 - p2)) / (z * z - 1);
        const z1 = z; z = z1 - p1 / pp;
        if (Math.abs(z - z1) < 1e-15) break;
      }
      x[i] = -z; x[n - 1 - i] = z;
      w[i] = w[n - 1 - i] = 2 / ((1 - z * z) * pp * pp);
    }
    return { x, w };
  }
  const GR = gaussLegendre(40), GA = gaussLegendre(64);

  // ---- off-axis Bz of a uniformly magnetised cylinder (axis normal to the sheet)
  // z = distance from the magnet's near face. Returns a lookup rho -> Bz.
  const fieldCache = new Map();
  function fieldTable(Br, R, L, z, rhoMax) {
    const key = [Br, R, L, z, rhoMax].map((v) => v.toPrecision(6)).join('|');
    if (fieldCache.has(key)) return fieldCache.get(key);
    const step = Math.min(R / 30, 2.5e-4);
    const n = Math.ceil(rhoMax / step) + 2;
    const tab = new Float64Array(n);
    // one charged disc of radius R at axial distance zz: integral of zz / r^3 dA
    const disc = (rho, zz) => {
      let s = 0;
      for (let i = 0; i < GR.x.length; i++) {
        const a = (R * (GR.x[i] + 1)) / 2, wa = (GR.w[i] * R) / 2;
        let ang = 0;
        for (let k = 0; k < GA.x.length; k++) {
          const th = (Math.PI * (GA.x[k] + 1)) / 2;
          const r2 = rho * rho + a * a - 2 * rho * a * Math.cos(th) + zz * zz;
          ang += GA.w[k] / (r2 * Math.sqrt(r2));
        }
        s += wa * a * ang * (Math.PI / 2) * 2;   // [0, pi] scaled, doubled for symmetry
      }
      return zz * s;
    };
    for (let i = 0; i < n; i++) {
      const rho = i * step;
      tab[i] = (Br / (4 * Math.PI)) * (disc(rho, z) - disc(rho, z + L));
    }
    const look = (rho) => {
      const f = rho / step, i = Math.floor(f);
      if (i >= n - 1) return 0;
      return tab[i] + (tab[i + 1] - tab[i]) * (f - i);
    };
    if (fieldCache.size > 200) fieldCache.clear();
    fieldCache.set(key, look);
    return look;
  }

  // ---- DCT-II helpers (naive O(N^2), sizes stay small)
  const cosCache = new Map();
  function cosTable(N) {
    if (cosCache.has(N)) return cosCache.get(N);
    const C = new Float64Array(N * N);
    for (let k = 0; k < N; k++) for (let n = 0; n < N; n++) C[k * N + n] = Math.cos((Math.PI * (n + 0.5) * k) / N);
    cosCache.set(N, C);
    return C;
  }
  // a: Ny rows x Nx cols (row-major). Transform along x (rows) then y (cols).
  function dct2d(a, Nx, Ny, inverse) {
    const Cx = cosTable(Nx), Cy = cosTable(Ny);
    const tmp = new Float64Array(Nx * Ny), out = new Float64Array(Nx * Ny);
    const row = new Float64Array(Nx), col = new Float64Array(Ny);
    for (let j = 0; j < Ny; j++) {
      for (let i = 0; i < Nx; i++) row[i] = a[j * Nx + i];
      for (let k = 0; k < Nx; k++) {
        let s = 0;
        if (!inverse) { for (let n = 0; n < Nx; n++) s += row[n] * Cx[k * Nx + n]; }
        else { s = row[0] / Nx; for (let m = 1; m < Nx; m++) s += (2 / Nx) * row[m] * Cx[m * Nx + k]; }
        tmp[j * Nx + k] = s;
      }
    }
    for (let i = 0; i < Nx; i++) {
      for (let j = 0; j < Ny; j++) col[j] = tmp[j * Nx + i];
      for (let l = 0; l < Ny; l++) {
        let s = 0;
        if (!inverse) { for (let n = 0; n < Ny; n++) s += col[n] * Cy[l * Ny + n]; }
        else { s = col[0] / Ny; for (let m = 1; m < Ny; m++) s += (2 / Ny) * col[m] * Cy[m * Ny + l]; }
        out[l * Nx + i] = s;
      }
    }
    return out;
  }

  // ---- one sheet layer: integral of |J/(sigma v)|^2 over the strip, for a given Bz(x, y)
  function layerPower(bzAt, width, Lx, h) {
    const Nx = Math.max(8, Math.round(Lx / h)), Ny = Math.max(6, Math.round(width / h));
    const hx = Lx / Nx, hy = width / Ny;
    const x0 = -Lx / 2, y0 = -width / 2;
    // S = v x B / v = -Bz on the y-faces (j+1/2), interior faces j = 0..Ny-2
    const S = new Float64Array(Nx * (Ny - 1));
    for (let j = 0; j < Ny - 1; j++) {
      const y = y0 + (j + 1) * hy;
      for (let i = 0; i < Nx; i++) S[j * Nx + i] = -bzAt(x0 + (i + 0.5) * hx, y);
    }
    // anisotropic Neumann Laplacian: sum (phi_n - phi)/h^2 * (face area) ... scale by hx*hy
    // div J = 0 per cell:  (phi_E - 2 phi + phi_W) hy/hx + (phi_N - 2 phi + phi_S) hx/hy = hx (S_N - S_S)
    const b = new Float64Array(Nx * Ny);
    for (let j = 0; j < Ny; j++) for (let i = 0; i < Nx; i++) {
      const sN = j < Ny - 1 ? S[j * Nx + i] : 0, sS = j > 0 ? S[(j - 1) * Nx + i] : 0;
      b[j * Nx + i] = hx * (sN - sS);
    }
    const B = dct2d(b, Nx, Ny, false);
    for (let l = 0; l < Ny; l++) for (let k = 0; k < Nx; k++) {
      const lam = -(2 - 2 * Math.cos((Math.PI * k) / Nx)) * (hy / hx) - (2 - 2 * Math.cos((Math.PI * l) / Ny)) * (hx / hy);
      B[l * Nx + k] = k === 0 && l === 0 ? 0 : B[l * Nx + k] / lam;
    }
    const phi = dct2d(B, Nx, Ny, true);
    let P = 0;
    for (let j = 0; j < Ny; j++) for (let i = 0; i < Nx - 1; i++) {
      const jx = -(phi[j * Nx + i + 1] - phi[j * Nx + i]) / hx;
      P += jx * jx * hx * hy;
    }
    for (let j = 0; j < Ny - 1; j++) for (let i = 0; i < Nx; i++) {
      const jy = S[j * Nx + i] - (phi[(j + 1) * Nx + i] - phi[j * Nx + i]) / hy;
      P += jy * jy * hx * hy;
    }
    return P;
  }

  // ---- public: damping coefficient of a magnet row over a strip
  // o: { D, L, Br, n, pitch, alternate, gap, t, width, sigma, steelBack, offset?, h? }
  const dampCache = new Map();
  function damping(o) {
    const key = JSON.stringify(o);
    if (dampCache.has(key)) return dampCache.get(key);
    const c = dampingRaw(o);
    if (dampCache.size > 500) dampCache.clear();
    dampCache.set(key, c);
    return c;
  }
  function dampingRaw(o) {
    const R = o.D / 2;
    const n = Math.max(1, Math.round(o.n));
    const span = (n - 1) * o.pitch;
    const margin = Math.max(6 * R, 3 * o.width, 0.04);
    const Lx = span + 2 * margin;
    const h = o.h || Math.max(Math.min(R / 5, o.width / 20), Lx / 300);  // converged to <0.1 %
    const xs = [];
    for (let k = 0; k < n; k++) xs.push({ x: -span / 2 + k * o.pitch, s: o.alternate && k % 2 ? -1 : 1 });
    const rhoMax = Math.hypot(Lx / 2 + 0.01, o.width / 2 + Math.abs(o.offset || 0) + 0.01) + span;
    const d = o.gap + o.t;                         // magnet face to the steel behind the sheet
    // two-point Gauss through the sheet thickness
    const g = 1 / Math.sqrt(3), layers = [o.gap + (o.t / 2) * (1 - g), o.gap + (o.t / 2) * (1 + g)];
    const off = o.offset || 0;
    let c = 0;
    for (const z of layers) {
      const f1 = fieldTable(o.Br, R, o.L, z, rhoMax);
      const f2 = o.steelBack ? fieldTable(o.Br, R, o.L, 2 * d - z, rhoMax) : null;
      const bzAt = (x, y) => {
        let s = 0;
        for (const m of xs) {
          const rho = Math.hypot(x - m.x, y - off);   // off: magnet row offset across the strip
          s += m.s * (f1(rho) + (f2 ? f2(rho) : 0));
        }
        return s;
      };
      c += o.sigma * (o.t / 2) * layerPower(bzAt, o.width, Lx, h);
    }
    return c;
  }

  // Exact check: point dipole over a wide thin sheet.
  function selfTest() {
    const m = 1.0, hgt = 0.01, sigma = 5.8e7, t = 1e-4;
    const bzAt = (x, y) => {
      const r2 = x * x + y * y + hgt * hgt, r = Math.sqrt(r2);
      return ((MU0 * m) / (4 * Math.PI)) * ((3 * hgt * hgt) / (r2 * r2 * r) - 1 / (r2 * r));
    };
    const exact = (3 * MU0 * MU0 * m * m * sigma * t) / (128 * Math.PI * hgt ** 4);
    const out = [];
    for (const W of [0.2, 0.3]) {
      const num = sigma * t * layerPower(bzAt, W, W, 0.0008);
      out.push({ width: W, numeric: num, exact, ratio: num / exact });
    }
    return out;
  }

  global.DoorEddy = { damping, selfTest, fieldTable };
})(typeof window !== 'undefined' ? window : globalThis);
