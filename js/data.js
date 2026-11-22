/* E-Fit — sabit program verisi (kişisel kullanım). */
(function (g) {
  // Hareket kataloğu: ad -> görsel kimliği, ekipman, kısa Türkçe ipucu
  const EX = {
    'Bench Press': { img: 'Barbell_Bench_Press_-_Medium_Grip', eq: 'barbell', tip: 'Kürek kemiklerini sık, ayaklar yerde. Barı göğsün ortasına kontrollü indir, dirsekler gövdeye ~45°.' },
    'Dumbbell Chest Press': { img: 'Dumbbell_Bench_Press', eq: 'dumbbell', tip: 'Dumbbell’ları göğüs hizasına indir, yukarıda hafifçe birbirine yaklaştır. Ağırlık = iki dumbbell toplamı.' },
    'Incline Bench Press': { img: 'Barbell_Incline_Bench_Press_-_Medium_Grip', eq: 'barbell', tip: 'Sehpa 30–45°. Barı köprücük kemiğinin biraz altına indir.' },
    'Squat': { img: 'Barbell_Full_Squat', eq: 'barbell', tip: 'Bar üst sırtta, göğüs dik. Kalçayı geriye-aşağı it, dizler ayak uçları yönünde. En az paralele in.' },
    'Leg Press': { img: 'Leg_Press', eq: 'machine', tip: 'Bel minderden kalkmasın. Dizleri kilitlemeden it, kontrollü indir.' },
    'Hack Squat': { img: 'Hack_Squat', eq: 'machine', tip: 'Sırt pede yaslı, ayaklar omuz genişliğinde. Derin ve kontrollü in.' },
    'Over Head Press': { img: 'Standing_Military_Press', eq: 'barbell', tip: 'Ayakta, karın ve kalça sıkı. Barı yüzünün önünden dik yukarı it, başını hafif geri al.' },
    'Dumbbell Shoulder Press': { img: 'Seated_Dumbbell_Press', eq: 'dumbbell', tip: 'Dumbbell’lar kulak hizasından yukarı. Belini aşırı kavislendirme. Ağırlık = iki dumbbell toplamı.' },
    'DB Shoulder Press': { img: 'Seated_Dumbbell_Press', eq: 'dumbbell', tip: 'Dumbbell’lar kulak hizasından yukarı. Belini aşırı kavislendirme. Ağırlık = iki dumbbell toplamı.' },
    'Smith Machine Shoulder Press': { img: 'Smith_Machine_Overhead_Shoulder_Press', eq: 'machine', tip: 'Oturarak, bar çene hizasına kadar insin. Kontrollü it.' },
    'Shoulder Press Machine': { img: 'Machine_Shoulder_Military_Press', eq: 'machine', tip: 'Koltuğu tutamaklar omuz hizasında olacak şekilde ayarla. Sırt pede yaslı it.' },
    'Romanian DL': { img: 'Romanian_Deadlift', eq: 'barbell', tip: 'Dizler hafif bükük, kalçayı geriye it. Bar bacaklara yakın, sırt düz. Arka bacakta gerilmeyi hisset.' },
    'Dumbbell Romanian Deadlift': { img: 'Stiff-Legged_Dumbbell_Deadlift', eq: 'dumbbell', tip: 'Kalçadan menteşe yap, sırt düz. Dumbbell’lar bacaklara yakın insin.' },
    'Hip Thrust': { img: 'Barbell_Hip_Thrust', eq: 'barbell', tip: 'Sırt üstü sehpaya yaslı, kalçayı yukarı it ve tepede sık. Çene göğse yakın.' },
    'Barbell Row': { img: 'Bent_Over_Barbell_Row', eq: 'barbell', tip: 'Gövde öne eğik, sırt düz. Barı göbek hizasına çek, dirsekler geriye.' },
    'T-Bar Row': { img: 'T-Bar_Row_with_Handle', eq: 'barbell', tip: 'Gövde öne eğik, sırt düz. Tutamağı göğsün altına çek.' },
    'Machine Row': { img: 'Leverage_Iso_Row', eq: 'machine', tip: 'Göğüs pede yaslı, kürek kemiklerini birbirine yaklaştırarak çek.' },
    'Pull Ups': { img: 'Pullups', eq: 'bw', tip: 'Tam asılı başla, çene barı geçene kadar çek. Sallanma yok. Hiç çekemiyorsan negatif barfiksle başla.' },
    'Assisted Pull Ups': { img: 'Band_Assisted_Pull-Up', eq: 'bw', tip: 'Bant ya da destekli makineyle barfiks. Haftadan haftaya desteği azalt.' },
    'Negative Pull Ups': { img: 'Pullups', eq: 'bw', tip: 'Zıplayarak ya da yükseltiyle tepeye çık, 3–5 saniyede yavaşça in.' },
    'Lateral Raises': { img: 'Side_Lateral_Raise', eq: 'dumbbell', tip: 'Dirsekler hafif bükük, kolları omuz hizasına kadar yana kaldır. Sallanmadan, kontrollü.' },
    'Cable Lateral Raises': { img: 'Cable_Seated_Lateral_Raise', eq: 'cable', tip: 'Kabloyu karşı elle tut, kolu omuz hizasına kadar yana kaldır.' },
    'Machine Lateral Raises': { img: 'Seated_Side_Lateral_Raise', eq: 'machine', tip: 'Makinede dirsekleri yana-yukarı omuz hizasına kaldır.' },
    'Lat Pulldown': { img: 'Wide-Grip_Lat_Pulldown', eq: 'cable', tip: 'Geniş tutuş, göğüs dik. Barı üst göğse çek, dirsekleri aşağı-geriye sür.' },
    'High Row Machine': { img: 'Leverage_High_Row', eq: 'machine', tip: 'Yukarıdan aşağı-geriye çek, kürek kemiklerini sık.' },
    'Single Arm Pulldown': { img: 'One_Arm_Lat_Pulldown', eq: 'cable', tip: 'Tek kolla tutamağı omuza doğru aşağı çek, sırtta kasılmayı hisset.' },
    'Chest Fly Machine': { img: 'Butterfly', eq: 'machine', tip: 'Dirsekler hafif bükük, kolları önde birleştir. Göğsü sıkarak kontrollü aç.' },
    'Dumbbell Chest Fly': { img: 'Dumbbell_Flyes', eq: 'dumbbell', tip: 'Sehpada, dirsekler hafif bükük kollar yana açılsın. Göğüste gerilme hissedince geri topla.' },
    'Cable Chest Fly': { img: 'Cable_Crossover', eq: 'cable', tip: 'İki kabloyu önde, göğüs hizasında birleştir. Hafif öne eğik dur.' },
    'Leg Extension': { img: 'Leg_Extensions', eq: 'machine', tip: 'Dizi makinenin ekseniyle hizala. Bacağı tam aç, tepede 1 sn sık, yavaş indir.' },
    'Dumbbell Lunges': { img: 'Dumbbell_Lunges', eq: 'dumbbell', tip: 'Uzun bir adım at, arka diz yere yaklaşsın. Ön diz ayak ucunu çok geçmesin.' },
    'Bulgarian Split Squat': { img: 'Split_Squat_with_Dumbbells', eq: 'dumbbell', tip: 'Arka ayak sehpada, öndeki bacakla dik in-kalk. Her bacak için ayrı say.' },
    'Overhead Triceps Extension': { img: 'Standing_Dumbbell_Triceps_Extension', eq: 'dumbbell', tip: 'Dumbbell başın arkasında, dirsekler sabit ve tavana bakıyor. Sadece ön kol hareket etsin.' },
    'Cable Pushdown': { img: 'Triceps_Pushdown_-_Rope_Attachment', eq: 'cable', tip: 'Dirsekler gövdeye yapışık, ipi aşağı itip altta ayır.' },
    'Skull Crushers': { img: 'EZ-Bar_Skullcrusher', eq: 'barbell', tip: 'Sırt üstü, barı alnına doğru indir. Dirsekler sabit kalsın.' },
    'Incline Dumbbell Curl': { img: 'Incline_Dumbbell_Curl', eq: 'dumbbell', tip: 'Eğimli sehpada kollar aşağı sarkık başla, dirsekleri öne getirmeden kıvır.' },
    'Dumbbell Curl': { img: 'Dumbbell_Bicep_Curl', eq: 'dumbbell', tip: 'Dirsekler gövdenin yanında sabit, sallanmadan kıvır.' },
    'Cable Curl': { img: 'Standing_Biceps_Cable_Curl', eq: 'cable', tip: 'Dirsekler sabit, barı omuzlara doğru kıvır. Yavaş indir.' },
    'Crunch': { img: 'Crunches', eq: 'bw', tip: 'Bel yerde kalsın, sadece omuzları kaldırarak karnı sık.' },
    'Leg Raises': { img: 'Flat_Bench_Lying_Leg_Raise', eq: 'bw', tip: 'Sırt üstü, bacakları düz kaldır. İnerken beli yerden kaldırma.' },
    'Plank': { img: 'Plank', eq: 'bw', tip: 'Dirsekler omuz altında, vücut tek çizgi. Kalça düşmesin. Süreni saniye olarak gir.', unit: 's' }
  };

  const SQUAT = ['Squat', 'Leg Press', 'Hack Squat'];
  const BENCH = ['Bench Press', 'Dumbbell Chest Press', 'Incline Bench Press'];
  const CORE = ['Crunch', 'Leg Raises', 'Plank'];

  /* Slot = programdaki bir hareket yeri (kendi ağırlık takibi olur).
     group: G1/G2/G3/G4/BW. factor: başlangıç ağırlığı katsayısı (Excel). inc: başarıda artış (kg). */
  const SLOTS = {
    bench_g1: { group: 'G1', def: 'Bench Press', alts: BENCH, factor: 0.8, inc: 2.5, sets: 4, reps: 5, amrap: true },
    squat_g1: { group: 'G1', def: 'Squat', alts: SQUAT, factor: 0.7, inc: 5, sets: 4, reps: 5, amrap: true },
    ohp_g1: { group: 'G1', def: 'Over Head Press', alts: ['Over Head Press', 'Dumbbell Shoulder Press', 'Smith Machine Shoulder Press'], factor: 0.7, inc: 2.5, sets: 4, reps: 5, amrap: true },
    shoulder_g2: { group: 'G2', def: 'Shoulder Press Machine', alts: ['DB Shoulder Press', 'Shoulder Press Machine', 'Over Head Press'], factor: 0.6, inc: 2.5, sets: 3, reps: 10 },
    rdl_g2: { group: 'G2', def: 'Romanian DL', alts: ['Romanian DL', 'Dumbbell Romanian Deadlift', 'Hip Thrust'], factor: 0.6, inc: 5, sets: 3, reps: 8 },
    bench_g2: { group: 'G2', def: 'Bench Press', alts: BENCH, factor: 0.6, inc: 2.5, sets: 3, reps: 10 },
    row_g2: { group: 'G2', def: 'Barbell Row', alts: ['Barbell Row', 'T-Bar Row', 'Machine Row'], factor: 0.6, inc: 2.5, sets: 4, reps: 10 },
    squat_g2: { group: 'G2', def: 'Squat', alts: SQUAT, factor: 0.6, inc: 2.5, sets: 3, reps: 10 },
    pullups: { group: 'BW', def: 'Pull Ups', alts: ['Pull Ups', 'Assisted Pull Ups', 'Negative Pull Ups'], sets: 3, rpe: 9 },
    lateral_g3: { group: 'G3', def: 'Lateral Raises', alts: ['Lateral Raises', 'Cable Lateral Raises', 'Machine Lateral Raises'], factor: 0.6, inc: 5, sets: 3, lo: 10, hi: 14, rpe: 9 },
    latpull_g3: { group: 'G3', def: 'Lat Pulldown', alts: ['Lat Pulldown', 'High Row Machine', 'Single Arm Pulldown'], factor: 0.65, inc: 5, sets: 3, lo: 10, hi: 14, rpe: 8 },
    fly_g3: { group: 'G3', def: 'Chest Fly Machine', alts: ['Chest Fly Machine', 'Dumbbell Chest Fly', 'Cable Chest Fly'], factor: 0.65, inc: 5, sets: 3, lo: 10, hi: 14, rpe: 8 },
    legext_g3: { group: 'G3', def: 'Leg Extension', alts: ['Leg Extension', 'Dumbbell Lunges', 'Bulgarian Split Squat'], factor: 0.65, inc: 5, sets: 3, lo: 10, hi: 14, rpe: 9 },
    tri_g4: { group: 'G4', def: 'Overhead Triceps Extension', alts: ['Cable Pushdown', 'Overhead Triceps Extension', 'Skull Crushers'], factor: 0.75, inc: 5, sets: 3, lo: 8, hi: 12, rpe: 9 },
    curl_g4: { group: 'G4', def: 'Incline Dumbbell Curl', alts: ['Incline Dumbbell Curl', 'Dumbbell Curl', 'Cable Curl'], factor: 0.75, inc: 5, sets: 3, lo: 8, hi: 12, rpe: 9 },
    core_a: { group: 'BW', def: 'Crunch', alts: CORE, sets: 3, rpe: 9 },
    core_b: { group: 'BW', def: 'Leg Raises', alts: CORE, sets: 3, rpe: 9 },
    core_c: { group: 'BW', def: 'Plank', alts: CORE, sets: 3, rpe: 9 }
  };

  const WORKOUTS = {
    A: ['bench_g1', 'shoulder_g2', 'rdl_g2', 'latpull_g3', 'legext_g3', 'core_a'],
    B: ['squat_g1', 'bench_g2', 'pullups', 'lateral_g3', 'curl_g4', 'core_b'],
    C: ['ohp_g1', 'squat_g2', 'row_g2', 'fly_g3', 'tri_g4', 'core_c']
  };

  // Dinlenme haftası (deload): 2 hafif antrenman, 3x5, ana ağırlığın %70'i
  const DELOAD = {
    D1: [['squat_g1', 'Squat'], ['bench_g1', 'Bench Press'], ['pullups', 'Pull Ups']],
    D2: [['ohp_g1', 'Over Head Press'], ['rdl_g2', 'Romanian DL'], ['row_g2', 'Barbell Row']]
  };

  /* Şınav/mekik testinden tahmin: her hareketin 1RM'i bir "çapa"nın oranı.
     P = üst vücut itiş (şınavdan, barbell bench 1RM karşılığı), L = alt vücut (mekik + vücut ağırlığından squat 1RM karşılığı).
     Tahmin bilerek temkinli; ilk (ölçüm) antrenmanından sonra gerçek veriyle yeniden hesaplanır. */
  const RATIO = {
    'Bench Press': ['P', 1], 'Dumbbell Chest Press': ['P', 0.8], 'Incline Bench Press': ['P', 0.8],
    'Squat': ['L', 1], 'Leg Press': ['L', 1.8], 'Hack Squat': ['L', 1.2],
    'Over Head Press': ['P', 0.6], 'Dumbbell Shoulder Press': ['P', 0.5], 'DB Shoulder Press': ['P', 0.5],
    'Smith Machine Shoulder Press': ['P', 0.6], 'Shoulder Press Machine': ['P', 0.6],
    'Romanian DL': ['L', 0.9], 'Dumbbell Romanian Deadlift': ['L', 0.7], 'Hip Thrust': ['L', 1.2],
    'Barbell Row': ['P', 0.8], 'T-Bar Row': ['P', 0.7], 'Machine Row': ['P', 0.8],
    'Lateral Raises': ['P', 0.2], 'Cable Lateral Raises': ['P', 0.1], 'Machine Lateral Raises': ['P', 0.3],
    'Lat Pulldown': ['P', 0.8], 'High Row Machine': ['P', 0.8], 'Single Arm Pulldown': ['P', 0.35],
    'Chest Fly Machine': ['P', 0.5], 'Dumbbell Chest Fly': ['P', 0.35], 'Cable Chest Fly': ['P', 0.35],
    'Leg Extension': ['L', 0.5], 'Dumbbell Lunges': ['L', 0.35], 'Bulgarian Split Squat': ['L', 0.3],
    'Overhead Triceps Extension': ['P', 0.3], 'Cable Pushdown': ['P', 0.4], 'Skull Crushers': ['P', 0.4],
    'Incline Dumbbell Curl': ['P', 0.3], 'Dumbbell Curl': ['P', 0.35], 'Cable Curl': ['P', 0.35]
  };

  // Vücut ölçüleri (cm)
  const MEASURES = [
    ['chest', 'Göğüs', 'Meme ucu hizasından, nefesi normal verirken'],
    ['arm', 'Kol', 'Pazı kasılıyken, en kalın yerinden'],
    ['waist', 'Bel', 'Göbek deliğinin ~1 cm üstünden'],
    ['hips', 'Kalça', 'En geniş yerinden'],
    ['thigh', 'Uyluk', 'En geniş yerinden'],
    ['calf', 'Baldır', 'En geniş yerinden']
  ];

  const REST = { G1: 120, G2: 120, G3: 90, G4: 90, BW: 90 };
  const WEEKS = 12;

  g.SH_DATA = { EX, SLOTS, WORKOUTS, DELOAD, REST, WEEKS, RATIO, MEASURES };
})(typeof self !== 'undefined' ? self : window);
