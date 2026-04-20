'use strict';
console.log('HTB Erdwärmesonden app.js v1 loaded');

const BASE = '/Erdwaermesonde/';
const STORAGE_PREFIX = 'htb-ews-v1';
const STORAGE_HISTORY = STORAGE_PREFIX + '-history';
const HISTORY_MAX = 50;

/* ═══════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════ */
const $ = id => document.getElementById(id);
const uid = () => crypto?.randomUUID?.() || ('id_' + Date.now() + '_' + Math.random().toString(16).slice(2));
const clone = v => JSON.parse(JSON.stringify(v));
const h = v => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const pdfSafe = v => String(v ?? '').replace(/[–—]/g,'-').replace(/[•→]/g,'-').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,'');

function dateDE(iso) {
  const s = String(iso || '').trim();
  if (!s) return '';
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : s;
}

function dateTag(d = new Date()) {
  return String(d.getDate()).padStart(2,'0') +
    String(d.getMonth()+1).padStart(2,'0') +
    String(d.getFullYear());
}

function valOrDash(v) { return (v !== undefined && v !== null && String(v).trim() !== '') ? String(v) : '—'; }

/* ═══════════════════════════════════════════
   STATE
═══════════════════════════════════════════ */
const state = {
  bohren: defaultBohren(),
  injektion: defaultInjektion(),
  druckprobe: defaultDruckprobe(),
  uebergabe: defaultUebergabe(),
  gas: defaultGas()
};

let _saveT = null;

/* ═══════════════════════════════════════════
   DEFAULTS
═══════════════════════════════════════════ */
function defaultBohren() {
  return {
    meta: {
      objekt:'', strasse:'', ort:'', gemeinde:'',
      auftragsnummer:'', bewilligungsnummer:'',
      maschinentyp:'', bohrart:'', sondennummer:'',
      bohrmeister:'', bauleitung:'', koordination:'',
      geologie:'', bohrbeginn:'', bohrende:''
    },
    ews: { typ:'', laenge:'', probenentnahme:'', injektiontyp:'' },
    schichten: [defaultSchicht()],
    vorkommnisse: {
      gwsp:'', wz:'', sv:'', ar:'nein', kv:'', gasgeruch:'nein', bemerkungen:''
    }
  };
}

function defaultSchicht() {
  return {
    id: uid(), tiefe:'', hauptbestandteil:'', nebenbestandteil:'',
    eigenschaften:'', lagerung:'', medium:'', wasser:'', bemerkungen:''
  };
}

function defaultInjektion() {
  return {
    meta: {
      objekt:'', strasse:'', ort:'', auftragsnummer:'',
      geologie:'', bauleitung:'', bohrmeister:'', koordination:'',
      injektiondurch:'', injektionam:''
    },
    sonden: [defaultInjSonde()]
  };
}

function defaultInjSonde() {
  return {
    id: uid(), nummer:'', material:'PE100-RC', typ:'Duplex 32mm', durchmesser:'4x32mm',
    abschnitte: [
      { dm:'', von:'', bis:'', volumen:'' },
      { dm:'', von:'', bis:'', volumen:'' },
      { dm:'', von:'', bis:'', volumen:'' }
    ],
    materialChecks: {
      thermocement: '', daemmer: '', kies: '', bentonit: '', sperrrohr: ''
    },
    sollverbrauch:'', istverbrauch:'', differenz:'',
    bemerkungen:''
  };
}

function defaultDruckprobe() {
  return {
    meta: {
      objekt:'', gskg:'', ort:'', auftragsnummer:'',
      geologie:'', bauleitung:'', bohrmeister:'', koordination:'',
      geprueftdurch:'', geprueftam:''
    },
    sonden: [defaultDpSonde()],
    bemerkungen: ''
  };
}

function defaultDpSonde() {
  return {
    id: uid(), nummer:'', tiefe:'',
    test1: { dauer:'', pruefDruck:'', endDruck:'', bestanden:'' },
    test2: { dauer:'', pruefDruck:'', endDruck:'', bestanden:'' },
    test3: { dauer:'', wasserDruck:'', bestanden:'' }
  };
}

function defaultUebergabe() {
  return {
    auftraggeber: { name:'', strasse:'', plzort:'', auftragsnummer:'' },
    bauherr: { name:'', strasse:'', plzort:'', bohrmeister:'' },
    sonden: [defaultUebSonde()],
    bemerkungen: ''
  };
}

function defaultUebSonde() {
  return {
    id: uid(), nummer:'', hersteller:'', typ:'', durchmesser:'', nutzlaenge:'',
    dichtigkeitsprobe:'', zugabeBohrgut:'', verpressung:'',
    material: { bentonit:false, daemmer:false, thermocem:false },
    abnahme:'', verschlossen:'', geprueft:''
  };
}

function defaultGas() {
  return {
    meta: {
      objekt:'', strasse:'', ort:'', auftragsnummer:'',
      bauleitung:'', bohrmeister:'', koordination:'',
      ueberwachung:'', messungdurch:'', messungam:''
    },
    alarm: {
      low:  { gas:'', o2:'19.5', lel:'10', h2s:'10', co:'30' },
      high: { gas:'', o2:'23.5', lel:'20', h2s:'20', co:'60' }
    },
    messungen: [
      { ort:'', gas:'', o2:'', lel:'', h2s:'', co:'' },
      { ort:'', gas:'', o2:'', lel:'', h2s:'', co:'' },
      { ort:'', gas:'', o2:'', lel:'', h2s:'', co:'' }
    ],
    bemerkungen: ''
  };
}

/* ═══════════════════════════════════════════
   TABS
═══════════════════════════════════════════ */
function initTabs() {
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(b => b.classList.toggle('is-active', b === btn));
      document.querySelectorAll('.pane').forEach(p => {
        const on = p.id === `tab-${btn.dataset.tab}`;
        p.classList.toggle('is-active', on);
        p.hidden = !on;
      });
      if (btn.dataset.tab === 'verlauf') renderHistoryList();
    });
  });
}

/* ═══════════════════════════════════════════
   COLLECT / SYNC — Generic field mapping
═══════════════════════════════════════════ */
function collectFieldsById(mapping) {
  const data = {};
  mapping.forEach(([id, key]) => {
    const el = $(id);
    if (el) data[key] = el.type === 'checkbox' ? el.checked : el.value || '';
  });
  return data;
}

function syncFieldsById(mapping, data) {
  mapping.forEach(([id, key]) => {
    const el = $(id);
    if (!el) return;
    if (el.type === 'checkbox') el.checked = !!data[key];
    else el.value = data[key] || '';
  });
}

/* ═══════════════════════════════════════════
   BOHREN — Sync & Render
═══════════════════════════════════════════ */
const BOHR_META = [
  ['bohr-objekt','objekt'],['bohr-strasse','strasse'],['bohr-ort','ort'],
  ['bohr-gemeinde','gemeinde'],['bohr-auftragsnummer','auftragsnummer'],
  ['bohr-bewilligungsnummer','bewilligungsnummer'],['bohr-maschinentyp','maschinentyp'],
  ['bohr-bohrart','bohrart'],['bohr-sondennummer','sondennummer'],
  ['bohr-bohrmeister','bohrmeister'],['bohr-bauleitung','bauleitung'],
  ['bohr-koordination','koordination'],['bohr-geologie','geologie'],
  ['bohr-bohrbeginn','bohrbeginn'],['bohr-bohrende','bohrende']
];
const BOHR_EWS = [
  ['bohr-ewstyp','typ'],['bohr-ewslaenge','laenge'],
  ['bohr-probenentnahme','probenentnahme'],['bohr-injektiontyp','injektiontyp']
];
const BOHR_VORK = [
  ['bohr-gwsp','gwsp'],['bohr-wz','wz'],['bohr-sv','sv'],
  ['bohr-ar','ar'],['bohr-kv','kv'],['bohr-gasgeruch','gasgeruch'],
  ['bohr-bemerkungen','bemerkungen']
];

function collectBohren() {
  state.bohren.meta = collectFieldsById(BOHR_META);
  state.bohren.ews = collectFieldsById(BOHR_EWS);
  state.bohren.vorkommnisse = collectFieldsById(BOHR_VORK);
  collectSchichten();
  return clone(state.bohren);
}

function syncBohren() {
  syncFieldsById(BOHR_META, state.bohren.meta);
  syncFieldsById(BOHR_EWS, state.bohren.ews);
  syncFieldsById(BOHR_VORK, state.bohren.vorkommnisse);
  renderSchichten();
}

function collectSchichten() {
  const rows = document.querySelectorAll('#bohr-schichten-body tr');
  const schichten = [];
  rows.forEach(tr => {
    const inputs = tr.querySelectorAll('input, select');
    schichten.push({
      id: tr.dataset.sid || uid(),
      tiefe: inputs[0]?.value || '',
      hauptbestandteil: inputs[1]?.value || '',
      nebenbestandteil: inputs[2]?.value || '',
      eigenschaften: inputs[3]?.value || '',
      lagerung: inputs[4]?.value || '',
      medium: inputs[5]?.value || '',
      wasser: inputs[6]?.value || '',
      bemerkungen: inputs[7]?.value || ''
    });
  });
  state.bohren.schichten = schichten.length ? schichten : [defaultSchicht()];
}

function renderSchichten() {
  const body = $('bohr-schichten-body');
  if (!body) return;
  body.innerHTML = state.bohren.schichten.map(s => `
    <tr data-sid="${h(s.id)}">
      <td><input class="mess-input" type="number" step="0.1" value="${h(s.tiefe)}" /></td>
      <td><input class="mess-input" type="text" value="${h(s.hauptbestandteil)}" placeholder="z.B. Kies" /></td>
      <td><input class="mess-input" type="text" value="${h(s.nebenbestandteil)}" placeholder="z.B. sandig" /></td>
      <td><input class="mess-input" type="text" value="${h(s.eigenschaften)}" /></td>
      <td><select class="mess-input">
        <option value="" ${!s.lagerung?'selected':''}>—</option>
        <option value="1" ${s.lagerung==='1'?'selected':''}>1</option>
        <option value="2" ${s.lagerung==='2'?'selected':''}>2</option>
        <option value="3" ${s.lagerung==='3'?'selected':''}>3</option>
      </select></td>
      <td><select class="mess-input">
        <option value="" ${!s.medium?'selected':''}>—</option>
        <option value="N" ${s.medium==='N'?'selected':''}>N</option>
        <option value="T" ${s.medium==='T'?'selected':''}>T</option>
      </select></td>
      <td><select class="mess-input">
        <option value="" ${!s.wasser?'selected':''}>—</option>
        <option value="1" ${s.wasser==='1'?'selected':''}>1</option>
        <option value="2" ${s.wasser==='2'?'selected':''}>2</option>
        <option value="3" ${s.wasser==='3'?'selected':''}>3</option>
      </select></td>
      <td><input class="mess-input" type="text" value="${h(s.bemerkungen)}" /></td>
    </tr>
  `).join('');
}

/* ═══════════════════════════════════════════
   INJEKTION — Sync & Render
═══════════════════════════════════════════ */
const INJ_META = [
  ['inj-objekt','objekt'],['inj-strasse','strasse'],['inj-ort','ort'],
  ['inj-auftragsnummer','auftragsnummer'],['inj-geologie','geologie'],
  ['inj-bauleitung','bauleitung'],['inj-bohrmeister','bohrmeister'],
  ['inj-koordination','koordination'],['inj-injektiondurch','injektiondurch'],
  ['inj-injektionam','injektionam']
];

function collectInjektion() {
  state.injektion.meta = collectFieldsById(INJ_META);
  collectInjSonden();
  return clone(state.injektion);
}

function syncInjektion() {
  syncFieldsById(INJ_META, state.injektion.meta);
  renderInjSonden();
}

function collectInjSonden() {
  const cards = document.querySelectorAll('#injSondenContainer .sonde-card');
  const sonden = [];
  cards.forEach(card => {
    const gv = (sel) => card.querySelector(sel)?.value || '';
    const abschnitte = [];
    card.querySelectorAll('.abschnitt-section').forEach(sec => {
      const ins = sec.querySelectorAll('input');
      abschnitte.push({
        dm: ins[0]?.value || '', von: ins[1]?.value || '',
        bis: ins[2]?.value || '', volumen: ins[3]?.value || ''
      });
    });
    sonden.push({
      id: card.dataset.sid || uid(),
      nummer: gv('[data-f="nummer"]'),
      material: gv('[data-f="material"]'),
      typ: gv('[data-f="typ"]'),
      durchmesser: gv('[data-f="durchmesser"]'),
      abschnitte: abschnitte.length ? abschnitte : defaultI
