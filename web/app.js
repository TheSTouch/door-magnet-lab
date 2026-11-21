// Door Magnet Lab: UI, scene drawing, tests, playback.
(function () {
  'use strict';
  const PH = window.DoorPhysics;
  const $ = (s) => document.querySelector(s);
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

  // ---------------------------------------------------------------- parameters
  // si: factor from the displayed unit to SI. measured: value came from the owner.
  const SCHEMA = [
    { g: 'Door and rail' },
    { id: 'door.mass', label: 'Door mass', unit: 'kg', v: 12, min: 2, max: 60, step: 0.5, si: 1, measured: true, help: 'Owner, 2026-11-21: about 12 kg, 80 × 200 cm.' },
    { id: 'door.width', label: 'Door width', unit: 'mm', v: 800, min: 400, max: 1400, step: 10, si: 1e-3, measured: true },
    { id: 'door.travel', label: 'Travel between the bumpers', unit: 'mm', v: 800, min: 200, max: 1500, step: 10, si: 1e-3, help: 'Not measured yet: assumed equal to the door width.' },
    { id: 'door.crr', label: 'Rolling friction coefficient', unit: '', v: 0.006, min: 0.001, max: 0.05, step: 0.001, si: 1, help: 'Pull the door slowly with a luggage scale: steady reading (kg) ÷ door mass (kg).' },
    { id: 'door.slope', label: 'Rail slope towards closed', unit: 'mm/m', v: 0, min: -10, max: 10, step: 0.5, si: 1e-3, help: 'Positive = the door drifts shut on its own.' },
    { id: 'door.wheelMass', label: 'Wheel inertia, as extra mass', unit: 'kg', v: 0.2, min: 0, max: 2, step: 0.05, si: 1 },

    { g: 'Rubber bumper (on each stopper)' },
    { id: 'bumper.len', label: 'Bumper protrusion', unit: 'mm', v: 12, min: 3, max: 40, step: 1, si: 1, help: 'Only used for the drawing.' },
    { id: 'bumper.f2mm', label: 'Force to squash it by 2 mm', unit: 'N', v: 400, min: 50, max: 3000, step: 10, si: 1 },
    { id: 'bumper.restitution', label: 'Bounce (restitution)', unit: '', v: 0.5, min: 0.05, max: 0.95, step: 0.05, si: 1, help: '0 = dead stop, 1 = perfect bounce. Hard rubber 0.5–0.7, soft foam or sorbothane 0.1–0.3.' },

    { g: 'Latch magnets (in the box on the stopper)', note: 'Magnets face down through the printed skin onto the steel plate on top of the door.' },
    { id: 'latch.count', type: 'select', label: 'Magnets', v: 2, options: [[0, 'None'], [1, '1, in the centre'], [2, '2, one each side'], [3, '3 in a row']] },
    { id: 'latch.D', label: 'Magnet diameter', unit: 'mm', v: 15, min: 5, max: 40, step: 1, si: 1e-3 },
    { id: 'latch.L', label: 'Magnet thickness', unit: 'mm', v: 5, min: 1, max: 20, step: 0.5, si: 1e-3 },
    { id: 'latch.grade', type: 'select', label: 'Grade', v: 'N42', options: Object.keys(PH.GRADES).map((k) => [k, k]) },
    { id: 'latch.pullOverride', label: 'Datasheet pull (0 = estimate)', unit: 'N', v: 0, min: 0, max: 500, step: 1, si: 1, help: 'The seller\'s adhesive force on thick steel, kg × 9.81.' },
    { id: 'latch.spacing', label: 'Centre-to-centre spacing', unit: 'mm', v: 15.1, min: 5, max: 60, step: 0.1, si: 1e-3 },
    { id: 'latch.skin', label: 'Printed skin under the magnet', unit: 'mm', v: 0.4, min: 0, max: 3, step: 0.1, si: 1e-3 },
    { id: 'latch.airGap', label: 'Air gap, box underside to plate', unit: 'mm', v: 2, min: 0.2, max: 15, step: 0.1, si: 1e-3, help: 'Not measured yet.' },
    { id: 'latch.plateT', label: 'Door plate thickness (steel)', unit: 'mm', v: 4, min: 0.5, max: 10, step: 0.5, si: 1e-3, help: 'Not measured yet. Check it is steel: a magnet sticks.' },
    { id: 'latch.edgeAtContact', label: 'Plate end past the box centre, door closed', unit: 'mm', v: 10, min: -30, max: 40, step: 0.5, si: 1e-3, help: 'With the hanger touching the bumper: how far the end of the door plate reaches under the box, from the box centre. Negative = it stops before the centre.' },
    { id: 'latch.plateLen', label: 'Plate length', unit: 'mm', v: 120, min: 30, max: 400, step: 5, si: 1e-3 },
    { id: 'latch.bothEnds', type: 'check', label: 'Same kit on the open-side stopper', v: true },

    { g: 'Eddy-current brake', note: 'A copper or aluminium sheet moving past magnets is slowed in proportion to its speed, without contact.' },
    { id: 'brake.mode', type: 'select', label: 'Brake', v: 'off', options: [['off', 'Off'], ['stopper', 'Sheet on the door plate, under the latch magnets'], ['hanger', 'Magnets on the hanger, strip on the rail']] },
    { id: 'brake.conductor', type: 'select', label: 'Sheet', v: 'copper', options: Object.entries(PH.CONDUCTORS).map(([k, c]) => [k, c.label]), show: (V) => V['brake.mode'] !== 'off' },
    { id: 'brake.t', label: 'Sheet thickness', unit: 'mm', v: 2, min: 0.5, max: 10, step: 0.5, si: 1e-3, show: (V) => V['brake.mode'] !== 'off' },
    { id: 'brake.stripLen', label: 'Sheet length from the plate end', unit: 'mm', v: 30, min: 5, max: 200, step: 5, si: 1e-3, show: (V) => V['brake.mode'] === 'stopper' },
    { id: 'brake.count', label: 'Magnets on each hanger', unit: '', v: 4, min: 1, max: 30, step: 1, si: 1, show: (V) => V['brake.mode'] === 'hanger' },
    { id: 'brake.D', label: 'Brake magnet diameter', unit: 'mm', v: 20, min: 5, max: 60, step: 1, si: 1e-3, show: (V) => V['brake.mode'] === 'hanger' },
    { id: 'brake.L', label: 'Brake magnet thickness', unit: 'mm', v: 10, min: 1, max: 30, step: 0.5, si: 1e-3, show: (V) => V['brake.mode'] === 'hanger' },
    { id: 'brake.grade', type: 'select', label: 'Brake magnet grade', v: 'N42', options: Object.keys(PH.GRADES).map((k) => [k, k]), show: (V) => V['brake.mode'] === 'hanger' },
    { id: 'brake.gap', label: 'Gap, magnet to strip', unit: 'mm', v: 1.5, min: 0.3, max: 10, step: 0.1, si: 1e-3, show: (V) => V['brake.mode'] === 'hanger' },
    { id: 'brake.zoneLen', label: 'Strip length from each stop', unit: 'mm', v: 200, min: 20, max: 600, step: 10, si: 1e-3, show: (V) => V['brake.mode'] === 'hanger' },
    { id: 'brake.flangeMu', label: 'Friction from the side pull', unit: '', v: 0.05, min: 0, max: 0.3, step: 0.01, si: 1, help: 'The magnets pull the hanger towards the steel rail and the wheels rub. 0.02 with a guide roller, 0.15 if something slides.', show: (V) => V['brake.mode'] === 'hanger' },

    { g: 'Test' },
    { id: 'test.start', label: 'Start, distance from the stop', unit: 'mm', v: 300, min: 20, max: 1500, step: 10, si: 1e-3 },
    { id: 'test.speed', label: 'Push speed', unit: 'm/s', v: 0.8, min: 0.05, max: 3, step: 0.05, si: 1, help: 'Gentle close 0.3, normal 0.5–1, slam 1.5–2.5.' },
    { id: 'test.pullRate', label: 'Pull test: force rise', unit: 'N/s', v: 10, min: 1, max: 100, step: 1, si: 1 },
  ];
  const DEFAULTS = Object.fromEntries(SCHEMA.filter((s) => s.id).map((s) => [s.id, s.v]));
  const STORE = 'door-magnet-lab-v1';
  let V = { ...DEFAULTS };
  try { Object.assign(V, JSON.parse(localStorage.getItem(STORE) || '{}')); } catch (e) { /* storage blocked */ }
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(V)); } catch (e) { /* ignore */ } };

  function toParams() {
    const P = { door: {}, bumper: {}, latch: {}, brake: {}, test: {} };
    for (const s of SCHEMA) {
      if (!s.id) continue;
      const [grp, key] = s.id.split('.');
      let val = V[s.id];
      if (s.type === 'select') val = typeof s.v === 'number' ? +val : val;
      else if (s.type === 'check') val = !!val;
      else val = +val * s.si;
      P[grp][key] = val;
    }
    return P;
  }

  // ---------------------------------------------------------------- panel
  function buildPanel() {
    const root = $('#params');
    root.innerHTML = '';
    let group;
    for (const s of SCHEMA) {
      if (s.g) {
        group = document.createElement('div');
        group.className = 'group';
        group.innerHTML = `<h3>${s.g}</h3>${s.note ? `<p class="gnote">${s.note}</p>` : ''}`;
        root.appendChild(group);
        if (s.g.startsWith('Latch')) group.dataset.derived = 'latch';
        if (s.g.startsWith('Eddy')) group.dataset.derived = 'brake';
        continue;
      }
      const row = document.createElement('div');
      row.className = 'prm' + (s.type === 'check' ? ' check' : '') + (s.measured ? ' measured' : '');
      row.dataset.id = s.id;
      const uid = 'p-' + s.id.replace('.', '-');
      if (s.type === 'select') {
        row.innerHTML = `<label for="${uid}">${s.label}</label><select id="${uid}">${s.options.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>`;
        row.querySelector('select').value = V[s.id];
        row.style.gridTemplateColumns = s.id === 'brake.mode' ? '1fr' : '';
      } else if (s.type === 'check') {
        row.innerHTML = `<input type="checkbox" id="${uid}"><label for="${uid}">${s.label}</label>`;
        row.querySelector('input').checked = !!V[s.id];
      } else {
        row.innerHTML = `<label for="${uid}">${s.label}${s.unit ? ` <span class="unit">${s.unit}</span>` : ''}</label>
          <input type="number" id="${uid}" min="${s.min}" max="${s.max}" step="${s.step}" value="${V[s.id]}">
          <input type="range" min="${s.min}" max="${s.max}" step="${s.step}" value="${V[s.id]}" aria-label="${s.label}">`;
      }
      if (s.help) row.insertAdjacentHTML('beforeend', `<div class="help">${s.help}</div>`);
      group.appendChild(row);
      const inputs = row.querySelectorAll('input, select');
      inputs.forEach((el) => el.addEventListener('input', () => {
        if (el.type === 'checkbox') V[s.id] = el.checked;
        else if (el.tagName === 'SELECT') V[s.id] = el.value;
        else {
          V[s.id] = el.value;
          inputs.forEach((o) => { if (o !== el) o.value = el.value; });
        }
        save();
        refreshVisibility();
        changed();
      }));
    }
    for (const grp of root.querySelectorAll('.group[data-derived]')) {
      const d = document.createElement('div');
      d.className = 'derived';
      d.id = 'derived-' + grp.dataset.derived;
      grp.appendChild(d);
    }
    refreshVisibility();
  }
  function refreshVisibility() {
    for (const s of SCHEMA) {
      if (!s.id || !s.show) continue;
      const row = document.querySelector(`.prm[data-id="${s.id}"]`);
      if (row) row.style.display = s.show(V) ? '' : 'none';
    }
  }

  // ---------------------------------------------------------------- state
  let P, model, run = null, lastTest = 'close', runInfo = null;
  let playT = 0, playing = false, lastFrame = 0;
  let sweepTimer = null, changeTimer = null;

  function changed() {
    clearTimeout(changeTimer);
    changeTimer = setTimeout(rebuild, 120);
  }
  function rebuild() {
    P = toParams();
    model = PH.buildModel(P);
    updateDerived();
    updateMap();
    updateQuestions();
    runTest(lastTest, true);
    clearTimeout(sweepTimer);
    sweepTimer = setTimeout(runSweep, 350);
  }

  // ---------------------------------------------------------------- derived
  const f1 = (x) => (Math.abs(x) >= 100 ? x.toFixed(0) : Math.abs(x) >= 10 ? x.toFixed(1) : x.toFixed(2));
  function latchWell() {
    const L = model.latch;
    if (!L) return 0;
    const rest = PH.restPosition(model);
    return L.U0 * (L.overlap(rest) - L.overlap(L.reach + 0.002));
  }
  function updateDerived() {
    const L = model.latch, B = model.brake;
    const dl = $('#derived-latch'), db = $('#derived-brake');
    if (L) {
      const hangerLoad = (P.door.mass * PH.G) / 2;
      dl.innerHTML = `Each magnet: <b>${f1(L.mag.contact)} N</b> on contact (${P.latch.pullOverride ? 'datasheet' : 'estimate'}),
        <b>${f1(L.mag.pull(L.gap))} N</b> across the ${f1(L.gap * 1e3)} mm gap.<br>
        Latch energy ${(latchWell() * 1000).toFixed(0)} mJ, reach ${f1(L.reach * 1e3)} mm from the bumper.<br>
        Upward pull on the plate up to ${f1(L.mag.pull(L.gap) * L.offsets.length)} N
        (each hanger carries ${f1(hangerLoad)} N).`;
    } else dl.textContent = 'No latch magnets.';
    if (B) {
      const need = neededDamping();
      db.innerHTML = `Damping <b>${f1(B.cTotal)} N·s/m</b> at each end (${f1(B.cPer)} per magnet, field in the sheet ${B.Beff.toFixed(2)} T).<br>
        To slow a ${P.test.speed} m/s push to 0.3 m/s over this zone you need about <b>${f1(need)} N·s/m</b>.` +
        (B.sideLoad ? `<br>The brake magnets pull the hanger onto the steel rail with about <b>${f1(B.sideLoad)} N</b>.` : '');
    } else db.textContent = 'Brake off.';
  }
  function zoneLength() {
    if (!model.brake) return 0;
    return P.brake.mode === 'stopper' ? P.brake.stripLen : P.brake.zoneLen;
  }
  function neededDamping() {
    const z = zoneLength();
    return z > 0 ? (model.m * Math.max(P.test.speed - 0.3, 0)) / z : 0;
  }

  // ---------------------------------------------------------------- tests
  function runTest(kind, keepTime) {
    lastTest = kind;
    document.querySelectorAll('[data-test]').forEach((b) => b.classList.toggle('primary', b.dataset.test === kind));
    const travel = model.travel;
    const start = Math.min(P.test.start, travel);
    if (kind === 'close') {
      run = PH.simulate(model, { p0: start, v0: -P.test.speed, tMax: 12 });
      runInfo = { kind, cls: PH.classify(model, run, 'closed'), label: `Pushed closed at ${P.test.speed} m/s from ${f1(start * 1e3)} mm` };
    } else if (kind === 'open') {
      run = PH.simulate(model, { p0: travel - start, v0: P.test.speed, tMax: 12 });
      runInfo = { kind, cls: PH.classify(model, run, 'open'), label: `Pushed open at ${P.test.speed} m/s from ${f1(start * 1e3)} mm before the open stop` };
    } else {
      const rest = PH.restPosition(model);
      const reach = model.latch ? model.latch.reach : 0.005;
      const rate = P.test.pullRate;
      let released = false;
      const stat = PH.breakawayStatic(model);
      run = PH.simulate(model, {
        p0: rest, v0: 0, tMax: Math.min(40, (stat.force * 1.6) / rate + 3),
        hand: (t, p) => {
          if (!released && p > reach + 0.008) released = true;
          return released ? 0 : rate * Math.max(t, 1e-6);
        },
        stopWhen: (s) => released && s.v === 0,
      });
      runInfo = { kind, rest, stat, label: `Pulled from the latched position, force rising ${rate} N/s` };
    }
    if (!keepTime) playT = 0;
    playT = Math.min(playT, run.final.t);
    playing = !keepTime || playing;
    if (!keepTime) playing = true;
    $('#btn-play').textContent = playing ? '⏸' : '▶';
    $('#scrub').max = Math.round(run.final.t * 1000);
    updateResults();
    updateTimeCharts();
    drawFrame();
  }

  function card(k, v, n, cls) {
    return `<div class="res ${cls || ''}"><div class="k">${k}</div><div class="v">${v}</div>${n ? `<div class="n">${n}</div>` : ''}</div>`;
  }
  function updateResults() {
    const r = run, i = runInfo, el = $('#results');
    $('#result-test').textContent = i.label;
    const stat = PH.breakawayStatic(model);
    const rest = PH.restPosition(model);
    const preload = model.latch ? -model.latch.force(rest) : 0;
    let html = '';
    if (i.kind === 'pull') {
      const sim = r.ev.breakaway;
      html += card('Force to pull it out of the latch', `${f1(stat.force)} N`, `≈ ${(stat.force / PH.G).toFixed(2)} kg on a luggage scale, hardest ${f1(stat.at * 1e3)} mm out.` + (sim ? ` In this ramp test it broke free at ${f1(sim)} N (a quicker pull reads higher).` : ''), 'wide');
      html += card('Held against the bumper with', `${f1(Math.max(preload, 0))} N`, 'Magnet pull at rest. Stops rattling if it is above a few newtons.');
      html += card('Rest position', rest < 0 ? `${f1(-rest * 1e3)} mm squash` : rest < 1e-4 ? 'touching' : `${f1(rest * 1e3)} mm off`, rest > 1e-4 ? 'Friction stops the magnet pulling it onto the bumper.' : 'Bumper squash at rest.');
    } else {
      const c = i.cls;
      html += card('Outcome', `${c.ok ? '✓' : '✗'} ${c.outcome}`, c.ok ? 'The door ends at rest, held by the magnet.' : `Ends ${f1(c.dist * 1e3)} mm from the stop.`, 'wide ' + (c.ok ? 'ok' : 'bad'));
      html += card('Speed when it hits the bumper', c.contact ? `${c.impact.toFixed(2)} m/s` : '–', c.contact ? `${f1(0.5 * model.m * c.impact ** 2)} J of energy at impact` : 'It never reached the bumper.');
      html += card('Peak bumper force', `${f1(r.ev.peakBumper)} N`, 'Load on the stopper clamp, the bumper and the hanger.');
      const reb = r.ev.maxAfterFirstClosed;
      if (i.kind === 'close') html += card('Rebound after first hit', reb ? `${f1(reb * 1e3)} mm` : '–', 'Furthest it bounced back out.');
      html += card('Pull needed to open it', `${f1(stat.force)} N`, `≈ ${(stat.force / PH.G).toFixed(2)} kg. Pull at rest ${f1(preload)} N.`);
    }
    html += advice();
    el.innerHTML = html;
  }

  function advice() {
    const L = model.latch, e = P.bumper.restitution, m = model.m;
    if (!L) return '<div class="advice">No latch magnets: nothing holds the door shut.</div>';
    const W = latchWell();
    // rebound energy e^2 * KE must stay below the latch energy
    const vCatch = Math.sqrt((2 * W) / (m * e * e));
    let s = `The latch stores about <b>${(W * 1000).toFixed(0)} mJ</b>. With a bounce of ${e}, it can catch a door that hits the bumper at up to about <b>${vCatch.toFixed(2)} m/s</b>`;
    s += ` (a ${P.test.speed} m/s push carries ${f1(0.5 * m * P.test.speed ** 2)} J).`;
    if (vCatch < P.test.speed) {
      s += ' To catch faster doors: a softer, deader bumper (lower bounce), a smaller gap or bigger magnets (more latch energy), or a brake that slows the door before it hits.';
    }
    return `<div class="advice">${s}</div>`;
  }

  // ---------------------------------------------------------------- sweep
  let sweep = null;
  function runSweep() {
    const travel = model.travel, start = Math.min(P.test.start, travel);
    const pts = [];
    for (let v = 0.1; v <= 3.0001; v += 0.1) {
      const r = PH.simulate(model, { p0: start, v0: -v, tMax: 8 });
      const c = PH.classify(model, r, 'closed');
      pts.push({ v: +v.toFixed(2), impact: c.impact, ok: c.ok, label: c.outcome, peak: r.ev.peakBumper });
    }
    sweep = pts;
    const okV = pts.filter((p) => p.ok).map((p) => p.v);
    let hint;
    if (!okV.length) hint = 'No push speed ends latched.';
    else {
      const ranges = [];
      let a = null, prev = null;
      for (const p of pts) {
        if (p.ok && a === null) a = p.v;
        if (!p.ok && a !== null) { ranges.push([a, prev]); a = null; }
        prev = p.v;
      }
      if (a !== null) ranges.push([a, prev]);
      hint = 'Ends latched for pushes of ' + ranges.map(([x, y]) => (x === y ? `${x}` : `${x}–${y}`)).join(', ') + ' m/s';
    }
    $('#sweep-hint').textContent = `From ${f1(start * 1e3)} mm. ${hint}`;
    charts.sweep.set([{ name: 'Impact speed', color: '--series-1', data: pts.map((p) => [p.v, p.impact]),
      dots: pts.map((p) => ({ x: p.v, y: p.impact, ok: p.ok, label: p.label })) }]);
  }

  // ---------------------------------------------------------------- charts
  const charts = {};
  function initCharts() {
    charts.pos = new Chart({ canvas: $('#ch-pos'), xLabel: 's', yFmt: (v) => f1(v), yTip: (v) => `${v.toFixed(1)} mm`, xTip: (v) => `${v.toFixed(2)}`, height: 170 });
    charts.vel = new Chart({ canvas: $('#ch-vel'), xLabel: 's', yTip: (v) => `${v.toFixed(3)} m/s`, xTip: (v) => `${v.toFixed(2)}`, height: 170 });
    charts.force = new Chart({ canvas: $('#ch-force'), xLabel: 's', yFmt: (v) => f1(v), yTip: (v) => `${v.toFixed(2)} N`, xTip: (v) => `${v.toFixed(2)}`, height: 170 });
    charts.map = new Chart({ canvas: $('#ch-map'), xLabel: 'mm', yFmt: (v) => f1(v), yTip: (v) => `${v.toFixed(2)} N`, xTip: (v) => `${v.toFixed(1)}`, height: 200 });
    charts.sweep = new Chart({ canvas: $('#ch-sweep'), xLabel: 'push m/s', yTip: (v) => `${v.toFixed(2)} m/s at the bumper`, xTip: (v) => `${v.toFixed(1)}`, height: 200 });
  }
  function legend(el, items) {
    el.innerHTML = items.map(([name, color]) => `<span><i style="background:var(${color})"></i>${name}</span>`).join('');
  }
  function updateTimeCharts() {
    const r = run.rec;
    const nearClosed = runInfo.kind !== 'open';
    const toDist = (p) => (nearClosed ? p : model.travel - p) * 1000;
    const t = r.t;
    charts.pos.set([{ name: 'Distance', color: '--series-1', data: t.map((x, i) => [x, toDist(r.p[i])]) }]);
    charts.vel.set([{ name: 'Speed', color: '--series-1', data: t.map((x, i) => [x, r.v[i]]) }]);
    const series = [
      { name: 'Latch', color: '--series-1', data: t.map((x, i) => [x, r.latch[i]]) },
      { name: 'Brake', color: '--series-2', data: t.map((x, i) => [x, r.brake[i]]) },
      { name: runInfo.kind === 'pull' ? 'Hand' : 'Friction', color: '--series-3', data: t.map((x, i) => [x, runInfo.kind === 'pull' ? r.hand[i] : r.friction[i]]) },
    ];
    if (!model.brake) series.splice(1, 1);
    charts.force.set(series);
    legend($('#lg-force'), series.map((s) => [s.name, s.color]));
  }
  function updateMap() {
    const L = model.latch;
    const to = L ? L.reach + 0.008 : 0.04;
    const pts = model.staticMap(-0.0015, to, 300);
    const series = [{ name: 'Latch total', color: '--series-1', data: pts.map((d) => [d.p * 1000, d.latch]) }];
    if (L && L.offsets.length === 2) {
      L.offsets.forEach((o, k) => {
        const f = (p) => { const s = o + L.cfg.edgeAtContact - p; return L.U0 * (-L.edge.dC(s) + L.edge.dC(s - L.cfg.plateLen)); };
        series.push({ name: k === 0 ? 'Magnet deeper in the stopper' : 'Magnet nearer the door', color: k === 0 ? '--series-2' : '--series-3',
          data: pts.map((d) => [d.p * 1000, f(d.p)]) });
      });
    }
    const rest = PH.restPosition(model);
    charts.map.set(series, { markers: [{ x: 0, label: 'bumper' }, { x: rest * 1000, label: '' }] });
    legend($('#lg-map'), series.map((s) => [s.name, s.color]));
  }

  // ---------------------------------------------------------------- scene
  const GEO = { stopW: 35, railH: 40, lobeBottom: -78, bumperY: -58, bumperD: 18, strapW: 40, wheelR: 45, doorTop: -95, doorLeft: -150, boxW: 40, boxH: 25, boxWall: 4, boxFloor: 4 };
  function geo() {
    const g = { ...GEO };
    g.bl = P.bumper.len;
    g.xb = -g.bl - g.stopW / 2;
    g.e0 = P.latch.edgeAtContact * 1000;
    g.plateT = P.latch.plateT * 1000;
    g.plateTop = g.doorTop + g.plateT;
    g.sheet = model.brake && P.brake.mode === 'stopper' ? P.brake.t * 1000 : 0;
    g.air = P.latch.airGap * 1000;
    g.boxBottom = g.plateTop + g.sheet + g.air;
    g.doorW = P.door.width * 1000;
    g.hs = g.doorW - 340;              // strap 1 left edge -> strap 2 left edge
    g.travel = model.travel * 1000;
    g.xOpen = g.travel + g.hs + g.strapW; // open-side bumper face, world
    return g;
  }

  function mapper(cx, cy, s, mirror) {
    return { x: (x) => cx + (mirror ? -x : x) * s, y: (y) => cy - y * s, s, mirror };
  }
  function rect(g, M, x0, x1, y0, y1, fill, stroke, r) {
    const a = M.x(x0), b = M.x(x1), c = M.y(y0), d = M.y(y1);
    const X = Math.min(a, b), Y = Math.min(c, d), W = Math.abs(b - a), H = Math.abs(d - c);
    g.beginPath();
    if (r && g.roundRect) g.roundRect(X, Y, W, H, Math.min(r * M.s, W / 2, H / 2)); else g.rect(X, Y, W, H);
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1; g.stroke(); }
  }
  function circle(g, M, x, y, r, fill, stroke) {
    g.beginPath(); g.arc(M.x(x), M.y(y), r * M.s, 0, Math.PI * 2);
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1; g.stroke(); }
  }

  // Stopper, bumper, magnet box, (brake strip on the rail) in local coordinates:
  // x = 0 at the bumper face, negative into the stopper. dist = door distance (mm).
  function drawStopper(g, M, G, dist, withLatch) {
    const C = { steel: css('--steel'), steel2: css('--steel-2'), rubber: css('--rubber'), pla: css('--pla'), mag: css('--magnet'), copper: css('--copper') };
    // clamp around the rail and the lower lobe
    rect(g, M, -G.bl - G.stopW, -G.bl, -G.railH - 3, 6, C.steel, C.steel2, 3);
    rect(g, M, -G.bl - G.stopW, -G.bl, G.lobeBottom, -G.railH, C.steel, C.steel2, 4);
    circle(g, M, -G.bl - G.stopW / 2, -12, 7, null, C.steel2);
    circle(g, M, -G.bl - G.stopW / 2, -58, 7, null, C.steel2);
    // bumper (squashes when dist < 0)
    const end = Math.min(0, dist);
    rect(g, M, -G.bl, end, G.bumperY - G.bumperD / 2, G.bumperY + G.bumperD / 2, C.rubber, C.steel2, 2);
    if (withLatch && model.latch) {
      const L = model.latch;
      const bx0 = G.xb - G.boxW / 2, bx1 = G.xb + G.boxW / 2, yb = G.boxBottom;
      g.globalAlpha = 0.92;
      rect(g, M, bx0, bx1, yb, yb + G.boxFloor, C.pla);                      // floor
      rect(g, M, bx0, bx0 + G.boxWall, yb, yb + G.boxH, C.pla);              // side walls
      rect(g, M, bx1 - G.boxWall, bx1, yb, yb + G.boxH, C.pla);
      g.globalAlpha = 1;
      const R = L.mag.R * 1000, T = L.cfg.L * 1000, skin = P.latch.skin * 1000;
      for (const o of L.offsets) {
        const x = G.xb + o * 1000;
        rect(g, M, x - R, x + R, yb + skin, yb + skin + T, C.mag, null, 0.5);
      }
    }
  }
  function drawRailStrip(g, M) {
    if (model.brake && P.brake.mode === 'hanger') rect(g, M, 0, P.brake.zoneLen * 1000, -GEO.railH + 10, -10, css('--copper'));
  }

  // Door parts near one end, local coordinates (used by the close-up).
  function drawDoorLocal(g, M, G, dist) {
    const C = { steel: css('--steel'), steel2: css('--steel-2'), wood: css('--wood'), wood2: css('--wood-2'), copper: css('--copper'), mag: css('--magnet') };
    rect(g, M, dist + G.doorLeft, dist + 400, G.doorTop - 400, G.doorTop, C.wood, C.wood2);
    const xe = G.xb - G.e0 + dist;
    rect(g, M, xe, xe + P.latch.plateLen * 1000, G.doorTop, G.plateTop, C.steel, C.steel2, 0.5);
    if (G.sheet) rect(g, M, xe, xe + P.brake.stripLen * 1000, G.plateTop, G.plateTop + G.sheet, C.copper);
    // hanger strap and wheel
    rect(g, M, dist, dist + G.strapW, G.doorTop - 300, G.wheelR, C.steel, C.steel2, 4);
    circle(g, M, dist + G.strapW / 2, G.wheelR, G.wheelR, C.steel, C.steel2);
    circle(g, M, dist + G.strapW / 2, G.wheelR, 9, C.steel2);
    if (model.brake && P.brake.mode === 'hanger') {
      const n = Math.min(P.brake.count, 6), d = P.brake.D * 1000;
      for (let k = 0; k < n; k++) rect(g, M, dist + 4 + (k * (G.strapW - 8)) / Math.max(n, 1), dist + 4 + ((k + 1) * (G.strapW - 8)) / Math.max(n, 1) - 1, -20 - d / 4, -20 + d / 4, C.mag);
    }
  }

  function drawTrack(pM, f) {
    const cv = $('#track'), dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth, h = 260;
    cv.width = w * dpr; cv.height = h * dpr;
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const G = geo(), p = pM * 1000;
    const x0 = -G.bl - G.stopW - 80, x1 = G.xOpen + G.bl + G.stopW + 80;
    const s = Math.min(w / (x1 - x0), h / 420);
    const top = 105;
    const W = mapper(-x0 * s, top * s + 10, s, false);
    g.fillStyle = css('--wall'); g.fillRect(0, 0, w, h);
    const C = { steel: css('--steel'), steel2: css('--steel-2'), wood: css('--wood'), wood2: css('--wood-2'), text: css('--text-2') };
    // rail
    rect(g, W, x0 + 30, x1 - 30, -G.railH, 0, C.steel);
    for (let x = x0 + 120; x < x1 - 60; x += 400) circle(g, W, x, -20, 8, null, C.steel2);
    drawRailStrip(g, W);
    const Wo = mapper(W.x(G.xOpen), top * s + 10, s, true);
    if (model.both) drawRailStrip(g, Wo);
    // door (body, plates, straps, wheels)
    rect(g, W, p + G.doorLeft, p + G.doorLeft + G.doorW, G.doorTop - 900, G.doorTop, C.wood, C.wood2);
    const xe1 = G.xb - G.e0 + p;
    rect(g, W, xe1, xe1 + P.latch.plateLen * 1000, G.doorTop, G.plateTop, C.steel);
    const xe2 = G.xOpen - (G.xb - G.e0 + (G.travel - p));
    rect(g, W, xe2 - P.latch.plateLen * 1000, xe2, G.doorTop, G.plateTop, C.steel);
    for (const sx of [p, p + G.hs]) {
      rect(g, W, sx, sx + G.strapW, G.doorTop - 280, G.wheelR, C.steel, null, 4);
      circle(g, W, sx + G.strapW / 2, G.wheelR, G.wheelR, C.steel, C.steel2);
    }
    // stoppers
    drawStopper(g, W, G, p, true);
    drawStopper(g, Wo, G, G.travel - p, model.both);
    // labels
    g.fillStyle = C.text; g.font = '12px system-ui, sans-serif'; g.textBaseline = 'top';
    g.textAlign = 'left'; g.fillText('Closed stop', 8, h - 18);
    g.textAlign = 'right'; g.fillText('Open stop', w - 8, h - 18);
    g.textAlign = 'center';
    g.fillText(`${f1(p)} mm from the closed stop · ${f1(Math.abs(f.v))} m/s`, w / 2, h - 18);
  }

  function drawDetail(pM, f) {
    const cv = $('#detail'), dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth, h = 330;
    cv.width = w * dpr; cv.height = h * dpr;
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const G = geo();
    const nearOpen = runInfo && runInfo.kind === 'open';
    const dist = (nearOpen ? model.travel - pM : pM) * 1000;
    $('#detail-title').textContent = nearOpen ? 'Open-side stopper, close up' : 'Closed-side stopper, close up';
    const xs = [-95, 95], ys = [38, -112];
    const s = Math.min(w / (xs[1] - xs[0]), h / (ys[0] - ys[1]));
    const M = mapper(w / 2 - ((xs[0] + xs[1]) / 2) * s * (nearOpen ? -1 : 1), (h - (ys[0] - ys[1]) * s) / 2 + ys[0] * s, s, nearOpen);
    g.fillStyle = css('--wall'); g.fillRect(0, 0, w, h);
    rect(g, M, -200, 200, -G.railH, 0, css('--steel'));
    if (!nearOpen || model.both) drawRailStrip(g, M);
    drawDoorLocal(g, M, G, dist);
    drawStopper(g, M, G, dist, !nearOpen || model.both);
    // annotations
    const text = css('--text'), muted = css('--text-2'), arrow = css('--arrow');
    g.font = '12px system-ui, sans-serif';
    if (model.latch && (!nearOpen || model.both)) {
      const yGap0 = G.plateTop + G.sheet, yGap1 = G.boxBottom + P.latch.skin * 1000;
      const xg = G.xb + G.boxW / 2 + 6;
      g.strokeStyle = muted; g.lineWidth = 1;
      g.beginPath(); g.moveTo(M.x(xg), M.y(yGap0)); g.lineTo(M.x(xg), M.y(yGap1)); g.stroke();
      g.textAlign = nearOpen ? 'right' : 'left'; g.textBaseline = 'middle';
      const lbl = `gap ${f1(model.latch.gap * 1000)} mm`, lw = g.measureText(lbl).width, lx = M.x(xg + 3);
      g.globalAlpha = 0.85; g.fillStyle = css('--surface');
      g.fillRect(nearOpen ? lx - lw - 4 : lx - 4, M.y(G.boxBottom - 6) - 9, lw + 8, 18); g.globalAlpha = 1;
      g.fillStyle = muted;
      g.fillText(`gap ${f1(model.latch.gap * 1000)} mm`, M.x(xg + 3), M.y(G.boxBottom - 6));
    }
    // force arrows on the strap
    const sign = nearOpen ? -1 : 1;   // local +x = away from this stop
    const mag = (f.latch + f.brake) * sign;
    const ax = dist + G.strapW / 2, ay = -104;
    const len = Math.max(-110, Math.min(110, mag * 8)) / s;
    if (Math.abs(mag) > 0.05) {
      g.strokeStyle = arrow; g.fillStyle = arrow; g.lineWidth = 2.5;
      const X0 = M.x(ax), X1 = M.x(ax + len), Y = M.y(ay);
      g.beginPath(); g.moveTo(X0, Y); g.lineTo(X1, Y); g.stroke();
      const dir = Math.sign(X1 - X0) || 1;
      g.beginPath(); g.moveTo(X1, Y); g.lineTo(X1 - dir * 8, Y - 5); g.lineTo(X1 - dir * 8, Y + 5); g.closePath(); g.fill();
    }
    g.fillStyle = text; g.textAlign = 'left'; g.textBaseline = 'top';
    const lines = [
      `Magnets ${f1(f.latch * sign)} N${model.brake ? ` · brake ${f1(f.brake * sign)} N` : ''}`,
      f.bumper ? `Bumper ${f1(Math.abs(f.bumper))} N, squashed ${f1(Math.max(0, -dist))} mm` : `${f1(dist)} mm from the bumper`,
    ];
    const tw = Math.max(...lines.map((l) => g.measureText(l).width));
    g.globalAlpha = 0.85; g.fillStyle = css('--surface'); g.fillRect(4, 4, tw + 14, lines.length * 16 + 8); g.globalAlpha = 1;
    g.fillStyle = text;
    lines.forEach((l, i) => g.fillText(l, 10, 10 + i * 16));
    g.fillStyle = muted; g.textBaseline = 'bottom';
    g.fillText('Negative = pulls towards the stop', 10, h - 8);
  }

  // ---------------------------------------------------------------- playback
  function frameAt(t) {
    const r = run.rec;
    if (!r.t.length) return { p: run.final.p, v: 0, latch: 0, brake: 0, bumper: 0 };
    let i = Math.min(r.t.length - 1, Math.max(0, Math.round(t / 0.004)));
    return { p: r.p[i], v: r.v[i], latch: r.latch[i], brake: r.brake[i], bumper: r.bumper[i], hand: r.hand[i] };
  }
  function drawFrame() {
    if (!run) return;
    const f = frameAt(playT);
    drawTrack(f.p, f);
    drawDetail(f.p, f);
    $('#clock').textContent = `${playT.toFixed(2)} s`;
    $('#scrub').value = Math.round(playT * 1000);
    for (const k of ['pos', 'vel', 'force']) { charts[k].cursorX = playT; charts[k].draw(); }
  }
  function tick(now) {
    if (playing && run) {
      const dt = Math.min(0.05, (now - lastFrame) / 1000);
      playT += dt * +$('#play-speed').value;
      if (playT >= run.final.t) { playT = run.final.t; playing = false; $('#btn-play').textContent = '▶'; }
      drawFrame();
    }
    lastFrame = now;
    requestAnimationFrame(tick);
  }

  // ---------------------------------------------------------------- questions
  const QUESTIONS = [
    ['Plate end under the box', 'latch.edgeAtContact', 'Door closed, hanger on the bumper: how far does the end of the steel plate on top of the door reach past the middle of where the box sits?'],
    ['Gap under the stopper', 'latch.airGap', 'Vertical gap between the underside of the stopper lobe and the plate on the door. The box floor must fit in it, so this decides the box and the magnet gap.'],
    ['Plate thickness', 'latch.plateT', 'Thickness of the steel plate on top of the door (check a magnet sticks to it).'],
    ['Stopper lobe size', null, 'Length along the rail, depth from the wall and height below the rail of the stopper part the box slips over. The v1 box (40 × 23 × 25 mm) does not fit yet.'],
    ['Travel', 'door.travel', 'How far the door slides from bumper to bumper.'],
    ['Rolling friction', 'door.crr', 'Pull the door slowly with a luggage scale and note the steady reading.'],
    ['Rail level', 'door.slope', 'Does the door drift on its own when let go half-open? Which way?'],
    ['Bumper', 'bumper.restitution', 'Drop the door gently against the bumper: does it bounce back far? Is the rubber hard or soft?'],
    ['Magnets you have', 'latch.D', 'Exact size and grade of the magnets (the box was made for Ø15 × 5 mm).'],
  ];
  function updateQuestions() {
    $('#questions').innerHTML = QUESTIONS.map(([title, id, d]) => {
      const s = id && SCHEMA.find((x) => x.id === id);
      const val = s ? ` <span class="d">now ${V[id]}${s.unit ? ' ' + s.unit : ''}${V[id] == DEFAULTS[id] ? ' (default)' : ''}</span>` : '';
      return `<div class="q"><b>${title}${val}</b><span class="d">${d}</span></div>`;
    }).join('');
  }

  // ---------------------------------------------------------------- wiring
  function init() {
    buildPanel();
    initCharts();
    document.querySelectorAll('[data-test]').forEach((b) => b.addEventListener('click', () => runTest(b.dataset.test)));
    $('#btn-play').addEventListener('click', () => {
      if (!run) return;
      if (!playing && playT >= run.final.t) playT = 0;
      playing = !playing;
      $('#btn-play').textContent = playing ? '⏸' : '▶';
    });
    $('#scrub').addEventListener('input', (e) => { playT = +e.target.value / 1000; playing = false; $('#btn-play').textContent = '▶'; drawFrame(); });
    $('#btn-reset').addEventListener('click', () => { V = { ...DEFAULTS }; save(); buildPanel(); rebuild(); });
    $('#btn-theme').addEventListener('click', () => {
      const root = document.documentElement;
      const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
      root.dataset.theme = dark ? 'light' : 'dark';
      redrawAll();
    });
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redrawAll);
    window.addEventListener('resize', () => { clearTimeout(window.__rz); window.__rz = setTimeout(redrawAll, 100); });
    // URL hash for sharing a setup or a moment: #test=pull&t=1.2&brake.mode=hanger
    const H = new URLSearchParams(location.hash.slice(1));
    for (const [k, v] of H) if (k in DEFAULTS) V[k] = v === 'true' ? true : v === 'false' ? false : v;
    if (H.size) buildPanel();
    if (H.get('test')) lastTest = H.get('test');
    rebuild();
    if (H.get('t')) { playT = Math.min(+H.get('t'), run.final.t); playing = false; $('#btn-play').textContent = '▶'; drawFrame(); }
    requestAnimationFrame(tick);
  }
  function redrawAll() {
    Object.values(charts).forEach((c) => c.draw());
    drawFrame();
  }
  init();
})();
