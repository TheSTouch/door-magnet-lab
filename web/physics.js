// Sliding door: 1-D physics along the rail.
//
// Coordinate: p = distance of the door from the CLOSED stop, in metres.
//   p = 0      the closed-side hanger strap just touches the closed-side bumper
//   p < 0      the closed-side bumper is compressed by -p
//   p = travel the open-side hanger strap just touches the open-side bumper
// A positive force pushes the door OPEN (towards larger p).
//
// Everything inside this file is SI (m, kg, s, N, T). The UI converts from mm.
//
// Models (all estimates, to be calibrated against the real door):
// - Rolling resistance: constant coefficient x normal load, with stiction.
// - Rubber bumper: Hunt-Crossley contact, F = k d^1.5 (1 + c d'/v_in), with the
//   damping set from a coefficient of restitution (Flores et al.).
// - Magnetic latch: disc magnets in the box on the stopper, facing down onto the
//   steel plate on top of the door. Pull force from the on-axis field of a
//   cylinder magnet and its mirror image in the plate. The sideways (latching)
//   force comes from energy: when the plate slides out from under a magnet the
//   stored energy U0(gap) = integral of the pull from gap to infinity is released,
//   spread over the magnet diameter in proportion to the chord length.
// - Eddy-current brake: a copper/aluminium strip moving past a row of magnets.
//   Low-speed drag F = c v, with c from a numerical thin-sheet solution on the
//   real strip width (eddy.js), falling off above the sheet's critical speed.
(function (global) {
  'use strict';

  const MU0 = 4e-7 * Math.PI;
  const G = 9.81;
  const GRADES = { N35: 1.19, N42: 1.30, N45: 1.35, N48: 1.39, N52: 1.45 };
  const CONDUCTORS = {
    copper: { sigma: 5.8e7, label: 'Copper' },
    aluminium: { sigma: 3.5e7, label: 'Aluminium' },
  };
  // Calibration: the image-method pull underestimates datasheet adhesive force
  // by about 20-25 % for small N42 discs; 1.25 brings Ø15x5 N42 to ~46 N.
  const PULL_CAL = 1.25;

  // On-axis field of a cylinder magnet, z from its face.
  function bz(Br, R, L, z) {
    return (Br / 2) * ((L + z) / Math.hypot(R, L + z) - z / Math.hypot(R, z));
  }

  // ---------- magnet + steel plate ----------
  // On-axis field of a rectangular block magnet (a x b face), z from its face.
  function bzBlockAxis(Br, a, b, L, z) {
    const f = (zz) => (zz <= 0 ? Math.PI / 2 : Math.atan((a * b) / (2 * zz * Math.sqrt(4 * zz * zz + a * a + b * b))));
    return (Br / Math.PI) * (f(z) - f(z + L));
  }

  function makeMagnet(m) {
    // m: { shape 'disc'|'block', D | a,b, L, grade, pullOverride (N, 0 = compute), plateT,
    //      backIron (sits on steel: acts like a magnet twice as long) }
    const block = m.shape === 'block';
    const L = m.backIron ? 2 * m.L : m.L, Br = GRADES[m.grade] || 1.3;
    const A = block ? m.a * m.b : Math.PI * (m.D / 2) ** 2;
    const Deq = block ? 2 * Math.sqrt(A / Math.PI) : m.D;   // disc of the same area
    const R = Deq / 2;
    const axis = block ? (z) => bzBlockAxis(Br, m.a, m.b, L, z) : (z) => bz(Br, R, L, z);
    m = { ...m, D: Deq };
    const b0 = axis(0);
    const computed = PULL_CAL * A * (2 * b0) ** 2 / (2 * MU0);
    const contact = m.pullOverride > 0 ? m.pullOverride : computed;
    // Thin plates saturate. 1 - exp(-t/t0), t0 = D/8 (estimate).
    const plateFactor = m.plateT > 0 ? 1 - Math.exp(-m.plateT / (m.D / 8)) : 1;
    const pull = (g) => contact * plateFactor * (axis(Math.max(g, 0)) / b0) ** 2;
    // U0(g) = integral of pull from g to "infinity" (g + 20 D is plenty)
    const energy = (g) => {
      const top = g + 20 * m.D, n = 800, h = (top - g) / n;
      let s = pull(g) + pull(top);
      for (let i = 1; i < n; i++) s += pull(g + i * h) * (i % 2 ? 4 : 2);
      return (s * h) / 3;
    };
    // Two identical magnets facing each other (opposite poles), faces d apart:
    // ideal steel acts as a mirror, so a magnet on steel at g equals two magnets
    // 2g apart. Hence pullMM(d) = (unsaturated) pull on steel at d/2.
    const pullMM = (d) => contact * (axis(Math.max(d, 0) / 2) / b0) ** 2;
    const energyMM = (d) => {
      const top = d + 40 * m.D, n = 800, h = (top - d) / n;
      let s = pullMM(d) + pullMM(top);
      for (let i = 1; i < n; i++) s += pullMM(d + i * h) * (i % 2 ? 4 : 2);
      return (s * h) / 3;
    };
    return { R, L, Br, A, b0, contact, computed, plateFactor, pull, energy, pullMM, energyMM,
      field: axis };
  }

  // Fraction of a disc's area that lies past a straight edge, and its
  // derivative, blurred by a Gaussian (fringing grows with the gap).
  function makeEdgeTable(R, sigma) {
    const span = R + 5 * sigma, step = Math.max(R / 400, 2e-6);
    const n = Math.ceil((2 * span) / step) + 1;
    const xs = new Float64Array(n), d = new Float64Array(n), c = new Float64Array(n);
    const chord = (s) => (Math.abs(s) >= R ? 0 : (2 * Math.sqrt(R * R - s * s)) / (Math.PI * R * R));
    const kHalf = Math.ceil((4 * sigma) / step);
    const kern = [];
    let ksum = 0;
    for (let k = -kHalf; k <= kHalf; k++) {
      const w = sigma > 0 ? Math.exp(-0.5 * ((k * step) / sigma) ** 2) : k === 0 ? 1 : 0;
      kern.push(w); ksum += w;
    }
    for (let i = 0; i < n; i++) {
      const s = -span + i * step;
      xs[i] = s;
      let acc = 0;
      for (let k = -kHalf; k <= kHalf; k++) acc += kern[k + kHalf] * chord(s - k * step);
      d[i] = acc / ksum;
    }
    // cumulative (trapezoid), then normalise to exactly 1
    for (let i = 1; i < n; i++) c[i] = c[i - 1] + 0.5 * (d[i] + d[i - 1]) * step;
    const total = c[n - 1];
    for (let i = 0; i < n; i++) { c[i] /= total; d[i] /= total; }
    const look = (arr, s, below, above) => {
      if (s <= -span) return below;
      if (s >= span) return above;
      const f = (s + span) / step, i = Math.floor(f), t = f - i;
      return i >= n - 1 ? arr[n - 1] : arr[i] * (1 - t) + arr[i + 1] * t;
    };
    return {
      // s = how far the plate edge reaches past the magnet centre
      dC: (s) => look(d, s, 0, 0),
      C: (s) => look(c, s, 0, 1),
    };
  }

  // ---------- latch, type 'bumper': magnet in the bumper, pulls the steel strap ----------
  // The magnet sits in the rubber bumper, axis along the rail, its face `recess`
  // behind the bumper face. The pull acts straight along the travel. If the
  // rubber squashes by more than the recess, the magnet itself hits the strap.
  function makeBumperLatch(cfg) {
    const mag = makeMagnet({ ...cfg, plateT: cfg.strapT });
    const n = cfg.count, rec = cfg.recess;
    const kHard = 5e7;   // magnet face on steel: very stiff
    // mount 'embedded': the magnet is moulded into the rubber behind a skin of `recess`
    //   and moves back with the face when the rubber squashes, so the gap never closes.
    // mount 'fixed': the magnet is fixed in the stopper `recess` behind the free face;
    //   squash the rubber more than that and the magnet hits the strap.
    // hangerMag: a second, identical magnet on the hanger strap facing it (opposite
    //   pole). Embedded: it hits the rubber skin over the bumper magnet, gap = skin.
    //   Fixed: it enters the hole in the bumper; it sticks out `hangerProtrude`
    //   from the strap, so the gap at rest shrinks by that much.
    const embedded = cfg.mount !== 'fixed';
    const two = !!cfg.hangerMag;
    const shift = two && !embedded ? cfg.hangerProtrude : 0;
    const gapAt = (p) => (embedded ? rec + Math.max(p, 0) : rec - shift + p);
    const pullAt = (g) => (two ? mag.pullMM(g) : mag.pull(g));
    const energyAt = (g) => (two ? mag.energyMM(g) : mag.energy(g));
    function force(p) {
      const g = gapAt(p);
      if (g < 0) return kHard * Math.pow(-g, 1.5) - n * pullAt(0);
      return -n * pullAt(g);
    }
    let reach = 0.002;
    while (reach < 0.3 && n * pullAt(Math.max(gapAt(reach), 0)) > 0.1) reach += 0.0005;
    const U0 = energyAt(Math.max(gapAt(0), 0));
    return {
      type: 'bumper', cfg, mag, gap: rec, U0, offsets: [0], force, reach, edge: null,
      overlap: () => 1,
      energy: (p) => -n * energyAt(Math.max(gapAt(p), 0)),
      pullAt,
      lift: () => 0,
      gapAt,
      magnetHits: (p) => gapAt(p) < 0,
    };
  }

  // ---------- latch, type 'plate': magnets on a stopper, steel plate on the door ----------
  function makeLatch(cfg) {
    if (cfg.count && cfg.type === 'bumper') return makeBumperLatch(cfg);
    // cfg: { count, D, L, grade, pullOverride, spacing, skin, airGap, extraGap,
    //        plateT, edgeAtContact, plateLen }
    if (!cfg.count) return null;
    const mag = makeMagnet(cfg);
    const gap = cfg.skin + cfg.airGap + (cfg.extraGap || 0);
    const U0 = mag.energy(gap);
    const sigma = Math.max(0.3e-3, 0.5 * gap);
    const edge = makeEdgeTable(mag.R, sigma);
    const offsets = cfg.count === 1 ? [0]
      : cfg.count === 2 ? [-cfg.spacing / 2, cfg.spacing / 2]
      : [-cfg.spacing, 0, cfg.spacing];
    const Lp = cfg.plateLen;
    // offsets: magnet position relative to the box centre, negative = deeper
    // into the stopper (further in the closing direction).
    // s_i = o_i + e0 - p  (how far the edge reaches past magnet i)
    const sOf = (o, p) => o + cfg.edgeAtContact - p;
    function force(p) {   // along +p (positive = pushes the door away from this stop)
      let f = 0;
      for (const o of offsets) {
        const s = sOf(o, p);
        f += -edge.dC(s) + edge.dC(s - Lp);
      }
      return U0 * f;
    }
    function overlap(p) { // number of magnet-equivalents covered by steel
      let a = 0;
      for (const o of offsets) { const s = sOf(o, p); a += edge.C(s) - edge.C(s - Lp); }
      return a;
    }
    const lift = (p) => mag.pull(gap) * overlap(p);  // vertical pull on the plate
    // Where the latch reaches: beyond this the pull is negligible.
    const deepest = Math.max(...offsets.map((o) => o + cfg.edgeAtContact));
    const reach = deepest + mag.R + 3 * sigma;
    const energy = (p) => -U0 * overlap(p);
    return { type: 'plate', cfg, mag, gap, U0, sigma, offsets, force, overlap, lift, reach, edge, energy, magnetHits: () => false };
  }

  // ---------- eddy-current brake ----------
  // The damping comes from DoorEddy (eddy.js): a numerical thin-sheet solution on
  // the real strip width, for the real magnet row (spacing, alternating poles),
  // with the steel behind the sheet (rail or door plate) taken into account.
  function makeBrake(cfg, latchCfg) {
    // cfg: { mode: 'off'|'stopper'|'hanger', conductor, t, width, stripLen,
    //        count, D, L, grade, gap, pitch, alternate, zoneLen, flangeMu }
    if (!cfg || cfg.mode === 'off') return null;
    const sigmaC = (CONDUCTORS[cfg.conductor] || CONDUCTORS.copper).sigma;
    const t = cfg.t;
    let m, gap, n, pitch;
    if (cfg.mode === 'stopper') {
      // the latch magnets brake on a sheet laid on the steel door plate
      if (!latchCfg.count || latchCfg.type === 'bumper') return null;
      m = makeMagnet({ ...latchCfg });
      gap = latchCfg.skin + latchCfg.airGap;
      n = latchCfg.count;
      pitch = latchCfg.spacing;
    } else {
      // magnets on the hanger: snapped straight onto the steel strap (steel behind
      // them, gap = space - strip - magnet), or in a printed holder (gap as set)
      const block = cfg.shape === 'block';
      const onStrap = cfg.mount === 'strap';
      m = makeMagnet({ shape: cfg.shape, D: cfg.D, a: cfg.a, b: cfg.b, L: cfg.L, grade: cfg.grade, pullOverride: 0, plateT: 0.006, backIron: onStrap });
      gap = onStrap ? Math.max(cfg.space - t - cfg.L, 0.0002) : cfg.gap;
      const cols = Math.max(1, Math.round(cfg.cols || cfg.count || 1)), rows = Math.max(1, Math.round(cfg.rows || 1));
      n = cols * rows;
      const along = block ? cfg.a : cfg.D, tall = block ? cfg.b : cfg.D;
      pitch = Math.max(cfg.pitch, along);
      const eddyArgs = { shape: block ? 'block' : 'disc', D: cfg.D, a: cfg.a, b: cfg.b, L: cfg.L, Br: m.Br,
        cols, rows, pitch, rowPitch: Math.max(cfg.rowPitch || 0, tall), alternate: !!cfg.alternate,
        gap, t, width: cfg.width, sigma: sigmaC, steelBack: true, backIron: onStrap };
      const cTotal = global.DoorEddy ? global.DoorEddy.damping(eddyArgs) : 0;
      const vCrit = 2 / (MU0 * sigmaC * t);
      const sideLoad = n * m.pull(gap + t);   // towards the steel rail, all along the travel
      const rowLen = (cols - 1) * pitch + along;
      const height = (rows - 1) * eddyArgs.rowPitch + tall;
      return { cfg, mag: m, gap, n, pitch, cPer: cTotal / n, cTotal, vCrit, sideLoad, rowLen, height, eddyArgs };
    }
    const eddyArgs = { D: m.R * 2, L: m.L, Br: m.Br, n, pitch, alternate: !!cfg.alternate,
      gap, t, width: cfg.width, sigma: sigmaC, steelBack: true };
    const cTotal = global.DoorEddy ? global.DoorEddy.damping(eddyArgs) : 0;
    const vCrit = 2 / (MU0 * sigmaC * t);   // thin-sheet characteristic speed
    // hanger mode: magnets attract the steel rail through the sheet -> side load
    const sideLoad = cfg.mode === 'hanger' ? n * m.pull(gap + t) : 0;
    const rowLen = (n - 1) * pitch + m.R * 2;
    return { cfg, mag: m, gap, n, pitch, cPer: cTotal / n, cTotal, vCrit, sideLoad, rowLen, eddyArgs };
  }

  // ---------- full model ----------
  function buildModel(P) {
    const latchCfg = { ...P.latch, extraGap: P.brake.mode === 'stopper' ? P.brake.t : 0 };
    const latch = makeLatch(latchCfg);
    const brake = makeBrake(P.brake, P.latch);
    const m = P.door.mass + P.door.wheelMass;
    const N = P.door.mass * G;
    const Fs = P.door.crr * N;
    const slopeF = -P.door.mass * G * P.door.slope; // slope = drop per metre towards closed
    const kB = P.bumper.f2mm / Math.pow(0.002, 1.5);
    const e = Math.min(Math.max(P.bumper.restitution, 0.05), 0.98);
    const hcFactor = (8 * (1 - e)) / (5 * e);
    const travel = P.door.travel;
    const both = P.latch.bothEnds;

    // brake activity as a function of position near one stop (dist >= 0 from it)
    function brakeActivity(dist) {
      if (!brake) return 0;
      if (brake.cfg.mode === 'stopper') {
        // the sheet covers the first stripLen of the plate, magnets overlap it
        if (!latch || !latch.edge) return 0;
        let a = 0;
        for (const o of latch.offsets) {
          const s = o + P.latch.edgeAtContact - dist;
          a += latch.edge.C(s) - latch.edge.C(s - P.brake.stripLen);
        }
        return a / latch.offsets.length;
      }
      // the magnet row enters the strip one magnet at a time
      // the strip runs from zoneStart to zoneLen measured from the stop
      const r = brake.rowLen, z0 = P.brake.zoneStart || 0;
      const inFar = Math.min(1, Math.max(0, (P.brake.zoneLen - dist) / r + 0.5));
      const inNear = z0 > 0 ? Math.min(1, Math.max(0, (dist - z0) / r + 0.5)) : 1;
      return Math.min(inFar, inNear);
    }
    function brakeForce(v, act) {
      if (!brake || act <= 0) return 0;
      const x = v / brake.vCrit;
      return (-brake.cTotal * v * act) / (1 + x * x);
    }

    // all forces except friction and the bumper's damping memory
    function parts(p, v) {
      const r = { latch: 0, brake: 0, bumper: 0, slope: slopeF, extraFriction: 0 };
      if (latch) {
        r.latch += latch.force(p);
        if (both) r.latch -= latch.force(travel - p);
      }
      if (brake) {
        const aC = brakeActivity(Math.max(p, 0));
        const aO = both ? brakeActivity(Math.max(travel - p, 0)) : 0;
        r.brake = brakeForce(v, aC) + brakeForce(v, aO);
        if (brake.sideLoad) r.extraFriction = P.brake.flangeMu * brake.sideLoad * Math.min(1, aC + aO);
      }
      return r;
    }

    // static force map near the closed stop (for the chart)
    function staticMap(fromM, toM, n) {
      const out = [];
      for (let i = 0; i <= n; i++) {
        const p = fromM + ((toM - fromM) * i) / n;
        const latchF = latch ? latch.force(p) : 0;
        const bump = p < 0 ? kB * Math.pow(-p, 1.5) : 0;
        out.push({ p, latch: latchF, bumper: bump });
      }
      return out;
    }

    return { P, latch, brake, m, N, Fs, slopeF, kB, hcFactor, travel, both, parts, staticMap, brakeActivity };
  }

  // ---------- integrator ----------
  // opts: { p0, v0, tMax, hand(t, p, v, state) -> N, stopWhen(state) -> bool }
  function simulate(model, opts) {
    const { m, Fs, kB, hcFactor, travel } = model;
    const dt = opts.dt || 1e-4, recEvery = 0.004;
    let p = opts.p0, v = opts.v0, t = 0, nextRec = 0;
    const rec = { t: [], p: [], v: [], latch: [], brake: [], bumper: [], friction: [], hand: [] };
    const ev = {
      contacts: [],           // { end:'closed'|'open', t, v }
      peakBumper: 0,
      maxAfterFirstClosed: null,
      handPeak: 0,
      breakaway: null,
    };
    let inC = false, inO = false, vInC = 0.01, vInO = 0.01;
    let still = 0;
    const tMax = opts.tMax || 8;
    const state = { t, p, v, ev };
    while (t < tMax) {
      const f = model.parts(p, v);
      // bumpers
      let bump = 0;
      if (p < 0) {
        const d = -p, dd = -v;
        if (!inC) { inC = true; vInC = Math.max(Math.abs(v), 0.01); ev.contacts.push({ end: 'closed', t, v: Math.abs(v) }); }
        bump += Math.max(0, kB * Math.pow(d, 1.5) * (1 + (hcFactor * dd) / vInC));
      } else inC = false;
      if (p > travel) {
        const d = p - travel, dd = v;
        if (!inO) { inO = true; vInO = Math.max(Math.abs(v), 0.01); ev.contacts.push({ end: 'open', t, v: Math.abs(v) }); }
        bump -= Math.max(0, kB * Math.pow(d, 1.5) * (1 + (hcFactor * dd) / vInO));
      } else inO = false;
      ev.peakBumper = Math.max(ev.peakBumper, Math.abs(bump));
      const hand = opts.hand ? opts.hand(t, p, v, state) : 0;
      ev.handPeak = Math.max(ev.handPeak, Math.abs(hand));
      const Fother = f.latch + f.brake + f.slope + bump + hand;
      const Fr = Fs + f.extraFriction;
      let fric = 0;
      if (Math.abs(v) < 1e-5) {
        if (Math.abs(Fother) <= Fr) { fric = -Fother; v = 0; }
        else fric = -Math.sign(Fother) * Fr;
      } else fric = -Math.sign(v) * Fr;
      const a = (Fother + fric) / m;
      const vNew = v + a * dt;
      // friction alone must not reverse the motion
      if (v !== 0 && Math.sign(vNew) !== Math.sign(v) && Math.abs(Fother) <= Fr) v = 0;
      else v = vNew;
      p += v * dt;
      t += dt;
      if (opts.hand && ev.breakaway === null && hand > 0 && v > 0.05) ev.breakaway = hand;
      if (t >= nextRec) {
        rec.t.push(t); rec.p.push(p); rec.v.push(v);
        rec.latch.push(f.latch); rec.brake.push(f.brake); rec.bumper.push(bump);
        rec.friction.push(fric); rec.hand.push(hand);
        nextRec += recEvery;
      }
      if (ev.contacts.length && ev.contacts[0].end === 'closed' && p > 0) {
        ev.maxAfterFirstClosed = Math.max(ev.maxAfterFirstClosed || 0, p);
      }
      state.t = t; state.p = p; state.v = v;
      if (opts.stopWhen && opts.stopWhen(state)) break;
      // stop once the door has been at rest for a while (and nobody pushes)
      if (v === 0 && !hand) { still += dt; if (still > 0.3) break; } else still = 0;
    }
    return { rec, ev, final: { t, p, v } };
  }

  // Classify a closing (towards p = 0) or opening run.
  function classify(model, run, towards) {
    const end = towards; // 'closed' | 'open'
    const dist = end === 'closed' ? run.final.p : model.travel - run.final.p;
    const contacts = run.ev.contacts.filter((c) => c.end === end);
    const first = run.ev.contacts[0];
    const impact = first && first.end === end ? first.v : contacts.length ? contacts[0].v : 0;
    const hasLatch = model.latch && (end === 'closed' || model.both);
    const reach = hasLatch ? model.latch.reach : 0;
    const big = run.ev.contacts.filter((c) => c.v > 0.05).length;   // ignore settling taps
    const extra = big > 1 ? ` after ${big} impacts` : '';
    let outcome, ok;
    if (dist < 0.001) {
      outcome = hasLatch ? 'Latched' : 'Closed, not held'; ok = !!hasLatch;
    } else if (hasLatch && dist <= reach) {
      // at rest inside the magnet zone: held in a magnetic well, or stuck short?
      const toward = end === 'closed' ? model.latch.force(dist) : model.latch.force(dist);
      const pullIn = -toward;  // positive = magnet still pulls it towards the stop
      if (pullIn < 0.05 && model.latch.overlap(dist) > 0.2) { outcome = 'Held by magnet'; ok = true; }
      else { outcome = 'Stuck short (friction beats magnet)'; ok = false; }
    } else if (!contacts.length) { outcome = 'Stopped short'; ok = false; }
    else { outcome = hasLatch ? 'Bounced out' : 'Bounced, not held'; ok = false; }
    let where = '';
    if (!ok) {
      const other = end === 'closed' ? 'open' : 'closed';
      const od = other === 'closed' ? run.final.p : model.travel - run.final.p;
      const oLatch = model.latch && (other === 'closed' || model.both);
      if (od < 0.001 || (oLatch && od <= model.latch.reach)) where = `, ended at the ${other} stop`;
    }
    return { outcome: outcome + (ok || outcome === 'Bounced out' ? extra : '') + where, ok, dist, impact,
      contact: contacts.length > 0, impacts: big };
  }

  // Settle the door at rest against the closed stop and return its position.
  function restPosition(model) {
    if (model._rest === undefined) model._rest = simulate(model, { p0: 0, v0: 0, tMax: 3 }).final.p;
    return model._rest;
  }

  // Static breakaway: the largest closing pull the hand must beat, plus friction.
  function breakawayStatic(model) {
    if (!model.latch) return { force: model.Fs + model.parts(0, 0).extraFriction, at: 0 };
    let best = 0, at = 0;
    const reach = model.latch.reach, from = Math.min(restPosition(model), 0);
    for (let i = 0; i <= 600; i++) {
      const p = from + ((reach - from) * i) / 600;
      const f = -model.latch.force(p);
      if (f > best) { best = f; at = p; }
    }
    const extra = model.parts(at, 0).extraFriction;   // brake magnets' side pull, if any
    return { force: best + model.Fs + extra - model.slopeF, at };
  }

  global.DoorPhysics = {
    GRADES, CONDUCTORS, G, MU0, bz, makeMagnet, makeLatch, makeBrake, buildModel,
    simulate, classify, restPosition, breakawayStatic,
  };
})(typeof window !== 'undefined' ? window : globalThis);
