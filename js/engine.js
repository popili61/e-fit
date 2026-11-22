/* Kural motoru — e-kitaptaki kurallar (Excel ile çelişirse kitap esas). */
(function (g) {
  const { SLOTS, WORKOUTS, DELOAD, WEEKS } = g.SH_DATA;

  const mround = (x, m = 2.5) => Math.round(x / m) * m;
  const fix = (x) => Math.round(x * 100) / 100;

  // 1 tekrar maksimum tahmini (Excel ile aynı formül)
  const e1rm = (w, r) => (w > 0 && r > 0 ? w * r * 0.0333 + w : 0);

  // Başlangıç ağırlığı: 1RM × %85 × hareket katsayısı, 2.5 kg'a yuvarlı
  function startWeight(slotId, w, r) {
    const s = SLOTS[slotId];
    if (!s.factor) return null;
    return Math.max(0, mround(e1rm(w, r) * 0.85 * s.factor));
  }

  const isWeighted = (slotId) => SLOTS[slotId].group !== 'BW';

  /* Şınav + mekik + vücut ağırlığından çapa 1RM'ler (temkinli tahmin).
     Şınavda vücut ağırlığının ~%64'ü itilir; barbell tekniği henüz oturmamış olabilir diye ×0.6 güvenlik payı. */
  function anchors(bw, pushups, situps) {
    const p = Math.max(0, Math.min(50, +pushups || 0));
    const s = Math.max(0, Math.min(60, +situps || 0));
    return { P: 0.64 * bw * (1 + p / 30) * 0.6, L: bw * (0.5 + (0.4 * s) / 30) };
  }
  function estimateStart(slotId, exName, anc) {
    const s = SLOTS[slotId];
    const r = g.SH_DATA.RATIO[exName];
    if (!s.factor || !r) return null;
    let w = mround(anc[r[0]] * r[1] * 0.85 * s.factor);
    const eq = (g.SH_DATA.EX[exName] || {}).eq;
    if (eq === 'barbell') w = Math.max(20, w); // boş olimpik bar
    return Math.max(2.5, w);
  }

  // Isınma setleri (kitap s.25): G1 %60×5, %70×3, %85×1-2 — G2 %60×5, %85×2-3
  function warmups(slotId, kg) {
    const grp = SLOTS[slotId].group;
    if (!kg) return [];
    if (grp === 'G1') return [[0.6, '5'], [0.7, '3'], [0.85, '1-2']].map(([p, r]) => ({ kg: mround(kg * p), reps: r, pct: p }));
    if (grp === 'G2') return [[0.6, '5'], [0.85, '2-3']].map(([p, r]) => ({ kg: mround(kg * p), reps: r, pct: p }));
    return [];
  }

  // Set hedefleri
  function targetSets(slotId) {
    const s = SLOTS[slotId];
    const out = [];
    for (let i = 0; i < s.sets; i++) {
      if (s.group === 'G1') out.push({ reps: s.reps, amrap: s.amrap && i === s.sets - 1 });
      else if (s.group === 'G2') out.push({ reps: s.reps });
      else if (s.group === 'G3' || s.group === 'G4') out.push({ reps: s.hi, lo: s.lo, hi: s.hi });
      else out.push({ max: true });
    }
    return out;
  }

  function schemeLabel(slotId) {
    const s = SLOTS[slotId];
    if (s.group === 'G1') return `${s.sets}x${s.reps}+`;
    if (s.group === 'G2') return `${s.sets}x${s.reps}`;
    if (s.lo) return `${s.sets}x${s.lo}-${s.hi}`;
    return `${s.sets}xmax`;
  }

  /* Bir sonraki ağırlık (kitap s.28-30):
     G1/G2: tüm setlerde hedef tekrar → artış; değilse %10 düşüş.
     G3/G4: üç sette de üst sınır → artış; herhangi bir set alt sınırın altında → %10 düşüş; aksi halde aynı.
     1.25 kg plaka yoksa (kitap s.33): 2.5'lik barbell artışı 2 haftada bir 5 kg olarak uygulanır. */
  function nextWeight(slotId, kg, reps, opts = {}) {
    const s = SLOTS[slotId];
    if (!isWeighted(slotId)) return { kg: null, action: 'none' };
    const done = reps.filter((r) => r !== null && r !== undefined && r !== '').map(Number);
    const n = s.sets;
    let action;
    if (s.group === 'G1' || s.group === 'G2') {
      // Ekstra set yapıldıysa da: hedef tekrarı tutan set sayısı hedef set sayısına ulaşmalı
      action = done.filter((r) => r >= s.reps).length >= n ? 'up' : 'down';
    } else {
      // En iyi n set değerlendirilir (ekstra set ceza değil)
      const top = [...done].sort((a, b) => b - a).slice(0, n);
      if (top.length >= n && top.every((r) => r >= s.hi)) action = 'up';
      else if (top.length < n || top.some((r) => r < s.lo)) action = 'down';
      else action = 'same';
    }
    let next = kg;
    let pending = false;
    if (action === 'up') {
      const halfStep = opts.noSmallPlates && s.inc === 2.5 && opts.equip === 'barbell';
      if (halfStep) {
        if (opts.pending) { next = kg + 5; } else { next = kg; pending = true; action = 'hold'; }
      } else next = kg + s.inc;
    } else if (action === 'down') {
      next = Math.min(mround(kg * 0.9), kg - 2.5); // hafif ağırlıklarda yuvarlama düşüşü yutmasın
    }
    return { kg: fix(Math.max(0, next)), action, pending };
  }

  // Sıradaki antrenman
  function plan(state) {
    const c = state.cycle;
    if (c.week <= WEEKS) {
      const key = ['A', 'B', 'C'][c.day];
      return { type: 'normal', key, week: c.week, day: c.day, slots: WORKOUTS[key] };
    }
    if (c.week === WEEKS + 1 && c.day < 2) {
      const key = c.day === 0 ? 'D1' : 'D2';
      return { type: 'deload', key, week: c.week, day: c.day, items: DELOAD[key] };
    }
    return { type: 'cycleEnd' };
  }

  /* Kalan seansların listesi (takvim için): mevcut konumdan döngü sonuna kadar */
  function remaining(state) {
    const c = { week: state.cycle.week, day: state.cycle.day };
    const out = [];
    for (let i = 0; i < 60; i++) {
      const p = plan({ cycle: c });
      if (p.type === 'cycleEnd') break;
      out.push({ type: p.type, key: p.key, week: p.week, day: p.day });
      advance({ cycle: c });
    }
    return out;
  }

  // Yağ oranı tahmini — RFM (Relative Fat Mass, Woolcott & Bergman 2018): yalnızca boy ve bel ölçüsü
  function rfm(sex, heightCm, waistCm) {
    if (!(heightCm > 0 && waistCm > 0)) return null;
    const v = (sex === 'kadın' ? 76 : 64) - 20 * (heightCm / waistCm);
    return Math.round(v * 10) / 10;
  }

  function advance(state) {
    const c = state.cycle;
    c.day += 1;
    if (c.week <= WEEKS && c.day > 2) { c.week += 1; c.day = 0; }
  }

  // Seans içinde en iyi set üzerinden 1RM tahmini (Excel'deki gibi)
  function sessionE1rm(entry) {
    let best = 0;
    for (const st of entry.sets) if (st.reps > 0 && st.kg > 0) best = Math.max(best, e1rm(st.kg, st.reps));
    return Math.round(best * 2) / 2;
  }

  g.SH_ENGINE = { remaining, rfm, anchors, estimateStart, mround, e1rm, startWeight, warmups, targetSets, schemeLabel, nextWeight, plan, advance, sessionE1rm, isWeighted };
})(typeof self !== 'undefined' ? self : window);
