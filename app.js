'use strict';
console.log('HTB Erdwärmesonden app.js v2 loaded');

const STORAGE_PREFIX = 'htb-ews-v2';
const STORAGE_DRAFT = `${STORAGE_PREFIX}-draft`;
const STORAGE_HISTORY = `${STORAGE_PREFIX}-history`;
const STORAGE_SETTINGS = `${STORAGE_PREFIX}-settings`;
const HISTORY_MAX = 60;

const $ = id => document.getElementById(id);
const uid = () => crypto?.randomUUID?.() || ('id_' + Date.now() + '_' + Math.random().toString(16).slice(2));
const clone = v => JSON.parse(JSON.stringify(v));
const h = v => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const pdfSafe = v => String(v ?? '')
  .replace(/[–—]/g, '-')
  .replace(/[•→►▾▸]/g, '-')
  .replace(/₂/g, '2')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');

let _saveTimer = null;

const TAB_KEYS = ['bohren', 'injektion', 'druckprobe', 'uebergabe', 'gas', 'verlauf'];

function dateDE(iso) {
  const s = String(iso || '').trim();
  if (!s) return '';
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : s;
}
function dateTag(d = new Date()) {
  return `${String(d.getDate()).padStart(2, '0')}${String(d.getMonth() + 1).padStart(2, '0')}${d.getFullYear()}`;
}
function val(v) {
  return String(v ?? '').trim() === '' ? '—' : String(v);
}

/* =========================================================
   DEFAULTS
========================================================= */
function defaultSettings() {
  return {
    theme: {
      bg: '#0d2f4f',
      accent: '#ffed00',
      card: '#171718',
      card2: '#202022'
    },
    tabs: {
      bohren: true,
      injektion: true,
      druckprobe: true,
      uebergabe: true,
      gas: true,
      verlauf: true
    }
  };
}

function defaultSchicht() {
  return {
    id: uid(),
    tiefe: '',
    hauptbestandteil: '',
    nebenbestandteil: '',
    eigenschaften: '',
    lagerung: '',
    medium: '',
    wasser: '',
    bemerkungen: ''
  };
}
function defaultBohren() {
  return {
    meta: {
      objekt: '', strasse: '', ort: '', gemeinde: '',
      auftragsnummer: '', bewilligungsnummer: '',
      maschinentyp: '', bohrart: '', bohrmeister: '',
      sondennummer: '', bauleitung: '', koordination: '',
      geologie: '', bohrbeginn: '', bohrende: ''
    },
    ews: { typ: '', laenge: '', probenentnahme: '', injektiontyp: '' },
    schichten: [defaultSchicht()],
    vorkommnisse: {
      gwsp: '', wz: '', sv: '', ar: 'nein',
      kv: '', gasgeruch: 'nein', bemerkungen: ''
    }
  };
}

function defaultInjSonde() {
  return {
    id: uid(),
    nummer: '',
    material: 'PE100-RC',
    typ: 'Duplex 32mm',
    durchmesser: '4x32mm',
    abschnitte: [
      { dm: '', von: '', bis: '', volumen: '' },
      { dm: '', von: '', bis: '', volumen: '' },
      { dm: '', von: '', bis: '', volumen: '' }
    ],
    materialChecks: {
      thermocement: '',
      daemmer: '',
      kies: '',
      bentonit: '',
      sperrrohr: ''
    },
    sollverbrauch: '',
    istverbrauch: '',
    differenz: '',
    bemerkungen: ''
  };
}
function defaultInjektion() {
  return {
    meta: {
      objekt: '', strasse: '', ort: '', auftragsnummer: '',
      geologie: '', bauleitung: '', bohrmeister: '',
      koordination: '', injektiondurch: '', injektionam: ''
    },
    sonden: [defaultInjSonde()]
  };
}

function defaultDpSonde() {
  return {
    id: uid(),
    nummer: '',
    tiefe: '',
    test1: { dauer: '', pruefdruck: '', enddruck: '', bestanden: '' },
    test2: { dauer: '', pruefdruck: '', enddruck: '', bestanden: '' },
    test3: { dauer: '', wasserdruck: '', bestanden: '' },
    bemerkungen: ''
  };
}
function defaultDruckprobe() {
  return {
    meta: {
      objekt: '', gskg: '', ort: '', auftragsnummer: '',
      geologie: '', bauleitung: '', bohrmeister: '',
      koordination: '', geprueftdurch: '', geprueftam: ''
    },
    sonden: [defaultDpSonde()],
    bemerkungen: ''
  };
}

function defaultUebSonde() {
  return {
    id: uid(),
    nummer: '',
    hersteller: '',
    typ: '',
    durchmesser: '',
    nutzlaenge: '',
    dichtigkeit: '',
    zugabe: '',
    verpressung: '',
    mat_bentonit: false,
    mat_daemmer: false,
    mat_thermocem: false,
    abnahme: '',
    verschlossen: '',
    geprueft: ''
  };
}
function defaultUebergabe() {
  return {
    auftraggeber: { name: '', strasse: '', plzort: '', auftragsnummer: '' },
    bauherr: { name: '', strasse: '', plzort: '', bohrmeister: '' },
    sonden: [defaultUebSonde()],
    bemerkungen: ''
  };
}

function defaultGas() {
  return {
    meta: {
      objekt: '', strasse: '', ort: '', auftragsnummer: '',
      bauleitung: '', bohrmeister: '', koordination: '',
      ueberwachung: '', messungdurch: '', messungam: ''
    },
    alarm: {
      low: { gas: '', o2: '19.5', lel: '10', h2s: '10', co: '30' },
      high: { gas: '', o2: '23.5', lel: '20', h2s: '20', co: '60' }
    },
    messungen: [
      { ort: '', gas: '', o2: '', lel: '', h2s: '', co: '' },
      { ort: '', gas: '', o2: '', lel: '', h2s: '', co: '' },
      { ort: '', gas: '', o2: '', lel: '', h2s: '', co: '' }
    ],
    bemerkungen: ''
  };
}

/* =========================================================
   NORMALIZE
========================================================= */
function normalizeSettings(raw) {
  const d = defaultSettings();
  return {
    theme: { ...d.theme, ...(raw?.theme || {}) },
    tabs: { ...d.tabs, ...(raw?.tabs || {}) }
  };
}
function normalizeBohren(raw) {
  const d = defaultBohren();
  return {
    meta: { ...d.meta, ...(raw?.meta || {}) },
    ews: { ...d.ews, ...(raw?.ews || {}) },
    schichten: Array.isArray(raw?.schichten) && raw.schichten.length
      ? raw.schichten.map(s => ({ ...defaultSchicht(), ...s, id: s.id || uid() }))
      : [defaultSchicht()],
    vorkommnisse: { ...d.vorkommnisse, ...(raw?.vorkommnisse || {}) }
  };
}
function normalizeInjektion(raw) {
  const d = defaultInjektion();
  return {
    meta: { ...d.meta, ...(raw?.meta || {}) },
    sonden: Array.isArray(raw?.sonden) && raw.sonden.length
      ? raw.sonden.map(s => ({
          ...defaultInjSonde(),
          ...s,
          id: s.id || uid(),
          abschnitte: Array.isArray(s.abschnitte) && s.abschnitte.length
            ? s.abschnitte.map((a, i) => ({ ...defaultInjSonde().abschnitte[i % 3], ...a }))
            : clone(defaultInjSonde().abschnitte),
          materialChecks: { ...defaultInjSonde().materialChecks, ...(s.materialChecks || {}) }
        }))
      : [defaultInjSonde()]
  };
}
function normalizeDruckprobe(raw) {
  const d = defaultDruckprobe();
  return {
    meta: { ...d.meta, ...(raw?.meta || {}) },
    sonden: Array.isArray(raw?.sonden) && raw.sonden.length
      ? raw.sonden.map(s => ({
          ...defaultDpSonde(),
          ...s,
          id: s.id || uid(),
          test1: { ...defaultDpSonde().test1, ...(s.test1 || {}) },
          test2: { ...defaultDpSonde().test2, ...(s.test2 || {}) },
          test3: { ...defaultDpSonde().test3, ...(s.test3 || {}) }
        }))
      : [defaultDpSonde()],
    bemerkungen: raw?.bemerkungen || ''
  };
}
function normalizeUebergabe(raw) {
  const d = defaultUebergabe();
  return {
    auftraggeber: { ...d.auftraggeber, ...(raw?.auftraggeber || {}) },
    bauherr: { ...d.bauherr, ...(raw?.bauherr || {}) },
    sonden: Array.isArray(raw?.sonden) && raw.sonden.length
      ? raw.sonden.map(s => ({ ...defaultUebSonde(), ...s, id: s.id || uid() }))
      : [defaultUebSonde()],
    bemerkungen: raw?.bemerkungen || ''
  };
}
function normalizeGas(raw) {
  const d = defaultGas();
  return {
    meta: { ...d.meta, ...(raw?.meta || {}) },
    alarm: {
      low: { ...d.alarm.low, ...(raw?.alarm?.low || {}) },
      high: { ...d.alarm.high, ...(raw?.alarm?.high || {}) }
    },
    messungen: Array.isArray(raw?.messungen) && raw.messungen.length
      ? raw.messungen.slice(0, 3).map((m, i) => ({ ...d.messungen[i], ...m }))
      : clone(d.messungen),
    bemerkungen: raw?.bemerkungen || ''
  };
}
function normalizeProto(proto, raw) {
  if (proto === 'bohren') return normalizeBohren(raw);
  if (proto === 'injektion') return normalizeInjektion(raw);
  if (proto === 'druckprobe') return normalizeDruckprobe(raw);
  if (proto === 'uebergabe') return normalizeUebergabe(raw);
  if (proto === 'gas') return normalizeGas(raw);
  return raw;
}

/* =========================================================
   STATE
========================================================= */
const state = {
  settings: defaultSettings(),
  bohren: defaultBohren(),
  injektion: defaultInjektion(),
  druckprobe: defaultDruckprobe(),
  uebergabe: defaultUebergabe(),
  gas: defaultGas()
};

/* =========================================================
   SETTINGS / THEME / TABS
========================================================= */
function applyTheme() {
  const t = state.settings.theme;
  const root = document.documentElement;
  root.style.setProperty('--bg', t.bg);
  root.style.setProperty('--accent', t.accent);
  root.style.setProperty('--card', t.card);
  root.style.setProperty('--card2', t.card2);
}

function syncSettingsUi() {
  $('set-bg').value = state.settings.theme.bg;
  $('set-accent').value = state.settings.theme.accent;
  $('set-card').value = state.settings.theme.card;
  $('set-card2').value = state.settings.theme.card2;

  TAB_KEYS.forEach(k => {
    const el = $(`set-tab-${k}`);
    if (el) el.checked = !!state.settings.tabs[k];
  });
}

function saveSettings() {
  localStorage.setItem(STORAGE_SETTINGS, JSON.stringify(state.settings));
}

function loadSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_SETTINGS) || 'null');
    state.settings = normalizeSettings(raw);
  } catch {
    state.settings = defaultSettings();
  }
  applyTheme();
  syncSettingsUi();
}

function applyTabVisibility() {
  TAB_KEYS.forEach(key => {
    const visible = !!state.settings.tabs[key];
    const btn = document.querySelector(`.tab[data-tab="${key}"]`);
    const pane = $(`tab-${key}`);
    if (btn) btn.hidden = !visible;
    if (pane && !visible) {
      pane.classList.remove('is-active');
      pane.hidden = true;
    }
  });

  const settingsBtn = document.querySelector('.tab[data-tab="settings"]');
  const settingsPane = $('tab-settings');
  if (settingsBtn) settingsBtn.hidden = false;
  if (settingsPane && !document.querySelector('.tab.is-active:not([hidden])')) {
    setActiveTab('settings');
  } else {
    const active = document.querySelector('.tab.is-active');
    if (!active || active.hidden) {
      const firstVisible = document.querySelector('.tab:not([hidden])');
      if (firstVisible) setActiveTab(firstVisible.dataset.tab);
    }
  }
}

function collectSettingsFromUi() {
  state.settings.theme.bg = $('set-bg').value || defaultSettings().theme.bg;
  state.settings.theme.accent = $('set-accent').value || defaultSettings().theme.accent;
  state.settings.theme.card = $('set-card').value || defaultSettings().theme.card;
  state.settings.theme.card2 = $('set-card2').value || defaultSettings().theme.card2;

  TAB_KEYS.forEach(k => {
    state.settings.tabs[k] = !!$(`set-tab-${k}`)?.checked;
  });

  applyTheme();
  saveSettings();
  applyTabVisibility();
}

function hookSettings() {
  ['set-bg', 'set-accent', 'set-card', 'set-card2'].forEach(id => {
    $(id)?.addEventListener('input', collectSettingsFromUi);
    $(id)?.addEventListener('change', collectSettingsFromUi);
  });

  TAB_KEYS.forEach(k => {
    $(`set-tab-${k}`)?.addEventListener('change', collectSettingsFromUi);
  });

  $('btnThemeReset')?.addEventListener('click', () => {
    const d = defaultSettings();
    state.settings.theme = clone(d.theme);
    syncSettingsUi();
    collectSettingsFromUi();
  });

  $('btnTabsAll')?.addEventListener('click', () => {
    TAB_KEYS.forEach(k => { state.settings.tabs[k] = true; });
    syncSettingsUi();
    collectSettingsFromUi();
  });

  $('btnTabsNone')?.addEventListener('click', () => {
    TAB_KEYS.forEach(k => { state.settings.tabs[k] = false; });
    syncSettingsUi();
    collectSettingsFromUi();
    setActiveTab('settings');
  });

  $('btnClearHistory')?.addEventListener('click', () => {
    if (!confirm('Gesamten Verlauf wirklich löschen?')) return;
    localStorage.removeItem(STORAGE_HISTORY);
    renderHistoryList();
  });

  $('btnResetSettings')?.addEventListener('click', () => {
    if (!confirm('Einstellungen wirklich auf Standard zurücksetzen?')) return;
    state.settings = defaultSettings();
    saveSettings();
    syncSettingsUi();
    applyTheme();
    applyTabVisibility();
  });
}

/* =========================================================
   TAB NAV
========================================================= */
function setActiveTab(key) {
  document.querySelectorAll('.tab').forEach(btn => {
    btn.classList.toggle('is-active', btn.dataset.tab === key);
  });
  document.querySelectorAll('.pane').forEach(pane => {
    const on = pane.id === `tab-${key}`;
    pane.classList.toggle('is-active', on);
    pane.hidden = !on;
  });
  if (key === 'verlauf') renderHistoryList();
}

function initTabs() {
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.hidden) return;
      setActiveTab(btn.dataset.tab);
    });
  });
}

/* =========================================================
   FIELD MAPPINGS
========================================================= */
function collectFieldsById(mapping) {
  const out = {};
  mapping.forEach(([id, key]) => {
    const el = $(id);
    if (!el) return;
    out[key] = el.type === 'checkbox' ? !!el.checked : (el.value || '');
  });
  return out;
}
function syncFieldsById(mapping, data) {
  mapping.forEach(([id, key]) => {
    const el = $(id);
    if (!el) return;
    if (el.type === 'checkbox') el.checked = !!data[key];
    else el.value = data[key] || '';
  });
}

const BOHR_META = [
  ['bohr-objekt', 'objekt'], ['bohr-strasse', 'strasse'], ['bohr-ort', 'ort'],
  ['bohr-gemeinde', 'gemeinde'], ['bohr-auftragsnummer', 'auftragsnummer'],
  ['bohr-bewilligungsnummer', 'bewilligungsnummer'], ['bohr-maschinentyp', 'maschinentyp'],
  ['bohr-bohrart', 'bohrart'], ['bohr-bohrmeister', 'bohrmeister'],
  ['bohr-sondennummer', 'sondennummer'], ['bohr-bauleitung', 'bauleitung'],
  ['bohr-koordination', 'koordination'], ['bohr-geologie', 'geologie'],
  ['bohr-bohrbeginn', 'bohrbeginn'], ['bohr-bohrende', 'bohrende']
];
const BOHR_EWS = [
  ['bohr-ewstyp', 'typ'], ['bohr-ewslaenge', 'laenge'],
  ['bohr-probenentnahme', 'probenentnahme'], ['bohr-injektiontyp', 'injektiontyp']
];
const BOHR_VORK = [
  ['bohr-gwsp', 'gwsp'], ['bohr-wz', 'wz'], ['bohr-sv', 'sv'],
  ['bohr-ar', 'ar'], ['bohr-kv', 'kv'], ['bohr-gasgeruch', 'gasgeruch'],
  ['bohr-bemerkungen', 'bemerkungen']
];

const INJ_META = [
  ['inj-objekt', 'objekt'], ['inj-strasse', 'strasse'], ['inj-ort', 'ort'],
  ['inj-auftragsnummer', 'auftragsnummer'], ['inj-geologie', 'geologie'],
  ['inj-bauleitung', 'bauleitung'], ['inj-bohrmeister', 'bohrmeister'],
  ['inj-koordination', 'koordination'], ['inj-injektiondurch', 'injektiondurch'],
  ['inj-injektionam', 'injektionam']
];

const DP_META = [
  ['dp-objekt', 'objekt'], ['dp-gskg', 'gskg'], ['dp-ort', 'ort'],
  ['dp-auftragsnummer', 'auftragsnummer'], ['dp-geologie', 'geologie'],
  ['dp-bauleitung', 'bauleitung'], ['dp-bohrmeister', 'bohrmeister'],
  ['dp-koordination', 'koordination'], ['dp-geprueftdurch', 'geprueftdurch'],
  ['dp-geprueftam', 'geprueftam']
];

const UEB_AG = [
  ['ueb-ag-name', 'name'], ['ueb-ag-strasse', 'strasse'],
  ['ueb-ag-plzort', 'plzort'], ['ueb-ag-auftragsnummer', 'auftragsnummer']
];
const UEB_BH = [
  ['ueb-bh-name', 'name'], ['ueb-bh-strasse', 'strasse'],
  ['ueb-bh-plzort', 'plzort'], ['ueb-bh-bohrmeister', 'bohrmeister']
];

const GAS_META = [
  ['gas-objekt', 'objekt'], ['gas-strasse', 'strasse'], ['gas-ort', 'ort'],
  ['gas-auftragsnummer', 'auftragsnummer'], ['gas-bauleitung', 'bauleitung'],
  ['gas-bohrmeister', 'bohrmeister'], ['gas-koordination', 'koordination'],
  ['gas-ueberwachung', 'ueberwachung'], ['gas-messungdurch', 'messungdurch'],
  ['gas-messungam', 'messungam']
];
const GAS_PARAMS = ['gas', 'o2', 'lel', 'h2s', 'co'];

/* =========================================================
   BOHREN
========================================================= */
function renderSchichten() {
  const body = $('bohr-schichten-body');
  if (!body) return;
  body.innerHTML = state.bohren.schichten.map(s => `
    <tr data-sid="${h(s.id)}">
      <td><input class="mess-input" type="number" step="0.1" value="${h(s.tiefe)}" /></td>
      <td><input class="mess-input" type="text" value="${h(s.hauptbestandteil)}" /></td>
      <td><input class="mess-input" type="text" value="${h(s.nebenbestandteil)}" /></td>
      <td><input class="mess-input" type="text" value="${h(s.eigenschaften)}" /></td>
      <td>
        <select class="mess-input">
          <option value="" ${!s.lagerung ? 'selected' : ''}>—</option>
          <option value="1" ${s.lagerung === '1' ? 'selected' : ''}>1</option>
          <option value="2" ${s.lagerung === '2' ? 'selected' : ''}>2</option>
          <option value="3" ${s.lagerung === '3' ? 'selected' : ''}>3</option>
        </select>
      </td>
      <td>
        <select class="mess-input">
          <option value="" ${!s.medium ? 'selected' : ''}>—</option>
          <option value="N" ${s.medium === 'N' ? 'selected' : ''}>N</option>
          <option value="T" ${s.medium === 'T' ? 'selected' : ''}>T</option>
        </select>
      </td>
      <td>
        <select class="mess-input">
          <option value="" ${!s.wasser ? 'selected' : ''}>—</option>
          <option value="1" ${s.wasser === '1' ? 'selected' : ''}>1</option>
          <option value="2" ${s.wasser === '2' ? 'selected' : ''}>2</option>
          <option value="3" ${s.wasser === '3' ? 'selected' : ''}>3</option>
        </select>
      </td>
      <td><input class="mess-input" type="text" value="${h(s.bemerkungen)}" /></td>
      <td><button class="icon-btn" type="button" data-action="del-schicht" data-sid="${h(s.id)}">×</button></td>
    </tr>
  `).join('');
}
function collectSchichten() {
  const rows = document.querySelectorAll('#bohr-schichten-body tr');
  const out = [];
  rows.forEach(tr => {
    const ins = tr.querySelectorAll('input, select');
    out.push({
      id: tr.dataset.sid || uid(),
      tiefe: ins[0]?.value || '',
      hauptbestandteil: ins[1]?.value || '',
      nebenbestandteil: ins[2]?.value || '',
      eigenschaften: ins[3]?.value || '',
      lagerung: ins[4]?.value || '',
      medium: ins[5]?.value || '',
      wasser: ins[6]?.value || '',
      bemerkungen: ins[7]?.value || ''
    });
  });
  state.bohren.schichten = out.length ? out : [defaultSchicht()];
}
function syncBohren() {
  syncFieldsById(BOHR_META, state.bohren.meta);
  syncFieldsById(BOHR_EWS, state.bohren.ews);
  syncFieldsById(BOHR_VORK, state.bohren.vorkommnisse);
  renderSchichten();
}
function collectBohren() {
  state.bohren.meta = collectFieldsById(BOHR_META);
  state.bohren.ews = collectFieldsById(BOHR_EWS);
  state.bohren.vorkommnisse = collectFieldsById(BOHR_VORK);
  collectSchichten();
}

/* =========================================================
   INJEKTION
========================================================= */
function injMatSelect(field, value) {
  return `
    <select class="field__input" data-f="${field}">
      <option value="" ${!value ? 'selected' : ''}>— wählen —</option>
      <option value="1" ${value === '1' ? 'selected' : ''}>1</option>
      <option value="2" ${value === '2' ? 'selected' : ''}>2</option>
      <option value="3" ${value === '3' ? 'selected' : ''}>3</option>
      <option value="1,2" ${value === '1,2' ? 'selected' : ''}>1+2</option>
      <option value="1,3" ${value === '1,3' ? 'selected' : ''}>1+3</option>
      <option value="2,3" ${value === '2,3' ? 'selected' : ''}>2+3</option>
      <option value="1,2,3" ${value === '1,2,3' ? 'selected' : ''}>alle</option>
    </select>
  `;
}
function renderInjSonden() {
  const host = $('injSondenContainer');
  if (!host) return;
  host.innerHTML = state.injektion.sonden.map((s, idx) => `
    <div class="sonde-card" data-sid="${h(s.id)}">
      <div class="sonde-card__head">
        <div class="sonde-card__title">Sonde ${idx + 1}</div>
        <button class="sonde-card__del" data-action="del-inj-sonde" data-sid="${h(s.id)}" type="button">Entfernen</button>
      </div>

      <div class="form-grid">
        <label class="field"><span class="field__label">Nummer</span><input class="field__input" data-f="nummer" type="text" value="${h(s.nummer)}" /></label>
        <label class="field"><span class="field__label">Sondenmaterial</span><input class="field__input" data-f="material" type="text" value="${h(s.material)}" /></label>
        <label class="field"><span class="field__label">Sondentyp</span><input class="field__input" data-f="typ" type="text" value="${h(s.typ)}" /></label>
        <label class="field"><span class="field__label">Durchmesser</span><input class="field__input" data-f="durchmesser" type="text" value="${h(s.durchmesser)}" /></label>
      </div>

      ${(s.abschnitte || []).map((a, i) => `
        <div class="abschnitt-section">
          <div class="abschnitt-section__title">${i + 1}. Abschnitt</div>
          <div class="form-grid">
            <label class="field"><span class="field__label">Durchmesser [mm]</span><input class="field__input" type="text" value="${h(a.dm)}" /></label>
            <label class="field"><span class="field__label">von [m]</span><input class="field__input" type="number" step="0.1" value="${h(a.von)}" /></label>
            <label class="field"><span class="field__label">bis [m]</span><input class="field__input" type="number" step="0.1" value="${h(a.bis)}" /></label>
            <label class="field"><span class="field__label">Volumen [ltr.]</span><input class="field__input" type="number" step="0.1" value="${h(a.volumen)}" /></label>
          </div>
        </div>
      `).join('')}

      <div class="abschnitt-section">
        <div class="abschnitt-section__title">Material Hauptbestandteil</div>
        <div class="form-grid">
          <label class="field"><span class="field__label">Thermocement</span>${injMatSelect('mat-thermocement', s.materialChecks.thermocement)}</label>
          <label class="field"><span class="field__label">Dämmer</span>${injMatSelect('mat-daemmer', s.materialChecks.daemmer)}</label>
          <label class="field"><span class="field__label">Kies Rundkorn</span>${injMatSelect('mat-kies', s.materialChecks.kies)}</label>
          <label class="field"><span class="field__label">Bentonit-Zement</span>${injMatSelect('mat-bentonit', s.materialChecks.bentonit)}</label>
          <label class="field"><span class="field__label">Sperrrohr</span>${injMatSelect('mat-sperrrohr', s.materialChecks.sperrrohr)}</label>
        </div>
      </div>

      <div class="abschnitt-section">
        <div class="abschnitt-section__title">Materialverbrauch</div>
        <div class="form-grid">
          <label class="field"><span class="field__label">Sollverbrauch [ltr.]</span><input class="field__input" data-f="sollverbrauch" type="number" step="0.1" value="${h(s.sollverbrauch)}" /></label>
          <label class="field"><span class="field__label">Istverbrauch [ltr.]</span><input class="field__input" data-f="istverbrauch" type="number" step="0.1" value="${h(s.istverbrauch)}" /></label>
          <label class="field"><span class="field__label">Differenz [ltr.]</span><input class="field__input" data-f="differenz" type="number" step="0.1" value="${h(s.differenz)}" /></label>
        </div>
      </div>

      <label class="field field--full" style="margin-top:8px">
        <span class="field__label">Bemerkungen</span>
        <textarea class="field__input" data-f="bemerkungen" rows="3">${h(s.bemerkungen)}</textarea>
      </label>
    </div>
  `).join('');
}
function collectInjSonden() {
  const cards = document.querySelectorAll('#injSondenContainer .sonde-card');
  const out = [];
  cards.forEach(card => {
    const gv = sel => card.querySelector(sel)?.value || '';
    const abs = [];
    card.querySelectorAll('.abschnitt-section').forEach((sec, idx) => {
      if (idx > 2) return;
      const ins = sec.querySelectorAll('input');
      abs.push({
        dm: ins[0]?.value || '',
        von: ins[1]?.value || '',
        bis: ins[2]?.value || '',
        volumen: ins[3]?.value || ''
      });
    });

    out.push({
      id: card.dataset.sid || uid(),
      nummer: gv('[data-f="nummer"]'),
      material: gv('[data-f="material"]'),
      typ: gv('[data-f="typ"]'),
      durchmesser: gv('[data-f="durchmesser"]'),
      abschnitte: abs.length ? abs : clone(defaultInjSonde().abschnitte),
      materialChecks: {
        thermocement: gv('[data-f="mat-thermocement"]'),
        daemmer: gv('[data-f="mat-daemmer"]'),
        kies: gv('[data-f="mat-kies"]'),
        bentonit: gv('[data-f="mat-bentonit"]'),
        sperrrohr: gv('[data-f="mat-sperrrohr"]')
      },
      sollverbrauch: gv('[data-f="sollverbrauch"]'),
      istverbrauch: gv('[data-f="istverbrauch"]'),
      differenz: gv('[data-f="differenz"]'),
      bemerkungen: gv('[data-f="bemerkungen"]')
    });
  });
  state.injektion.sonden = out.length ? out : [defaultInjSonde()];
}
function syncInjektion() {
  syncFieldsById(INJ_META, state.injektion.meta);
  renderInjSonden();
}
function collectInjektion() {
  state.injektion.meta = collectFieldsById(INJ_META);
  collectInjSonden();
}

/* =========================================================
   DRUCKPROBE
========================================================= */
function ynSelect(field, value) {
  return `
    <select class="field__input" data-f="${field}">
      <option value="" ${!value ? 'selected' : ''}>— —</option>
      <option value="ja" ${value === 'ja' ? 'selected' : ''}>Ja</option>
      <option value="nein" ${value === 'nein' ? 'selected' : ''}>Nein</option>
    </select>
  `;
}
function renderDpSonden() {
  const host = $('dpSondenContainer');
  if (!host) return;
  host.innerHTML = state.druckprobe.sonden.map((s, idx) => `
    <div class="sonde-card" data-sid="${h(s.id)}">
      <div class="sonde-card__head">
        <div class="sonde-card__title">EWS ${idx + 1}</div>
        <button class="sonde-card__del" data-action="del-dp-sonde" data-sid="${h(s.id)}" type="button">Entfernen</button>
      </div>

      <div class="form-grid">
        <label class="field"><span class="field__label">Sonden Nummer</span><input class="field__input" data-f="nummer" type="text" value="${h(s.nummer)}" /></label>
        <label class="field"><span class="field__label">Tiefe [m]</span><input class="field__input" data-f="tiefe" type="number" step="0.1" value="${h(s.tiefe)}" /></label>
      </div>

      <div class="abschnitt-section">
        <div class="abschnitt-section__title">1. Druckprüfung nach Einbau</div>
        <div class="form-grid">
          <label class="field"><span class="field__label">Prüfdauer [min]</span><input class="field__input" data-f="t1-dauer" type="number" value="${h(s.test1.dauer)}" /></label>
          <label class="field"><span class="field__label">Prüfdruck [bar]</span><input class="field__input" data-f="t1-pruefdruck" type="number" step="0.1" value="${h(s.test1.pruefdruck)}" /></label>
          <label class="field"><span class="field__label">Enddruck [bar]</span><input class="field__input" data-f="t1-enddruck" type="number" step="0.1" value="${h(s.test1.enddruck)}" /></label>
          <label class="field"><span class="field__label">Bestanden</span>${ynSelect('t1-bestanden', s.test1.bestanden)}</label>
        </div>
      </div>

      <div class="abschnitt-section">
        <div class="abschnitt-section__title">2. Druck-Endprüfung nach Injektion</div>
        <div class="form-grid">
          <label class="field"><span class="field__label">Prüfdauer [min]</span><input class="field__input" data-f="t2-dauer" type="number" value="${h(s.test2.dauer)}" /></label>
          <label class="field"><span class="field__label">Prüfdruck [bar]</span><input class="field__input" data-f="t2-pruefdruck" type="number" step="0.1" value="${h(s.test2.pruefdruck)}" /></label>
          <label class="field"><span class="field__label">Enddruck [bar]</span><input class="field__input" data-f="t2-enddruck" type="number" step="0.1" value="${h(s.test2.enddruck)}" /></label>
          <label class="field"><span class="field__label">Bestanden</span>${ynSelect('t2-bestanden', s.test2.bestanden)}</label>
        </div>
      </div>

      <div class="abschnitt-section">
        <div class="abschnitt-section__title">3. Durchfluss-Endprüfung</div>
        <div class="form-grid">
          <label class="field"><span class="field__label">Prüfdauer [min]</span><input class="field__input" data-f="t3-dauer" type="number" value="${h(s.test3.dauer)}" /></label>
          <label class="field"><span class="field__label">Wasserdruck [bar]</span><input class="field__input" data-f="t3-wasserdruck" type="number" step="0.1" value="${h(s.test3.wasserdruck)}" /></label>
          <label class="field"><span class="field__label">Bestanden</span>${ynSelect('t3-bestanden', s.test3.bestanden)}</label>
        </div>
      </div>

      <label class="field field--full" style="margin-top:8px">
        <span class="field__label">4. Bemerkungen</span>
        <textarea class="field__input" data-f="bemerkungen" rows="3">${h(s.bemerkungen)}</textarea>
      </label>
    </div>
  `).join('');
}
function collectDpSonden() {
  const cards = document.querySelectorAll('#dpSondenContainer .sonde-card');
  const out = [];
  cards.forEach(card => {
    const gv = sel => card.querySelector(sel)?.value || '';
    out.push({
      id: card.dataset.sid || uid(),
      nummer: gv('[data-f="nummer"]'),
      tiefe: gv('[data-f="tiefe"]'),
      test1: {
        dauer: gv('[data-f="t1-dauer"]'),
        pruefdruck: gv('[data-f="t1-pruefdruck"]'),
        enddruck: gv('[data-f="t1-enddruck"]'),
        bestanden: gv('[data-f="t1-bestanden"]')
      },
      test2: {
        dauer: gv('[data-f="t2-dauer"]'),
        pruefdruck: gv('[data-f="t2-pruefdruck"]'),
        enddruck: gv('[data-f="t2-enddruck"]'),
        bestanden: gv('[data-f="t2-bestanden"]')
      },
      test3: {
        dauer: gv('[data-f="t3-dauer"]'),
        wasserdruck: gv('[data-f="t3-wasserdruck"]'),
        bestanden: gv('[data-f="t3-bestanden"]')
      },
      bemerkungen: gv('[data-f="bemerkungen"]')
    });
  });
  state.druckprobe.sonden = out.length ? out : [defaultDpSonde()];
}
function syncDruckprobe() {
  syncFieldsById(DP_META, state.druckprobe.meta);
  $('dp-bemerkungen').value = state.druckprobe.bemerkungen || '';
  renderDpSonden();
}
function collectDruckprobe() {
  state.druckprobe.meta = collectFieldsById(DP_META);
  state.druckprobe.bemerkungen = $('dp-bemerkungen')?.value || '';
  collectDpSonden();
}

/* =========================================================
   ÜBERGABE
========================================================= */
function renderUebSonden() {
  const host = $('uebSondenContainer');
  if (!host) return;
  host.innerHTML = state.uebergabe.sonden.map((s, idx) => `
    <div class="sonde-card" data-sid="${h(s.id)}">
      <div class="sonde-card__head">
        <div class="sonde-card__title">EWS ${idx + 1}</div>
        <button class="sonde-card__del" data-action="del-ueb-sonde" data-sid="${h(s.id)}" type="button">Entfernen</button>
      </div>

      <div class="form-grid">
        <label class="field"><span class="field__label">EWS-Nr.</span><input class="field__input" data-f="nummer" type="text" value="${h(s.nummer)}" /></label>
        <label class="field"><span class="field__label">Sondenhersteller</span><input class="field__input" data-f="hersteller" type="text" value="${h(s.hersteller)}" /></label>
        <label class="field"><span class="field__label">Sondentyp</span><input class="field__input" data-f="typ" type="text" value="${h(s.typ)}" /></label>
        <label class="field"><span class="field__label">Durchmesser</span><input class="field__input" data-f="durchmesser" type="text" value="${h(s.durchmesser)}" /></label>
        <label class="field"><span class="field__label">Nutzlänge [m]</span><input class="field__input" data-f="nutzlaenge" type="number" step="0.1" value="${h(s.nutzlaenge)}" /></label>
      </div>

      <div class="abschnitt-section">
        <div class="abschnitt-section__title">Sonden- und Injektionsdaten</div>
        <div class="form-grid">
          <label class="field"><span class="field__label">Dichtigkeitsprobe erfolgt</span>${ynSelect('dichtigkeit', s.dichtigkeit)}</label>
          <label class="field"><span class="field__label">Zugabe von Bohrgut</span>${ynSelect('zugabe', s.zugabe)}</label>
          <label class="field"><span class="field__label">Verpressung fachgerecht</span>${ynSelect('verpressung', s.verpressung)}</label>
        </div>

        <div class="check-row">
          <label class="check-item"><input data-f="mat_bentonit" type="checkbox" ${s.mat_bentonit ? 'checked' : ''} /> Bentonit / Zement</label>
          <label class="check-item"><input data-f="mat_daemmer" type="checkbox" ${s.mat_daemmer ? 'checked' : ''} /> Dämmer</label>
          <label class="check-item"><input data-f="mat_thermocem" type="checkbox" ${s.mat_thermocem ? 'checked' : ''} /> Thermocem</label>
        </div>
      </div>

      <div class="abschnitt-section">
        <div class="abschnitt-section__title">Durchgeführte Abnahme</div>
        <div class="form-grid">
          <label class="field"><span class="field__label">Abnahme nach Druckprobe bestanden</span>${ynSelect('abnahme', s.abnahme)}</label>
          <label class="field"><span class="field__label">Erdwärmesonde verschlossen</span>${ynSelect('verschlossen', s.verschlossen)}</label>
          <label class="field"><span class="field__label">Dichtigkeit / Durchfluss geprüft</span>${ynSelect('geprueft', s.geprueft)}</label>
        </div>
      </div>
    </div>
  `).join('');
}
function collectUebSonden() {
  const cards = document.querySelectorAll('#uebSondenContainer .sonde-card');
  const out = [];
  cards.forEach(card => {
    const gv = sel => card.querySelector(sel)?.value || '';
    const gc = sel => !!card.querySelector(sel)?.checked;
    out.push({
      id: card.dataset.sid || uid(),
      nummer: gv('[data-f="nummer"]'),
      hersteller: gv('[data-f="hersteller"]'),
      typ: gv('[data-f="typ"]'),
      durchmesser: gv('[data-f="durchmesser"]'),
      nutzlaenge: gv('[data-f="nutzlaenge"]'),
      dichtigkeit: gv('[data-f="dichtigkeit"]'),
      zugabe: gv('[data-f="zugabe"]'),
      verpressung: gv('[data-f="verpressung"]'),
      mat_bentonit: gc('[data-f="mat_bentonit"]'),
      mat_daemmer: gc('[data-f="mat_daemmer"]'),
      mat_thermocem: gc('[data-f="mat_thermocem"]'),
      abnahme: gv('[data-f="abnahme"]'),
      verschlossen: gv('[data-f="verschlossen"]'),
      geprueft: gv('[data-f="geprueft"]')
    });
  });
  state.uebergabe.sonden = out.length ? out : [defaultUebSonde()];
}
function syncUebergabe() {
  syncFieldsById(UEB_AG, state.uebergabe.auftraggeber);
  syncFieldsById(UEB_BH, state.uebergabe.bauherr);
  $('ueb-bemerkungen').value = state.uebergabe.bemerkungen || '';
  renderUebSonden();
}
function collectUebergabe() {
  state.uebergabe.auftraggeber = collectFieldsById(UEB_AG);
  state.uebergabe.bauherr = collectFieldsById(UEB_BH);
  state.uebergabe.bemerkungen = $('ueb-bemerkungen')?.value || '';
  collectUebSonden();
}

/* =========================================================
   GAS
========================================================= */
function syncGas() {
  syncFieldsById(GAS_META, state.gas.meta);

  ['low', 'high'].forEach(level => {
    GAS_PARAMS.forEach(param => {
      const el = $(`gas-alarm-${level}-${param}`);
      if (el) el.value = state.gas.alarm[level][param] || '';
    });
  });

  state.gas.messungen.forEach((m, i) => {
    ['ort', ...GAS_PARAMS].forEach(key => {
      const el = $(`gas-m${i + 1}-${key}`);
      if (el) el.value = m[key] || '';
    });
  });

  $('gas-bemerkungen').value = state.gas.bemerkungen || '';
}
function collectGas() {
  state.gas.meta = collectFieldsById(GAS_META);
  ['low', 'high'].forEach(level => {
    GAS_PARAMS.forEach(param => {
      const el = $(`gas-alarm-${level}-${param}`);
      if (el) state.gas.alarm[level][param] = el.value || '';
    });
  });
  state.gas.messungen = [0, 1, 2].map(i => {
    const row = {};
    ['ort', ...GAS_PARAMS].forEach(key => {
      const el = $(`gas-m${i + 1}-${key}`);
      row[key] = el?.value || '';
    });
    return row;
  });
  state.gas.bemerkungen = $('gas-bemerkungen')?.value || '';
}

/* =========================================================
   COLLECT / SYNC ALL
========================================================= */
function collectAll() {
  collectBohren();
  collectInjektion();
  collectDruckprobe();
  collectUebergabe();
  collectGas();
}
function syncAll() {
  syncBohren();
  syncInjektion();
  syncDruckprobe();
  syncUebergabe();
  syncGas();
}

/* =========================================================
   DRAFT
========================================================= */
function saveDraftDebounced() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    try {
      collectAll();
      localStorage.setItem(STORAGE_DRAFT, JSON.stringify({
        bohren: state.bohren,
        injektion: state.injektion,
        druckprobe: state.druckprobe,
        uebergabe: state.uebergabe,
        gas: state.gas
      }));
    } catch (err) {
      console.warn('Draft save failed', err);
    }
  }, 250);
}

function loadDraft() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_DRAFT) || 'null');
    if (!raw) return;
    state.bohren = normalizeBohren(raw.bohren);
    state.injektion = normalizeInjektion(raw.injektion);
    state.druckprobe = normalizeDruckprobe(raw.druckprobe);
    state.uebergabe = normalizeUebergabe(raw.uebergabe);
    state.gas = normalizeGas(raw.gas);
    syncAll();
  } catch (err) {
    console.warn('Draft load failed', err);
  }
}

/* =========================================================
   HISTORY
========================================================= */
function readHistory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_HISTORY) || '[]');
  } catch {
    return [];
  }
}
function writeHistory(list) {
  localStorage.setItem(STORAGE_HISTORY, JSON.stringify(list.slice(0, HISTORY_MAX)));
}

function getProtoLabel(proto) {
  return ({
    bohren: 'Bohrprotokoll',
    injektion: 'Injektionsprotokoll',
    druckprobe: 'Druckprobe',
    uebergabe: 'Übergabeprotokoll',
    gas: 'Gasmessung'
  })[proto] || proto;
}
function getProtoBadge(proto) {
  return `<span class="proto-badge proto-badge--${h(proto)}">${h(getProtoLabel(proto))}</span>`;
}
function getProtoTitle(proto, data) {
  if (proto === 'uebergabe') {
    return `${getProtoLabel(proto)} · ${data?.auftraggeber?.name || '—'} · ${data?.bauherr?.plzort || '—'}`;
  }
  return `${getProtoLabel(proto)} · ${data?.meta?.objekt || '—'} · ${data?.meta?.ort || '—'}`;
}
function saveToHistory(proto) {
  collectAll();
  const entry = {
    id: uid(),
    proto,
    savedAt: Date.now(),
    title: getProtoTitle(proto, state[proto]),
    data: clone(state[proto])
  };
  const list = readHistory();
  list.unshift(entry);
  writeHistory(list);
}

function renderHistoryList() {
  const host = $('historyList');
  if (!host) return;
  const filter = $('historyFilter')?.value || 'alle';
  let list = readHistory();
  if (filter !== 'alle') list = list.filter(x => x.proto === filter);

  if (!list.length) {
    host.innerHTML = `<div class="empty-state">Noch keine Protokolle gespeichert.</div>`;
    return;
  }

  host.innerHTML = list.map(entry => `
    <div class="historyItem">
      <div class="historyTop">
        <span>${getProtoBadge(entry.proto)}</span>
        <span style="color:var(--muted);font-size:.82em">${h(new Date(entry.savedAt).toLocaleString('de-DE'))}</span>
      </div>
      <div class="historySub">${h(entry.title)}</div>
      <div class="historyBtns">
        <button data-hact="load" data-id="${h(entry.id)}" type="button">Laden</button>
        <button data-hact="pdf" data-id="${h(entry.id)}" type="button">PDF</button>
        <button data-hact="del" data-id="${h(entry.id)}" type="button">Löschen</button>
      </div>
    </div>
  `).join('');
}

function hookHistory() {
  $('historyFilter')?.addEventListener('change', renderHistoryList);

  $('historyList')?.addEventListener('click', async e => {
    const btn = e.target.closest('[data-hact]');
    if (!btn) return;

    const act = btn.dataset.hact;
    const id = btn.dataset.id;
    const list = readHistory();
    const entry = list.find(x => x.id === id);
    if (!entry && act !== 'del') return;

    if (act === 'del') {
      if (!confirm('Eintrag wirklich löschen?')) return;
      writeHistory(list.filter(x => x.id !== id));
      renderHistoryList();
      return;
    }

    if (act === 'load') {
      state[entry.proto] = normalizeProto(entry.proto, entry.data);
      syncAll();

      if (!state.settings.tabs[entry.proto]) {
        state.settings.tabs[entry.proto] = true;
        saveSettings();
        syncSettingsUi();
        applyTabVisibility();
      }

      saveDraftDebounced();
      setActiveTab(entry.proto);
      return;
    }

    if (act === 'pdf') {
      try {
        await exportPdf(entry.proto, entry.data);
      } catch (err) {
        console.error(err);
        alert('PDF-Fehler: ' + (err?.message || String(err)));
      }
    }
  });
}

/* =========================================================
   RESET
========================================================= */
function resetProto(proto) {
  if (!confirm(`${getProtoLabel(proto)} wirklich zurücksetzen?`)) return;

  if (proto === 'bohren') state.bohren = defaultBohren();
  if (proto === 'injektion') state.injektion = defaultInjektion();
  if (proto === 'druckprobe') state.druckprobe = defaultDruckprobe();
  if (proto === 'uebergabe') state.uebergabe = defaultUebergabe();
  if (proto === 'gas') state.gas = defaultGas();

  syncAll();
  saveDraftDebounced();
}

/* =========================================================
   PDF EXPORT
========================================================= */
function buildPdfSections(proto, data) {
  if (proto === 'bohren') {
    return [
      {
        title: 'Stammdaten',
        lines: [
          `Objekt: ${val(data.meta.objekt)}`,
          `Straße: ${val(data.meta.strasse)}`,
          `Ort: ${val(data.meta.ort)}`,
          `Gemeinde: ${val(data.meta.gemeinde)}`,
          `Auftragsnummer: ${val(data.meta.auftragsnummer)}`,
          `Bewilligungsnummer: ${val(data.meta.bewilligungsnummer)}`,
          `Maschinentyp: ${val(data.meta.maschinentyp)}`,
          `Bohrart: ${val(data.meta.bohrart)}`,
          `Bohrmeister: ${val(data.meta.bohrmeister)}`,
          `Sonden Nummer: ${val(data.meta.sondennummer)}`,
          `Bauleitung: ${val(data.meta.bauleitung)}`,
          `Koordination: ${val(data.meta.koordination)}`,
          `Geologie: ${val(data.meta.geologie)}`,
          `Bohrbeginn: ${val(dateDE(data.meta.bohrbeginn))}`,
          `Bohrende: ${val(dateDE(data.meta.bohrende))}`
        ]
      },
      {
        title: 'EWS / Bohrdaten',
        lines: [
          `EWS-Typ: ${val(data.ews.typ)}`,
          `EWS-Länge [m]: ${val(data.ews.laenge)}`,
          `Probenentnahme alle [m]: ${val(data.ews.probenentnahme)}`,
          `Injektion: ${val(data.ews.injektiontyp)}`
        ]
      },
      {
        title: 'Schichtenverzeichnis',
        lines: (data.schichten || []).flatMap((s, i) => [
          `${i + 1}. Tiefe bis ${val(s.tiefe)} m`,
          `   Hauptbestandteil: ${val(s.hauptbestandteil)} | Nebenbestandteil: ${val(s.nebenbestandteil)}`,
          `   Eigenschaften: ${val(s.eigenschaften)} | Lagerung: ${val(s.lagerung)} | Medium: ${val(s.medium)} | Wasser: ${val(s.wasser)}`,
          `   Bemerkungen: ${val(s.bemerkungen)}`
        ])
      },
      {
        title: 'Besondere Vorkommnisse',
        lines: [
          `GW-Spiegel [m]: ${val(data.vorkommnisse.gwsp)}`,
          `Wasserzufluss: ${val(data.vorkommnisse.wz)}`,
          `Spülverluste: ${val(data.vorkommnisse.sv)}`,
          `Arteser: ${val(data.vorkommnisse.ar)}`,
          `Kavernen: ${val(data.vorkommnisse.kv)}`,
          `Gasgeruch: ${val(data.vorkommnisse.gasgeruch)}`,
          `Bemerkungen: ${val(data.vorkommnisse.bemerkungen)}`
        ]
      }
    ];
  }

  if (proto === 'injektion') {
    return [
      {
        title: 'Stammdaten',
        lines: [
          `Objekt: ${val(data.meta.objekt)}`,
          `Straße: ${val(data.meta.strasse)}`,
          `Ort: ${val(data.meta.ort)}`,
          `Auftragsnummer: ${val(data.meta.auftragsnummer)}`,
          `Geologie: ${val(data.meta.geologie)}`,
          `Bauleitung: ${val(data.meta.bauleitung)}`,
          `Bohrmeister: ${val(data.meta.bohrmeister)}`,
          `Koordination: ${val(data.meta.koordination)}`,
          `Injektion durch: ${val(data.meta.injektiondurch)}`,
          `Injektion am: ${val(dateDE(data.meta.injektionam))}`
        ]
      },
      ...(data.sonden || []).map((s, i) => ({
        title: `Sonde ${i + 1} (${val(s.nummer)})`,
        lines: [
          `Material: ${val(s.material)}`,
          `Sondentyp: ${val(s.typ)}`,
          `Durchmesser: ${val(s.durchmesser)}`,
          ...s.abschnitte.flatMap((a, idx) => [
            `${idx + 1}. Abschnitt: DM ${val(a.dm)} mm | von ${val(a.von)} m | bis ${val(a.bis)} m | Volumen ${val(a.volumen)} ltr.`
          ]),
          `Material Thermocement: ${val(s.materialChecks.thermocement)}`,
          `Material Dämmer: ${val(s.materialChecks.daemmer)}`,
          `Material Kies Rundkorn: ${val(s.materialChecks.kies)}`,
          `Material Bentonit-Zement: ${val(s.materialChecks.bentonit)}`,
          `Material Sperrrohr: ${val(s.materialChecks.sperrrohr)}`,
          `Sollverbrauch [ltr.]: ${val(s.sollverbrauch)}`,
          `Istverbrauch [ltr.]: ${val(s.istverbrauch)}`,
          `Differenz [ltr.]: ${val(s.differenz)}`,
          `Bemerkungen: ${val(s.bemerkungen)}`
        ]
      }))
    ];
  }

  if (proto === 'druckprobe') {
    return [
      {
        title: 'Stammdaten',
        lines: [
          `Objekt: ${val(data.meta.objekt)}`,
          `GS / KG: ${val(data.meta.gskg)}`,
          `Ort: ${val(data.meta.ort)}`,
          `Auftragsnummer: ${val(data.meta.auftragsnummer)}`,
          `Geologie: ${val(data.meta.geologie)}`,
          `Bauleitung: ${val(data.meta.bauleitung)}`,
          `Bohrmeister: ${val(data.meta.bohrmeister)}`,
          `Koordination: ${val(data.meta.koordination)}`,
          `Geprüft durch: ${val(data.meta.geprueftdurch)}`,
          `Geprüft am: ${val(dateDE(data.meta.geprueftam))}`
        ]
      },
      ...(data.sonden || []).map((s, i) => ({
        title: `Sonde ${i + 1} (${val(s.nummer)})`,
        lines: [
          `Tiefe [m]: ${val(s.tiefe)}`,
          `1. Prüfung: Dauer ${val(s.test1.dauer)} min | Prüfdruck ${val(s.test1.pruefdruck)} bar | Enddruck ${val(s.test1.enddruck)} bar | Bestanden ${val(s.test1.bestanden)}`,
          `2. Prüfung: Dauer ${val(s.test2.dauer)} min | Prüfdruck ${val(s.test2.pruefdruck)} bar | Enddruck ${val(s.test2.enddruck)} bar | Bestanden ${val(s.test2.bestanden)}`,
          `3. Prüfung: Dauer ${val(s.test3.dauer)} min | Wasserdruck ${val(s.test3.wasserdruck)} bar | Bestanden ${val(s.test3.bestanden)}`,
          `4. Bemerkungen: ${val(s.bemerkungen)}`
        ]
      })),
      {
        title: 'Allgemeine Bemerkungen',
        lines: [`${val(data.bemerkungen)}`]
      }
    ];
  }

  if (proto === 'uebergabe') {
    return [
      {
        title: 'Auftraggeber',
        lines: [
          `Name: ${val(data.auftraggeber.name)}`,
          `Straße: ${val(data.auftraggeber.strasse)}`,
          `PLZ / Ort: ${val(data.auftraggeber.plzort)}`,
          `Auftragsnummer: ${val(data.auftraggeber.auftragsnummer)}`
        ]
      },
      {
        title: 'Bauherr / Kunde',
        lines: [
          `Name: ${val(data.bauherr.name)}`,
          `Straße: ${val(data.bauherr.strasse)}`,
          `PLZ / Ort: ${val(data.bauherr.plzort)}`,
          `Bohrmeister: ${val(data.bauherr.bohrmeister)}`
        ]
      },
      ...(data.sonden || []).map((s, i) => ({
        title: `EWS ${i + 1} (${val(s.nummer)})`,
        lines: [
          `Hersteller: ${val(s.hersteller)}`,
          `Typ: ${val(s.typ)}`,
          `Durchmesser: ${val(s.durchmesser)}`,
          `Nutzlänge [m]: ${val(s.nutzlaenge)}`,
          `Dichtigkeitsprobe erfolgt: ${val(s.dichtigkeit)}`,
          `Zugabe von Bohrgut: ${val(s.zugabe)}`,
          `Verpressung fachgerecht: ${val(s.verpressung)}`,
          `Materialien: ${
            [
              s.mat_bentonit ? 'Bentonit/Zement' : '',
              s.mat_daemmer ? 'Dämmer' : '',
              s.mat_thermocem ? 'Thermocem' : ''
            ].filter(Boolean).join(', ') || '—'
          }`,
          `Abnahme nach Druckprobe bestanden: ${val(s.abnahme)}`,
          `EWS verschlossen und gesichert: ${val(s.verschlossen)}`,
          `Dichtigkeit und Durchfluss geprüft: ${val(s.geprueft)}`
        ]
      })),
      {
        title: 'Bemerkungen',
        lines: [`${val(data.bemerkungen)}`]
      }
    ];
  }

  if (proto === 'gas') {
    return [
      {
        title: 'Stammdaten',
        lines: [
          `Objekt: ${val(data.meta.objekt)}`,
          `Straße: ${val(data.meta.strasse)}`,
          `Ort: ${val(data.meta.ort)}`,
          `Auftragsnummer: ${val(data.meta.auftragsnummer)}`,
          `Bauleitung: ${val(data.meta.bauleitung)}`,
          `Bohrmeister: ${val(data.meta.bohrmeister)}`,
          `Koordination: ${val(data.meta.koordination)}`,
          `Überwachung: ${val(data.meta.ueberwachung)}`,
          `Messung durch: ${val(data.meta.messungdurch)}`,
          `Messung am: ${val(dateDE(data.meta.messungam))}`
        ]
      },
      {
        title: 'Alarmeinstellungen',
        lines: [
          `LOW: GAS ${val(data.alarm.low.gas)} | O2 ${val(data.alarm.low.o2)} | LEL ${val(data.alarm.low.lel)} | H2S ${val(data.alarm.low.h2s)} | CO ${val(data.alarm.low.co)}`,
          `HIGH: GAS ${val(data.alarm.high.gas)} | O2 ${val(data.alarm.high.o2)} | LEL ${val(data.alarm.high.lel)} | H2S ${val(data.alarm.high.h2s)} | CO ${val(data.alarm.high.co)}`
        ]
      },
      {
        title: 'Messungen',
        lines: (data.messungen || []).map((m, i) =>
          `${i + 1}. Messort ${val(m.ort)} | GAS ${val(m.gas)} | O2 ${val(m.o2)} | LEL ${val(m.lel)} | H2S ${val(m.h2s)} | CO ${val(m.co)}`
        )
      },
      {
        title: 'Bemerkungen',
        lines: [`${val(data.bemerkungen)}`]
      }
    ];
  }

  return [{ title: 'Daten', lines: [JSON.stringify(data, null, 2)] }];
}

function wrapText(text, maxChars = 95) {
  const src = pdfSafe(text);
  if (src.length <= maxChars) return [src];
  const words = src.split(/\s+/);
  const lines = [];
  let line = '';
  words.forEach(word => {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars) {
      if (line) lines.push(line);
      line = word;
    } else {
      line = next;
    }
  });
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

async function exportPdf(proto, data) {
  if (!window.PDFLib) {
    alert('PDF-Library noch nicht geladen.');
    return;
  }

  const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
  const pdf = await PDFDocument.create();
  const fontR = await pdf.embedFont(StandardFonts.Helvetica);
  const fontB = await pdf.embedFont(StandardFonts.HelveticaBold);

  const PAGE_W = 595.28;
  const PAGE_H = 841.89;
  const margin = 40;
  const lineH = 14;
  const black = rgb(0, 0, 0);
  const grey = rgb(0.93, 0.93, 0.93);

  let page = null;
  let y = 0;
  let pageNo = 0;

  function newPage() {
    page = pdf.addPage([PAGE_W, PAGE_H]);
    pageNo += 1;
    y = PAGE_H - margin;

    page.drawRectangle({
      x: margin,
      y: y - 28,
      width: PAGE_W - margin * 2,
      height: 28,
      color: grey,
      borderColor: black,
      borderWidth: 0.7
    });
    page.drawText(pdfSafe('HTB Baugesellschaft m.b.H.'), {
      x: margin + 6, y: y - 11, size: 9, font: fontR, color: black
    });
    page.drawText(pdfSafe(getProtoLabel(proto)), {
      x: margin + 6, y: y - 23, size: 14, font: fontB, color: black
    });
    page.drawText(pdfSafe(`Seite ${pageNo}`), {
      x: PAGE_W - margin - 45, y: y - 20, size: 8, font: fontR, color: black
    });
    y -= 40;
  }

  function ensureSpace(lines = 1) {
    if (!page || y < margin + lines * lineH + 20) newPage();
  }

  function writeSectionTitle(text) {
    ensureSpace(2);
    page.drawRectangle({
      x: margin,
      y: y - 16,
      width: PAGE_W - margin * 2,
      height: 16,
      color: grey,
      borderColor: black,
      borderWidth: 0.7
    });
    page.drawText(pdfSafe(text), {
      x: margin + 5,
      y: y - 12,
      size: 9,
      font: fontB,
      color: black
    });
    y -= 22;
  }

  function writeParagraph(text, bold = false) {
    const lines = wrapText(text, 95);
    ensureSpace(lines.length + 1);
    lines.forEach(line => {
      page.drawText(pdfSafe(line), {
        x: margin + 4,
        y,
        size: 9,
        font: bold ? fontB : fontR,
        color: black
      });
      y -= lineH;
    });
  }

  newPage();
  const sections = buildPdfSections(proto, normalizeProto(proto, data));
  sections.forEach(section => {
    writeSectionTitle(section.title);
    (section.lines || []).forEach(line => writeParagraph(line));
    y -= 6;
  });

  const bytes = await pdf.save();
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const fileName = `${dateTag()}_HTB_EWS_${getProtoLabel(proto).replace(/\s+/g, '_')}.pdf`;

  const win = window.open(url, '_blank');
  if (!win) {
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/* =========================================================
   BUTTONS / EVENTS
========================================================= */
function hookProtocolButtons() {
  document.querySelectorAll('[data-action="save"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const proto = btn.dataset.proto;
      saveToHistory(proto);
      saveDraftDebounced();
      alert(`${getProtoLabel(proto)} im Verlauf gespeichert.`);
    });
  });

  document.querySelectorAll('[data-action="reset"]').forEach(btn => {
    btn.addEventListener('click', () => resetProto(btn.dataset.proto));
  });

  $('btnAddSchicht')?.addEventListener('click', () => {
    collectSchichten();
    state.bohren.schichten.push(defaultSchicht());
    renderSchichten();
    saveDraftDebounced();
  });

  $('btnAddInjSonde')?.addEventListener('click', () => {
    collectInjSonden();
    state.injektion.sonden.push(defaultInjSonde());
    renderInjSonden();
    saveDraftDebounced();
  });

  $('btnAddDpSonde')?.addEventListener('click', () => {
    collectDpSonden();
    state.druckprobe.sonden.push(defaultDpSonde());
    renderDpSonden();
    saveDraftDebounced();
  });

  $('btnAddUebSonde')?.addEventListener('click', () => {
    collectUebSonden();
    state.uebergabe.sonden.push(defaultUebSonde());
    renderUebSonden();
    saveDraftDebounced();
  });
}

function hookDynamicDeletion() {
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const act = btn.dataset.action;
    const sid = btn.dataset.sid;

    if (act === 'del-schicht') {
      collectSchichten();
      if (state.bohren.schichten.length <= 1) {
        alert('Mindestens eine Schicht muss vorhanden sein.');
        return;
      }
      state.bohren.schichten = state.bohren.schichten.filter(x => x.id !== sid);
      renderSchichten();
      saveDraftDebounced();
    }

    if (act === 'del-inj-sonde') {
      collectInjSonden();
      if (state.injektion.sonden.length <= 1) {
        alert('Mindestens eine Sonde muss vorhanden sein.');
        return;
      }
      state.injektion.sonden = state.injektion.sonden.filter(x => x.id !== sid);
      renderInjSonden();
      saveDraftDebounced();
    }

    if (act === 'del-dp-sonde') {
      collectDpSonden();
      if (state.druckprobe.sonden.length <= 1) {
        alert('Mindestens eine Sonde muss vorhanden sein.');
        return;
      }
      state.druckprobe.sonden = state.druckprobe.sonden.filter(x => x.id !== sid);
      renderDpSonden();
      saveDraftDebounced();
    }

    if (act === 'del-ueb-sonde') {
      collectUebSonden();
      if (state.uebergabe.sonden.length <= 1) {
        alert('Mindestens eine Sonde muss vorhanden sein.');
        return;
      }
      state.uebergabe.sonden = state.uebergabe.sonden.filter(x => x.id !== sid);
      renderUebSonden();
      saveDraftDebounced();
    }
  });
}

function hookGlobalAutosave() {
  document.addEventListener('input', e => {
    if (e.target.closest('#tab-settings')) return;
    saveDraftDebounced();
  });
  document.addEventListener('change', e => {
    if (e.target.closest('#tab-settings')) return;
    saveDraftDebounced();
  });
}

/* =========================================================
   INSTALL BUTTON
========================================================= */
function initInstallButton() {
  let installPrompt = null;
  const btn = $('btnInstall');

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    installPrompt = e;
    if (btn) btn.hidden = false;
  });

  btn?.addEventListener('click', async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    btn.hidden = true;
  });

  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    if (btn) btn.hidden = true;
  });
}

/* =========================================================
   INIT
========================================================= */
window.addEventListener('DOMContentLoaded', () => {
  initTabs();
  hookSettings();
  hookProtocolButtons();
  hookDynamicDeletion();
  hookHistory();
  hookGlobalAutosave();
  initInstallButton();

  loadSettings();
  applyTabVisibility();

  renderSchichten();
  renderInjSonden();
  renderDpSonden();
  renderUebSonden();

  loadDraft();
  syncAll();
  renderHistoryList();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js?v=2').catch(err => console.error('SW:', err));
  }
});
