
(function () {
  'use strict';

  // ---------- Константы ----------
  const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const FULL = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
  const COLORS = ['#0a84ff', '#ff9f0a', '#30d158', '#bf5af2', '#ff375f', '#64d2ff', '#ffd60a', '#8e8e93'];
  const KEY = 'schedule-load-v1';
  const SVG = 'http://www.w3.org/2000/svg';

  // ---------- Настройки ----------
  const SETTINGS_KEY = 'schedule-settings-v1';
  const DEFAULTS = { theme: 'auto', accent: 'blue', city: 'spb', weather: true, strict: 'normal', sleep: true, age: null, bed: '23:00', wake: '07:00',
    lesson: 45, homework: 60, autoClose: false, compact: false, showWeek: true, showHints: true };
  const LESSON_RANGE = [20, 180], HW_RANGE = [5, 240];   // допустимое время урока и домашки по умолчанию, минуты
  const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
  const CITIES = {
    spb: { name: 'Санкт-Петербург', lat: 59.9386, lon: 30.3141 },
    msk: { name: 'Москва', lat: 55.7558, lon: 37.6173 }
  };
  const LOAD_BY = { soft: 45, normal: 36, hard: 27 };   // нагрузка дня (сложность × часы), которая даёт коэффициент 10
  const OPTIONS = {
    theme: [['auto', 'Авто'], ['light', 'Светлая'], ['dark', 'Тёмная']],
    city: [['spb', 'Санкт-Петербург'], ['msk', 'Москва']],
    strict: [['soft', 'Мягкая'], ['normal', 'Обычная'], ['hard', 'Строгая']]
  };
  const ACCENTS = [
    ['blue', 'Синий', '#0a84ff', 211, 90],
    ['teal', 'Бирюзовый', '#30b0c7', 187, 75],
    ['green', 'Зелёный', '#30d158', 140, 60],
    ['orange', 'Оранжевый', '#ff9f0a', 28, 95],
    ['pink', 'Розовый', '#ff375f', 345, 85],
    ['purple', 'Фиолетовый', '#bf5af2', 280, 70],
    ['indigo', 'Индиго', '#5e5ce6', 241, 65],
    ['graphite', 'Графит', '#8e8e93', 0, 0]
  ];   // [ключ, название, цвет кружка, оттенок (0–360), насыщенность для диаграммы]
  const STRICT_HELP = {
    soft: 'Мягкая: день считается тяжёлым позже (10 из 10 при нагрузке 45).',
    normal: 'Обычная: 6 часов дел со сложностью 6 дают 10 из 10 (нагрузка 36).',
    hard: 'Строгая: тяжёлый день наступает раньше (10 из 10 при нагрузке 27).'
  };
  let settings = loadSettings();
  const loadMax = () => LOAD_BY[settings.strict];

  // ---------- Сон ----------
  const toMin = t => { const p = t.split(':'); return Number(p[0]) * 60 + Number(p[1]); };
  function sleepNorm(age) {   // норма сна в часах по возрасту (рекомендации Национального фонда сна, США)
    if (age <= 13) return [9, 11];
    if (age <= 17) return [8, 10];
    if (age <= 64) return [7, 9];
    return [7, 8];
  }
  // Сколько человек спит и чего не хватает до нормы; null, если сон не учитывается или данных мало
  function sleepInfo() {
    if (!settings.sleep || !settings.age) return null;
    const dur = (toMin(settings.wake) - toMin(settings.bed) + 1440) % 1440;   // минут (с переходом через полночь)
    if (dur === 0) return null;
    const norm = sleepNorm(settings.age);
    const deficit = Math.max(0, norm[0] - dur / 60);                          // недостающие часы до нижней границы нормы
    return { dur, lo: norm[0], hi: norm[1], deficit, mult: 1 + Math.min(0.3, deficit * 0.1) };
  }
  const sleepMult = () => { const i = sleepInfo(); return i ? i.mult : 1; };
  const sleepNormText = () => (settings.sleep && settings.age ? sleepNorm(settings.age).join('–') : '8–10');
  function fmtDur(min) {
    const h = Math.floor(min / 60), m = min % 60;
    return h && m ? h + ' ч ' + m + ' мин' : h ? h + ' ч' : m + ' мин';
  }

  // Цвета диаграммы: оттенки рядом с выбранным цветом темы, разной светлоты, чтобы соседние сектора различались
  const PALETTE_SHIFT = [0, 8, -8, 16, -16, 24, -24, 32];
  const PALETTE_LIGHT = [52, 66, 40, 60, 46, 72, 34, 56];
  function updatePalette() {
    const a = ACCENTS.find(x => x[0] === settings.accent) || ACCENTS[0];
    COLORS.length = 0;
    PALETTE_SHIFT.forEach((shift, i) => {
      const sat = a[4] === 0 ? 0 : Math.max(35, a[4] - (i % 3) * 8);
      COLORS.push('hsl(' + ((a[3] + shift + 360) % 360) + ', ' + sat + '%, ' + PALETTE_LIGHT[i] + '%)');
    });
  }

  function loadSettings() {
    const s = Object.assign({}, DEFAULTS);
    try {
      const v = JSON.parse(localStorage.getItem(SETTINGS_KEY));
      if (v && typeof v === 'object') {
        if (OPTIONS.theme.some(o => o[0] === v.theme)) s.theme = v.theme;
        if (ACCENTS.some(o => o[0] === v.accent)) s.accent = v.accent;
        if (OPTIONS.city.some(o => o[0] === v.city)) s.city = v.city;
        if (OPTIONS.strict.some(o => o[0] === v.strict)) s.strict = v.strict;
        if (typeof v.weather === 'boolean') s.weather = v.weather;
        if (typeof v.sleep === 'boolean') s.sleep = v.sleep;
        if (Number.isInteger(v.age) && v.age >= 6 && v.age <= 99) s.age = v.age;
        if (TIME_RE.test(v.bed)) s.bed = v.bed;
        if (TIME_RE.test(v.wake)) s.wake = v.wake;
        if (Number.isInteger(v.lesson) && v.lesson >= LESSON_RANGE[0] && v.lesson <= LESSON_RANGE[1]) s.lesson = v.lesson;
        if (Number.isInteger(v.homework) && v.homework >= HW_RANGE[0] && v.homework <= HW_RANGE[1]) s.homework = v.homework;
        ['autoClose', 'compact', 'showWeek', 'showHints'].forEach(k => { if (typeof v[k] === 'boolean') s[k] = v[k]; });
      }
    } catch (e) { /* настроек нет или хранилище недоступно: берём стандартные */ }
    return s;
  }

  // ---------- Погода (Санкт-Петербург, сервис Open-Meteo, ключ не нужен) ----------
  const WEATHER_KEY = 'schedule-weather-v1';
  const weatherUrl = c => 'https://api.open-meteo.com/v1/forecast?latitude=' + c.lat + '&longitude=' + c.lon
    + '&current=temperature_2m,weather_code&daily=weather_code&timezone=Europe%2FMoscow&forecast_days=7';
  let weather = loadWeather();   // { t: время запроса, temp: °C сейчас, code: код сейчас, daily: { 'ГГГГ-ММ-ДД': код } }
  let weatherState = weather ? 'ok' : 'loading';   // 'loading' | 'ok' | 'error'
  let weatherRetries = 0;
  let weatherReq = 0;   // номер последнего запроса: устаревшие ответы игнорируются

  // Код погоды WMO → значок, название и множитель нагрузки дня (1 = не влияет)
  function weatherInfo(code) {
    if (code <= 3) return { icon: ['☀️', '🌤️', '⛅', '☁️'][code], text: ['ясно', 'малооблачно', 'облачно', 'пасмурно'][code], mult: 1 };
    if (code === 45 || code === 48) return { icon: '🌫️', text: 'туман', mult: 1.05 };
    if (code >= 51 && code <= 57) return { icon: '🌦️', text: 'морось', mult: 1.05 };
    if (code === 65 || code === 67 || code === 82) return { icon: '🌧️', text: 'сильный дождь', mult: 1.15 };
    if ((code >= 61 && code <= 66) || code === 80 || code === 81) return { icon: '🌧️', text: 'дождь', mult: 1.1 };
    if (code === 75 || code === 86) return { icon: '❄️', text: 'сильный снег', mult: 1.15 };
    if ((code >= 71 && code <= 77) || code === 85) return { icon: '🌨️', text: 'снег', mult: 1.1 };
    if (code >= 95) return { icon: '⛈️', text: 'гроза', mult: 1.25 };
    return { icon: '🌡️', text: 'погода неизвестна', mult: 1 };
  }
  const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  // Дата ближайшего дня недели с индексом i (сегодня или в ближайшие 6 дней)
  function dateOfDay(i) { const d = new Date(); d.setDate(d.getDate() + (i - todayIdx() + 7) % 7); return ymd(d); }
  function dayWeather(i) {
    if (!settings.weather || !weather || !weather.daily) return null;
    const c = weather.daily[dateOfDay(i)];
    return typeof c === 'number' ? weatherInfo(c) : null;
  }
  const dayMult = i => { const w = dayWeather(i); return w ? w.mult : 1; };

  function loadWeather() {
    if (!settings.weather) return null;
    try {
      const w = JSON.parse(localStorage.getItem(WEATHER_KEY + '-' + settings.city));
      if (w && w.daily && Date.now() - w.t < 6 * 3600 * 1000) return w;   // старше 6 часов не используем
    } catch (e) { /* нет сохранённой погоды */ }
    return null;
  }
  function fetchWeather() {
    if (!settings.weather) return;
    if (!window.fetch) { if (!weather) weatherState = 'error'; render(); return; }
    const city = settings.city, req = ++weatherReq;
    const ctrl = window.AbortController ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 10000) : 0;
    fetch(weatherUrl(CITIES[city]), ctrl ? { signal: ctrl.signal } : undefined)
      .then(r => { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
      .then(j => {
        if (req !== weatherReq) return;   // за это время сменили город или выключили погоду
        const daily = {};
        (j.daily.time || []).forEach((d, i) => { if (typeof j.daily.weather_code[i] === 'number') daily[d] = j.daily.weather_code[i]; });
        weather = { t: Date.now(), temp: j.current.temperature_2m, code: j.current.weather_code, daily };
        weatherState = 'ok'; weatherRetries = 0;
        try { localStorage.setItem(WEATHER_KEY + '-' + city, JSON.stringify(weather)); } catch (e) { /* не страшно */ }
      })
      .catch(() => {
        if (req !== weatherReq) return;
        // нет сети: остаётся последняя сохранённая погода; если её нет, показываем ошибку и пробуем ещё раз
        if (!weather) weatherState = 'error';
        if (weatherRetries++ < 3) setTimeout(fetchWeather, 60 * 1000);
      })
      .then(() => { clearTimeout(timer); render(); });
  }

  // ---------- Данные ----------
  let days = loadDays();                       // 7 списков: { t: тип, n: название, d: сложность, m: минуты }
  const todayIdx = () => (new Date().getDay() + 6) % 7;   // индекс сегодняшнего дня: 0 = Пн ... 6 = Вс
  let sel = todayIdx();     // выбранный день (по умолчанию — сегодня)

  function loadDays() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && Array.isArray(s.days) && s.days.length === 7) {
        return s.days.map(a => Array.isArray(a) ? a
          .filter(it => it && it.d >= 1 && it.d <= 10 && it.m > 0)
          .map(it => {
            const item = { ...it };
            if (item.t === 'Урок' && TIME_RE.test(item.startTime || '')) {
              const endMinutes = toMin(item.startTime) + 45;
              item.endTime = String(Math.floor(endMinutes / 60) % 24).padStart(2, '0') + ':' + String(endMinutes % 60).padStart(2, '0');
              item.m = 45;
            }
            return item;
          }) : []);
      }
    } catch (e) { /* хранилище недоступно — работаем без него */ }
    return [[], [], [], [], [], [], []];
  }
  let storageOk = storageWorks();
  function storageWorks() {
    try { const t = '__test'; localStorage.setItem(t, '1'); localStorage.removeItem(t); return true; }
    catch (e) { return false; }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify({ days })); storageOk = true; }
    catch (e) { storageOk = false; }
    updateNote();
  }
  function updateNote() {
    const w = document.getElementById('storageWarn');
    if (!w) return;
    w.hidden = storageOk;
    w.textContent = storageOk ? '' : 'Браузер не разрешает сохранять данные (возможно, включён приватный режим): после закрытия вкладки расписание и настройки пропадут. Сделайте экспорт в CSV, чтобы не потерять расписание.';
  }

  // ---------- Элементы ----------
  const $ = id => document.getElementById(id);
  const form = $('form'), nameEl = $('name'), typeEl = $('type'), minEl = $('min'), diffEl = $('diff');
  const startTimeEl = $('startTime');
  const errorEl = $('error');

  // ---------- Расчёты ----------
  // Нагрузка элемента = сложность × часы. Коэффициент дня = нагрузка дня / порог × 10, не больше 10 (порог 36, в настройках можно сделать мягче или строже).
  // Погода и недосып умножают нагрузку дня: ясно ×1, дождь ×1,1, гроза ×1,25, недосып до ×1,3
  function isPassedLesson(it, dayIdx) {
    if (dayIdx !== todayIdx() || it.t !== 'Урок' || !TIME_RE.test(it.endTime || '')) return false;
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    return currentMinutes >= toMin(it.endTime);
  }
  function activeItems(items, dayIdx) {
    return items.filter(it => !isPassedLesson(it, dayIdx));
  }
  function stats(items, dayIdx) {
    let load = 0, min = 0, dm = 0;
    for (const it of activeItems(items, dayIdx)) { load += it.d * it.m / 60; min += it.m; dm += it.d * it.m; }
    const m = dayIdx === undefined ? 1 : dayMult(dayIdx) * sleepMult();
    return { load, hours: min / 60, avg: min ? dm / min : 0, k: Math.min(10, load * m / loadMax() * 10), mult: m };
  }
  const kClass = k => (k < 4 ? 'good' : k < 7 ? 'warn' : 'bad');   // зелёный / жёлтый / красный
  const fmt = n => n.toFixed(1).replace('.', ',');

  const TEXT = {
    good: ['Лёгкий день', 'Можно отдохнуть: делайте уроки без спешки и займитесь тем, что нравится.'],
    warn: ['Средний день', 'Выделите вечером время на домашку и не сдвигайте сон.'],
    bad:  ['Тяжёлый день', 'Сил уйдёт много: отдых и сон сегодня важнее новых дел.']
  };

  // ---------- Отрисовка ----------
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function renderTabs() {
    const box = $('tabs');
    box.textContent = '';
    DAYS.forEach((name, i) => {
      const s = stats(days[i], i);
      const b = el('button', 'tab' + (i === sel ? ' active' : ''));
      b.type = 'button';
      b.dataset.day = i;
      b.setAttribute('aria-label', FULL[i] + (i === todayIdx() ? ', сегодня' : ''));
      if (i === todayIdx()) b.classList.add('today');
      b.append(el('span', '', name), el('span', 'k ' + (days[i].length ? kClass(s.k) : 'none'), days[i].length ? fmt(s.k) : '–'));
      box.appendChild(b);
    });
  }

  function fmtTemp(t) {
    const r = Math.round(t);
    return (r > 0 ? '+' + r : r < 0 ? '\u2212' + Math.abs(r) : '0') + ' °C';
  }
  function renderWeather() {
    const box = $('weather');
    box.textContent = '';
    if (!settings.weather) { box.hidden = true; return; }
    box.hidden = false;
    if (!weather) {
      if (weatherState === 'loading') { box.appendChild(el('div', 'w-now', 'Загружаю погоду…')); return; }
      box.appendChild(el('div', 'w-day', 'Погоду загрузить не удалось: нет интернета или сайт открыт в режиме предпросмотра. Коэффициент считается без погоды.'));
      const retry = el('button', 'btn ghost', 'Повторить');
      retry.type = 'button';
      retry.style.marginTop = '8px';
      retry.addEventListener('click', () => { weatherState = 'loading'; weatherRetries = 0; render(); fetchWeather(); });
      box.appendChild(retry);
      return;
    }
    const now = weatherInfo(weather.code);
    box.appendChild(el('div', 'w-now', now.icon + ' ' + CITIES[settings.city].name + ': сейчас ' + fmtTemp(weather.temp) + ', ' + now.text));
    const w = dayWeather(sel);
    if (w) {
      const note = w.mult > 1 ? 'нагрузка дня +' + Math.round((w.mult - 1) * 100) + '%' : 'на сложность не влияет';
      box.appendChild(el('div', 'w-day' + (w.mult > 1 ? ' bad' : ''), FULL[sel] + ': ' + w.icon + ' ' + w.text + ', ' + note));
    }
  }

  // ---------- Обзор недели ----------
  // Серии тяжёлых дней подряд (неделя повторяется, поэтому воскресенье идёт перед понедельником)
  function heavyRuns(heavy) {
    if (heavy.every(Boolean)) return [];
    const runs = [];
    for (let i = 0; i < 7; i++) {
      if (heavy[i] && !heavy[(i + 6) % 7]) {
        const run = [];
        for (let j = i; heavy[j % 7] && run.length < 7; j++) run.push(j % 7);
        if (run.length >= 2) runs.push(run);
      }
    }
    return runs;
  }
  function weekSummary() {
    const ks = days.map((items, i) => (items.length ? stats(items, i) : null));
    const filled = [];
    ks.forEach((st, i) => { if (st) filled.push({ i, k: st.k, hours: st.hours }); });
    if (!filled.length) return null;
    const avg = filled.reduce((a, d) => a + d.k, 0) / filled.length;
    const heavy = ks.map(st => !!st && st.k >= 7);
    const byK = filled.slice().sort((a, b) => a.k - b.k);
    return {
      ks, filled, avg,
      heavyCount: heavy.filter(Boolean).length,
      allHeavy: heavy.every(Boolean),
      runs: heavyRuns(heavy),
      hours: filled.reduce((a, d) => a + d.hours, 0),
      heaviest: byK[byK.length - 1],
      lightest: byK[0]
    };
  }
  function renderWeek() {
    const card = $('weekCard');
    const w = weekSummary();
    card.hidden = !w || !settings.showWeek;
    if (card.hidden) return;

    const bars = $('weekBars');
    bars.textContent = '';
    DAYS.forEach((name, i) => {
      const st = w.ks[i];
      const b = el('button', 'wbar' + (i === sel ? ' sel' : '') + (i === todayIdx() ? ' today' : ''));
      b.type = 'button';
      b.setAttribute('aria-pressed', String(i === sel));
      b.setAttribute('aria-label', FULL[i] + (st ? ', коэффициент ' + fmt(st.k) : ', дел нет'));
      const fill = el('span', 'wfill ' + (st ? kClass(st.k) : 'none'));
      if (st) fill.style.height = Math.max(4, st.k * 10) + '%';
      const track = el('span', 'wtrack');
      track.appendChild(fill);
      b.append(el('span', 'wval', st ? fmt(st.k) : '–'), track, el('span', 'wname', name));
      b.addEventListener('click', () => { sel = i; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
      bars.appendChild(b);
    });

    const meta = $('weekMeta');
    meta.textContent = '';
    const stat = (value, label, cls) => { const d = el('div'); d.append(el('b', cls || '', value), el('span', '', label)); meta.appendChild(d); };
    stat(fmt(w.avg), 'средний коэффициент', kClass(w.avg));
    stat(String(w.heavyCount), 'тяжёлых дней');
    stat(fmt(w.hours), 'часов за неделю');

    const line = $('weekLine');
    line.textContent = w.filled.length > 1
      ? 'Тяжелее всего: ' + FULL[w.heaviest.i] + ' (' + fmt(w.heaviest.k) + '). Легче всего: ' + FULL[w.lightest.i] + ' (' + fmt(w.lightest.k) + ').'
      : 'Заполните остальные дни, чтобы увидеть неделю целиком.';

    const hints = $('weekHints');
    hints.textContent = '';
    if (!settings.showHints) return;
    if (w.allHeavy) {
      hints.appendChild(el('div', 'hint', 'Все дни недели тяжёлые: отдыхать почти некогда. Проверьте, что можно убрать или сдвинуть.'));
    }
    w.runs.forEach(run => {
      hints.appendChild(el('div', 'hint', 'Тяжёлые дни идут подряд: ' + run.map(i => DAYS[i]).join(', ') + '. Оставьте между ними время на отдых.'));
    });
    if (w.heaviest.k >= 7 && w.lightest.i !== w.heaviest.i && w.heaviest.k - w.lightest.k >= 2) {
      hints.appendChild(el('div', 'hint', 'Часть дел из дня «' + FULL[w.heaviest.i] + '» можно сделать заранее в более лёгкий день: ' + FULL[w.lightest.i] + '.'));
    }
    if (w.filled.length > 1 && w.heavyCount === 0) {
      hints.appendChild(el('p', 'muted', 'Тяжёлых дней нет: нагрузка на неделю распределена спокойно.'));
    }
  }

  function renderPie(items, total) {
    const svg = $('pie');
    svg.textContent = '';
    if (!items.length || total <= 0) {
      const c = document.createElementNS(SVG, 'circle');
      c.setAttribute('cx', 21); c.setAttribute('cy', 21); c.setAttribute('r', 15.915);
      c.setAttribute('fill', 'none'); c.setAttribute('stroke-width', 6);
      c.setAttribute('stroke', 'var(--line)');
      svg.appendChild(c);
      return;
    }
    const mk = (pct, off, color) => {
      const c = document.createElementNS(SVG, 'circle');
      c.setAttribute('cx', 21); c.setAttribute('cy', 21); c.setAttribute('r', 15.915);
      c.setAttribute('fill', 'none'); c.setAttribute('stroke-width', 6);
      c.setAttribute('stroke', color);
      c.setAttribute('stroke-dasharray', pct + ' ' + (100 - pct));
      c.setAttribute('stroke-dashoffset', 25 - off);   // старт сверху
      return c;
    };
    svg.appendChild(mk(100, 0, 'var(--line)'));
    let off = 0;
    items.forEach((it, i) => {
      const pct = it.d * it.m / 60 / total * 100;
      svg.appendChild(mk(Math.max(pct - (items.length > 1 ? 0.6 : 0), 0.01), off, COLORS[i % COLORS.length]));
      off += pct;
    });
  }

  // Средневзвешенный балл предмета из MarkIt
  function getSubjectGrade(lessonName) {
    try {
      const saved = localStorage.getItem('markit_data_v3');
      if (!saved) return null;

      const data = JSON.parse(saved);
      if (!data || !data.subjects || typeof data.subjects !== 'object') return null;

      function normalizeName(name) {
        return String(name)
          .replace(/\([^)]*\)|\[[^\]]*\]|\{[^}]*\}/g, ' ')
          .toLowerCase()
          .replace(/[^a-zа-яё0-9]+/gi, ' ')
          .trim()
          .replace(/\s+/g, ' ');
      }

      const normalizedLesson = normalizeName(lessonName);
      if (!normalizedLesson) return null;

      const subjects = Object.entries(data.subjects);
      let match = subjects.find(([name]) => normalizeName(name) === normalizedLesson);

      if (!match) {
        const firstFour = normalizedLesson.replace(/\s/g, '').slice(0, 4);
        if (!firstFour) return null;
        match = subjects.find(([name]) =>
          normalizeName(name).replace(/\s/g, '').startsWith(firstFour)
        );
      }

      if (!match || !Array.isArray(match[1])) return null;

      let weightedSum = 0;
      let totalWeight = 0;

      match[1].forEach(item => {
        if (!item) return;
        const grade = Number(item.grade);
        const weight = Number(item.weight);
        if (
          Number.isFinite(grade) && grade >= 2 && grade <= 5 &&
          Number.isFinite(weight) && weight > 0
        ) {
          weightedSum += grade * weight;
          totalWeight += weight;
        }
      });

      return totalWeight > 0 ? weightedSum / totalWeight : null;
    } catch (error) {
      console.error('Ошибка получения среднего балла MarkIt:', error);
      return null;
    }
  }

  function render() {
    const items = days[sel], s = stats(items, sel), has = items.length > 0;
    renderTabs();
    renderWeather();
    renderWeek();
    $('dayTitle').textContent = FULL[sel];
    $('empty').hidden = has;
    $('result').hidden = !has;
    $('listCard').hidden = !has;
    $('clear').hidden = !has;
    if (!has) return;

    const cls = kClass(s.k);
    $('k').textContent = fmt(s.k);
    $('k').className = 'num ' + cls;
    $('verdict').textContent = TEXT[cls][0];
    $('advice').textContent = TEXT[cls][1];
    $('hours').textContent = fmt(s.hours);
    $('avg').textContent = fmt(s.avg);

    // Подсказки: тяжёлый завтрашний день и риск для сна
    const hints = $('hints');
    hints.textContent = '';
    if (settings.showHints) {
      const next = stats(days[(sel + 1) % 7], (sel + 1) % 7);
      if (days[(sel + 1) % 7].length && next.k >= 7 && s.k < 7) {
        hints.appendChild(el('div', 'hint', 'Завтра тяжёлый день (' + fmt(next.k) + '): сделайте часть уроков заранее, сегодня.'));
      }
      const w = dayWeather(sel);
      if (w && w.mult > 1) {
        hints.appendChild(el('div', 'hint', 'Погода (' + w.text + ') увеличила нагрузку дня на ' + Math.round((w.mult - 1) * 100) + '%.'));
      }
      const sl = sleepInfo();
      if (sl && sl.deficit > 0) {
        hints.appendChild(el('div', 'hint', 'Недосып: вы спите ' + fmtDur(sl.dur) + ', а для вашего возраста нужно ' + sl.lo + '–' + sl.hi + ' часов. Нагрузка дня увеличена на ' + Math.round((sl.mult - 1) * 100) + '%.'));
      }
      if (s.hours > 9) {
        hints.appendChild(el('div', 'hint', 'Занято больше 9 часов. Следите, чтобы хватило времени на сон (' + sleepNormText() + ' часов).'));
      }
    }

    const currentItems = activeItems(items, sel);
    renderPie(currentItems, s.load);

    // Список дел: завершённые уроки остаются в расписании, но не входят в расчёт
    const list = $('list');
    list.textContent = '';
    items.forEach((it, i) => {
      const passed = isPassedLesson(it, sel);
      const share = !passed && s.load > 0 ? Math.round(it.d * it.m / 60 / s.load * 100) : 0;
      const row = el('div', 'row');
      if (passed) row.style.opacity = '0.55';
      const sw = el('span', 'sw');
      sw.style.background = COLORS[i % COLORS.length];
      const info = el('div');
      let details = it.m + ' мин';
      if (it.t === 'Урок' && TIME_RE.test(it.startTime || '') && TIME_RE.test(it.endTime || '')) details = it.startTime + '–' + it.endTime;
      if (passed) details += ' · урок завершён';
      const title = el('div', 't', it.n);
      if (it.t === 'Урок') {
        const avg = getSubjectGrade(it.n);
        if (avg !== null && Number.isFinite(avg)) {
          const hue = ((Math.max(2, Math.min(5, avg)) - 2) / 3) * 120;
          const color = 'hsl(' + hue + ', 75%, 42%)';
          const gradeBadge = document.createElement('span');
          gradeBadge.textContent = '[' + avg.toFixed(2).replace('.', ',') + ']';
          gradeBadge.style.fontWeight = '700';
          gradeBadge.style.color = color;
          gradeBadge.style.marginLeft = '4px';
          title.appendChild(gradeBadge);
        }
      }
      info.append(title, el('div', 'm', it.t + ' · ' + details + (passed ? '' : ' · ' + share + '% нагрузки')));
      const pill = el('span', 'pill ' + (it.d <= 3 ? 'good' : it.d <= 6 ? 'warn' : 'bad'), it.d);
      pill.title = 'Сложность';
      const del = el('button', 'icon-btn', '✕');
      del.type = 'button';
      del.dataset.i = i;
      del.setAttribute('aria-label', 'Удалить: ' + it.n);
      row.append(sw, info, pill, del);
      list.appendChild(row);
    });
  }

  // Обновляем список дел, если оценки изменены в окне MarkIt этого же планера.
  window.addEventListener('markit-data-updated', render);

  // ---------- Обработчики ----------
  $('tabs').addEventListener('click', e => {
    const b = e.target.closest('button[data-day]');
    if (b) { sel = Number(b.dataset.day); render(); }
  });

  diffEl.addEventListener('input', () => { $('diffVal').textContent = diffEl.value; });
  [nameEl, minEl].forEach(x => x.addEventListener('input', () => { errorEl.textContent = ''; }));

  // Добавление в выбранный день
  const hasOwnTime = () => typeEl.value === 'Кружок';
  function syncType() {
    const type = typeEl.value;
    const isLesson = type === 'Урок';
    const own = hasOwnTime();
    $('startTimeWrap').hidden = !isLesson;
    $('minWrap').hidden = !own;
    $('typeWrap').classList.toggle('full', !own);
    startTimeEl.required = isLesson;
    errorEl.textContent = '';
  }
  typeEl.addEventListener('change', syncType);
  [nameEl, minEl, startTimeEl].forEach(x => x.addEventListener('input', () => { errorEl.textContent = ''; }));

  form.addEventListener('submit', e => {
    e.preventDefault();
    const t = typeEl.value;
    let m = t === 'Урок' ? 45 : settings.homework;
    let lessonData = {};

    if (t === 'Урок') {
      const startTime = startTimeEl.value;
      if (!TIME_RE.test(startTime || '')) {
        errorEl.textContent = 'Укажите время начала урока.';
        startTimeEl.focus();
        return;
      }
      const endMinutes = toMin(startTime) + 45;
      const endTime = String(Math.floor(endMinutes / 60) % 24).padStart(2, '0') + ':' + String(endMinutes % 60).padStart(2, '0');
      lessonData = { startTime, endTime };
    } else if (hasOwnTime()) {
      m = Number(minEl.value);
      if (!Number.isInteger(m) || m < 5 || m > 600) {
        errorEl.textContent = 'Длительность — целое число минут от 5 до 600.';
        minEl.focus();
        return;
      }
    }

    const added = nameEl.value.trim() || t;
    days[sel].push({ t, n: added, d: Number(diffEl.value), m, ...lessonData });
    save();
    errorEl.textContent = '';
    nameEl.value = '';
    render();
    if (settings.autoClose) { closeAdd(); return; }
    nameEl.focus();
    $('addOk').textContent = 'Добавлено в день «' + FULL[sel] + '»: ' + added + '. Дел в этот день: ' + days[sel].length + '.';
  });

  // ---------- Окно «Добавить дело» ----------
  const addBack = $('addBackdrop'), segDay = $('segDay');
  let addFocus = null;
  DAYS.forEach((name, i) => {
    const b = el('button', '', name);
    b.type = 'button';
    b.dataset.val = i;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-label', FULL[i]);
    b.addEventListener('click', () => { sel = i; $('addOk').textContent = ''; render(); markDay(); });
    segDay.appendChild(b);
  });
  function markDay() {
    segDay.querySelectorAll('button').forEach(b => b.setAttribute('aria-checked', String(Number(b.dataset.val) === sel)));
  }
  function openAdd() {
    addFocus = document.activeElement;
    $('addOk').textContent = '';
    errorEl.textContent = '';
    markDay();
    addBack.hidden = false;
    document.body.style.overflow = 'hidden';
    $('addClose').focus();
  }
  function closeAdd() {
    addBack.hidden = true;
    document.body.style.overflow = '';
    if (addFocus && addFocus.focus) addFocus.focus();
  }
  $('openAdd').addEventListener('click', openAdd);
  $('addClose').addEventListener('click', closeAdd);
  addBack.addEventListener('click', e => { if (e.target === addBack) closeAdd(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !addBack.hidden) closeAdd(); });

  // Удаление одного элемента
  $('list').addEventListener('click', e => {
    const b = e.target.closest('button[data-i]');
    if (!b) return;
    days[sel].splice(Number(b.dataset.i), 1);
    save();
    render();
  });

  // «Очистить день»: первое нажатие просит подтвердить, второе — стирает
  const clearBtn = $('clear');
  let timer = null;
  function disarm() {
    clearTimeout(timer); timer = null;
    clearBtn.classList.remove('armed');
    clearBtn.textContent = 'Очистить день';
  }
  clearBtn.addEventListener('click', () => {
    if (timer === null) {
      clearBtn.classList.add('armed');
      clearBtn.textContent = 'Точно очистить?';
      timer = setTimeout(disarm, 3000);
    } else {
      disarm();
      days[sel] = [];
      save();
      render();
    }
  });
  $('tabs').addEventListener('click', disarm);

  // Пример недели, чтобы сразу увидеть, как всё работает
  $('sample').addEventListener('click', () => {
    const U = (n, d, m = settings.lesson) => ({ t: 'Урок', n, d, m });
    const K = (n, d, m) => ({ t: 'Кружок', n, d, m });
    const H = (d, m) => ({ t: 'Домашка', n: 'Домашнее задание', d, m });
    days = [
      [U('Математика', 7), U('Физика', 8), U('Русский', 5), U('История', 4), K('Робототехника', 6, 90), H(7, 90)],
      [U('Математика', 7), U('Химия', 7), U('Английский', 5), U('Физкультура', 2), H(5, 60)],
      [U('Физика', 8), U('Литература', 4), U('Информатика', 6), U('Биология', 5), K('Музыка', 5, 60), H(7, 90)],
      [U('Русский', 5), U('География', 3), U('Обществознание', 4), U('Физкультура', 2), H(4, 45)],
      [U('Математика', 7), U('Физика', 8), U('Химия', 7), U('Английский', 5), K('Плавание', 4, 90), H(6, 60)],
      [K('Робототехника', 6, 90), H(5, 60)],
      [H(6, 90)]
    ];
    save();
    render();
  });

  // ===== Экспорт и импорт CSV =====
  const DELIM = ';';   // «;» корректно открывается в Excel и Numbers с русскими настройками; при импорте разделитель определяется сам
  const NL = String.fromCharCode(10), CR = String.fromCharCode(13), TAB = String.fromCharCode(9);
  const QUOT = String.fromCharCode(34), APOS = String.fromCharCode(39), BOM = String.fromCharCode(0xFEFF);
  const ioMsg = $('ioMsg');
  const say = (text, ok) => { ioMsg.textContent = text; ioMsg.className = 'io-msg ' + (ok ? 'ok' : 'err'); };

  // Ячейка CSV: кавычки при необходимости + защита от формул в Excel (= + - @)
  function csvCell(v) {
    let s = String(v);
    if (/^[=+@-]/.test(s) || s[0] === TAB || s[0] === CR) s = APOS + s;
    const need = s.includes(QUOT) || s.includes(DELIM) || s.includes(',') || s.includes(NL) || s.includes(CR);
    return need ? QUOT + s.split(QUOT).join(QUOT + QUOT) + QUOT : s;
  }

  function buildCSV() {
    const lines = [['День', 'Тип', 'Название', 'Сложность', 'Минуты'].join(DELIM)];
    days.forEach((items, i) => items.forEach(it => lines.push([DAYS[i], it.t, it.n, it.d, it.m].map(csvCell).join(DELIM))));
    return BOM + lines.join(CR + NL) + CR + NL;   // BOM — чтобы кириллица читалась в Excel
  }

  // Экспорт: опубликованная страница просит у зрителя разрешение на сохранение, локальный файл — обычная загрузка
  $('exp').addEventListener('click', async () => {
    const count = days.reduce((n, d) => n + d.length, 0);
    if (!count) return say('Расписание пустое — экспортировать нечего.', false);
    const csv = buildCSV(), filename = 'расписание.csv';
    try {
      const dl = window.claude ? await window.claude.use('downloads') : null;
      if (dl) {
        await dl.save({ filename, data: csv });
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      }
      say('Экспортировано записей: ' + count + '.', true);
    } catch (e) {
      say(e && e.code === 'declined' ? 'Сохранение отменено.' : 'Не удалось сохранить файл.', false);
    }
  });

  // Разбор CSV: кавычки, двойные кавычки внутри ячейки, переносы строк внутри кавычек
  function parseCSV(text, delim) {
    const rows = [];
    let row = [], field = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === QUOT) { if (text[i + 1] === QUOT) { field += QUOT; i++; } else quoted = false; }
        else field += c;
      } else if (c === QUOT) quoted = true;
      else if (c === delim) { row.push(field); field = ''; }
      else if (c === NL || c === CR) {
        if (c === CR && text[i + 1] === NL) i++;
        row.push(field); rows.push(row); row = []; field = '';
      } else field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows.filter(r => r.some(x => x.trim() !== ''));
  }

  // День: Пн / понедельник / 1
  function parseDay(s) {
    s = s.trim().toLowerCase();
    let i = DAYS.findIndex(d => d.toLowerCase() === s);
    if (i < 0) i = FULL.findIndex(d => d.toLowerCase() === s);
    return i >= 0 ? i : (/^[1-7]$/.test(s) ? Number(s) - 1 : -1);
  }
  // Тип: Урок / Кружок / Домашка (пусто = Урок)
  function parseType(s) {
    s = s.trim().toLowerCase();
    if (!s || s.startsWith('урок')) return 'Урок';
    if (s.startsWith('круж')) return 'Кружок';
    if (s.startsWith('дом')) return 'Домашка';
    return null;
  }
  const num = s => Number(String(s).trim().replace(',', '.'));

  function importText(raw) {
    const text = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;
    const first = text.split(NL, 1)[0];
    // Разделитель (; , или табуляция) определяем по первой строке
    const delim = [DELIM, ',', TAB].map(d => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
    const fresh = [[], [], [], [], [], [], []];
    let ok = 0, skipped = 0;
    parseCSV(text, delim).forEach((r, idx) => {
      const di = parseDay(r[0] || '');
      if (di < 0) { if (idx > 0) skipped++; return; }   // первая строка без дня — заголовок
      const t = parseType(r[1] || ''), d = num(r[3]), m = num(r[4]);
      if (ok >= 500 || !t || !Number.isInteger(d) || d < 1 || d > 10 || !Number.isInteger(m) || m < 5 || m > 600) { skipped++; return; }
      const n = String(r[2] || '').trim().replace(/^'(?=[=+@-])/, '').slice(0, 40) || t;
      fresh[di].push({ t, n, d, m });
      ok++;
    });
    if (!ok) return say('Не нашёл подходящих строк. Нужны столбцы: День; Тип; Название; Сложность (1–10); Минуты (5–600).', false);
    if ($('replace').checked) days = fresh; else fresh.forEach((a, i) => days[i].push(...a));
    save();
    render();
    say('Импортировано записей: ' + ok + (skipped ? ', пропущено строк с ошибками: ' + skipped : '') + '.', true);
  }

  $('imp').addEventListener('click', () => $('file').click());
  $('file').addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 1e6) { e.target.value = ''; return say('Файл слишком большой (больше 1 МБ).', false); }
    const r = new FileReader();
    r.onload = () => {
      let t;
      try { t = new TextDecoder('utf-8', { fatal: true }).decode(r.result); }
      catch (err) { t = new TextDecoder('windows-1251').decode(r.result); }   // Excel на Windows сохраняет CSV в этой кодировке
      importText(t);
    };
    r.onerror = () => say('Не удалось прочитать файл.', false);
    r.readAsArrayBuffer(f);
    e.target.value = '';   // чтобы можно было выбрать тот же файл ещё раз
  });
  // Запасной путь: вставить CSV текстом (если выбор файла недоступен)
  $('pasteGo').addEventListener('click', () => {
    const t = $('paste').value.trim();
    if (!t) return say('Вставьте текст CSV в поле выше.', false);
    importText(t);
  });

  // Новый день: если страница осталась открытой за полночь (или вкладку открыли снова), переходим на сегодняшний день
  let lastDate = new Date().toDateString();
  function checkNewDay() {
    const now = new Date().toDateString();
    if (now === lastDate) return;
    lastDate = now;
    sel = todayIdx();
    render();
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkNewDay(); });
  window.addEventListener('focus', checkNewDay);
  setInterval(checkNewDay, 60000);   // и проверка раз в минуту

  // Запоминаем начало текущей учебной недели. Состояние урока не сохраняется как «навсегда завершённое»:
  // поэтому в новую неделю уроки автоматически снова активны в свой день.
  const WEEK_KEY = 'schedule-last-monday-v1';
  function getMondayTimestamp(date = new Date()) {
    const monday = new Date(date);
    monday.setHours(0, 0, 0, 0);
    monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
    return monday.getTime();
  }
  function checkNewWeek() {
    const mondayTimestamp = getMondayTimestamp();
    let savedTimestamp = null;
    try { savedTimestamp = Number(localStorage.getItem(WEEK_KEY)); } catch (e) {}
    if (savedTimestamp !== mondayTimestamp) {
      try { localStorage.setItem(WEEK_KEY, String(mondayTimestamp)); } catch (e) {}
      render();
    }
  }
  checkNewWeek();
  setInterval(checkNewWeek, 60000);

  // ---------- Настройки: применение и окно ----------
  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* не страшно */ }
  }
  function applySettings() {
    const r = document.documentElement;
    if (settings.theme === 'auto') { r.removeAttribute('data-theme'); r.style.colorScheme = ''; }
    else { r.setAttribute('data-theme', settings.theme); r.style.colorScheme = settings.theme; }
    r.setAttribute('data-accent', settings.accent);
    if (settings.compact) r.setAttribute('data-compact', ''); else r.removeAttribute('data-compact');
    updatePalette();
  }
  // После смены города или переключателя погоды: берём сохранённую погоду нового города и запрашиваем свежую
  function weatherReset() {
    weatherReq++;
    weather = loadWeather();
    weatherState = weather ? 'ok' : 'loading';
    weatherRetries = 0;
    render();
    fetchWeather();
  }
  function setSetting(key, value) {
    settings[key] = value;
    saveSettings();
    applySettings();
    renderSettings();
    if (key === 'city' || key === 'weather') weatherReset(); else render();
  }
  function buildSettings() {
    [['segTheme', 'theme'], ['segCity', 'city'], ['segStrict', 'strict']].forEach(([id, key]) => {
      OPTIONS[key].forEach(([val, label]) => {
        const b = el('button', '', label);
        b.type = 'button'; b.dataset.val = val;
        b.setAttribute('role', 'radio');
        b.addEventListener('click', () => setSetting(key, val));
        $(id).appendChild(b);
      });
    });
    ACCENTS.forEach(([val, label, color]) => {
      const b = el('button', 'swatch');
      b.type = 'button'; b.dataset.val = val;
      const dot = el('span', 'dot');
      dot.style.background = color;
      b.append(dot, el('span', '', label));
      b.setAttribute('role', 'radio');
      b.addEventListener('click', () => setSetting('accent', val));
      $('swatches').appendChild(b);
    });
    $('swWeather').addEventListener('click', () => setSetting('weather', !settings.weather));
    $('swSleep').addEventListener('click', () => setSetting('sleep', !settings.sleep));
    [['swCompact', 'compact'], ['swWeek', 'showWeek'], ['swHints', 'showHints'], ['swClose', 'autoClose']].forEach(([id, key]) => {
      $(id).addEventListener('click', () => setSetting(key, !settings[key]));
    });
    [['lessonMin', 'lesson', LESSON_RANGE], ['hwMin', 'homework', HW_RANGE]].forEach(([id, key, range]) => {
      $(id).addEventListener('input', () => {
        const v = Number($(id).value);
        if (Number.isInteger(v) && v >= range[0] && v <= range[1]) setSetting(key, v);
      });
      $(id).addEventListener('change', syncDurInputs);   // ушли из поля с неверным числом: вернуть сохранённое значение
    });
    ['input', 'change'].forEach(ev => {
      $('age').addEventListener(ev, () => {
        const v = Number($('age').value);
        setSetting('age', Number.isInteger(v) && v >= 6 && v <= 99 ? v : null);
      });
      ['bed', 'wake'].forEach(id => $(id).addEventListener(ev, () => {
        const v = $(id).value;
        if (TIME_RE.test(v)) setSetting(id, v);
      }));
    });
  }
  // Подставляет сохранённые значения в поля (при вводе поля не перезаписываются)
  function syncSleepInputs() {
    $('age').value = settings.age === null ? '' : settings.age;
    $('bed').value = settings.bed;
    $('wake').value = settings.wake;
  }
  function syncDurInputs() {
    $('lessonMin').value = settings.lesson;
    $('hwMin').value = settings.homework;
  }
  function renderSleepInfo() {
    const box = $('sleepInfo');
    if (!settings.sleep) { box.textContent = ''; return; }
    if (!settings.age) { box.textContent = 'Укажите возраст от 6 до 99 лет, чтобы рассчитать норму сна.'; return; }
    const i = sleepInfo();
    if (!i) { box.textContent = 'Время, когда вы ложитесь и встаёте, не должно совпадать.'; return; }
    box.textContent = 'Вы спите ' + fmtDur(i.dur) + '. Норма для вашего возраста: ' + i.lo + '–' + i.hi + ' часов. '
      + (i.deficit > 0
        ? 'Не хватает ' + fmtDur(Math.round(i.deficit * 60)) + ': нагрузка каждого дня +' + Math.round((i.mult - 1) * 100) + '%.'
        : 'Сна хватает, на коэффициент это не влияет.');
  }
  function renderSettings() {
    [['segTheme', 'theme'], ['segCity', 'city'], ['segStrict', 'strict'], ['swatches', 'accent']].forEach(([id, key]) => {
      $(id).querySelectorAll('button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.val === settings[key])));
    });
    $('swWeather').setAttribute('aria-checked', String(settings.weather));
    $('rowCity').hidden = !settings.weather;
    $('swSleep').setAttribute('aria-checked', String(settings.sleep));
    [['swCompact', 'compact'], ['swWeek', 'showWeek'], ['swHints', 'showHints'], ['swClose', 'autoClose']].forEach(([id, key]) => $(id).setAttribute('aria-checked', String(settings[key])));
    $('rowSleep').hidden = !settings.sleep;
    renderSleepInfo();
    $('strictHelp').textContent = STRICT_HELP[settings.strict];
  }

  const sheetBack = $('sheetBackdrop');
  let lastFocus = null;
  function openSheet() {
    lastFocus = document.activeElement;
    sheetBack.hidden = false;
    document.body.style.overflow = 'hidden';
    $('setClose').focus();
  }
  function closeSheet() {
    sheetBack.hidden = true;
    document.body.style.overflow = '';
    armReset(false);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  $('openSettings').addEventListener('click', openSheet);
  $('setClose').addEventListener('click', closeSheet);
  sheetBack.addEventListener('click', e => { if (e.target === sheetBack) closeSheet(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !sheetBack.hidden) closeSheet(); });

  // Удаление всего расписания: нужно нажать два раза подряд
  let resetArmed = false, resetTimer = 0;
  function armReset(on) {
    resetArmed = on;
    const b = $('resetAll');
    b.classList.toggle('armed', on);
    b.textContent = on ? 'Нажмите ещё раз, чтобы удалить всё' : 'Удалить всё расписание';
    clearTimeout(resetTimer);
    if (on) resetTimer = setTimeout(() => armReset(false), 4000);
  }
  $('resetAll').addEventListener('click', () => {
    if (!resetArmed) { armReset(true); return; }
    days = [[], [], [], [], [], [], []];
    save(); render(); armReset(false);
  });

  // Настройки, изменённые в другой вкладке, применяются и здесь
  window.addEventListener('storage', e => {
    if (e.key === SETTINGS_KEY) { settings = loadSettings(); applySettings(); syncSleepInputs(); syncDurInputs(); renderSettings(); weatherReset(); }
  });

  buildSettings();
  syncType();
  applySettings();
  syncSleepInputs();
  syncDurInputs();
  renderSettings();

  // Если сайт открыт в двух вкладках, изменения из одной появляются в другой
  window.addEventListener('storage', e => { if (e.key === KEY) { days = loadDays(); render(); } });
  // Просим браузер не удалять сохранённые данные при нехватке места
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  render();
  updateNote();
  fetchWeather();
  setInterval(fetchWeather, 30 * 60 * 1000);   // обновлять погоду раз в полчаса
})();


;


(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const mq = matchMedia('(prefers-reduced-motion: reduce)'), still = () => mq.matches;
  // Обёртка над Web Animations API: ничего не делает, если анимации отключены в системе
  const anim = (n, k, o) => {
    if (!n || !n.animate || still()) return null;
    try { return n.animate(k, Object.assign({ duration: 450, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' }, o)); }
    catch (e) { return null; }
  };
  // Следит за изменениями узла: сначала разовый вызов, потом наблюдатель
  const watch = (n, f, o) => {
    if (!n) return null;
    f();
    const mo = new MutationObserver(f);
    mo.observe(n, o || { childList: true });
    return mo;
  };
  const slideIn = [{ opacity: 0, transform: 'translateX(-14px)' }, { opacity: 1, transform: 'none' }];
  const dropIn = [{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'none' }];

  setTimeout(() => document.documentElement.classList.add('a-ready'), 1400);

  // 1. Плашка выбранного дня плавно переезжает на новый день
  const tabs = $('tabs'); let prev = -1;
  watch(tabs, () => {
    const t = [...tabs.children], i = t.findIndex(x => x.classList.contains('active'));
    if (i < 0) return;
    if (prev >= 0 && prev !== i) {
      anim(t[i], [{ transform: 'translateX(' + (t[prev].offsetLeft - t[i].offsetLeft) + 'px)' }, { transform: 'none' }],
        { duration: 480, easing: 'cubic-bezier(.3,1.25,.5,1)', pseudoElement: '::before' });
    }
    prev = i;
  });

  // 2. Коэффициент дня «накручивается» до нового значения
  const k = $('k'); let shown = 0, raf = 0, kmo = null;
  kmo = watch(k, () => {
    const to = parseFloat(k.textContent.replace(',', '.'));
    if (isNaN(to)) return;
    cancelAnimationFrame(raf);
    if (still() || to === shown) { shown = to; return; }
    const from = shown, t0 = performance.now();
    const step = now => {
      const p = Math.min(1, (now - t0) / 800);
      shown = p < 1 ? from + (to - from) * (1 - Math.pow(1 - p, 3)) : to;
      k.textContent = shown.toFixed(1).replace('.', ',');
      if (kmo) kmo.takeRecords();   // свои записи не считаем изменением
      if (p < 1) raf = requestAnimationFrame(step);
    };
    step(t0);
  }, { childList: true, characterData: true, subtree: true });

  // 3. Кольцо диаграммы последовательно «дорисовывается» по секторам
  const pie = $('pie'); let pieSig = '';
  watch(pie, () => {
    const c = [...pie.children];
    const sig = c.map(x => ['stroke-dasharray', 'stroke-dashoffset', 'stroke'].map(a => x.getAttribute(a)).join()).join('|');
    if (sig === pieSig) return;   // перерисовка без изменений (например, обновилась погода) — не повторяем
    pieSig = sig;
    c.slice(1).forEach(x => {
      const to = x.getAttribute('stroke-dasharray'), p = parseFloat(to), off = 25 - parseFloat(x.getAttribute('stroke-dashoffset'));
      anim(x, [{ strokeDasharray: '0 100' }, { strokeDasharray: to }], { duration: Math.max(80, p / 100 * 900), delay: off / 100 * 900, easing: 'linear' });
    });
  });

  // 4. Список дел: строки выезжают по очереди (при добавлении — только новая), при удалении уезжают
  const list = $('list'); let pl = [];
  watch(list, () => {
    const cur = [$('dayTitle').textContent].concat([...list.children].map(r =>
      ((r.querySelector('.t') || {}).textContent || '') + '|' + ((r.querySelector('.pill') || {}).textContent || '')));
    const same = cur.length === pl.length && cur.every((x, i) => x === pl[i]);
    const keep = !same && cur.length > pl.length && pl.every((x, i) => x === cur[i]) ? Math.max(0, pl.length - 1) : 0;
    if (!same) [...list.children].forEach((r, i) => { if (i >= keep) anim(r, slideIn, { delay: Math.min(i - keep, 8) * 50, duration: 420 }); });
    pl = cur;
  });
  list.addEventListener('click', e => {
    const b = e.target.closest('button[data-i]');
    if (!b || b.dataset.go || still()) return;
    e.stopPropagation();   // сначала анимация, потом штатное удаление
    b.disabled = true;
    const a = anim(b.closest('.row'), [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(32px)' }], { duration: 240, easing: 'ease-in', fill: 'forwards' });
    const go = () => { b.disabled = false; b.dataset.go = '1'; b.click(); };
    if (a) a.onfinish = go; else go();
  }, true);

  // 5. Столбики недели вырастают, когда меняются данные
  let ws = '';
  watch($('weekBars'), () => {
    const f = [...document.querySelectorAll('#weekBars .wfill')], s = f.map(x => x.className + x.style.height).join();
    if (s === ws) return;
    ws = s;
    f.forEach((x, i) => anim(x, [{ transform: 'scaleY(0)' }, { transform: 'none' }], { duration: 700, delay: i * 50 }));
  });

  // 6. Подсказки и сообщения мягко появляются
  ['hints', 'weekHints'].forEach(id => {
    const h = $(id); let s = '';
    watch(h, () => {
      const t = h.textContent;
      if (t === s) return;
      s = t;
      [...h.children].forEach((c, i) => anim(c, dropIn, { duration: 380, delay: i * 70 }));
    });
  });
  const io = $('ioMsg');
  watch(io, () => { if (io.textContent) anim(io, dropIn, { duration: 300 }); });

  // 7. Ошибка в форме: поле «потряхивает»
  const er = $('error');
  watch(er, () => {
    if (!er.textContent) return;
    anim($('min'), [{ transform: 'none' }, { transform: 'translateX(-7px)' }, { transform: 'translateX(7px)' }, { transform: 'translateX(-4px)' }, { transform: 'none' }], { duration: 380, easing: 'ease-in-out' });
    anim(er, dropIn, { duration: 280 });
  });

  // 8. Окна (настройки и «Добавить дело»): выезжают снизу (на широком экране всплывают) и так же закрываются
  const wide = matchMedia('(min-width:700px)');
  const sheetFrom = () => wide.matches ? { opacity: 0, transform: 'translateY(18px) scale(.96)' } : { transform: 'translateY(100%)' };
  ['sheetBackdrop', 'addBackdrop'].forEach(id => {
    const sb = $(id); if (!sb) return;
    let open = !sb.hidden;
    watch(sb, () => {
      if (!sb.hidden && !open) {
        anim(sb, [{ opacity: 0 }, { opacity: 1 }], { duration: 280 });
        anim(sb.firstElementChild, [sheetFrom(), { opacity: 1, transform: 'none' }], { duration: 480, easing: 'cubic-bezier(.2,.9,.25,1)' });
      } else if (sb.hidden && open && !still()) {
        // Окно уже скрыто, поэтому анимируем его копию и удаляем после окончания
        const g = sb.cloneNode(true);
        g.hidden = false; g.removeAttribute('id');
        g.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
        g.inert = true; g.setAttribute('aria-hidden', 'true'); g.style.pointerEvents = 'none';
        sb.after(g);
        anim(g, [{ opacity: 1 }, { opacity: 0 }], { duration: 260, fill: 'forwards' });
        anim(g.firstElementChild, [{ opacity: 1, transform: 'none' }, sheetFrom()], { duration: 300, easing: 'ease-in', fill: 'forwards' });
        setTimeout(() => g.remove(), 320);
      }
      open = !sb.hidden;
    }, { attributes: true, attributeFilter: ['hidden'] });
  });

  // 9. Смена темы или цвета: плавный переход, пятна фона не «щёлкают»
  const root = document.documentElement, bg = document.querySelector('.bg');
  const tv = () => (root.getAttribute('data-theme') || '') + '|' + root.getAttribute('data-accent');
  let lt = tv(), tt = 0;
  new MutationObserver(() => {
    const v = tv();
    if (v === lt || still()) { lt = v; return; }
    lt = v;
    root.classList.add('a-theme');
    anim(bg, [{ opacity: .2 }, { opacity: 1 }], { duration: 600 });
    clearTimeout(tt);
    tt = setTimeout(() => root.classList.remove('a-theme'), 600);
  }).observe(root, { attributes: true, attributeFilter: ['data-theme', 'data-accent'] });
})();


;


/* ===== Улучшения для iPhone/iPad без изменения логики планера ===== */
(function () {
  'use strict';
  var root = document.documentElement;
  var standalone = false;
  try {
    standalone = (window.navigator.standalone === true) ||
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  } catch (e) {}

  /* Высота именно видимой области Safari: помогает окнам при открытой клавиатуре. */
  function syncVisualViewport() {
    try {
      var vv = window.visualViewport;
      var h = vv && vv.height ? vv.height : window.innerHeight;
      if (h && isFinite(h)) root.style.setProperty('--ios-visual-height', Math.round(h) + 'px');
    } catch (e) {}
  }
  syncVisualViewport();
  window.addEventListener('resize', syncVisualViewport, { passive: true });
  window.addEventListener('orientationchange', function () { setTimeout(syncVisualViewport, 180); }, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', syncVisualViewport, { passive: true });
    window.visualViewport.addEventListener('scroll', syncVisualViewport, { passive: true });
  }

  /* Не даём прокрутке страницы проходить сквозь затемнение, но сохраняем
     прокрутку содержимого самого окна настроек/добавления дела. */
  ['sheetBackdrop', 'addBackdrop'].forEach(function (id) {
    var backdrop = document.getElementById(id);
    if (!backdrop) return;
    backdrop.addEventListener('touchmove', function (event) {
      if (event.target === backdrop) event.preventDefault();
    }, { passive: false });
  });

  /* На iOS клавиатура иногда перекрывает активное поле внутри модального окна. */
  document.addEventListener('focusin', function (event) {
    var target = event.target;
    if (!target || !target.matches || !target.matches('input, select, textarea')) return;
    setTimeout(function () {
      try {
        var box = target.getBoundingClientRect();
        var visibleH = window.visualViewport ? window.visualViewport.height : window.innerHeight;
        if (box.bottom > visibleH - 18 || box.top < 8) {
          target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      } catch (e) {}
    }, 220);
  });

  /* Подсказка установки показывается только на втором посещении и запоминает закрытие. */
  if (!standalone) {
    try {
      var dismissed = localStorage.getItem('planner-ios-install-hint-dismissed-v1') === '1';
      var visits = parseInt(localStorage.getItem('planner-ios-visits-v1') || '0', 10);
      if (!isFinite(visits) || visits < 0) visits = 0;
      localStorage.setItem('planner-ios-visits-v1', String(Math.min(visits + 1, 20)));
      if (visits >= 1 && !dismissed) {
        var hint = document.createElement('aside');
        hint.className = 'ios-install-hint';
        hint.setAttribute('role', 'note');
        hint.innerHTML = '<span>Можно добавить планер на экран «Домой» через меню «Поделиться» в Safari.</span><button type="button" aria-label="Закрыть подсказку">×</button>';
        hint.style.cssText = 'position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom, 0px));z-index:100;display:flex;align-items:center;gap:12px;padding:12px 14px;border:1px solid var(--line);border-radius:16px;background:var(--card);color:var(--text);box-shadow:0 8px 30px var(--shadow);font:14px/1.4 -apple-system,BlinkMacSystemFont,sans-serif;-webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px);';
        var close = hint.querySelector('button');
        close.style.cssText = 'flex:none;border:0;background:transparent;color:var(--muted);font:24px/1 sans-serif;padding:0 2px;';
        close.addEventListener('click', function () {
          try { localStorage.setItem('planner-ios-install-hint-dismissed-v1', '1'); } catch (e) {}
          hint.remove();
        });
        document.body.appendChild(hint);
      }
    } catch (e) {}
  }
})();


;


/* Калькулятор оценок MarkIt: просмотр, добавление и импорт оценок */
(function () {
  'use strict';

  const STORAGE_KEY = 'markit_data_v3';
  const openBtn = document.getElementById('openCalc');
  const closeBtn = document.getElementById('calcClose');
  const backdrop = document.getElementById('calcBackdrop');
  const termSeg = document.getElementById('calcTermSeg');
  const content = document.getElementById('calcContent');
  const addGradeForm = document.getElementById('addGradeForm');
  const subjectInput = document.getElementById('newGradeSubject');
  const gradeInput = document.getElementById('newGradeValue');
  const weightInput = document.getElementById('newGradeWeight');
  const gradeTermInput = document.getElementById('newGradeTerm');
  const subjectOptions = document.getElementById('markitSubjectOptions');
  const addGradeMessage = document.getElementById('addGradeMessage');
  const importFile = document.getElementById('markitImportFile');
  const importText = document.getElementById('markitImportText');
  const importButton = document.getElementById('importMarkitBtn');
  const importMessage = document.getElementById('importMarkitMessage');

  if (!openBtn || !closeBtn || !backdrop || !termSeg || !content || !addGradeForm || !importButton) {
    console.error('MarkIt: не найдены элементы окна оценок.');
    return;
  }

  function getDefaultTerm() {
    const month = new Date().getMonth() + 1;
    if (month >= 9 && month <= 11) return 1;
    if (month === 12 || month <= 2) return 2;
    return 3;
  }

  let selectedTerm = getDefaultTerm();
  let previousFocus = null;
  let previousBodyOverflow = '';

  function openCalc() {
    previousFocus = document.activeElement;
    gradeTermInput.value = String(selectedTerm === 0 ? getDefaultTerm() : selectedTerm);
    previousBodyOverflow = document.body.style.overflow;
    backdrop.hidden = false;
    document.body.style.overflow = 'hidden';
    renderCalc(selectedTerm);
    closeBtn.focus();
  }

  function closeCalc() {
    backdrop.hidden = true;
    document.body.style.overflow = previousBodyOverflow;
    if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
  }

  openBtn.addEventListener('click', openCalc);
  closeBtn.addEventListener('click', closeCalc);
  backdrop.addEventListener('click', function (event) {
    if (event.target === backdrop) closeCalc();
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && !backdrop.hidden) closeCalc();
  });

  function readMarkitData() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return { subjects: {}, nextId: 1, term: selectedTerm || getDefaultTerm() };
    const data = JSON.parse(saved);
    if (!data || !data.subjects || typeof data.subjects !== 'object' || Array.isArray(data.subjects)) {
      throw new Error('Неверный формат данных MarkIt.');
    }
    if (!Number.isFinite(Number(data.nextId)) || Number(data.nextId) < 1) data.nextId = 1;
    Object.keys(data.subjects).forEach(function (name) {
      if (!Array.isArray(data.subjects[name])) data.subjects[name] = [];
    });
    return data;
  }

  function saveMarkitData(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    renderCalc(selectedTerm);
    updateSubjectOptions(data);
    window.dispatchEvent(new Event('markit-data-updated'));
  }

  function updateSubjectOptions(data) {
    if (!subjectOptions) return;
    subjectOptions.textContent = '';
    Object.keys(data.subjects || {}).sort().forEach(function (name) {
      const option = document.createElement('option');
      option.value = name;
      subjectOptions.appendChild(option);
    });
  }

  function setToolMessage(element, message, state) {
    if (!element) return;
    element.textContent = message;
    if (state) element.dataset.state = state;
    else delete element.dataset.state;
  }

  // Добавление оценки прямо в планере — формат записи совместим с MarkIt.
  addGradeForm.addEventListener('submit', function (event) {
    event.preventDefault();
    const subjectName = subjectInput.value.trim();
    const grade = Number(gradeInput.value);
    const weight = Number(String(weightInput.value).replace(',', '.'));
    const term = Number(gradeTermInput.value);

    if (!subjectName) {
      setToolMessage(addGradeMessage, 'Введите название предмета.', 'error');
      subjectInput.focus();
      return;
    }
    if (![2, 3, 4, 5].includes(grade)) {
      setToolMessage(addGradeMessage, 'Выберите оценку от 2 до 5.', 'error');
      return;
    }
    if (!Number.isFinite(weight) || weight <= 0 || weight > 100) {
      setToolMessage(addGradeMessage, 'Вес должен быть числом больше нуля и не больше 100.', 'error');
      weightInput.focus();
      return;
    }

    try {
      const data = readMarkitData();
      if (!Array.isArray(data.subjects[subjectName])) data.subjects[subjectName] = [];
      let maxId = 0;
      Object.values(data.subjects).forEach(function (entries) {
        entries.forEach(function (item) { maxId = Math.max(maxId, Number(item && item.id) || 0); });
      });
      const nextId = Math.max(Number(data.nextId) || 1, maxId + 1);
      data.subjects[subjectName].push({
        id: nextId,
        subject: '',
        grade: grade,
        weight: weight,
        term: term,
        date: Date.now()
      });
      data.nextId = nextId + 1;
      if (![0, 1, 2, 3].includes(Number(data.term))) data.term = term;
      saveMarkitData(data);
      setToolMessage(addGradeMessage, 'Оценка сохранена.', 'success');
      subjectInput.value = '';
      gradeInput.value = '5';
      weightInput.value = '1';
      gradeTermInput.value = String(selectedTerm === 0 ? getDefaultTerm() : selectedTerm);
    } catch (error) {
      setToolMessage(addGradeMessage, 'Не удалось сохранить оценку. Возможно, хранилище недоступно.', 'error');
      console.error('MarkIt: ошибка сохранения оценки.', error);
    }
  });

  // Файл из резервной копии MarkIt можно выбрать или вставить JSON вручную.
  if (importFile) {
    importFile.addEventListener('change', function () {
      const file = importFile.files && importFile.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function () {
        importText.value = String(reader.result || '');
        setToolMessage(importMessage, 'Файл загружен. Нажмите «Импортировать оценки».', 'success');
      };
      reader.onerror = function () {
        setToolMessage(importMessage, 'Не удалось прочитать файл.', 'error');
      };
      reader.readAsText(file);
    });
  }

  importButton.addEventListener('click', function () {
    let imported;
    try {
      imported = JSON.parse(importText.value.trim());
      if (!imported || !imported.subjects || typeof imported.subjects !== 'object' || Array.isArray(imported.subjects)) {
        throw new Error('В файле не найден список предметов.');
      }
      Object.keys(imported.subjects).forEach(function (name) {
        if (!Array.isArray(imported.subjects[name])) throw new Error('Список оценок предмета повреждён.');
        imported.subjects[name].forEach(function (item) {
          if (!item || !Number.isFinite(Number(item.grade)) || Number(item.grade) < 2 || Number(item.grade) > 5 ||
              !Number.isFinite(Number(item.weight)) || Number(item.weight) <= 0) {
            throw new Error('В копии есть оценка с неверным форматом.');
          }
        });
      });
    } catch (error) {
      setToolMessage(importMessage, 'Не удалось прочитать копию MarkIt. Вставьте полный JSON из кнопки «Копия».', 'error');
      return;
    }

    try {
      const current = readMarkitData();
      let maxId = 0;
      Object.values(current.subjects).forEach(function (entries) {
        entries.forEach(function (item) { maxId = Math.max(maxId, Number(item && item.id) || 0); });
      });
      let added = 0;
      Object.keys(imported.subjects).forEach(function (name) {
        if (!Array.isArray(current.subjects[name])) current.subjects[name] = [];
        const existing = current.subjects[name];
        imported.subjects[name].forEach(function (incoming) {
          const duplicate = existing.some(function (item) {
            return Number(item.id) === Number(incoming.id) &&
              Number(item.grade) === Number(incoming.grade) &&
              Number(item.weight) === Number(incoming.weight) &&
              Number(item.term || getDefaultTerm()) === Number(incoming.term || getDefaultTerm()) &&
              Number(item.date || 0) === Number(incoming.date || 0);
          });
          if (duplicate) return;
          const copy = Object.assign({}, incoming);
          if (!Number.isFinite(Number(copy.id)) || Number(copy.id) <= 0 ||
              Object.values(current.subjects).some(function (entries) {
                return entries.some(function (item) { return Number(item.id) === Number(copy.id); });
              })) {
            copy.id = ++maxId;
          } else {
            maxId = Math.max(maxId, Number(copy.id));
          }
          if (![1, 2, 3].includes(Number(copy.term))) copy.term = getDefaultTerm();
          existing.push(copy);
          added++;
        });
      });
      current.nextId = Math.max(Number(current.nextId) || 1, Number(imported.nextId) || 1, maxId + 1);
      saveMarkitData(current);
      setToolMessage(importMessage, 'Импорт завершён. Добавлено оценок: ' + added + '.', 'success');
    } catch (error) {
      setToolMessage(importMessage, 'Не удалось сохранить импортированные оценки. Проверьте доступность хранилища.', 'error');
      console.error('MarkIt: ошибка импорта.', error);
    }
  });

  function updateTermButtons() {
    termSeg.querySelectorAll('button[data-term]').forEach(function (button) {
      button.setAttribute('aria-checked', String(Number(button.dataset.term) === selectedTerm));
    });
  }

  termSeg.addEventListener('click', function (event) {
    const button = event.target.closest('button[data-term]');
    if (!button) return;
    selectedTerm = Number(button.dataset.term);
    gradeTermInput.value = String(selectedTerm === 0 ? getDefaultTerm() : selectedTerm);
    updateTermButtons();
    renderCalc(selectedTerm);
  });

  // Непрерывный градиент: 2 = красный, 3.5 = жёлтый, 5 = зелёный.
  function getGradeColor(average) {
    const value = Math.max(2, Math.min(5, average));
    const hue = ((value - 2) / 3) * 120;
    return 'hsl(' + hue + ', 75%, 42%)';
  }

  function showMessage(message) {
    content.textContent = '';
    const paragraph = document.createElement('p');
    paragraph.className = 'calc-empty';
    paragraph.textContent = message;
    content.appendChild(paragraph);
  }

  function renderCalc(term) {
    content.textContent = '';
    let data;

    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) {
        showMessage('Нет оценок за выбранный период.');
        return;
      }
      data = JSON.parse(saved);
    } catch (error) {
      showMessage('Не удалось прочитать данные MarkIt.');
      console.error('MarkIt: ошибка чтения данных.', error);
      return;
    }

    if (!data || !data.subjects || typeof data.subjects !== 'object') {
      showMessage('Нет оценок за выбранный период.');
      return;
    }

    const rows = [];
    Object.entries(data.subjects).forEach(function (entry) {
      const name = entry[0];
      const entries = entry[1];
      if (!Array.isArray(entries)) return;

      const grades = entries.filter(function (item) {
        if (!item) return false;
        const grade = Number(item.grade);
        const weight = Number(item.weight);
        if (!Number.isFinite(grade) || grade < 2 || grade > 5) return false;
        if (!Number.isFinite(weight) || weight <= 0) return false;
        return term === 0 || Number(item.term) === term;
      });
      if (grades.length === 0) return;

      let totalWeight = 0;
      let weightedSum = 0;
      grades.forEach(function (item) {
        const grade = Number(item.grade);
        const weight = Number(item.weight);
        weightedSum += grade * weight;
        totalWeight += weight;
      });
      if (totalWeight <= 0) return;
      rows.push({ name: name, average: weightedSum / totalWeight });
    });

    rows.sort(function (a, b) { return a.average - b.average; });
    if (rows.length === 0) {
      showMessage('Нет оценок за выбранный период.');
      return;
    }

    rows.forEach(function (row) {
      const item = document.createElement('div');
      item.className = 'subject-item';

      const name = document.createElement('span');
      name.className = 'subject-item-name';
      name.textContent = row.name;

      const grade = document.createElement('span');
      grade.className = 'subject-item-grade';

      const averageText = document.createElement('span');
      averageText.className = 'grade-average';
      averageText.textContent = row.average.toFixed(2).replace('.', ',');
      averageText.style.color = getGradeColor(row.average);

      const pill = document.createElement('span');
      pill.className = 'pill';
      pill.style.backgroundColor = getGradeColor(row.average);
      pill.setAttribute('aria-hidden', 'true');

      grade.append(averageText, pill);
      item.append(name, grade);
      content.appendChild(item);
    });
  }

  window.addEventListener('storage', function (event) {
    if (event.key === STORAGE_KEY && !backdrop.hidden) renderCalc(selectedTerm);
  });

  updateTermButtons();
  try {
    const initialData = readMarkitData();
    updateSubjectOptions(initialData);
    gradeTermInput.value = String(selectedTerm === 0 ? getDefaultTerm() : selectedTerm);
  } catch (error) {
    console.warn('MarkIt: не удалось подготовить форму оценок.', error);
  }
})();


;


/* Русский / English. Язык хранится отдельно от настроек расписания. */
(function () {
  'use strict';
  var KEY = 'planner-language-v1';
  var lang = 'ru';
  try { lang = localStorage.getItem(KEY) === 'en' ? 'en' : 'ru'; } catch (e) {}
  var root = document.documentElement;
  var sourceText = new WeakMap();
  var renderedText = new WeakMap();
  var sourceAttr = new WeakMap();
  var renderedAttr = new WeakMap();

  var DICT = {
    'Индикатор сложности расписания':'Schedule Difficulty Indicator',
    'Добавьте уроки, кружки и домашку — получите коэффициент сложности дня.':'Add lessons, activities, and homework to calculate your day’s difficulty score.',
    'Настройки':'Settings','Оценки':'Grades','Период оценок':'Grade period','Год':'Year',
    'Нет оценок за выбранный период.':'No grades for the selected period.','Не удалось прочитать данные MarkIt.':'Could not read MarkIt data.',
    '＋ Добавить оценку':'＋ Add grade','⇧ Импорт оценок из MarkIt':'⇧ Import grades from MarkIt','Предмет':'Subject','Оценка':'Grade','Вес':'Weight','Триместр':'Term','1 триместр':'Term 1','2 триместр':'Term 2','3 триместр':'Term 3','Сохранить оценку':'Save grade','Файл резервной копии (необязательно)':'Backup file (optional)','Данные MarkIt':'MarkIt data','Импортировать оценки':'Import grades','Например, Математика':'e.g. Mathematics','Вставьте сюда текст копии MarkIt':'Paste the MarkIt backup text here','В MarkIt нажмите «Копия», затем вставьте сюда весь скопированный JSON. Импорт объединит данные и не удалит существующие оценки.':'In MarkIt, tap “Copy”, then paste the full JSON here. Import merges data and keeps existing grades.','Введите название предмета.':'Enter a subject name.','Выберите оценку от 2 до 5.':'Choose a grade from 2 to 5.','Вес должен быть числом больше нуля и не больше 100.':'Weight must be greater than 0 and no more than 100.','Оценка сохранена.':'Grade saved.','Не удалось сохранить оценку. Возможно, хранилище недоступно.':'Could not save the grade. Storage may be unavailable.','Файл загружен. Нажмите «Импортировать оценки».':'File loaded. Tap “Import grades”.','Не удалось прочитать файл.':'Could not read the file.','Не удалось прочитать копию MarkIt. Вставьте полный JSON из кнопки «Копия».':'Could not read the MarkIt backup. Paste the full JSON from the “Copy” button.','Список оценок предмета повреждён.':'A subject grade list is invalid.','В файле не найден список предметов.':'No subject list found in the file.','В копии есть оценка с неверным форматом.':'The backup contains an invalid grade.','Импорт завершён. Добавлено оценок: ':'Import complete. Grades added: ','Не удалось сохранить импортированные оценки. Проверьте доступность хранилища.':'Could not save imported grades. Check storage availability.','Добавить дело':'Add task','День':'Day','Очистить день':'Clear day',
    'В этом дне пока ничего нет. Нажмите «Добавить дело».':'Nothing planned for this day yet. Tap “Add task”.',
    'Заполнить примером недели':'Fill with sample week','Круговая диаграмма нагрузки дня':'Daily workload pie chart',
    'коэффициент дня из 10':'Daily score out of 10','часов занято':'hours scheduled','средняя сложность':'average difficulty',
    'Из чего состоит день':'Daily breakdown','Неделя целиком':'Whole week','Добавить дело':'Add task','Готово':'Done',
    'Название':'Name','Например, Математика':'e.g. Mathematics','Что это':'Task type','Урок':'Lesson','Кружок':'Activity','Домашка':'Homework',
    'Длительность, мин':'Duration, min','Сложность:':'Difficulty:','Добавить в день':'Add to day','Точно очистить?':'Clear this day?',
    'Внешний вид':'Appearance','Тема':'Theme','Цвет':'Accent color','«Авто» подстраивается под тему устройства.':'“Auto” follows your device’s appearance.',
    'Язык':'Language','Язык интерфейса: русский':'Interface language: Russian','Цветовая тема':'Accent color','День недели':'Day of week','Экран':'Display','Компактный режим':'Compact mode','Показывать «Неделю целиком»':'Show “Whole week”',
    'Показывать подсказки':'Show tips','Компактный режим уменьшает отступы и диаграмму, чтобы на экране помещалось больше. Подсказки — это советы под диаграммой дня и обзором недели.':'Compact mode reduces spacing and chart size so more fits on screen. Tips appear below the daily chart and weekly overview.',
    'Добавление дел':'Adding tasks','Закрывать окно после добавления':'Close the window after adding a task','Урок, мин':'Lesson, min','Домашка, мин':'Homework, min',
    'Это время подставляется само, когда вы добавляете урок или домашку, поэтому в форме его вводить не нужно. Длительность кружка вводится вручную. Уже добавленные дела не меняются.':'These durations are filled in automatically when you add a lesson or homework, so you do not need to enter them in the form. Activity duration is entered manually. Existing tasks are not changed.',
    'Погода':'Weather','Учитывать погоду':'Include weather','Город':'City',
    'Плохая погода увеличивает нагрузку дня: туман и морось ×1,05, дождь и снег ×1,1, сильный дождь и снег ×1,15, гроза ×1,25. Ясная и облачная погода не влияет. Данные:':'Bad weather increases the day’s workload: fog and drizzle ×1.05, rain and snow ×1.1, heavy rain and snow ×1.15, thunderstorms ×1.25. Clear and cloudy weather have no effect. Data:',
    'Сон':'Sleep','Учитывать сон':'Include sleep','Возраст':'Age','Например, 14':'e.g. 14','Ложусь спать':'Bedtime','Встаю':'Wake-up time',
    'Нормы сна (Национальный фонд сна, США): 6–13 лет 9–11 часов, 14–17 лет 8–10, 18–64 года 7–9, от 65 лет 7–8. Если сна меньше нормы, нагрузка каждого дня растёт на 10% за каждый недостающий час (максимум на 30%). Это общие рекомендации, а не медицинский совет.':'Sleep recommendations (National Sleep Foundation, US): ages 6–13: 9–11 hours; 14–17: 8–10; 18–64: 7–9; 65+: 7–8. If you sleep less than recommended, each day’s workload increases by 10% per missing hour (up to 30%). These are general recommendations, not medical advice.',
    'Расчёт':'Calculation','Строгость оценки':'Scoring strictness','Данные':'Data','Экспорт в CSV':'Export CSV','Импорт из CSV':'Import CSV',
    'Заменить текущее':'Replace current schedule','Вставить CSV текстом':'Paste CSV as text','Скачать':'Download','Удалить всё расписание':'Delete entire schedule',
    'Авто':'Auto','Светлая':'Light','Тёмная':'Dark','Синий':'Blue','Бирюзовый':'Teal','Зелёный':'Green','Оранжевый':'Orange','Розовый':'Pink','Фиолетовый':'Purple','Индиго':'Indigo','Графит':'Graphite',
    'Мягкая':'Relaxed','Обычная':'Normal','Строгая':'Strict','Санкт-Петербург':'Saint Petersburg','Москва':'Moscow',
    'Пн':'Mon','Вт':'Tue','Ср':'Wed','Чт':'Thu','Пт':'Fri','Сб':'Sat','Вс':'Sun',
    'Понедельник':'Monday','Вторник':'Tuesday','Среда':'Wednesday','Четверг':'Thursday','Пятница':'Friday','Суббота':'Saturday','Воскресенье':'Sunday',
    'Лёгкий день':'Light day','Можно отдохнуть: делайте уроки без спешки и займитесь тем, что нравится.':'You can take it easy: do your homework without rushing and make time for something you enjoy.',
    'Средний день':'Moderate day','Выделите вечером время на домашку и не сдвигайте сон.':'Set aside time for homework this evening and keep your sleep schedule.',
    'Тяжёлый день':'Demanding day','Сил уйдёт много: отдых и сон сегодня важнее новых дел.':'This day will take a lot of energy: rest and sleep matter more than adding tasks.',
    'Повторить':'Retry','Сегодня':'Today','Загружаю погоду…':'Loading weather…','Погоду загрузить не удалось: нет интернета или сайт открыт в режиме предпросмотра. Коэффициент считается без погоды.':'Could not load weather: there is no internet connection or the site is in preview mode. The score is calculated without weather.',
    'сейчас':'now','ясно':'clear','малооблачно':'mostly clear','облачно':'partly cloudy','пасмурно':'overcast','туман':'fog','морось':'drizzle','сильный дождь':'heavy rain','дождь':'rain','сильный снег':'heavy snow','снег':'snow','гроза':'thunderstorm','погода неизвестна':'unknown weather',
    'на сложность не влияет':'does not affect difficulty','нагрузка дня':'daily workload',
    'Завтра тяжёлый день':'Tomorrow is a demanding day','сделайте часть уроков заранее, сегодня.':'do some homework ahead of time today.',
    'Недосып':'Not enough sleep','Занято больше 9 часов. Следите, чтобы хватило времени на сон':'More than 9 hours are scheduled. Make sure you have enough time to sleep',
    'Сложность':'Difficulty','Удалить:':'Delete:','средний коэффициент':'average score','тяжёлых дней':'demanding days','часов за неделю':'hours this week',
    'Все дни недели тяжёлые: отдыхать почти некогда. Проверьте, что можно убрать или сдвинуть.':'Every day this week is demanding, leaving little time to rest. Check what can be removed or rescheduled.',
    'Тяжёлых дней нет: нагрузка на неделю распределена спокойно.':'There are no demanding days: the weekly workload is well balanced.',
    'Заполните остальные дни, чтобы увидеть неделю целиком.':'Fill in the remaining days to see the full week.',
    'Расписание и настройки хранятся только в вашем браузере на этом устройстве. Чтобы перенести расписание на другое устройство, используйте экспорт в CSV.':'Your schedule and settings are stored only in this browser on this device. To move your schedule to another device, export it to CSV.',
    'Импортировать текст':'Import text','Дел нет':'No tasks','Коэффициент':'Score','Закрыть подсказку':'Dismiss tip',
    'Можно добавить планер на экран «Домой» через меню «Поделиться» в Safari.':'You can add the planner to your Home Screen using the Share menu in Safari.',
    'Расписание пустое — экспортировать нечего.':'The schedule is empty — there is nothing to export.','Сохранение отменено.':'Saving was cancelled.','Не удалось сохранить файл.':'Could not save the file.',
    'Вставьте текст CSV в поле выше.':'Paste CSV text into the field above.','Файл слишком большой (больше 1 МБ).':'The file is too large (over 1 MB).','Не удалось прочитать файл.':'Could not read the file.',
    'Нажмите ещё раз, чтобы удалить всё':'Tap again to delete everything','Укажите возраст от 6 до 99 лет, чтобы рассчитать норму сна.':'Enter an age from 6 to 99 to calculate the recommended sleep duration.',
    'Время, когда вы ложитесь и встаёте, не должно совпадать.':'Bedtime and wake-up time cannot be the same.',
    'Сна хватает, на коэффициент это не влияет.':'You are getting enough sleep; the score is not affected.'
  };

  function translateDynamic(s) {
    var m;
    if ((m = s.match(/^(.+), сегодня$/))) return translateDynamic(m[1]) + ', today';
    if ((m = s.match(/^(.+): сегодня$/))) return translateDynamic(m[1]) + ': today';
    if ((m = s.match(/^(.+), коэффициент (.+)$/))) return translateDynamic(m[1]) + ', score ' + m[2];
    if ((m = s.match(/^(.+), дел нет$/))) return translateDynamic(m[1]) + ', no tasks';
    if ((m = s.match(/^Тяжелее всего: (.+) \((.+)\)\. Легче всего: (.+) \((.+)\)\.$/))) return 'Heaviest day: ' + translateDynamic(m[1]) + ' (' + m[2] + '). Lightest day: ' + translateDynamic(m[3]) + ' (' + m[4] + ').';
    if ((m = s.match(/^Тяжёлые дни идут подряд: (.+)\. Оставьте между ними время на отдых\.$/))) return 'Demanding days are consecutive: ' + m[1].split(', ').map(translateDynamic).join(', ') + '. Leave time to rest between them.';
    if ((m = s.match(/^Часть дел из дня «(.+)» можно сделать заранее в более лёгкий день: (.+)\.$/))) return 'Some tasks from ' + translateDynamic(m[1]) + ' can be done ahead of time on a lighter day: ' + translateDynamic(m[2]) + '.';
    if ((m = s.match(/^Не хватает (.+): нагрузка каждого дня \+(\d+)%\.$/))) return 'You are short by ' + m[1] + ': each day’s workload +' + m[2] + '%.';
    if ((m = s.match(/^(.+): сейчас (.+), (.+)$/))) return translateDynamic(m[1]) + ': ' + m[2] + ', ' + translateDynamic(m[3]);
    if ((m = s.match(/^(.+): (.+), нагрузка дня \+(\d+)%$/))) return translateDynamic(m[1]) + ': ' + translateDynamic(m[2]) + ', daily workload +' + m[3] + '%';
    if ((m = s.match(/^(.+): (.+), на сложность не влияет$/))) return translateDynamic(m[1]) + ': ' + translateDynamic(m[2]) + ', does not affect difficulty';
    if ((m = s.match(/^([^\s]+)\s+(ясно|малооблачно|облачно|пасмурно|туман|морось|сильный дождь|дождь|сильный снег|снег|гроза|погода неизвестна)$/))) return m[1] + ' ' + (DICT[m[2]] || m[2]);
    if ((m = s.match(/^(?:(\d+) ч(?:ас(?:а|ов)?)?\s*)?(?:(\d+) мин(?:ут(?:а|ы)?)?)?$/)) && (m[1] || m[2])) return (m[1] ? m[1] + ' h ' : '') + (m[2] ? m[2] + ' min' : '').trim();
    if ((m = s.match(/^(Урок|Кружок|Домашка) · (\d+) мин · (\d+)% нагрузки$/))) return ({'Урок':'Lesson','Кружок':'Activity','Домашка':'Homework'}[m[1]]) + ' · ' + m[2] + ' min · ' + m[3] + '% of workload';
    if ((m = s.match(/^Завтра тяжёлый день \(([^)]+)\): (.+)$/))) return 'Tomorrow is a demanding day (' + m[1] + '): do some homework ahead of time today.';
    if ((m = s.match(/^Погода \((.+)\) увеличила нагрузку дня на (\d+)%\.$/))) return 'Weather (' + translateDynamic(m[1]) + ') increased the day’s workload by ' + m[2] + '%.';
    if ((m = s.match(/^Недосып: вы спите (.+), а для вашего возраста нужно (.+) часов\. Нагрузка дня увеличена на (\d+)%\.$/))) return 'Not enough sleep: you sleep ' + m[1] + ', but your age group needs ' + m[2] + ' hours. The day’s workload increased by ' + m[3] + '%.';
    if ((m = s.match(/^Занято больше 9 часов\. Следите, чтобы хватило времени на сон \((.+) часов\)\.$/))) return 'More than 9 hours are scheduled. Make sure you have enough time to sleep (' + m[1] + ' hours).';
    if ((m = s.match(/^Вы спите (.+)\. Норма для вашего возраста: (.+) часов\. (.+)$/))) {
      var tail = m[3].replace(/^Не хватает (.+): нагрузка каждого дня \+(\d+)%\.$/, 'You are short by $1: each day’s workload +$2%.');
      tail = tail.replace(/^Сна хватает, на коэффициент это не влияет\.$/, 'You are getting enough sleep; the score is not affected.');
      return 'You sleep ' + m[1] + '. Recommended for your age: ' + m[2] + ' hours. ' + tail;
    }
    if ((m = s.match(/^(.+): день считается тяжёлым позже \(10 из 10 при нагрузке (\d+)\)\.$/))) return 'Relaxed: a day is considered demanding later (10/10 at a workload of ' + m[2] + ').';
    if ((m = s.match(/^Обычная: 6 часов дел со сложностью 6 дают 10 из 10 \(нагрузка (\d+)\)\.$/))) return 'Normal: 6 hours of tasks with difficulty 6 give 10/10 (workload ' + m[1] + ').';
    if ((m = s.match(/^Строгая: тяжёлый день наступает раньше \(10 из 10 при нагрузке (\d+)\)\.$/))) return 'Strict: a demanding day is reached sooner (10/10 at a workload of ' + m[1] + ').';
    if ((m = s.match(/^Коэффициент дня из 10$/i))) return 'Daily score out of 10';
    return null;
  }
  function translate(s) {
    if (lang !== 'en') return s;
    var lead=(s.match(/^\s*/) || [''])[0], trail=(s.match(/\s*$/) || [''])[0];
    if (lead.length + trail.length < s.length) { var core=s.slice(lead.length,s.length-trail.length); if (core !== s) return lead + translate(core) + trail; }
    if (Object.prototype.hasOwnProperty.call(DICT, s)) return DICT[s];
    var d = translateDynamic(s);
    if (d !== null) return d;
    if (/^Удалить: /.test(s)) return 'Delete: ' + s.slice('Удалить: '.length);
    if (/^Экспортировано записей: /.test(s)) return s.replace('Экспортировано записей: ', 'Exported records: ').replace(/\.$/, '.');
    if (/^Импортировано записей: /.test(s)) return s.replace('Импортировано записей: ', 'Imported records: ').replace('пропущено строк с ошибками:', 'rows skipped due to errors:');
    if (/^Не нашёл подходящих строк\./.test(s)) return 'No matching rows found. Required columns: Day; Type; Name; Difficulty (1–10); Minutes (5–600).';
    return s;
  }
  function walk(node) {
    if (node.nodeType === 3) {
      var old = renderedText.get(node);
      if (old !== undefined && node.data !== old) sourceText.set(node, node.data);
      if (!sourceText.has(node)) sourceText.set(node, node.data);
      var out = lang === 'en' ? translate(sourceText.get(node)) : sourceText.get(node);
      if (node.data !== out) node.data = out;
      renderedText.set(node, out);
      return;
    }
    if (node.nodeType !== 1) return;
    var attrs = ['aria-label','title','placeholder'];
    for (var i=0;i<attrs.length;i++) {
      var a=attrs[i];
      if (!node.hasAttribute(a)) continue;
      var key=node.tagName+'|'+a;
      var byNode=sourceAttr.get(node);
      if (!byNode) { byNode={}; sourceAttr.set(node,byNode); }
      var renderedByNode=renderedAttr.get(node);
      if (!renderedByNode) { renderedByNode={}; renderedAttr.set(node,renderedByNode); }
      if (renderedByNode[a] !== undefined && node.getAttribute(a) !== renderedByNode[a]) byNode[a]=node.getAttribute(a);
      if (byNode[a] === undefined) byNode[a]=node.getAttribute(a);
      var translated=lang==='en' ? translate(byNode[a]) : byNode[a];
      if (node.getAttribute(a)!==translated) node.setAttribute(a,translated);
      renderedByNode[a]=translated;
    }
    for (var c=node.firstChild;c;c=c.nextSibling) walk(c);
  }
  function apply() {
    root.setAttribute('data-language',lang);
    var btn=document.getElementById('langSwitch');
    if (btn) {
      btn.setAttribute('aria-checked',String(lang==='en'));
    }
    walk(document.body);
    document.documentElement.lang=lang==='en'?'en':'ru';
  }
  var btn=document.getElementById('langSwitch');
  if (btn) btn.addEventListener('click',function(){
    lang=lang==='ru'?'en':'ru';
    try { localStorage.setItem(KEY,lang); } catch(e) {}
    apply();
  });
  apply();
  if (window.MutationObserver) {
    var observer=new MutationObserver(function(records){
      records.forEach(function(r){
        if (r.type==='characterData') walk(r.target);
        else if (r.type==='attributes') walk(r.target);
        else for (var i=0;i<r.addedNodes.length;i++) walk(r.addedNodes[i]);
      });
    });
    observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['aria-label','title','placeholder']});
  }
})();


;


/* Регистрация офлайн-кэша. Сайт должен открываться по HTTPS. */
(function () {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('./sw.js')
      .catch(function (error) {
        console.warn('Не удалось включить офлайн-режим:', error);
      });
  });
})();
