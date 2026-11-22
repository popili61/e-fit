/* E-Fit — arayüz ve akış. Tüm veriler bu cihazda (localStorage) tutulur. */
(function () {
  'use strict';
  const { EX, SLOTS, WORKOUTS, REST, WEEKS, MEASURES } = SH_DATA;
  const E = SH_ENGINE;
  const KEY = 'sh_state_v1';
  const $app = document.getElementById('app');
  const $nav = document.getElementById('nav');
  const DAYS = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt']; // JS getDay sırası
  const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

  // ---------- Durum ----------
  function freshState() {
    const choice = {};
    for (const id in SLOTS) choice[id] = SLOTS[id].def;
    return {
      v: 2, setupDone: false,
      settings: { noSmallPlates: false, sound: true, days: [1, 3, 5] },
      profile: { name: '', sex: 'erkek', age: '', height: '' },
      test: { pushups: '', situps: '' },
      measures: [], // [{date, height, chest, arm, waist, hips, thigh, calf}]
      calibrated: {},
      choice, weights: {}, pending: {}, inputs: {},
      cycle: { n: 1, week: 1, day: 0, started: today() },
      bw: [], history: [], active: null
    };
  }
  let S;
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      S = raw ? Object.assign(freshState(), JSON.parse(raw)) : freshState();
    } catch (e) { S = freshState(); }
    S.settings = Object.assign({ noSmallPlates: false, sound: true, days: [1, 3, 5] }, S.settings || {});
    // Eski sürüm (set set akış) yarım seansı yeni akışa uymaz
    if (S.active && !S.active.v2) S.active = null;
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('Kaydedilemedi: depolama dolu olabilir'); }
  }
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {}

  // ---------- Yardımcılar ----------
  function pad(n) { return String(n).padStart(2, '0'); }
  function isoOf(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  function today() { return isoOf(new Date()); }
  function fmtDate(iso) { try { const [y, m, d] = iso.split('-').map(Number); return `${d} ${MONTHS[m - 1].slice(0, 3)} ${y}`; } catch (e) { return iso; } }
  function fmtDay(iso) { const [y, m, d] = iso.split('-').map(Number); const dt = new Date(y, m - 1, d); return `${d} ${MONTHS[m - 1]} ${DAYS[dt.getDay()]}`; }
  const fmtTime = (ts) => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const kgTxt = (k) => (k === null || k === undefined || k === '' ? '' : (Math.round(k * 100) / 100).toString().replace('.', ','));
  const exOf = (slotId) => EX[S.choice[slotId]] || EX[SLOTS[slotId].def];
  const nameOf = (slotId) => S.choice[slotId] || SLOTS[slotId].def;
  const imgs = (ex) => [`img/ex/${ex.img}_0.jpg`, `img/ex/${ex.img}_1.jpg`];
  const groupPill = (g) => `<span class="pill ${g.toLowerCase()}">${g === 'BW' ? 'Vücut ağırlığı' : g}</span>`;
  const isSecEx = (name) => (EX[name] || {}).unit === 's';
  let toastT;
  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2200);
  }
  function vibrate(p) { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} }
  let actx;
  function beep() {
    if (!S.settings.sound) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.25, 0.5].forEach((t, i) => {
        const o = actx.createOscillator(), g = actx.createGain();
        o.frequency.value = i === 2 ? 1046 : 784; o.connect(g); g.connect(actx.destination);
        g.gain.setValueAtTime(0.25, actx.currentTime + t); g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + t + 0.2);
        o.start(actx.currentTime + t); o.stop(actx.currentTime + t + 0.22);
      });
    } catch (e) {}
  }
  let wake;
  async function keepAwake(on) {
    try {
      if (on && 'wakeLock' in navigator && !wake) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); }
      if (!on && wake) { await wake.release(); wake = null; }
    } catch (e) {}
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.active) keepAwake(true); });

  // Bu harekette son gerçekleşen (dinlenme haftası hariç)
  function lastEntry(slotId) {
    for (let i = S.history.length - 1; i >= 0; i--) {
      const h = S.history[i];
      if (h.type === 'deload') continue;
      const e = h.entries.find((x) => x.slot === slotId && !x.skipped && x.sets && x.sets.length);
      if (e) return e;
    }
    return null;
  }
  const curBw = () => (S.bw.length ? S.bw[S.bw.length - 1].kg : '');
  const lastMeasure = () => (S.measures.length ? S.measures[S.measures.length - 1] : {});
  function addBw(v) {
    const d = today();
    const i = S.bw.findIndex((b) => b.date === d);
    if (i >= 0) S.bw[i].kg = v; else S.bw.push({ date: d, kg: v });
  }

  // ---------- Yönlendirme ----------
  let view = 'home';
  let ui = {};
  function go(v, keep) { view = v; if (!keep) ui = {}; render(); window.scrollTo(0, 0); }

  // ---------- Hedef metinleri ----------
  function targetText(slotId, kg, deload) {
    const s = SLOTS[slotId];
    const w = kg !== null && kg !== undefined ? `${kgTxt(kg)} kg × ` : '';
    const sec = isSecEx(nameOf(slotId));
    if (deload) return `${w}5 tekrar × 3 set`;
    if (s.group === 'G1') return `${w}${s.reps}+ tekrar × ${s.sets} set`;
    if (s.group === 'G2') return `${w}${s.reps} tekrar × ${s.sets} set`;
    if (s.lo) return `${w}${s.lo}–${s.hi} tekrar × ${s.sets} set`;
    return `${s.sets} set × max ${sec ? 'saniye' : 'tekrar'}`;
  }

  // ---------- Seans oluşturma ----------
  function buildSession() {
    const p = E.plan(S);
    const ses = { v2: true, id: 's' + Date.now(), date: today(), startedAt: Date.now(), cycle: S.cycle.n, week: p.week, day: p.day, key: p.key, type: p.type, entries: [], idx: 0, rest: null };
    const items = p.type === 'normal' ? p.slots.map((s) => [s, false]) : p.items.map(([s]) => [s, true]);
    for (const [slot, deload] of items) {
      const w = E.isWeighted(slot);
      const kg = !w ? null : deload ? E.mround((S.weights[slot] || 0) * 0.7) : S.weights[slot] || 0;
      const s = SLOTS[slot];
      const nSets = deload ? 3 : s.sets;
      const prev = lastEntry(slot);
      const sets = [];
      for (let i = 0; i < nSets; i++) {
        let reps;
        if (deload) reps = 5;
        else if (s.group === 'G1' || s.group === 'G2') reps = s.reps;
        else if (s.lo) reps = s.hi;
        else reps = prev && prev.sets[i] ? prev.sets[i].reps : '';
        sets.push({ kg, reps });
      }
      ses.entries.push({
        slot, name: nameOf(slot), group: s.group, plannedKg: kg, deload,
        calib: !deload && w && !S.calibrated[slot],
        warm: deload ? [] : E.warmups(slot, kg),
        sets, saved: false, skipped: false
      });
    }
    return ses;
  }
  // idx: 0 = genel ısınma, 1..N = hareketler, N+1 = özet

  // ---------- Ekranlar ----------
  function render() {
    if (!S.setupDone && !['setup', 'welcome'].includes(view)) view = 'welcome';
    if (S.active && view === 'home') view = 'session';
    if (view === 'measure') view = 'measures';
    const map = { measures: vMeasures, welcome: vWelcome, setup: vSetup, home: vHome, session: vSession, history: vHistory, progress: vProgress, settings: vSettings, cycleEnd: vCycleEnd };
    $app.innerHTML = (map[view] || vHome)();
    renderNav();
    tick();
  }
  function renderNav() {
    const hide = view === 'session' || view === 'welcome' || (view === 'setup' && !S.setupDone);
    $nav.classList.toggle('hidden', hide);
    if (hide) { $nav.innerHTML = ''; return; }
    const items = [['home', '📅', 'Program'], ['history', '📋', 'Geçmiş'], ['measures', '📏', 'Ölçüler'], ['progress', '📈', 'İlerleme'], ['settings', '⚙️', 'Ayarlar']];
    $nav.innerHTML = items.map(([v, i, t]) => `<button data-act="nav" data-v="${v}" class="${view === v ? 'on' : ''}"><span class="i">${i}</span>${t}</button>`).join('');
  }
  const brand = (sub) => `<div class="brand"><div class="logo">E</div><div><h1>E-FIT</h1><div class="sub">${esc(sub || 'Kişisel antrenman koçun')}</div></div></div>`;

  // ---------- Profil sihirbazı ----------
  function stepHead(n, title) {
    return `<div class="row spread" style="margin-bottom:6px"><span class="small muted">Adım ${n} / 5</span><span class="small muted">${title}</span></div>
      <div class="progress" style="margin-bottom:14px"><div style="width:${n * 20}%"></div></div>`;
  }
  function bodySvg() {
    const L = (x1, y1, x2, y2, n) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="ml"/><circle cx="${x1 - 9}" cy="${y1}" r="7" class="mc"/><text x="${x1 - 9}" y="${y1 + 3.5}" class="mt">${n}</text>`;
    return `<svg class="body" viewBox="40 0 180 300" role="img" aria-label="Ölçü noktaları">
      <g class="fig">
        <circle cx="130" cy="28" r="16"/>
        <path d="M124 44 h12 v8 h-12z"/>
        <path d="M106 54 Q130 48 154 54 L160 118 L152 168 L108 168 L100 118 Z"/>
        <path d="M106 58 L92 108 L86 152" class="limb"/>
        <path d="M154 58 L168 108 L174 152" class="limb"/>
        <path d="M118 166 L116 228 L117 286" class="leg"/>
        <path d="M142 166 L144 228 L143 286" class="leg"/>
      </g>
      ${L(104, 80, 156, 80, 1)}${L(82, 110, 99, 110, 2)}${L(103, 126, 157, 126, 3)}${L(105, 156, 155, 156, 4)}${L(106, 192, 128, 192, 5)}${L(107, 244, 126, 244, 6)}
    </svg>`;
  }
  function measureFields(m, placeholders) {
    const hVal = ui.m?.height ?? (placeholders ? '' : m.height ?? S.profile.height ?? '');
    return `<div><label class="f">Boy (cm)</label><input type="number" inputmode="numeric" data-mf="height" value="${esc(hVal)}" placeholder="${esc(m.height ?? S.profile.height ?? '')}"></div>
      <div class="measure-wrap">${bodySvg()}
        <div class="mlist">${MEASURES.map(([k, t, h], i) => `<div><label class="f"><b class="mn">${i + 1}</b> ${t} <span class="muted">(cm)</span></label><input type="number" inputmode="decimal" step="0.5" data-mf="${k}" value="${esc(ui.m?.[k] ?? (placeholders ? '' : m[k] ?? ''))}" placeholder="${esc(placeholders ? m[k] ?? '' : '')}"><div class="hint">${h}</div></div>`).join('')}</div>
      </div>`;
  }
  const daysPicker = () => `<div class="dayspick">${[1, 2, 3, 4, 5, 6, 0].map((d) => `<button data-act="dayToggle" data-d="${d}" class="${S.settings.days.includes(d) ? 'on' : ''}">${DAYS[d]}</button>`).join('')}</div>`;

  function vWelcome() {
    const st = ui.step || 1;
    const P = S.profile, m = lastMeasure();
    if (st === 1) {
      return `${brand()}
      <div class="card hero stack">
        ${stepHead(1, 'Tanışalım')}
        <h2>Hoş geldin! 💪</h2>
        <p>12 haftalık antrenman programını adım adım uygulatan kişisel koçunum. Her harekette hedefi gösteririm, sen gerçekleşeni girersin, sonraki antrenmanı ben planlarım.</p>
        <div><label class="f" for="pName">Sana nasıl hitap edeyim?</label><input type="text" id="pName" data-pf="name" value="${esc(P.name)}" placeholder="Adın" autocomplete="given-name"></div>
        <button class="btn primary big" data-act="wiz" data-to="2">Devam</button>
        <p class="small muted center">Veriler yalnızca bu telefonda saklanır.</p>
      </div>`;
    }
    if (st === 2) {
      return `${brand(P.name ? 'Merhaba ' + P.name : '')}
      <div class="card stack">
        ${stepHead(2, 'Temel bilgiler')}
        <h2>Biraz seni tanıyayım</h2>
        <div class="seg">${['erkek', 'kadın'].map((x) => `<button data-act="sex" data-v="${x}" class="${P.sex === x ? 'on' : ''}">${x === 'erkek' ? 'Erkek' : 'Kadın'}</button>`).join('')}</div>
        <div class="grid3">
          <div><label class="f">Yaş</label><input type="number" inputmode="numeric" data-pf="age" value="${esc(P.age)}"></div>
          <div><label class="f">Boy (cm)</label><input type="number" inputmode="numeric" data-pf="height" value="${esc(P.height)}"></div>
          <div><label class="f">Kilo (kg)</label><input type="number" inputmode="decimal" step="0.1" data-pf="bw" value="${esc(ui.bw ?? curBw())}"></div>
        </div>
        <div><label class="f">Hangi günler antrenman yapacaksın? (haftada 3 gün)</label>${daysPicker()}</div>
        <div class="row"><button class="btn ghost" data-act="wiz" data-to="1">Geri</button><button class="btn primary" data-act="wiz" data-to="3">Devam</button></div>
      </div>`;
    }
    if (st === 3) {
      return `${brand('Vücut ölçüleri')}
      <div class="card stack">
        ${stepHead(3, 'Ölçüler')}
        <h2>Başlangıç ölçülerin</h2>
        <p class="small muted">Mezura ile ölç, santimetre olarak gir. İlerlemeni ve yağ oranını bu ölçülerle takip edeceğiz.</p>
        ${measureFields(m, false)}
        <div class="row"><button class="btn ghost" data-act="wiz" data-to="2">Geri</button><button class="btn primary" data-act="wiz" data-to="4">Devam</button></div>
      </div>`;
    }
    if (st === 4) {
      return `${brand('Kısa test')}
      <div class="card stack">
        ${stepHead(4, 'Güç testi')}
        <h2>İki soru</h2>
        <p class="small muted">Tek seferde, durmadan ve düzgün formda yapabildiğin en fazla sayıyı yaz. Emin değilsen şimdi dene!</p>
        <div><label class="f">Kaç şınav çekebilirsin?</label><input type="number" inputmode="numeric" min="0" data-tf="pushups" value="${esc(S.test.pushups)}"></div>
        <div><label class="f">Kaç mekik çekebilirsin?</label><input type="number" inputmode="numeric" min="0" data-tf="situps" value="${esc(S.test.situps)}"></div>
        <div class="row"><button class="btn ghost" data-act="wiz" data-to="3">Geri</button><button class="btn primary" data-act="wiz" data-to="5">Programımı oluştur</button></div>
      </div>`;
    }
    const est = estimateAll();
    const fat = E.rfm(P.sex, m.height, m.waist);
    return `${brand('Programın hazır')}
    <div class="card hero stack">
      ${stepHead(5, 'Program')}
      <h2>Programın hazır${P.name ? ', ' + esc(P.name) : ''}! 🦸</h2>
      ${fat !== null ? `<p class="small">Tahmini yağ oranın: <b style="color:var(--gold)">%${kgTxt(fat)}</b> <span class="muted">(boy/bel formülü)</span></p>` : ''}
      <p class="small">12 hafta, haftada 3 gün (${S.settings.days.slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => DAYS[d]).join(' · ')}). Başlangıç ağırlıkları cevaplarından <b>tahmin edildi</b> ve bilerek hafif tutuldu.</p>
      <div class="calibbox">📏 Her hareketin ilk yapılışı bir <b>ölçüm antrenmanı</b>. Hedefi dene, gerçekleşeni gir — ağırlıkları senin gerçek gücüne göre ben ayarlayacağım.</div>
    </div>
    ${['A', 'B', 'C'].map((k) => `<div class="card"><h3>Workout ${k}</h3><ul class="exlist">${WORKOUTS[k].map((id) => `<li><img class="thumb" src="${imgs(exOf(id))[0]}" alt="" loading="lazy"><div><div class="name">${esc(nameOf(id))}</div><div class="meta">${targetText(id, null)}</div></div><div class="kg">${E.isWeighted(id) ? kgTxt(est[id]) + ' kg' : '<span class="muted small">vücut a.</span>'}</div></li>`).join('')}</ul></div>`).join('')}
    <div class="card btns">
      <button class="btn primary big" data-act="wizFinish">Programı başlat</button>
      <button class="btn ghost" data-act="wiz" data-to="4">Geri</button>
      <button class="btn ghost small" data-act="wizManual">Gelişmiş: ağırlıkları kendim gireceğim</button>
    </div>`;
  }
  function estimateAll() {
    const anc = E.anchors(+curBw() || 75, S.test.pushups, S.test.situps);
    const out = {};
    for (const id in SLOTS) if (E.isWeighted(id)) out[id] = E.estimateStart(id, nameOf(id), anc);
    return out;
  }
  function measureValid(m) {
    const miss = MEASURES.filter(([k]) => !(m[k] > 5 && m[k] < 300)).map((x) => x[1]);
    if (!(m.height >= 120 && m.height <= 230)) miss.unshift('Boy');
    return miss;
  }
  function wizValidate(to) {
    const st = ui.step || 1;
    if (to < st) return true;
    if (st === 1 && !S.profile.name.trim()) return toast('Adını yazar mısın?'), false;
    if (st === 2) {
      const P = S.profile; const bw = +(ui.bw ?? curBw());
      if (!(P.age >= 12 && P.age <= 100)) return toast('Yaşını kontrol et'), false;
      if (!(P.height >= 120 && P.height <= 230)) return toast('Boyunu cm olarak gir'), false;
      if (!(bw >= 30 && bw <= 300)) return toast('Kilonu kontrol et'), false;
      if (S.settings.days.length !== 3) return toast('Haftada 3 gün seç'), false;
      addBw(bw);
    }
    if (st === 3) {
      const m = Object.assign({ height: S.profile.height }, lastMeasure(), ui.m || {});
      const miss = measureValid(m);
      if (miss.length) return toast(`Eksik ölçü: ${miss.join(', ')}`), false;
      saveMeasure(m);
    }
    if (st === 4) {
      const t = S.test;
      if (t.pushups === '' || t.situps === '' || t.pushups < 0 || t.situps < 0) return toast('İki sayıyı da gir (yapamıyorsan 0)'), false;
    }
    return true;
  }
  function saveMeasure(m, date, bw) {
    const d = date || today();
    const rec = { date: d, height: +m.height, bw: +(bw ?? m.bw ?? curBw()) || null };
    MEASURES.forEach(([k]) => { rec[k] = +m[k]; });
    if (rec.height) S.profile.height = rec.height;
    const i = S.measures.findIndex((x) => x.date === d);
    if (i >= 0) S.measures[i] = rec; else S.measures.push(rec);
    S.measures.sort((a, b) => a.date.localeCompare(b.date));
    if (rec.bw) addBwAt(d, rec.bw);
  }
  function addBwAt(d, v) {
    const i = S.bw.findIndex((b) => b.date === d);
    if (i >= 0) S.bw[i].kg = v; else S.bw.push({ date: d, kg: v });
    S.bw.sort((a, b) => a.date.localeCompare(b.date));
  }
  // Ölçüm kaydından türetilen değerler
  function comp(m) {
    const h = m.height || S.profile.height;
    const bw = m.bw || bwAt(m.date);
    const fat = E.rfm(S.profile.sex, h, m.waist);
    const fatKg = bw && fat !== null ? Math.round(bw * fat) / 100 : null;
    const lean = bw && fat !== null ? Math.round((bw - fatKg) * 10) / 10 : null;
    return { bw, fat, fatKg: fatKg !== null ? Math.round(fatKg * 10) / 10 : null, lean };
  }
  function bwAt(date) {
    let v = null;
    for (const b of S.bw) { if (b.date <= date) v = b.kg; }
    return v || (S.bw[0] && S.bw[0].kg) || null;
  }
  const MKEYS = [['bw', 'Kilo', 'kg'], ['fat', 'Yağ', '%'], ['lean', 'Yağsız kütle', 'kg'], ...MEASURES.map(([k, t]) => [k, t, 'cm'])];
  function mVal(m, k) { const c = comp(m); return k in c ? c[k] : m[k]; }

  function vMeasures() {
    const list = S.measures;
    const editing = ui.editDate ? list.find((x) => x.date === ui.editDate) : null;
    const last = list[list.length - 1] || {};
    const base = editing || last;
    const date = ui.date || (editing ? editing.date : today());
    let html = brand('Vücut ölçüleri');
    html += `<div class="card stack">
      <h3>${editing ? 'Ölçümü düzenle' : 'Yeni ölçüm'}</h3>
      <div class="grid2">
        <div><label class="f">Ölçüm tarihi</label><input type="date" data-uf="date" max="${today()}" value="${esc(date)}"></div>
        <div><label class="f">Kilo (kg)</label><input type="number" inputmode="decimal" step="0.1" data-pf="bw" value="${esc(ui.bw ?? (editing ? editing.bw ?? '' : ''))}" placeholder="${esc(last.bw ?? curBw())}"></div>
      </div>
      ${editing ? measureFields(editing, false) : measureFields(base, true)}
      ${editing ? '' : '<p class="small muted">Boş bıraktığın alan son ölçümden alınır. Her zaman aynı noktalardan, sabah aç karnına ölç.</p>'}
      <button class="btn primary big" data-act="measureSave">${editing ? 'Değişiklikleri kaydet' : 'Ölçümü kaydet'}</button>
      ${editing ? '<button class="btn ghost" data-act="measureCancel">Vazgeç</button>' : ''}
    </div>`;
    if (list.length) {
      const k = ui.mk || 'waist';
      const [, t, u] = MKEYS.find((x) => x[0] === k);
      const pts = list.map((m) => ({ x: Date.parse(m.date), y: mVal(m, k) })).filter((p) => p.y !== null && p.y !== undefined && !isNaN(p.y));
      html += `<div class="card"><h3>Zaman içindeki değişim</h3>
        <div class="chips">${MKEYS.map(([kk, tt]) => `<button data-act="mk" data-k="${kk}" class="${kk === k ? 'on' : ''}">${tt}</button>`).join('')}</div>
        ${pts.length > 1 ? lineChart([{ col: '#ffc93c', pts }]) : `<p class="small muted" style="margin-top:10px">Grafik için en az 2 ölçüm gerekir. Ayda bir ölçmen yeterli.</p>`}
        ${pts.length ? `<p class="small" style="margin:6px 0 0">${t}: <b>${kgTxt(pts[pts.length - 1].y)} ${u}</b>${pts.length > 1 ? ` · ilk ölçüme göre <b class="${deltaCls(k, pts[pts.length - 1].y - pts[0].y)}">${sgn(pts[pts.length - 1].y - pts[0].y)} ${u}</b>` : ''}</p>` : ''}
      </div>`;
      html += `<div class="card"><h3>Ölçüm geçmişi</h3>${[...list].reverse().map((m, ri) => {
        const prev = list[list.length - 2 - ri];
        const c = comp(m);
        const cell = (k, label, u) => { const v = mVal(m, k); const d = prev ? v - mVal(prev, k) : null; return `<div class="mc2"><span class="muted">${label}</span><b>${kgTxt(v)}${u}</b>${d !== null && !isNaN(d) && d !== 0 ? `<span class="${deltaCls(k, d)}">${sgn(d)}</span>` : ''}</div>`; };
        return `<div class="mrec"><div class="row spread"><b>${fmtDay(m.date)}</b><span><button class="btn sm ghost" data-act="measureEdit" data-d="${m.date}">Düzenle</button> <button class="btn sm danger" data-act="measureDel" data-d="${m.date}">Sil</button></span></div>
          <div class="mgrid">${cell('bw', 'Kilo', '')}${c.fat !== null ? cell('fat', 'Yağ %', '') : ''}${MEASURES.map(([kk, tt]) => cell(kk, tt, '')).join('')}</div></div>`;
      }).join('')}</div>`;
    }
    return html;
  }
  // Bel, kalça, yağ ve yağ kütlesinde düşüş iyi; kol, göğüs, uyluk, baldır, yağsız kütlede artış iyi
  const GOOD_DOWN = ['waist', 'hips', 'fat', 'fatKg'];
  function deltaCls(k, d) { if (!d || k === 'bw') return ''; return (GOOD_DOWN.includes(k) ? d < 0 : d > 0) ? 'good' : 'bad'; }
  const sgn = (d) => (d > 0 ? '+' : '') + kgTxt(Math.round(d * 10) / 10);

  // ---------- Gelişmiş: hareketler ve ağırlıklar ----------
  function vSetup() {
    const groups = [['G1', 'Ana hareketler'], ['G2', 'Yardımcı bileşik hareketler'], ['G3', 'İzole hareketler'], ['G4', 'Kol hareketleri'], ['BW', 'Vücut ağırlığı ve karın']];
    const first = !S.setupDone;
    let html = `${brand('Hareketler ve ağırlıklar')}
    <div class="card stack">
      <p class="small">Bir hareketin güncel ağırlığını biliyorsan <b>yaptığın ağırlık ve tekrarı</b> gir, başlangıç ağırlığı hesaplanır; ya da "Kullanılacak" alanına doğrudan yaz. Değer girdiğin hareket ölçüm antrenmanına girmez.</p>
      <p class="small muted">Dumbbell hareketlerinde <b>iki dumbbell'ın toplamını</b> yaz.</p>
    </div>`;
    for (const [g, title] of groups) {
      const ids = Object.keys(SLOTS).filter((id) => SLOTS[id].group === g);
      html += `<div class="card"><div class="row spread"><h3>${title}</h3>${groupPill(g)}</div>`;
      for (const id of ids) {
        const s = SLOTS[id];
        const inp = S.inputs[id] || {};
        const opts = s.alts.map((a) => `<option ${nameOf(id) === a ? 'selected' : ''}>${esc(a)}</option>`).join('');
        const where = Object.entries(WORKOUTS).filter(([, l]) => l.includes(id)).map(([k]) => 'Workout ' + k).join(', ');
        html += `<div class="setup-slot">
          <div class="row spread small muted"><span>${where} · ${E.schemeLabel(id)}${s.rpe ? ' · RPE ' + s.rpe : ''}</span>${E.isWeighted(id) && !S.calibrated[id] ? '<span class="small" style="color:#7fd3ff">📏 ölçülecek</span>' : ''}</div>
          <select data-ch="choice" data-slot="${id}" aria-label="Hareket">${opts}</select>`;
        if (E.isWeighted(id)) {
          const calc = inp.w && inp.r ? E.startWeight(id, +inp.w, +inp.r) : null;
          html += `<div class="grid3" style="margin-top:8px">
            <div><label class="f">Ağırlık (kg)</label><input type="number" inputmode="decimal" step="0.5" min="0" data-ch="w" data-slot="${id}" value="${esc(inp.w ?? '')}"></div>
            <div><label class="f">Tekrar</label><input type="number" inputmode="numeric" min="1" max="30" data-ch="r" data-slot="${id}" value="${esc(inp.r ?? '')}"></div>
            <div><label class="f">Kullanılacak</label><input type="number" inputmode="decimal" step="0.5" min="0" data-ch="kg" data-slot="${id}" value="${esc(S.weights[id] ?? '')}"></div>
          </div>
          <div class="calc" id="calc-${id}">${calc !== null ? `Tahmini 1RM: ${kgTxt(Math.round(E.e1rm(+inp.w, +inp.r)))} kg → başlangıç <b>${kgTxt(calc)} kg</b>` : ''}</div>`;
        }
        html += `</div>`;
      }
      html += `</div>`;
    }
    html += `<div class="card stack">
      <button class="btn primary big" data-act="setupSave">${first ? 'Kaydet ve programa başla' : 'Kaydet'}</button>
      <button class="btn ghost" data-act="nav" data-v="${first ? 'welcome' : 'settings'}">Vazgeç</button>
    </div>`;
    return html;
  }

  // ---------- Ana ekran: takvim + program ----------
  // Planlanan seansları antrenman günlerine yerleştir (bugünden itibaren; bugün antrenman yapıldıysa yarından)
  function schedule() {
    const rem = E.remaining(S);
    const out = {};
    const doneToday = S.history.some((h) => h.date === today());
    const d = new Date(); d.setHours(12, 0, 0, 0);
    if (doneToday) d.setDate(d.getDate() + 1);
    let i = 0, guard = 0;
    while (i < rem.length && guard++ < 400) {
      if (S.settings.days.includes(d.getDay())) { out[isoOf(d)] = rem[i]; i++; }
      d.setDate(d.getDate() + 1);
    }
    return out;
  }
  function vHome() {
    const p = E.plan(S);
    if (p.type === 'cycleEnd') { view = 'cycleEnd'; return vCycleEnd(); }
    const c = S.cycle;
    const doneW = Math.min(WEEKS, c.week - 1) * 3 + (c.week <= WEEKS ? c.day : 0);
    const pct = Math.round((doneW / (WEEKS * 3)) * 100);
    const plan = schedule();
    const done = {};
    S.history.forEach((h) => { (done[h.date] = done[h.date] || []).push(h); });
    const now = new Date();
    const ym = ui.ym || [now.getFullYear(), now.getMonth()];
    const sel = ui.sel || today();
    let html = brand(`${S.profile.name ? 'Merhaba ' + S.profile.name + ' · ' : ''}Döngü ${c.n}`);
    html += `<div class="card">
      <div class="row spread"><b>${p.type === 'deload' ? 'Dinlenme haftası' : `Hafta ${c.week} / ${WEEKS}`}</b><span class="muted small">%${pct} tamamlandı</span></div>
      <div class="progress" style="margin-top:8px"><div style="width:${pct}%"></div></div>
    </div>`;
    html += calendar(ym, plan, done, sel);
    html += dayDetail(sel, plan, done);
    const nextLabel = p.type === 'normal' ? `Workout ${p.key}` : `Dinlenme ${p.day + 1}`;
    html += `<div class="sticky-cta"><button class="btn primary big" data-act="start">▶ ANTRENMANA BAŞLA<span class="btnsub">${nextLabel} · Hafta ${Math.min(c.week, WEEKS)}</span></button></div>`;
    return html;
  }
  function calendar([y, m], plan, done, sel) {
    const first = new Date(y, m, 1);
    const offset = (first.getDay() + 6) % 7; // Pazartesi başlangıç
    const nDays = new Date(y, m + 1, 0).getDate();
    let cells = '';
    for (let i = 0; i < offset; i++) cells += '<div class="cd empty"></div>';
    for (let d = 1; d <= nDays; d++) {
      const iso = `${y}-${pad(m + 1)}-${pad(d)}`;
      const dn = done[iso], pl = plan[iso];
      let badge = '', cls = '';
      if (dn) { cls = 'done'; badge = dn.map((h) => (h.type === 'deload' ? 'D' : h.key)).join('') + '✓'; }
      else if (pl) { cls = pl.type === 'deload' ? 'plan deload' : 'plan'; badge = pl.type === 'deload' ? 'D' : pl.key; }
      if (iso === today()) cls += ' today';
      if (iso === sel) cls += ' sel';
      cells += `<button class="cd ${cls}" data-act="selDay" data-d="${iso}"><span class="n">${d}</span>${badge ? `<span class="b">${badge}</span>` : ''}</button>`;
    }
    return `<div class="card cal">
      <div class="row spread" style="margin-bottom:8px"><button class="iconbtn sm" data-act="calNav" data-d="-1" aria-label="Önceki ay">‹</button><b>${MONTHS[m]} ${y}</b><button class="iconbtn sm" data-act="calNav" data-d="1" aria-label="Sonraki ay">›</button></div>
      <div class="cgrid">${['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map((x) => `<div class="ch">${x}</div>`).join('')}${cells}</div>
      <div class="legend" style="margin-top:10px"><span><i style="background:var(--ok)"></i>Gerçekleşen</span><span><i style="background:transparent;border:1.5px solid var(--accent)"></i>Hedef (planlanan)</span><span><i style="background:#7fd3ff"></i>Dinlenme</span></div>
    </div>`;
  }
  function dayDetail(iso, plan, done) {
    const dn = done[iso] || [], pl = plan[iso];
    let html = `<div class="card"><h3>${fmtDay(iso)}${iso === today() ? ' · Bugün' : ''}</h3>`;
    if (!dn.length && !pl) html += `<p class="muted small">${iso < today() ? 'Bu gün antrenman yapılmadı.' : 'Dinlenme günü.'}</p>`;
    for (const h of dn) {
      html += `<div class="dd"><div class="row spread"><b>${h.type === 'deload' ? 'Dinlenme ' + (h.day + 1) : 'Workout ' + h.key} · H${h.week}</b><span class="pill done">✓ GERÇEKLEŞEN ${fmtTime(h.startedAt)}${h.finishedAt ? '–' + fmtTime(h.finishedAt) : ''}</span></div>
        <table class="dt">${h.entries.map((e) => `<tr><td>${esc(e.name)}</td><td>${e.skipped ? '<span class="muted">atlandı</span>' : e.sets.map((s) => (s.kg !== null && s.kg !== '' ? `${kgTxt(s.kg)}×` : '') + s.reps).join(' · ')}</td></tr>`).join('')}</table></div>`;
    }
    if (pl) {
      const items = pl.type === 'normal' ? WORKOUTS[pl.key].map((s) => [s, false]) : SH_DATA.DELOAD[pl.key].map(([s]) => [s, true]);
      html += `<div class="dd"><div class="row spread"><b>${pl.type === 'deload' ? 'Dinlenme ' + (pl.day + 1) : 'Workout ' + pl.key} · H${pl.week}</b><span class="pill plan">HEDEF</span></div>
        <table class="dt">${items.map(([s, dl]) => { const kg = E.isWeighted(s) ? (dl ? E.mround((S.weights[s] || 0) * 0.7) : S.weights[s] || 0) : null; return `<tr><td>${esc(nameOf(s))}${!dl && E.isWeighted(s) && !S.calibrated[s] ? ' <span title="ölçüm">📏</span>' : ''}</td><td>${targetText(s, kg, dl)}</td></tr>`; }).join('')}</table>
        <p class="small muted" style="margin:6px 0 0">Hedef ağırlıklar her antrenmandan sonra gerçekleşene göre güncellenir.</p></div>`;
    }
    return html + '</div>';
  }

  // ---------- Antrenman (hareket başına tek sayfa) ----------
  function vSession() {
    const ses = S.active;
    if (!ses) { view = 'home'; return vHome(); }
    const N = ses.entries.length;
    const pct = Math.round((ses.idx / (N + 1)) * 100);
    let html = `<div class="coach-top">
      <button class="iconbtn" data-act="back" aria-label="Geri" ${ses.idx === 0 ? 'disabled' : ''}>‹</button>
      <div class="steps"><div class="row spread small"><b>${ses.type === 'deload' ? 'Dinlenme ' + (ses.day + 1) : 'Workout ' + ses.key} · H${ses.week}</b><span class="muted">${ses.idx >= 1 && ses.idx <= N ? `Hareket ${ses.idx}/${N}` : ''}</span></div><div class="progress" style="margin-top:6px"><div style="width:${pct}%"></div></div></div>
      <button class="iconbtn" data-act="menu" aria-label="Menü">⋯</button>
    </div>`;
    if (ui.menu) {
      html += `<div class="card btns" style="margin-bottom:12px">
        <button class="btn ghost" data-act="toDone">Antrenmanı bitir (özete git)</button>
        <button class="btn danger" data-act="abort">Antrenmanı iptal et</button>
        <button class="btn" data-act="menu">Kapat</button>
      </div>`;
    }
    if (ses.idx === 0) html += stWarmup();
    else if (ses.idx <= N) html += stExercise(ses, ses.idx - 1);
    else html += stDone(ses);
    if (ses.rest) html += restOverlay(ses);
    return html;
  }
  function stWarmup() {
    return `<div class="card hero stack">
      <h2>Genel ısınma</h2>
      <div class="target"><div class="label">Süre</div><div class="big">5–10 <small>dk</small></div><div class="note">Hafif–orta tempolu kardiyo, hafif terleyene kadar</div></div>
      <div class="tipbox">Sonra o günün hareketlerine yönelik birkaç dinamik ısınma hareketi yap (ör. vücut ağırlığıyla squat, kol çevirme). Isınmayı 30 dakikalık kardiyoya çevirme.</div>
      <button class="btn ok big" data-act="next">✓ Isındım, başlayalım</button>
    </div>`;
  }
  function animBox(ex) {
    const [a, b] = imgs(ex);
    return `<div class="anim small"><img src="${a}" alt=""><img class="b" src="${b}" alt=""></div>`;
  }
  function stExercise(ses, i) {
    const e = ses.entries[i];
    const ex = EX[e.name] || exOf(e.slot);
    const s = SLOTS[e.slot];
    const weighted = e.plannedKg !== null;
    const sec = isSecEx(e.name);
    const rest = e.deload ? 60 : REST[e.group] || 90;
    const prev = lastEntry(e.slot);
    let note = '';
    if (e.calib) note = `<div class="calibbox">📏 <b>Ölçüm antrenmanı.</b> Ağırlık tahmini: hafif ya da ağır gelirse ağırlığı değiştir. <b>Son seti</b> yapabildiğin kadar yap (1 tekrar yedekte bırak) ve gerçekleşeni yaz. Sonraki ağırlığı buna göre ayarlayacağım.</div>`;
    else if (!e.deload) {
      if (s.group === 'G1') note = `<p class="small muted">Son set yapabildiğin kadar (formun bozulmadan, en az ${s.reps}). Tüm setlerde hedefi tutarsan sonraki sefer ağırlık artar.</p>`;
      else if (s.group === 'G2') note = `<p class="small muted">Tüm setlerde ${s.reps} tekrarı tamamlarsan ağırlık artar, tutturamazsan biraz düşer.</p>`;
      else if (s.lo) note = `<p class="small muted">RPE ${s.rpe}'u geçme. Üç sette de ${s.hi} tekrara ulaşınca ağırlık artar; ${s.lo}'un altında kalırsan düşer.</p>`;
      else note = `<p class="small muted">Her sette RPE ${s.rpe || 9}'a kadar: 1 tekrar daha yapabilecekken bırak.</p>`;
    }
    const rows = e.sets.map((st, k) => `<div class="srow">
        <span class="sn">${k + 1}</span>
        ${weighted ? `<div class="cell"><input type="number" inputmode="decimal" step="0.5" min="0" data-si="${k}" data-sf="kg" value="${esc(st.kg)}" aria-label="Set ${k + 1} ağırlık"><span class="u">kg</span></div><span class="x">×</span>` : ''}
        <div class="cell"><button class="mini" data-act="repd" data-k="${k}" data-d="${sec ? -5 : -1}" aria-label="azalt">−</button><input type="number" inputmode="numeric" min="0" data-si="${k}" data-sf="reps" value="${esc(st.reps)}" placeholder="?" aria-label="Set ${k + 1} ${sec ? 'saniye' : 'tekrar'}"><button class="mini" data-act="repd" data-k="${k}" data-d="${sec ? 5 : 1}" aria-label="artır">+</button><span class="u">${sec ? 'sn' : 'tkr'}</span></div>
        ${e.sets.length > 1 ? `<button class="del" data-act="setDel" data-k="${k}" aria-label="Seti sil">✕</button>` : '<span class="del"></span>'}
      </div>`).join('');
    return `<div class="stack">
      <div class="row spread"><h2>${i + 1}. ${esc(e.name)}</h2>${groupPill(e.group)}</div>
      ${animBox(ex)}
      <div class="card tgt">
        <div class="label">🎯 HEDEF</div>
        <div class="tline">${targetText(e.slot, e.plannedKg, e.deload)}</div>
        ${!e.deload && s.rpe ? `<div class="small muted">RPE ${s.rpe}</div>` : ''}
        ${e.warm.length ? `<div class="warm">🔥 Isınma: ${e.warm.map((w) => `${kgTxt(w.kg)} kg × ${w.reps}`).join(' · ')}</div>` : ''}
        <div class="restnote">⏱ Setler arası <b>${rest} sn</b> dinlen</div>
      </div>
      ${note}
      <div class="tipbox">💡 ${esc(ex.tip)}</div>
      <div class="card act">
        <div class="row spread"><div class="label">✅ GERÇEKLEŞEN</div>${prev ? `<span class="small muted">Geçen sefer: ${prev.sets.map((x) => (x.kg !== null && x.kg !== '' ? kgTxt(x.kg) + '×' : '') + x.reps).join(' · ')}</span>` : ''}</div>
        <div class="srows">${rows}</div>
        <button class="btn ghost sm addset" data-act="setAdd">+ Set ekle</button>
        ${sec ? `<div style="margin-top:8px"><button class="btn sm" data-act="sw">${ui.sw ? '⏹ Durdur ve son boş sete yaz' : '⏱ Kronometre'}</button> <span id="swv" class="muted"></span></div>` : ''}
      </div>
      <button class="btn ok big" data-act="exSave">💾 KAYDET ve DEVAM ET</button>
      <button class="btn ghost" data-act="exSkip">Bu hareketi atla</button>
    </div>`;
  }
  function restOverlay(ses) {
    const left = Math.max(0, Math.ceil((ses.rest.until - Date.now()) / 1000));
    return `<div class="rest" id="rest">
      <div class="muted">Sonraki harekete geçmeden dinlen</div>
      <div class="clock" id="restClock">${mmss(left)}</div>
      <div class="next">${esc(ses.rest.next || '')}</div>
      <div class="row"><button class="btn" data-act="restAdd">+30 sn</button><button class="btn primary" data-act="restEnd">Hazırım</button></div>
    </div>`;
  }
  const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  function evalEntry(e) {
    const base = { slot: e.slot, name: e.name, from: e.plannedKg, to: e.plannedKg };
    if (e.deload || !E.isWeighted(e.slot)) return { ...base, action: 'none' };
    if (e.skipped || !e.saved || !e.sets.length) return { ...base, action: 'skip' };
    const sets = e.sets.filter((x) => x.reps !== '' && x.reps !== null);
    if (!sets.length) return { ...base, action: 'skip' };
    if (e.calib) {
      // Ölçüm: en iyi setten 1RM (son sette yedekte bırakılan 1 tekrar eklenir, kitap s.27) → Excel başlangıç formülü
      let best = null;
      sets.forEach((x, k) => {
        if (!(x.reps > 0 && x.kg > 0)) return;
        const r = Math.min(15, +x.reps + (k === sets.length - 1 ? 1 : 0));
        const v = E.e1rm(+x.kg, r);
        if (!best || v > best.v) best = { v, kg: +x.kg, r };
      });
      if (!best) return { ...base, action: 'skip' };
      let calc = E.startWeight(e.slot, best.kg, best.r);
      // Kitap kuralıyla çapraz kontrol: hedefi tutturduysan ağırlık düşmez, tutturamadıysan artmaz
      const cnt0 = {};
      sets.forEach((x) => { cnt0[x.kg] = (cnt0[x.kg] || 0) + 1; });
      const kg0 = +Object.keys(cnt0).sort((a, b) => cnt0[b] - cnt0[a])[0];
      const rule = E.nextWeight(e.slot, kg0, sets.map((x) => +x.reps), {});
      // Küçük eksikte kitap kuralı (−%10); tahmin açıkça çok ağırsa (hedefin %60'ından az tekrar) ölçüm formülü
      const sl = SLOTS[e.slot];
      const need = sl.lo || sl.reps || 1;
      const minReps = Math.min(...sets.map((x) => +x.reps));
      let to;
      if (rule.action === 'up') to = Math.max(calc, rule.kg);
      else if (rule.action === 'down') to = minReps >= need * 0.6 ? rule.kg : Math.min(calc, kg0);
      else to = kg0;
      if ((EX[e.name] || {}).eq === 'barbell') to = Math.max(20, to);
      return { ...base, to: Math.max(2.5, to), action: 'calib' };
    }
    const cnt = {};
    sets.forEach((x) => { cnt[x.kg] = (cnt[x.kg] || 0) + 1; });
    const kg = +Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0];
    const r = E.nextWeight(e.slot, kg, sets.map((x) => +x.reps), { noSmallPlates: S.settings.noSmallPlates, equip: (EX[e.name] || {}).eq, pending: S.pending[e.slot] });
    return { ...base, from: kg, to: r.kg, action: r.action, pending: r.pending };
  }
  function stDone(ses) {
    const res = ses.entries.map(evalEntry);
    const lbl = { up: '▲ artıyor', down: '▼ düşüyor', same: '= aynı kalıyor', hold: '= 2 hafta kuralı', skip: 'atlandı', none: '', calib: '📏 ölçüldü' };
    return `<div class="stack">
      <div class="card hero center"><div style="font-size:44px">🏆</div><h2>Antrenman tamam${S.profile.name ? ', ' + esc(S.profile.name) : ''}!</h2><p class="muted small">${fmtTime(ses.startedAt)} başladı · ${Math.max(1, Math.round((Date.now() - ses.startedAt) / 60000))} dk</p></div>
      <div class="card">
        <h3>Hedef → Gerçekleşen → Sonraki</h3>
        ${res.map((r, i) => { const e = ses.entries[i]; return `<div class="summary-item"><div class="row spread"><b>${esc(r.name)}</b>${r.action !== 'none' ? `<span class="chg ${r.action}">${lbl[r.action]}</span>` : ''}</div>
          <div class="small muted">Hedef: ${targetText(e.slot, e.plannedKg, e.deload)}</div>
          <div class="small">Gerçekleşen: ${e.skipped || !e.saved ? '<span class="muted">—</span>' : e.sets.map((x) => (x.kg !== null && x.kg !== '' ? kgTxt(x.kg) + '×' : '') + x.reps).join(' · ')}</div>
          ${r.action !== 'none' && r.action !== 'skip' ? `<div class="small">Sonraki: <b>${kgTxt(r.to)} kg</b></div>` : ''}</div>`; }).join('')}
      </div>
      ${res.some((r) => r.action === 'calib') ? '<div class="calibbox">📏 Ölçüm tamam: ağırlıklar artık senin gerçek performansına göre ayarlandı.</div>' : ''}
      ${res.some((r) => r.action === 'down') ? '<div class="tipbox">Bazı hareketlerde ağırlık biraz düşürüldü. Moralini bozma: daha ileri sıçramak için bazen birkaç adım geri gitmek gerekir.</div>' : ''}
      <button class="btn ok big" data-act="finish">💾 Antrenmanı kaydet</button>
    </div>`;
  }

  // ---------- Geçmiş ----------
  function vHistory() {
    let html = brand('Geçmiş antrenmanlar');
    if (!S.history.length) return html + '<div class="card muted">Henüz kayıtlı antrenman yok.</div>';
    html += [...S.history].reverse().map((h) => `<details class="hist"><summary><div class="row spread"><b>${h.type === 'deload' ? 'Dinlenme ' + (h.day + 1) : 'Workout ' + h.key}</b><span class="muted small">${fmtDate(h.date)} · ${fmtTime(h.startedAt)}</span></div><div class="small muted">Döngü ${h.cycle} · Hafta ${h.week}</div></summary>
      <table>${h.entries.map((e) => `<tr><td>${esc(e.name)}<br><span class="small muted">Hedef: ${targetText(e.slot, e.plannedKg, e.deload)}</span></td><td>${e.skipped ? 'atlandı' : e.sets.map((x) => (x.kg !== null && x.kg !== '' ? kgTxt(x.kg) + '×' : '') + x.reps).join('<br>')}</td></tr>`).join('')}</table>
      <div style="margin-top:10px"><button class="btn sm danger" data-act="histDel" data-id="${h.id}">Kaydı sil</button></div>
    </details>`).join('');
    return html;
  }

  // ---------- İlerleme ----------
  const LIFTS = [['bench_g1', '#ff4d3d'], ['squat_g1', '#ffc93c'], ['ohp_g1', '#7fd3ff'], ['rdl_g2', '#c3a4ff'], ['row_g2', '#2ecc71']];
  function liftSeries() {
    return LIFTS.map(([id, col]) => ({ id, col, name: nameOf(id), pts: S.history.filter((h) => h.type === 'normal').map((h) => { const e = h.entries.find((x) => x.slot === id && !x.skipped && x.sets && x.sets.length); return e ? { x: h.startedAt, d: h.date, y: E.sessionE1rm({ sets: e.sets.map((s) => ({ kg: +s.kg, reps: +s.reps })) }) } : null; }).filter((p) => p && p.y > 0) }));
  }
  function verdict(dLean, dFat) {
    if (dFat < -0.3 && dLean > 0.3) return ['good', '🔥💪 Recomposition: yağ yakarken aynı anda kas kazanıyorsun. Mükemmel gidiyor!'];
    if (dFat < -0.3 && dLean >= -0.5) return ['good', '🔥 Yağ yakıyorsun ve kas kütleni koruyorsun. Böyle devam.'];
    if (dFat < -0.3) return ['bad', '⚠️ Kilo veriyorsun ama yağsız kütlen de azalıyor. Proteini yeterli al, kalori açığını ~300 kcal civarında tut (kitap s.41).'];
    if (dLean > 0.3 && dFat <= 0.5) return ['good', '💪 Temiz kas kazanımı: yağsız kütle artıyor, yağ artmıyor.'];
    if (dLean > 0.3) return ['warn', '📈 Hacim dönemi: kas kazanıyorsun ama yağ da artıyor. Yağlanmayı izle, fazla ~300 kcal\'yi geçmesin (kitap s.40).'];
    if (dFat > 0.5) return ['bad', '⚠️ Yağ kütlen artıyor, kas artışı yok. Beslenmeni gözden geçir.'];
    return ['', '➖ Vücut kompozisyonun şimdilik stabil.'];
  }
  function vProgress() {
    let html = brand('İlerleme');
    const ms = S.measures.map((m) => ({ m, ...comp(m) }));
    const c0 = ms[0], c1 = ms[ms.length - 1];
    const series = liftSeries();
    const main = series.filter((s) => ['bench_g1', 'squat_g1', 'ohp_g1'].includes(s.id));
    const firstT = main.every((s) => s.pts.length) ? main.reduce((a, s) => a + s.pts[0].y, 0) : null;
    const lastT = main.every((s) => s.pts.length) ? main.reduce((a, s) => a + s.pts[s.pts.length - 1].y, 0) : null;
    const benchNow = series[0].pts.length ? series[0].pts[series[0].pts.length - 1].y : null;
    const squatNow = series[1].pts.length ? series[1].pts[series[1].pts.length - 1].y : null;
    const bwNow = c1 ? c1.bw : +curBw() || null;

    // Özet: vücut kompozisyonu + güç
    if (c1 && c1.fat !== null) {
      html += `<div class="card hero">
        <div class="small muted">Son ölçüm · ${fmtDate(c1.m.date)}</div>
        <div class="kpis">
          <div><span>Yağ oranı</span><b style="color:var(--gold)">%${kgTxt(c1.fat)}</b>${ms.length > 1 ? `<i class="${deltaCls('fat', c1.fat - c0.fat)}">${sgn(c1.fat - c0.fat)} puan</i>` : ''}</div>
          <div><span>Yağsız kütle</span><b>${kgTxt(c1.lean)} kg</b>${ms.length > 1 && c0.lean !== null ? `<i class="${deltaCls('lean', c1.lean - c0.lean)}">${sgn(c1.lean - c0.lean)} kg</i>` : ''}</div>
          <div><span>Yağ kütlesi</span><b>${kgTxt(c1.fatKg)} kg</b>${ms.length > 1 && c0.fatKg !== null ? `<i class="${deltaCls('fatKg', c1.fatKg - c0.fatKg)}">${sgn(c1.fatKg - c0.fatKg)} kg</i>` : ''}</div>
          <div><span>Kilo</span><b>${kgTxt(c1.bw)} kg</b>${ms.length > 1 && c0.bw ? `<i>${sgn(c1.bw - c0.bw)} kg</i>` : ''}</div>
        </div>
        ${ms.length > 1 && c0.lean !== null ? (() => { const [cls, txt] = verdict(c1.lean - c0.lean, c1.fatKg - c0.fatKg); return `<div class="verdict ${cls}">${txt}<div class="small muted" style="margin-top:4px">${fmtDate(c0.m.date)} → ${fmtDate(c1.m.date)} · ${ms.length} ölçüm</div></div>`; })() : '<p class="small muted" style="margin:8px 0 0">İkinci ölçümden sonra yağ ve kas değişimini burada yorumlayacağım. Ayda bir ölçmen yeterli.</p>'}
        <p class="small muted" style="margin:8px 0 0">Yağ oranı boy/bel formülüyle (RFM) tahmin edilir, ±3–4 puan sapabilir. Kitaptaki estetik hedef: erkekte ~%10–12.</p>
      </div>`;
    } else {
      html += `<div class="card"><p class="small muted">Yağ oranı ve kompozisyon için Ölçüler sekmesinden ölçüm gir.</p><button class="btn sm" data-act="nav" data-v="measures">📏 Ölçüm gir</button></div>`;
    }
    // Güç
    html += `<div class="card"><h3>Güç</h3>
      ${lastT !== null ? `<div class="kpis">
        <div><span>Ana 3 hareket toplamı</span><b>${kgTxt(Math.round(lastT))} kg</b>${firstT !== lastT ? `<i class="${lastT >= firstT ? 'good' : 'bad'}">${sgn(lastT - firstT)} kg (%${kgTxt(Math.round(((lastT - firstT) / firstT) * 1000) / 10)})</i>` : ''}</div>
        ${benchNow && bwNow ? `<div><span>Bench / kilo</span><b>${kgTxt(Math.round((benchNow / bwNow) * 100) / 100)}×</b></div>` : ''}
        ${squatNow && bwNow ? `<div><span>Squat / kilo</span><b>${kgTxt(Math.round((squatNow / bwNow) * 100) / 100)}×</b></div>` : ''}
      </div>` : ''}
      ${series.some((s) => s.pts.length) ? `<div class="small muted" style="margin-top:8px">Tahmini 1 tekrar maksimum (kg)</div>${lineChart(series)}` : '<p class="muted small">Antrenman kaydettikçe oluşur.</p>'}
      <div class="legend">${series.map((s) => `<span><i style="background:${s.col}"></i>${esc(s.name)}${s.pts.length ? ': ' + kgTxt(s.pts[s.pts.length - 1].y) : ''}</span>`).join('')}</div></div>`;
    // Kompozisyon grafiği
    const leanPts = ms.filter((x) => x.lean !== null).map((x) => ({ x: Date.parse(x.m.date), y: x.lean }));
    const fatPts = ms.filter((x) => x.fatKg !== null).map((x) => ({ x: Date.parse(x.m.date), y: x.fatKg }));
    if (leanPts.length > 1) {
      html += `<div class="card"><h3>Vücut kompozisyonu (kg)</h3>${lineChart([{ col: '#2ecc71', pts: leanPts }, { col: '#ff7a45', pts: fatPts }])}
        <div class="legend"><span><i style="background:#2ecc71"></i>Yağsız kütle</span><span><i style="background:#ff7a45"></i>Yağ kütlesi</span></div></div>`;
    }
    const bw = S.bw.map((b) => ({ x: Date.parse(b.date), y: b.kg }));
    if (bw.length > 1) html += `<div class="card"><h3>Kilo (kg)</h3>${lineChart([{ col: '#ffc93c', pts: bw }])}</div>`;
    html += `<div class="card"><h3>Güncel hedef ağırlıklar</h3><ul class="exlist">${Object.keys(SLOTS).filter(E.isWeighted).map((id) => `<li><div><div class="name">${esc(nameOf(id))}${!S.calibrated[id] ? ' 📏' : ''}</div><div class="meta">${SLOTS[id].group} · ${E.schemeLabel(id)}</div></div><div class="kg">${kgTxt(S.weights[id] || 0)} kg</div></li>`).join('')}</ul></div>`;
    return html;
  }
  function lineChart(series) {
    const W = 320, H = 170, P = { l: 30, r: 8, t: 10, b: 22 };
    const all = series.flatMap((s) => s.pts);
    if (!all.length) return '';
    let x0 = Math.min(...all.map((p) => p.x)), x1 = Math.max(...all.map((p) => p.x));
    let y0 = Math.min(...all.map((p) => p.y)), y1 = Math.max(...all.map((p) => p.y));
    if (x0 === x1) { x0 -= 86400000; x1 += 86400000; }
    const padY = Math.max(2, (y1 - y0) * 0.1); y0 = Math.max(0, Math.floor(y0 - padY)); y1 = Math.ceil(y1 + padY);
    const X = (x) => P.l + ((x - x0) / (x1 - x0)) * (W - P.l - P.r);
    const Y = (y) => H - P.b - ((y - y0) / (y1 - y0)) * (H - P.t - P.b);
    let g = '';
    for (let i = 0; i <= 3; i++) { const v = y0 + ((y1 - y0) * i) / 3; g += `<line x1="${P.l}" x2="${W - P.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="#2e3340"/><text x="${P.l - 4}" y="${Y(v) + 3}" text-anchor="end">${Math.round(v)}</text>`; }
    g += `<text x="${P.l}" y="${H - 6}">${fmtDate(isoOf(new Date(x0)))}</text><text x="${W - P.r}" y="${H - 6}" text-anchor="end">${fmtDate(isoOf(new Date(x1)))}</text>`;
    for (const s of series) {
      if (!s.pts.length) continue;
      const d = s.pts.map((p) => `${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ');
      g += `<polyline fill="none" stroke="${s.col}" stroke-width="2.5" stroke-linejoin="round" points="${d}"/>`;
      g += s.pts.map((p) => `<circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="3" fill="${s.col}"/>`).join('');
    }
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Grafik">${g}</svg>`;
  }

  // ---------- Ayarlar ----------
  function vSettings() {
    return `${brand('Ayarlar')}
    <div class="card stack">
      <h3>Profilim</h3>
      <div><label class="f">Adın</label><input type="text" data-pf="name" value="${esc(S.profile.name)}"></div>
      <div class="grid3">
        <div><label class="f">Yaş</label><input type="number" inputmode="numeric" data-pf="age" value="${esc(S.profile.age)}"></div>
        <div><label class="f">Boy (cm)</label><input type="number" inputmode="numeric" data-pf="height" value="${esc(S.profile.height)}"></div>
        <div><label class="f">Cinsiyet</label><select data-pf2="sex"><option ${S.profile.sex === 'erkek' ? 'selected' : ''} value="erkek">Erkek</option><option ${S.profile.sex === 'kadın' ? 'selected' : ''} value="kadın">Kadın</option></select></div>
      </div>
      <div><label class="f">Antrenman günlerim</label>${daysPicker()}</div>
    </div>
    <div class="card">
      <label class="switch"><span>Salonumda 1,25 kg plaka yok<br><span class="small muted">Barbell'da 2,5 kg artışlar 2 haftada bir 5 kg olarak yapılır</span></span><input type="checkbox" data-ch="noSmallPlates" ${S.settings.noSmallPlates ? 'checked' : ''}></label>
      <label class="switch"><span>Dinlenme bitince ses</span><input type="checkbox" data-ch="sound" ${S.settings.sound ? 'checked' : ''}></label>
    </div>
    <div class="card btns">
      <button class="btn" data-act="nav" data-v="setup">Hareketler ve ağırlıklar</button>
      <div class="row"><button class="btn sm" data-act="weekMinus">‹</button><div class="grow center"><b>Döngü ${S.cycle.n} · ${S.cycle.week > WEEKS ? 'Dinlenme' : 'Hafta ' + S.cycle.week} · ${S.cycle.week > WEEKS ? (S.cycle.day + 1) : ['A', 'B', 'C'][S.cycle.day] || ''}</b></div><button class="btn sm" data-act="weekPlus">›</button></div>
      <p class="small muted">Sıradaki antrenmanı yalnızca düzeltmen gerekiyorsa değiştir.</p>
    </div>
    <div class="card btns">
      <h3>Yedekleme</h3>
      <p class="small muted">Veriler yalnızca bu telefonda. Telefon değiştirmeden ya da uygulamayı silmeden önce yedek al.</p>
      <button class="btn" data-act="export">⬇ Yedeği indir (.json)</button>
      <label class="btn ghost" for="importFile">⬆ Yedekten geri yükle</label>
      <input type="file" id="importFile" accept="application/json,.json" hidden>
    </div>
    <div class="card btns">
      <button class="btn danger" data-act="reset">Tüm verileri sil</button>
      <p class="small muted center">E-Fit · kişisel kullanım içindir</p>
    </div>`;
  }

  function vCycleEnd() {
    const has10 = S.history.some((h) => h.cycle === S.cycle.n && h.week === 10);
    return `${brand('Döngü tamamlandı')}
    <div class="card hero center"><div style="font-size:44px">🦸</div><h2>Tebrikler! ${S.cycle.n}. döngüyü bitirdin.</h2><p class="small muted">Yeni bir 12 haftalık döngüye başlama zamanı. Kitaptaki iki seçenekten birini seç:</p></div>
    <div class="card stack"><h3>1. Temiz başlangıç</h3><p class="small muted">Son haftalar çok yorucu geçtiyse. Son yaptığın ağırlık ve tekrarlardan yeni 1RM hesaplanır, ağırlıklar yeniden merdiven şeklinde başlar.</p><button class="btn primary" data-act="newCycle" data-m="1">Temiz başlangıçla başla</button></div>
    <div class="card stack"><h3>2. 10. hafta ağırlıklarıyla devam</h3><p class="small muted">Son haftalar çok yormadıysa ve hâlâ ilerleyebileceğini düşünüyorsan.</p><button class="btn" data-act="newCycle" data-m="2" ${has10 ? '' : 'disabled'}>10. haftanın ağırlıklarıyla başla</button></div>
    <div class="card"><button class="btn ghost" data-act="nav" data-v="measures">Önce yeni ölçülerimi gireyim</button></div>`;
  }

  // ---------- Etkileşimler ----------
  function curEntry() { const ses = S.active; return ses && ses.idx >= 1 && ses.idx <= ses.entries.length ? ses.entries[ses.idx - 1] : null; }
  function gotoIdx(i) { const ses = S.active; ses.idx = Math.max(0, Math.min(ses.entries.length + 1, i)); ses.rest = null; ui = {}; save(); render(); window.scrollTo(0, 0); }
  function afterExercise(e) {
    const ses = S.active;
    vibrate(30);
    const nextI = ses.idx + 1;
    if (nextI <= ses.entries.length) {
      const sec = e.deload ? 60 : REST[e.group] || 90;
      ses.rest = { until: Date.now() + sec * 1000, next: `Sıradaki: ${ses.entries[nextI - 1].name}` };
      ses.idx = nextI; ui = {}; save(); render(); window.scrollTo(0, 0);
    } else gotoIdx(nextI);
  }

  const actions = {
    nav: (el) => go(el.dataset.v),
    wiz: (el) => { const to = +el.dataset.to; if (!wizValidate(to)) return; save(); ui.step = to; render(); window.scrollTo(0, 0); },
    sex: (el) => { S.profile.sex = el.dataset.v; save(); render(); },
    dayToggle: (el) => {
      const d = +el.dataset.d; const a = S.settings.days;
      if (a.includes(d)) S.settings.days = a.filter((x) => x !== d);
      else if (a.length >= 3) return toast('Haftada 3 gün seçebilirsin; önce birini kaldır');
      else a.push(d);
      save(); render();
    },
    wizFinish: () => {
      S.weights = estimateAll(); S.calibrated = {}; S.pending = {};
      S.setupDone = true; S.cycle = { n: 1, week: 1, day: 0, started: today() };
      save(); toast(`Hadi başlayalım ${S.profile.name}! 💪`); go('home');
    },
    wizManual: () => { S.weights = estimateAll(); S.calibrated = {}; save(); go('setup'); },
    measureSave: () => {
      const editing = ui.editDate ? S.measures.find((x) => x.date === ui.editDate) : null;
      const m = Object.assign({ height: S.profile.height }, editing || lastMeasure(), ui.m || {});
      const date = ui.date || (editing ? editing.date : today());
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today()) return toast('Geçerli bir tarih seç (bugün ya da önce)');
      const miss = measureValid(m);
      if (miss.length) return toast(`Eksik ölçü: ${miss.join(', ')}`);
      let bw = ui.bw !== undefined && ui.bw !== '' ? +ui.bw : editing ? editing.bw : (lastMeasure().bw || curBw());
      if (!(bw >= 30 && bw <= 300)) return toast('Kilonu gir');
      if (editing && date !== editing.date) S.measures = S.measures.filter((x) => x !== editing);
      if (!editing && S.measures.some((x) => x.date === date) && !confirm(`${fmtDate(date)} için zaten bir ölçüm var. Üzerine yazılsın mı?`)) return;
      saveMeasure(m, date, bw);
      save(); toast(editing ? 'Ölçüm güncellendi' : 'Ölçüm kaydedildi'); go('measures');
    },
    measureEdit: (el) => { ui = { editDate: el.dataset.d, m: {} }; render(); window.scrollTo(0, 0); },
    measureCancel: () => go('measures'),
    measureDel: (el) => {
      if (!confirm(`${fmtDate(el.dataset.d)} ölçümü silinsin mi?`)) return;
      S.measures = S.measures.filter((x) => x.date !== el.dataset.d); save(); toast('Silindi'); render();
    },
    mk: (el) => { ui.mk = el.dataset.k; render(); },
    selDay: (el) => { ui.sel = el.dataset.d; render(); },
    calNav: (el) => {
      const now = new Date(); const [y, m] = ui.ym || [now.getFullYear(), now.getMonth()];
      const d = new Date(y, m + +el.dataset.d, 1); ui.ym = [d.getFullYear(), d.getMonth()]; render();
    },
    start: () => {
      if (!Object.keys(S.weights || {}).length) { toast('Önce programı oluştur'); return go('welcome'); }
      S.active = buildSession(); save(); keepAwake(true); go('session');
    },
    next: () => gotoIdx(S.active.idx + 1),
    back: () => gotoIdx(S.active.idx - 1),
    menu: () => { ui.menu = !ui.menu; render(); },
    repd: (el) => {
      const e = curEntry(); const st = e.sets[+el.dataset.k];
      st.reps = Math.max(0, (+st.reps || 0) + +el.dataset.d); save(); render();
    },
    setAdd: () => { const e = curEntry(); const l = e.sets[e.sets.length - 1] || { kg: e.plannedKg, reps: '' }; e.sets.push({ kg: l.kg, reps: l.reps }); save(); render(); },
    setDel: (el) => { const e = curEntry(); if (e.sets.length > 1) e.sets.splice(+el.dataset.k, 1); save(); render(); },
    sw: () => {
      const e = curEntry();
      if (ui.sw) {
        const v = Math.round((Date.now() - ui.sw) / 1000); ui.sw = null;
        const target = e.sets.find((x) => x.reps === '' || x.reps === null) || e.sets[e.sets.length - 1];
        target.reps = v; save(); render();
      } else { ui.sw = Date.now(); render(); }
    },
    exSave: () => {
      const e = curEntry();
      const bad = e.sets.findIndex((x) => x.reps === '' || x.reps === null || isNaN(+x.reps) || (e.plannedKg !== null && (x.kg === '' || isNaN(+x.kg))));
      if (bad >= 0) return toast(`Set ${bad + 1}: ${e.plannedKg !== null ? 'ağırlık ve ' : ''}tekrar sayısını gir`);
      e.sets.forEach((x) => { x.reps = +x.reps; if (e.plannedKg !== null) x.kg = +x.kg; });
      e.saved = true; e.skipped = false; afterExercise(e);
    },
    exSkip: () => { const e = curEntry(); e.skipped = true; e.saved = false; gotoIdx(S.active.idx + 1); },
    restAdd: () => { S.active.rest.until += 30000; save(); tick(); },
    restEnd: () => { S.active.rest = null; save(); render(); },
    toDone: () => gotoIdx(S.active.entries.length + 1),
    abort: () => { if (!confirm('Antrenman iptal edilsin mi? Bu seansta girilenler kaydedilmez.')) return; S.active = null; save(); keepAwake(false); go('home'); },
    finish: () => {
      const ses = S.active;
      ses.entries.forEach((e) => {
        if (!e.saved) e.skipped = true;
        const r = evalEntry(e);
        e.result = r;
        if (r.action !== 'none' && r.action !== 'skip' && r.to !== null) {
          S.weights[r.slot] = r.to;
          S.pending[r.slot] = !!r.pending;
          if (r.action === 'calib') S.calibrated[r.slot] = true;
        }
      });
      ses.finishedAt = Date.now(); delete ses.rest; delete ses.idx;
      S.history.push(ses);
      E.advance(S);
      S.active = null; save(); keepAwake(false);
      toast('Kaydedildi 💪');
      go(E.plan(S).type === 'cycleEnd' ? 'cycleEnd' : 'home');
    },
    setupSave: () => { S.setupDone = true; save(); toast('Kaydedildi'); go('home'); },
    histDel: (el) => { if (!confirm('Bu kayıt silinsin mi? (Ağırlıklar ve sıradaki antrenman değişmez)')) return; S.history = S.history.filter((h) => h.id !== el.dataset.id); save(); render(); },
    weekMinus: () => { const c = S.cycle; if (c.day > 0) c.day--; else if (c.week > 1) { c.week--; c.day = c.week > WEEKS ? 1 : 2; } save(); render(); },
    weekPlus: () => { E.advance(S); if (S.cycle.week > WEEKS + 1) { S.cycle.week = WEEKS + 1; S.cycle.day = 2; } save(); render(); },
    export: () => {
      const blob = new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `efit-yedek-${today()}.json`;
      document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    },
    reset: () => { if (!confirm('Tüm antrenman geçmişi ve ayarlar silinecek. Emin misin?')) return; if (!confirm('Geri alınamaz. Son kez onaylıyor musun?')) return; S = freshState(); save(); go('welcome'); },
    newCycle: (el) => {
      const m = el.dataset.m; const n = S.cycle.n;
      if (m === '1') {
        for (const id of Object.keys(SLOTS).filter(E.isWeighted)) {
          const e = lastEntry(id); if (!e) continue;
          let best = null;
          e.sets.forEach((x) => { if (x.reps > 0 && x.kg > 0 && (!best || E.e1rm(x.kg, x.reps) > E.e1rm(best.kg, best.reps))) best = x; });
          if (best) { S.inputs[id] = { w: best.kg, r: best.reps }; S.weights[id] = E.startWeight(id, best.kg, best.reps); }
        }
      } else {
        S.history.filter((h) => h.cycle === n && h.week === 10).forEach((h) => h.entries.forEach((e) => { if (e.plannedKg) S.weights[e.slot] = e.plannedKg; }));
      }
      S.pending = {};
      S.cycle = { n: n + 1, week: 1, day: 0, started: today() };
      save(); toast(`Döngü ${n + 1} başladı!`); go('home');
    }
  };

  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const fn = actions[el.dataset.act];
    if (fn) { ev.preventDefault(); fn(el); }
  });
  document.addEventListener('input', (ev) => {
    const el = ev.target;
    if (el.dataset.si !== undefined) {
      const e = curEntry(); if (!e) return;
      const st = e.sets[+el.dataset.si]; st[el.dataset.sf] = el.value === '' ? '' : +el.value; save(); return;
    }
    if (el.dataset.pf) {
      const k = el.dataset.pf;
      if (k === 'bw') ui.bw = el.value === '' ? '' : +el.value;
      else S.profile[k] = k === 'name' ? el.value : (el.value === '' ? '' : +el.value);
      save(); return;
    }
    if (el.dataset.uf) { ui[el.dataset.uf] = el.value; return; }
    if (el.dataset.mf) { ui.m = ui.m || {}; ui.m[el.dataset.mf] = el.value === '' ? '' : +el.value; return; }
    if (el.dataset.tf) { S.test[el.dataset.tf] = el.value === '' ? '' : +el.value; save(); return; }
    const ch = el.dataset.ch; if (!ch) return;
    const id = el.dataset.slot;
    if (ch === 'w' || ch === 'r') {
      S.inputs[id] = S.inputs[id] || {};
      S.inputs[id][ch] = el.value === '' ? '' : +el.value;
      const inp = S.inputs[id];
      const box = document.getElementById('calc-' + id);
      if (inp.w > 0 && inp.r > 0) {
        const sw = E.startWeight(id, +inp.w, +inp.r);
        S.weights[id] = sw; S.calibrated[id] = true;
        const kgIn = document.querySelector(`input[data-ch="kg"][data-slot="${id}"]`);
        if (kgIn) kgIn.value = sw;
        if (box) box.innerHTML = `Tahmini 1RM: ${kgTxt(Math.round(E.e1rm(+inp.w, +inp.r)))} kg → başlangıç <b>${kgTxt(sw)} kg</b>`;
      } else if (box) box.textContent = '';
      save();
    } else if (ch === 'kg') {
      S.weights[id] = el.value === '' ? 0 : +el.value; S.calibrated[id] = true; save();
    }
  });
  document.addEventListener('change', (ev) => {
    const el = ev.target; const ch = el.dataset.ch;
    if (el.dataset.pf2) { S.profile[el.dataset.pf2] = el.value; save(); return; }
    if (ch === 'choice') { S.choice[el.dataset.slot] = el.value; save(); }
    else if (ch === 'noSmallPlates' || ch === 'sound') { S.settings[ch] = el.checked; save(); toast('Kaydedildi'); }
    else if (el.id === 'importFile' && el.files[0]) {
      const r = new FileReader();
      r.onload = () => {
        try {
          const d = JSON.parse(r.result);
          if (!d || !d.cycle || !d.weights) throw new Error('bad');
          if (!confirm('Mevcut veriler yedektekilerle değiştirilecek. Devam?')) return;
          localStorage.setItem(KEY, JSON.stringify(d)); load(); toast('Yedek yüklendi'); go('home');
        } catch (e) { toast('Bu dosya geçerli bir yedek değil'); }
      };
      r.readAsText(el.files[0]);
    }
  });

  // Zamanlayıcı
  let lastLeft = null;
  function tick() {
    const ses = S.active;
    if (ses && ses.rest) {
      const left = Math.max(0, Math.ceil((ses.rest.until - Date.now()) / 1000));
      const c = document.getElementById('restClock');
      if (c) c.textContent = mmss(left);
      if (left === 0) {
        if (lastLeft !== null && lastLeft !== 0) { beep(); vibrate([200, 100, 200]); }
        ses.rest = null; lastLeft = null; save(); render(); return;
      }
      lastLeft = left;
    } else lastLeft = null;
    if (ui.sw) { const v = document.getElementById('swv'); if (v) v.textContent = Math.round((Date.now() - ui.sw) / 1000) + ' sn'; }
  }
  setInterval(tick, 250);

  load();
  if (S.active) { view = 'session'; keepAwake(true); }
  render();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
  window.__SH = { get state() { return S; }, render };
})();
