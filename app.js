'use strict';
console.log('HTB Erdwärmesonden app.js v1 loaded');

const BASE = '/Erdwaermesonde/';
const STORAGE_PREFIX = 'htb-ews-v1';
const STORAGE_DRAFT = STORAGE_PREFIX + '-draft';
const STORAGE_HISTORY = STORAGE_PREFIX + '-history';
const HISTORY_MAX = 50;

/* ═══════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════ */
const $ = id => document.getElementById(id);
const uid = () => crypto?.randomUUID?.() || ('id_' + Date.now() + '_' + Math.random().toString(16).slice(2));
const clone = v => JSON.parse(JSON.stringify(v));
const h = v => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const pdfSafe = v => String(v ?? '').replace(/[–—]/g,'-').replace(/[•→►▾▸]/g,'-').replace(/[₂]/g,'2').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,'');

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
function fmtComma(v, d=2) {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(d).replace('.', ',') : '—';
}

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
      thermocement:'', daemmer:'', kies:'', bentonit:'', sperrrohr:''
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
    test3: { dauer:'', wasserDruck:'', bestanden:'' },
    test4: ''
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
    dichtigkeit:'', zugabe:'', verpressung:'',
    mat_bentonit:false, mat_daemmer:false, mat_thermocem:false,
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
   STATE
═══════════════════════════════════════════ */
const state = {
  bohren: defaultBohren(),
  injektion: defaultInjektion(),
  druckprobe: defaultDruckprobe(),
  uebergabe: defaultUebergabe(),
  gas: defaultGas()
};

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
   GENERIC FIELD HELPERS
═══════════════════════════════════════════ */
function collectFieldsById(mapping) {
  const data = {};
  mapping.forEach(([id, key]) => {
    const el = $(id);
    if (!el) return;
    if (el.type === 'checkbox') data[key] = el.checked;
    else data[key] = el.value || '';
  });
  return data;
}
function syncFieldsById(mapping, data) {
  if (!data) return;
  mapping.forEach(([id, key]) => {
    const el = $(id);
    if (!el) return;
    if (el.type === 'checkbox') el.checked = !!data[key];
    else el.value = data[key] || '';
  });
}

/* ═══════════════════════════════════════════
   BOHREN — Mappings, Collect, Sync, Render
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
      <td><input class="mess-input" type="text" value="${h(s.nebenbestandteil)}" /></td>
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
   INJEKTION — Collect, Sync, Render
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
    const gv = sel => card.querySelector(sel)?.value || '';
    const abschnitte = [];
    card.querySelectorAll('.abschnitt-section').forEach(sec => {
      const ins = sec.querySelectorAll('input');
      abschnitte.push({
        dm: ins[0]?.value || '', von: ins[1]?.value || '',
        bis: ins[2]?.value || '', volumen: ins[3]?.value || ''
      });
    });
    const matSel = (name) => card.querySelector(`[data-f="mat_${name}"]`)?.value || '';
    sonden.push({
      id: card.dataset.sid || uid(),
      nummer: gv('[data-f="nummer"]'),
      material: gv('[data-f="material"]'),
      typ: gv('[data-f="typ"]'),
      durchmesser: gv('[data-f="durchmesser"]'),
      abschnitte: abschnitte.length ? abschnitte : defaultInjSonde().abschnitte,
      materialChecks: {
        thermocement: matSel('thermocement'),
        daemmer: matSel('daemmer'),
        kies: matSel('kies'),
        bentonit: matSel('bentonit'),
        sperrrohr: matSel('sperrrohr')
      },
      sollverbrauch: gv('[data-f="sollverbrauch"]'),
      istverbrauch: gv('[data-f="istverbrauch"]'),
      differenz: gv('[data-f="differenz"]'),
      bemerkungen: gv('[data-f="bemerkungen"]')
    });
  });
  state.injektion.sonden = sonden.length ? sonden : [defaultInjSonde()];
}

function renderInjSonden() {
  const host = $('injSondenContainer');
  if (!host) return;
  host.innerHTML = state.injektion.sonden.map((s, idx) => {
    const abschnittHtml = (s.abschnitte || []).map((a, ai) => `
      <div class="abschnitt-section">
        <div class="abschnitt-section__title">${ai+1}. Abschnitt</div>
        <div class="form-grid">
          <label class="field"><span class="field__label">Durchmesser [mm]</span>
            <input class="field__input" type="text" value="${h(a.dm)}" /></label>
          <label class="field"><span class="field__label">von [m]</span>
            <input class="field__input" type="number" step="0.1" value="${h(a.von)}" /></label>
          <label class="field"><span class="field__label">bis [m]</span>
            <input class="field__input" type="number" step="0.1" value="${h(a.bis)}" /></label>
          <label class="field"><span class="field__label">Volumen [ltr.]</span>
            <input class="field__input" type="number" step="0.1" value="${h(a.volumen)}" /></label>
        </div>
      </div>
    `).join('');

    const mc = s.materialChecks || {};
    const matOpts = (key, val) => `
      <select class="field__input" data-f="mat_${key}">
        <option value="" ${!val?'selected':''}>— wählen —</option>
        <option value="1" ${val==='1'?'selected':''}>Abschnitt 1</option>
        <option value="2" ${val==='2'?'selected':''}>Abschnitt 2</option>
        <option value="3" ${val==='3'?'selected':''}>Abschnitt 3</option>
        <option value="1,2" ${val==='1,2'?'selected':''}>Abschnitt 1+2</option>
        <option value="1,3" ${val==='1,3'?'selected':''}>Abschnitt 1+3</option>
        <option value="2,3" ${val==='2,3'?'selected':''}>Abschnitt 2+3</option>
        <option value="1,2,3" ${val==='1,2,3'?'selected':''}>Alle</option>
      </select>`;

    return `
    <div class="sonde-card" data-sid="${h(s.id)}">
      <div class="sonde-card__head">
        <div class="sonde-card__title">Sonde ${idx+1}</div>
        <button class="sonde-card__del" data-action="del-inj-sonde" data-sid="${h(s.id)}" type="button">Entfernen</button>
      </div>
      <div class="form-grid">
        <label class="field"><span class="field__label">Nummer</span>
          <input class="field__input" data-f="nummer" type="text" value="${h(s.nummer)}" /></label>
        <label class="field"><span class="field__label">Material</span>
          <input class="field__input" data-f="material" type="text" value="${h(s.material)}" /></label>
        <label class="field"><span class="field__label">Sondentyp</span>
          <input class="field__input" data-f="typ" type="text" value="${h(s.typ)}" /></label>
        <label class="field"><span class="field__label">Durchmesser</span>
          <input class="field__input" data-f="durchmesser" type="text" value="${h(s.durchmesser)}" /></label>
      </div>
      ${abschnittHtml}
      <div class="abschnitt-section">
        <div class="abschnitt-section__title">Material Hauptbestandteil</div>
        <div class="form-grid">
          <label class="field"><span class="field__label">Thermocement</span>${matOpts('thermocement', mc.thermocement)}</label>
          <label class="field"><span class="field__label">Dämmer</span>${matOpts('daemmer', mc.daemmer)}</label>
          <label class="field"><span class="field__label">Kies Rundkorn</span>${matOpts('kies', mc.kies)}</label>
          <label class="field"><span class="field__label">Bentonit-Zement</span>${matOpts('bentonit', mc.bentonit)}</label>
          <label class="field"><span class="field__label">Sperrrohr</span>${matOpts('sperrrohr', mc.sperrrohr)}</label>
        </div>
      </div>
      <div class="abschnitt-section">
        <div class="abschnitt-section__title">Materialverbrauch</div>
        <div class="form-grid">
          <label class="field"><span class="field__label">Sollverbrauch [ltr.]</span>
            <input class="field__input" data-f="sollverbrauch" type="number" step="0.1" value="${h(s.sollverbrauch)}" /></label>
          <label class="field"><span class="field__label">Istverbrauch [ltr.]</span>
            <input class="field__input" data-f="istverbrauch" type="number" step="0.1" value="${h(s.istverbrauch)}" /></label>
          <label class="field"><span class="field__label">Differenz [ltr.]</span>
            <input class="field__input" data-f="differenz" type="number" step="0.1" value="${h(s.differenz)}" /></label>
        </div>
      </div>
      <label class="field field--full" style="margin-top:8px"><span class="field__label">Bemerkungen</span>
        <textarea class="field__input" data-f="bemerkungen" rows="2">${h(s.bemerkungen)}</textarea></label>
    </div>
    `;
  }).join('');
}

/* ═══════════════════════════════════════════
   DRUCKPROBE — Collect, Sync, Render
═══════════════════════════════════════════ */
const DP_META = [
  ['dp-objekt','objekt'],['dp-gskg','gskg'],['dp-ort','ort'],
  ['dp-auftragsnummer','auftragsnummer'],['dp-geologie','geologie'],
  ['dp-bauleitung','bauleitung'],['dp-bohrmeister','bohrmeister'],
  ['dp-koordination','koordination'],['dp-geprueftdurch','geprueftdurch'],
  ['dp-geprueftam','geprueftam']
];

function collectDruckprobe() {
  state.druckprobe.meta = collectFieldsById(DP_META);
  state.druckprobe.bemerkungen = $('dp-bemerkungen')?.value || '';
  collectDpSonden();
  return clone(state.druckprobe);
}
function syncDruckprobe() {
  syncFieldsById(DP_META, state.druckprobe.meta);
  if ($('dp-bemerkungen')) $('dp-bemerkungen').value = state.druckprobe.bemerkungen || '';
  renderDpSonden();
}
function collectDpSonden() {
  const cards = document.querySelectorAll('#dpSondenContainer .sonde-card');
  const sonden = [];
  cards.forEach(card => {
    const gv = sel => card.querySelector(sel)?.value || '';
    sonden.push({
      id: card.dataset.sid || uid(),
      nummer: gv('[data-f="nummer"]'),
      tiefe: gv('[data-f="tiefe"]'),
      test1: {
        dauer: gv('[data-f="t1-dauer"]'),
        pruefDruck: gv('[data-f="t1-pruef"]'),
        endDruck: gv('[data-f="t1-end"]'),
        bestanden: gv('[data-f="t1-best"]')
      },
      test2: {
        dauer: gv('[data-f="t2-dauer"]'),
        pruefDruck: gv('[data-f="t2-pruef"]'),
        endDruck: gv('[data-f="t2-end"]'),
        bestanden: gv('[data-f="t2-best"]')
      },
      test3: {
        dauer: gv('[data-f="t3-dauer"]'),
        wasserDruck: gv('[data-f="t3-wasser"]'),
        bestanden: gv('[data-f="t3-best"]')
      },
      test4: gv('[data-f="t4-bem"]')
    });
  });
  state.druckprobe.sonden = sonden.length ? sonden : [defaultDpSonde()];
}

function renderDpSonden() {
  const host = $('dpSondenContainer');
  if (!host) return;
  host.innerHTML = state.druckprobe.sonden.map((s, idx) => {
    const bestOpts = (key, val) => `
      <select class="field__input" data-f="${key}">
        <option value="" ${!val?'selected':''}>— —</option>
        <option value="ja" ${val==='ja'?'selected':''}>Ja</option>
        <option value="nein" ${val==='nein'?'selected':''}>Nein</option>
      </select>`;
    return `
    <div class="sonde-card" data-sid="${h(s.id)}">
      <div class="sonde-card__head">
        <div class="sonde-card__title">EWS ${idx+1}</div>
        <button class="sonde-card__del" data-action="del-dp-sonde" data-sid="${h(s.id)}" type="button">Entfernen</button>
      </div>
      <div class="form-grid">
        <label class="field"><span class="field__label">Sonden Nummer</span>
          <input class="field__input" data-f="nummer" type="text" value="${h(s.nummer)}" /></label>
        <label class="field"><span class="field__label">Tiefe [m]</span>
          <input class="field__input" data-f="tiefe" type="number" step="0.1" value="${h(s.tiefe)}" /></label>
      </div>
      <div class="abschnitt-section">
        <div class="abschnitt-section__title">1. Druckprüfung nach Einbau (Kurzzeit)</div>
        <div class="form-grid">
          <label class="field"><span class="field__label">Prüfdauer [min]</span>
            <input class="field__input" data-f="t1-dauer" type="number" value="${h(s.test1?.dauer)}" /></label>
          <label class="field"><span class="field__label">Prüfdruck [bar]</span>
            <input class="field__input" data-f="t1-pruef" type="number" step="0.1" value="${h(s.test1?.pruefDruck)}" /></label>
          <label class="field"><span class="field__label">Enddruck [bar]</span>
            <input class="field__input" data-f="t1-end" type="number" step="0.1" value="${h(s.test1?.endDruck)}" /></label>
          <label class="field"><span class="field__label">Bestanden</span>${bestOpts('t1-best', s.test1?.bestanden)}</label>
        </div>
      </div>
      <div class="abschnitt-section">
        <div class="abschnitt-section__title">2. Druck-Endprüfung nach Injektion (Langzeit)</div>
        <div class="form-grid">
          <label class="field"><span class="field__label">Prüfdauer [min]</span>
            <input class="field__input" data-f="t2-dauer" type="number" value="${h(s.test2?.dauer)}" /></label>
          <label class="field"><span class="field__label">Prüfdruck [bar]</span>
            <input class="field__input" data-f="t2-pruef" type="number" step="0.1" value="${h(s.test2?.pruefDruck)}" /></label>
          <label class="field"><span class="field__label">Enddruck [bar]</span>
            <input class="field__input" data-f="t2-end" type="number" step="0.1" value="${h(s.test2?.endDruck)}" /></label>
          <label class="field"><span class="field__label">Bestanden</span>${bestOpts('t2-best', s.test2?.bestanden)}</label>
        </div>
      </div>
      <div class="abschnitt-section">
        <div class="abschnitt-section__title">3. Durchfluss-Endprüfung</div>
        <div class="form-grid">
          <label class="field"><span class="field__label">Prüfdauer [min]</span>
            <input class="field__input" data-f="t3-dauer" type="number" value="${h(s.test3?.dauer)}" /></label>
          <label class="field"><span class="field__label">Wasserdruck [bar]</span>
            <input class="field__input" data-f="t3-wasser" type="number" step="0.1" value="${h(s.test3?.wasserDruck)}" /></label>
          <label class="field"><span class="field__label">Bestanden</span>${bestOpts('t3-best', s.test3?.bestanden)}</label>
        </div>
      </div>
      <label class="field field--full" style="margin-top:8px"><span class="field__label">4. Bemerkungen</span>
        <textarea class="field__input" data-f="t4-bem" rows="2">${h(s.test4 || '')}</textarea></label>
    </div>`;
  }).join('');
}

/* ═══════════════════════════════════════════
   ÜBERGABE — Collect, Sync, Render
═══════════════════════════════════════════ */
const UEB_AG = [
  ['ueb-ag-name','name'],['ueb-ag-strasse','strasse'],
  ['ueb-ag-plzort','plzort'],['ueb-ag-auftragsnummer','auftragsnummer']
];
const UEB_BH = [
  ['ueb-bh-name','name'],['ueb-bh-strasse','strasse'],
  ['ueb-bh-plzort','plzort'],['ueb-bh-bohrmeister','bohrmeister']
];

function collectUebergabe() {
  state.uebergabe.auftraggeber = collectFieldsById(UEB_AG);
  state.uebergabe.bauherr = collectFieldsById(UEB_BH);
  state.uebergabe.bemerkungen = $('ueb-bemerkungen')?.value || '';
  collectUebSonden();
  return clone(state.uebergabe);
}
function syncUebergabe() {
  syncFieldsById(UEB_AG, state.uebergabe.auftraggeber);
  syncFieldsById(UEB_BH, state.uebergabe.bauherr);
  if ($('ueb-bemerkungen')) $('ueb-bemerkungen').value = state.uebergabe.bemerkungen || '';
  renderUebSonden();
}
function collectUebSonden() {
  const cards = document.querySelectorAll('#uebSondenContainer .sonde-card');
  const sonden = [];
  cards.forEach(card => {
    const gv = sel => card.querySelector(sel)?.value || '';
    const gc = sel => card.querySelector(sel)?.checked || false;
    sonden.push({
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
  state.uebergabe.sonden = sonden.length ? sonden : [defaultUebSonde()];
}

function renderUebSonden() {
  const host = $('uebSondenContainer');
  if (!host) return;
  host.innerHTML = state.uebergabe.sonden.map((s, idx) => {
    const ynOpts = (key, val) => `
      <select class="field__input" data-f="${key}">
        <option value="" ${!val?'selected':''}>— —</option>
        <option value="ja" ${val==='ja'?'selected':''}>Ja</option>
        <option value="nein" ${val==='nein'?'selected':''}>Nein</option>
      </select>`;
    return `
    <div class="sonde-card" data-sid="${h(s.id)}">
      <div class="sonde-card__head">
        <div class="sonde-card__title">EWS ${idx+1}</div>
        <button class="sonde-card__del" data-action="del-ueb-sonde" data-sid="${h(s.id)}" type="button">Entfernen</button>
      </div>
      <div class="form-grid">
        <label class="field"><span class="field__label">EWS-Nr.</span>
          <input class="field__input" data-f="nummer" type="text" value="${h(s.nummer)}" /></label>
        <label class="field"><span class="field__label">Hersteller</span>
          <input class="field__input" data-f="hersteller" type="text" value="${h(s.hersteller)}" /></label>
        <label class="field"><span class="field__label">Sondentyp</span>
          <input class="field__input" data-f="typ" type="text" value="${h(s.typ)}" /></label>
        <label class="field"><span class="field__label">Durchmesser</span>
          <input class="field__input" data-f="durchmesser" type="text" value="${h(s.durchmesser)}" /></label>
        <label class="field"><span class="field__label">Nutzlänge [m]</span>
          <input class="field__input" data-f="nutzlaenge" type="number" step="0.1" value="${h(s.nutzlaenge)}" /></label>
      </div>
      <div class="abschnitt-section">
        <div class="abschnitt-section__title">Prüfungen</div>
        <div class="form-grid">
          <label class="field"><span class="field__label">Dichtigkeitsprobe</span>${ynOpts('dichtigkeit', s.dichtigkeit)}</label>
          <label class="field"><span class="field__label">Zugabe Bohrgut</span>${ynOpts('zugabe', s.zugabe)}</label>
          <label class="field"><span class="field__label">Verpressung fachgerecht</span>${ynOpts('verpressung', s.verpressung)}</label>
        </div>
        <div class="check-row" style="margin-top:10px">
          <label class="check-item"><input type="checkbox" data-f="mat_bentonit" ${s.mat_bentonit?'checked':''} /> Bentonit/Zement</label>
          <label class="check-item"><input type="checkbox" data-f="mat_daemmer" ${s.mat_daemmer?'checked':''} /> Dämmer</label>
          <label class="check-item"><input type="checkbox" data-f="mat_thermocem" ${s.mat_thermocem?'checked':''} /> Thermocem</label>
        </div>
      </div>
      <div class="abschnitt-section">
        <div class="abschnitt-section__title">Abnahme</div>
        <div class="form-grid">
          <label class="field"><span class="field__label">Druckprobe bestanden</span>${ynOpts('abnahme', s.abnahme)}</label>
          <label class="field"><span class="field__label">EWS verschlossen</span>${ynOpts('verschlossen', s.verschlossen)}</label>
          <label class="field"><span class="field__label">Dichtigkeit & Durchfluss geprüft</span>${ynOpts('geprueft', s.geprueft)}</label>
        </div>
      </div>
    </div>`;
  }).join('');
}

/* ═══════════════════════════════════════════
   GAS — Collect, Sync
═══════════════════════════════════════════ */
const GAS_META = [
  ['gas-objekt','objekt'],['gas-strasse','strasse'],['gas-ort','ort'],
  ['gas-auftragsnummer','auftragsnummer'],['gas-bauleitung','bauleitung'],
  ['gas-bohrmeister','bohrmeister'],['gas-koordination','koordination'],
  ['gas-ueberwachung','ueberwachung'],['gas-messungdurch','messungdurch'],
  ['gas-messungam','messungam']
];
const GAS_PARAMS = ['gas','o2','lel','h2s','co'];

function collectGas() {
  state.gas.meta = collectFieldsById(GAS_META);
  ['low','high'].forEach(level => {
    GAS_PARAMS.forEach(p => {
      const el = $(`gas-alarm-${level}-${p}`);
      if (el) state.gas.alarm[level][p] = el.value || '';
    });
  });
  for (let i = 0; i < 3; i++) {
    const m = state.gas.messungen[i] || {};
    GAS_PARAMS.concat(['ort']).forEach(p => {
      const id = `gas-m${i+1}-${p}`;
      const el = $(id);
      if (el) m[p] = el.value || '';
    });
    state.gas.messungen[i] = m;
  }
  state.gas.bemerkungen = $('gas-bemerkungen')?.value || '';
  return clone(state.gas);
}
function syncGas() {
  syncFieldsById(GAS_META, state.gas.meta);
  ['low','high'].forEach(level => {
    GAS_PARAMS.forEach(p => {
      const el = $(`gas-alarm-${level}-${p}`);
      if (el) el.value = state.gas.alarm?.[level]?.[p] || '';
    });
  });
  for (let i = 0; i < 3; i++) {
    const m = state.gas.messungen?.[i] || {};
    GAS_PARAMS.concat(['ort']).forEach(p => {
      const el = $(`gas-m${i+1}-${p}`);
      if (el) el.value = m[p] || '';
    });
  }
  if ($('gas-bemerkungen')) $('gas-bemerkungen').value = state.gas.bemerkungen || '';
}

/* ═══════════════════════════════════════════
   COLLECT ALL / SNAPSHOT
═══════════════════════════════════════════ */
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
function getSnapshot(proto) {
  collectAll();
  return { proto, data: clone(state[proto]), savedAt: Date.now() };
}
function getLabel(proto) {
  const labels = {
    bohren:'Bohrprotokoll', injektion:'Injektionsprotokoll',
    druckprobe:'Druckprobe', uebergabe:'Übergabeprotokoll', gas:'Gasmessung'
  };
  return labels[proto] || proto;
}
function getObjekt(proto) {
  const d = state[proto];
  if (!d) return '';
  if (d.meta) return d.meta.objekt || '';
  if (d.auftraggeber) return d.auftraggeber.name || '';
  return '';
}
function getOrt(proto) {
  const d = state[proto];
  if (!d) return '';
  if (d.meta) return d.meta.ort || '';
  if (d.bauherr) return d.bauherr.plzort || '';
  return '';
}

/* ═══════════════════════════════════════════
   DRAFT / HISTORY
═══════════════════════════════════════════ */
function saveDraftDebounced() {
  clearTimeout(_saveT);
  _saveT = setTimeout(() => {
    try {
      collectAll();
      localStorage.setItem(STORAGE_DRAFT, JSON.stringify(state));
    } catch (e) { console.warn('Draft save failed', e); }
  }, 300);
}
function loadDraft() {
  try {
    const raw = localStorage.getItem(STORAGE_DRAFT);
    if (!raw) return;
    const saved = JSON.parse(raw);
    ['bohren','injektion','druckprobe','uebergabe','gas'].forEach(k => {
      if (saved[k]) state[k] = saved[k];
    });
    syncAll();
  } catch (e) { console.warn('Draft load failed', e); }
}
function readHistory() {
  try { return JSON.parse(localStorage.getItem(STORAGE_HISTORY) || '[]'); } catch { return []; }
}
function writeHistory(list) {
  try { localStorage.setItem(STORAGE_HISTORY, JSON.stringify(list.slice(0, HISTORY_MAX))); } catch {}
}
function saveToHistory(proto) {
  collectAll();
  const objekt = getObjekt(proto);
  const ort = getOrt(proto);
  const entry = {
    id: uid(),
    proto,
    savedAt: Date.now(),
    title: `${getLabel(proto)} · ${objekt || '—'} · ${ort || '—'}`,
    data: clone(state[proto])
  };
  const list = readHistory();
  list.unshift(entry);
  writeHistory(list);
}
function resetProto(proto) {
  if (!confirm(`Alle ${getLabel(proto)}-Eingaben zurücksetzen?`)) return;
  const defaults = {
    bohren: defaultBohren, injektion: defaultInjektion,
    druckprobe: defaultDruckprobe, uebergabe: defaultUebergabe, gas: defaultGas
  };
  state[proto] = defaults[proto]();
  syncAll();
  saveDraftDebounced();
}

/* ═══════════════════════════════════════════
   HISTORY UI
═══════════════════════════════════════════ */
function renderHistoryList() {
  const host = $('historyList');
  if (!host) return;
  const filter = $('historyFilter')?.value || 'alle';
  let list = readHistory();
  if (filter !== 'alle') list = list.filter(e => e.proto === filter);
  if (!list.length) {
    host.innerHTML = '<div class="empty-state">Noch keine Protokolle gespeichert.</div>';
    return;
  }
  host.innerHTML = list.map(entry => `
    <div class="historyItem">
      <div class="historyTop">
        <span><span class="proto-badge proto-badge--${h(entry.proto)}">${h(getLabel(entry.proto))}</span></span>
        <span style="color:var(--muted);font-size:.82em">${h(new Date(entry.savedAt).toLocaleString('de-DE'))}</span>
      </div>
      <div class="historySub">${h(entry.title)}</div>
      <div class="historyBtns">
        <button type="button" data-hact="load" data-id="${h(entry.id)}">Laden</button>
        <button type="button" data-hact="pdf"  data-id="${h(entry.id)}">PDF</button>
        <button type="button" data-hact="del"  data-id="${h(entry.id)}">Löschen</button>
      </div>
    </div>
  `).join('');
}

function hookHistoryDelegation() {
  const host = $('historyList');
  if (!host || host.dataset.bound === '1') return;
  host.dataset.bound = '1';
  host.addEventListener('click', async e => {
    const btn = e.target.closest('[data-hact]');
    if (!btn) return;
    const id = btn.dataset.id;
    const act = btn.dataset.hact;
    const list = readHistory();
    const entry = list.find(x => x.id === id);
    if (act === 'del') {
      if (!confirm('Eintrag löschen?')) return;
      writeHistory(list.filter(x => x.id !== id));
      renderHistoryList();
      return;
    }
    if (!entry) return;
    if (act === 'load') {
      state[entry.proto] = entry.data;
      syncAll();
      saveDraftDebounced();
      // Switch to tab
      const tabBtn = document.querySelector(`.tab[data-tab="${entry.proto}"]`);
      if (tabBtn) tabBtn.click();
      return;
    }
    if (act === 'pdf') {
      try { await exportPdf(entry.proto, entry.data); }
      catch (err) { console.error(err); alert('PDF-Fehler: ' + (err?.message || String(err))); }
    }
  });
}

/* ═══════════════════════════════════════════
   PDF EXPORT
═══════════════════════════════════════════ */
async function exportPdf(proto, data) {
  if (!window.PDFLib) { alert('PDF-Library noch nicht geladen. Bitte kurz warten.'); return; }
  const fontkit = window.fontkit || window.PDFLibFontkit;
  if (!fontkit) { alert('fontkit noch nicht geladen.'); return; }

  const { PDFDocument, rgb, StandardFonts } = window.PDFLib;
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);

  // Use Helvetica as fallback (always available)
  const fontR = await pdf.embedFont(StandardFonts.Helvetica);
  const fontB = await pdf.embedFont(StandardFonts.HelveticaBold);

  const PAGE_W = 595.28, PAGE_H = 841.89;
  const K = rgb(0, 0, 0);
  const GREY = rgb(0.92, 0.92, 0.92);
  const LGREY = rgb(0.96, 0.96, 0.96);
  const margin = 40;

  const page = pdf.addPage([PAGE_W, PAGE_H]);
  let cy = PAGE_H - margin;
  const W = PAGE_W - 2 * margin;

  // Helper functions
  function txt(text, x, y, size, font, color) {
    try { page.drawText(pdfSafe(String(text ?? '')), { x, y, size, font: font || fontR, color: color || K }); } catch {}
  }
  function line(x1, y1, x2, y2, w) {
    page.drawLine({ start:{x:x1,y:y1}, end:{x:x2,y:y2}, thickness:w||0.7, color:K });
  }
  function rect(x, y, w, hh, fill) {
    page.drawRectangle({ x, y, width:w, height:hh, borderColor:K, borderWidth:0.7, color:fill });
  }

  // Header
  const hdrH = 36;
  rect(margin, cy - hdrH, W, hdrH, GREY);
  txt('HTB Baugesellschaft m.b.H.', margin + 6, cy - 14, 9, fontR);
  txt(getLabel(proto), margin + 6, cy - 28, 14, fontB);
  txt(`Erstellt: ${new Date().toLocaleDateString('de-DE')}`, margin + W - 130, cy - 14, 8, fontR);
  cy -= hdrH + 4;

  // Generic meta block renderer
  function drawMetaBlock(fields, title) {
    const rowH = 16;
    const cols = 2;
    const colW = W / cols;
    if (title) {
      rect(margin, cy - 14, W, 14, GREY);
      txt(title, margin + 4, cy - 11, 8, fontB);
      cy -= 16;
    }
    for (let i = 0; i < fields.length; i += cols) {
      for (let c = 0; c < cols && i + c < fields.length; c++) {
        const [label, value] = fields[i + c];
        const x = margin + c * colW;
        rect(x, cy - rowH, colW, rowH);
        txt(label + ':', x + 4, cy - rowH + 5, 7, fontB);
        txt(valOrDash(value), x + colW * 0.4, cy - rowH + 5, 8, fontR);
      }
      cy -= rowH;
    }
  }

  // Table renderer
  function drawTable(headers, rows, colWidths) {
    const rowH = 14;
    const headerH = 16;
    // Header row
    let xOff = margin;
    rect(margin, cy - headerH, W, headerH, GREY);
    colWidths.forEach((cw, i) => {
      const w = W * cw;
      txt(headers[i] || '', xOff + 3, cy - headerH + 4, 7, fontB);
      if (i > 0) line(xOff, cy, xOff, cy - headerH);
      xOff += w;
    });
    cy -= headerH;
    // Data rows
    rows.forEach((row, ri) => {
      if (cy < margin + 30) return; // page overflow protection
      xOff = margin;
      const fill = ri % 2 === 0 ? LGREY : undefined;
      rect(margin, cy - rowH, W, rowH, fill);
      colWidths.forEach((cw, ci) => {
        const w = W * cw;
        txt(valOrDash(row[ci]), xOff + 3, cy - rowH + 4, 7, fontR);
        if (ci > 0) line(xOff, cy, xOff, cy - rowH);
        xOff += w;
      });
      cy -= rowH;
    });
  }

  // ─── Render by protocol type ───
  if (proto === 'bohren') {
    const d = data;
    const m = d.meta || {};
    drawMetaBlock([
      ['Objekt', m.objekt], ['Auftragsnummer', m.auftragsnummer],
      ['Strasse', m.strasse], ['Ort', m.ort],
      ['Gemeinde', m.gemeinde], ['Bewilligungsnr.', m.bewilligungsnummer],
      ['Maschinentyp', m.maschinentyp], ['Bohrart', m.bohrart],
      ['Sonden Nr.', m.sondennummer], ['Bohrmeister', m.bohrmeister],
      ['Bauleitung', m.bauleitung], ['Koordination', m.koordination],
      ['Geologie', m.geologie], ['Bohrbeginn', dateDE(m.bohrbeginn)],
      ['Bohrende', dateDE(m.bohrende)]
    ], 'Stammdaten');
    cy -= 4;
    const ews = d.ews || {};
    drawMetaBlock([
      ['EWS-Typ', ews.typ], ['EWS-Laenge', ews.laenge ? ews.laenge + ' m' : ''],
      ['Probenentnahme', ews.probenentnahme ? 'alle ' + ews.probenentnahme + ' m' : ''],
      ['Injektion', ews.injektiontyp]
    ], 'EWS-Daten');
    cy -= 4;
    // Schichtenverzeichnis
    const sch = d.schichten || [];
    if (sch.length) {
      drawTable(
        ['Tiefe [m]', 'Hauptbestandteil', 'Nebenbestandteil', 'Eigenschaften', 'Lag.', 'Med.', 'H2O', 'Bemerkungen'],
        sch.map(s => [s.tiefe, s.hauptbestandteil, s.nebenbestandteil, s.eigenschaften, s.lagerung, s.medium, s.wasser, s.bemerkungen]),
        [0.08, 0.16, 0.14, 0.16, 0.06, 0.06, 0.06, 0.28]
      );
    }
    cy -= 4;
    const v = d.vorkommnisse || {};
    drawMetaBlock([
      ['GW-Spiegel', v.gwsp ? v.gwsp + ' m' : ''], ['Wasserzufluss', v.wz],
      ['Spuelverluste', v.sv], ['Artesisch', v.ar],
      ['Kavernen', v.kv], ['Gasgeruch', v.gasgeruch],
      ['Bemerkungen', v.bemerkungen]
    ], 'Besondere Vorkommnisse');

  } else if (proto === 'injektion') {
    const d = data;
    const m = d.meta || {};
    drawMetaBlock([
      ['Objekt', m.objekt], ['Auftragsnummer', m.auftragsnummer],
      ['Strasse', m.strasse], ['Ort', m.ort],
      ['Geologie', m.geologie], ['Bauleitung', m.bauleitung],
      ['Bohrmeister', m.bohrmeister], ['Koordination', m.koordination],
      ['Injektion durch', m.injektiondurch], ['Injektion am', dateDE(m.injektionam)]
    ], 'Stammdaten');
    cy -= 4;
    (d.sonden || []).forEach((s, si) => {
      if (cy < 120) return;
      rect(margin, cy - 14, W, 14, GREY);
      txt(`Sonde ${si+1}: ${valOrDash(s.nummer)}`, margin + 4, cy - 11, 8, fontB);
      cy -= 16;
      drawMetaBlock([
        ['Material', s.material], ['Typ', s.typ],
        ['Durchmesser', s.durchmesser],
        ['Soll [ltr.]', s.sollverbrauch], ['Ist [ltr.]', s.istverbrauch],
        ['Differenz [ltr.]', s.differenz]
      ]);
      (s.abschnitte || []).forEach((a, ai) => {
        if (cy < 80) return;
        drawMetaBlock([
          [`${ai+1}. Abschn. DM`, a.dm + ' mm'], [`von-bis`, `${valOrDash(a.von)} - ${valOrDash(a.bis)} m`],
          ['Volumen', a.volumen ? a.volumen + ' ltr.' : '']
        ]);
      });
      cy -= 4;
    });

  } else if (proto === 'druckprobe') {
    const d = data;
    const m = d.meta || {};
    drawMetaBlock([
      ['Objekt', m.objekt], ['Auftragsnummer', m.auftragsnummer],
      ['GS/KG', m.gskg], ['Ort', m.ort],
      ['Geologie', m.geologie], ['Bauleitung', m.bauleitung],
      ['Bohrmeister', m.bohrmeister], ['Koordination', m.koordination],
      ['Geprueft durch', m.geprueftdurch], ['Geprueft am', dateDE(m.geprueftam)]
    ], 'Stammdaten');
    cy -= 4;
    (d.sonden || []).forEach((s, si) => {
      if (cy < 140) return;
      rect(margin, cy - 14, W, 14, GREY);
      txt(`EWS ${si+1}: ${valOrDash(s.nummer)} · Tiefe: ${valOrDash(s.tiefe)} m`, margin + 4, cy - 11, 8, fontB);
      cy -= 16;
      drawTable(
        ['Pruefung', 'Dauer [min]', 'Pruef-/Wasserdruck [bar]', 'Enddruck [bar]', 'Bestanden'],
        [
          ['1. Kurzzeit', s.test1?.dauer, s.test1?.pruefDruck, s.test1?.endDruck, s.test1?.bestanden],
          ['2. Langzeit', s.test2?.dauer, s.test2?.pruefDruck, s.test2?.endDruck, s.test2?.bestanden],
          ['3. Durchfluss', s.test3?.dauer, s.test3?.wasserDruck, '—', s.test3?.bestanden]
        ],
        [0.20, 0.18, 0.25, 0.18, 0.19]
      );
      if (s.test4) {
        txt('Bemerkungen: ' + s.test4, margin + 4, cy - 10, 7, fontR);
        cy -= 14;
      }
      cy -= 4;
    });
    if (d.bemerkungen) {
      txt('Bemerkungen: ' + d.bemerkungen, margin + 4, cy - 10, 7, fontR);
      cy -= 16;
    }

  } else if (proto === 'uebergabe') {
    const d = data;
    const ag = d.auftraggeber || {};
    const bh = d.bauherr || {};
    drawMetaBlock([
      ['Auftraggeber', ag.name], ['Kunde/Bauherr', bh.name],
      ['AG Strasse', ag.strasse], ['BH Strasse', bh.strasse],
      ['AG PLZ/Ort', ag.plzort], ['BH PLZ/Ort', bh.plzort],
      ['Auftragsnummer', ag.auftragsnummer], ['Bohrmeister', bh.bohrmeister]
    ], 'Auftraggeber / Bauherr');
    cy -= 4;
    (d.sonden || []).forEach((s, si) => {
      if (cy < 140) return;
      rect(margin, cy - 14, W, 14, GREY);
      txt(`EWS ${si+1}: ${valOrDash(s.nummer)}`, margin + 4, cy - 11, 8, fontB);
      cy -= 16;
      drawMetaBlock([
        ['Hersteller', s.hersteller], ['Typ', s.typ],
        ['Durchmesser', s.durchmesser], ['Nutzlaenge', s.nutzlaenge ? s.nutzlaenge + ' m' : ''],
        ['Dichtigkeit', s.dichtigkeit], ['Zugabe Bohrgut', s.zugabe],
        ['Verpressung', s.verpressung],
        ['Material', [s.mat_bentonit?'Bentonit':'', s.mat_daemmer?'Daemmer':'', s.mat_thermocem?'Thermocem':''].filter(Boolean).join(', ') || '—'],
        ['Druckprobe best.', s.abnahme], ['Verschlossen', s.verschlossen],
        ['Geprueft', s.geprueft]
      ]);
      cy -= 4;
    });
    if (d.bemerkungen) {
      txt('Bemerkungen: ' + d.bemerkungen, margin + 4, cy - 10, 7, fontR);
      cy -= 16;
    }

  } else if (proto === 'gas') {
    const d = data;
    const m = d.meta || {};
    drawMetaBlock([
      ['Objekt', m.objekt], ['Auftragsnummer', m.auftragsnummer],
      ['Strasse', m.strasse], ['Ort', m.ort],
      ['Bauleitung', m.bauleitung], ['Bohrmeister', m.bohrmeister],
      ['Koordination', m.koordination], ['Ueberwachung', m.ueberwachung],
      ['Messung durch', m.messungdurch], ['Messung am', dateDE(m.messungam)]
    ], 'Stammdaten');
    cy -= 4;
    // Alarm
    const al = d.alarm || {};
    drawTable(
      ['', 'GAS [%]', 'O2 [%]', 'LEL [%]', 'H2S [ppm]', 'CO [ppm]'],
      [
        ['LOW', al.low?.gas, al.low?.o2, al.low?.lel, al.low?.h2s, al.low?.co],
        ['HIGH', al.high?.gas, al.high?.o2, al.high?.lel, al.high?.h2s, al.high?.co]
      ],
      [0.16, 0.168, 0.168, 0.168, 0.168, 0.168]
    );
    cy -= 4;
    // Messungen
    const mess = d.messungen || [];
    drawTable(
      ['Nr.', 'Messort', 'GAS [%]', 'O2 [%]', 'LEL [%]', 'H2S [ppm]', 'CO [ppm]'],
      mess.map((mm, i) => [i+1, mm.ort, mm.gas, mm.o2, mm.lel, mm.h2s, mm.co]),
      [0.06, 0.22, 0.12, 0.12, 0.12, 0.12, 0.12]
    );
    cy -= 4;
    if (d.bemerkungen) {
      txt('Bemerkungen: ' + d.bemerkungen, margin + 4, cy - 10, 7, fontR);
      cy -= 16;
    }
  }

  // Footer
  line(margin, margin + 20, margin + W, margin + 20, 0.8);
  txt('HTB Baugesellschaft m.b.H. - Erdwaermesonden', margin + 4, margin + 8, 7, fontR);
  txt(`Seite 1/1`, margin + W - 40, margin + 8, 7, fontR);

  // Save and open
  const bytes = await pdf.save();
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const objName = (getObjekt(proto) || getLabel(proto))
    .replace(/[^\wäöüÄÖÜß\- ]+/g, '').trim().replace(/\s+/g, '_');
  const fileName = `${dateTag()}_HTB_EWS_${getLabel(proto).replace(/\s+/g,'_')}_${objName || 'Protokoll'}.pdf`;
  const w = window.open(url, '_blank');
  if (!w) {
    const a = document.createElement('a');
    a.href = url; a.download = fileName; a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/* ═══════════════════════════════════════════
   EVENT HOOKS
═══════════════════════════════════════════ */
function hookGlobalInputs() {
  // Debounced auto-save on any input change
  document.addEventListener('input', () => saveDraftDebounced());
  document.addEventListener('change', () => saveDraftDebounced());
}

function hookButtons() {
  // Save buttons
  document.querySelectorAll('[data-action="save"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const proto = btn.dataset.proto;
      saveToHistory(proto);
      saveDraftDebounced();
      alert(`${getLabel(proto)} im Verlauf gespeichert.`);
    });
  });
  // Reset buttons
  document.querySelectorAll('[data-action="reset"]').forEach(btn => {
    btn.addEventListener('click', () => resetProto(btn.dataset.proto));
  });
  // PDF from current form
  document.querySelectorAll('[data-action="pdf"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const proto = btn.dataset.proto;
      collectAll();
      try { await exportPdf(proto, clone(state[proto])); }
      catch (err) { console.error(err); alert('PDF-Fehler: ' + (err?.message || String(err))); }
    });
  });

  // Add Schicht
  $('btnAddSchicht')?.addEventListener('click', () => {
    collectSchichten();
    state.bohren.schichten.push(defaultSchicht());
    renderSchichten();
    saveDraftDebounced();
  });

  // Add Inj-Sonde
  $('btnAddInjSonde')?.addEventListener('click', () => {
    collectInjSonden();
    state.injektion.sonden.push(defaultInjSonde());
    renderInjSonden();
    saveDraftDebounced();
  });

  // Add Dp-Sonde
  $('btnAddDpSonde')?.addEventListener('click', () => {
    collectDpSonden();
    state.druckprobe.sonden.push(defaultDpSonde());
    renderDpSonden();
    saveDraftDebounced();
  });

  // Add Ueb-Sonde
  $('btnAddUebSonde')?.addEventListener('click', () => {
    collectUebSonden();
    state.uebergabe.sonden.push(defaultUebSonde());
    renderUebSonden();
    saveDraftDebounced();
  });

  // History filter
  $('historyFilter')?.addEventListener('change', renderHistoryList);
}

function hookSondeDeletion() {
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const act = btn.dataset.action;
    const sid = btn.dataset.sid;

    if (act === 'del-inj-sonde') {
      if (state.injektion.sonden.length <= 1) { alert('Mindestens eine Sonde erforderlich.'); return; }
      collectInjSonden();
      state.injektion.sonden = state.injektion.sonden.filter(s => s.id !== sid);
      renderInjSonden();
      saveDraftDebounced();
    }
    if (act === 'del-dp-sonde') {
      if (state.druckprobe.sonden.length <= 1) { alert('Mindestens eine Sonde erforderlich.'); return; }
      collectDpSonden();
      state.druckprobe.sonden = state.druckprobe.sonden.filter(s => s.id !== sid);
      renderDpSonden();
      saveDraftDebounced();
    }
    if (act === 'del-ueb-sonde') {
      if (state.uebergabe.sonden.length <= 1) { alert('Mindestens eine Sonde erforderlich.'); return; }
      collectUebSonden();
      state.uebergabe.sonden = state.uebergabe.sonden.filter(s => s.id !== sid);
      renderUebSonden();
      saveDraftDebounced();
    }
  });
}

/* ═══════════════════════════════════════════
   INSTALL PWA
═══════════════════════════════════════════ */
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

/* ═══════════════════════════════════════════
   INIT
═══════════════════════════════════════════ */
window.addEventListener('DOMContentLoaded', () => {
  initTabs();
  hookGlobalInputs();
  hookButtons();
  hookSondeDeletion();
  hookHistoryDelegation();
  initInstallButton();

  // Initial render of dynamic sections
  renderSchichten();
  renderInjSonden();
  renderDpSonden();
  renderUebSonden();

  // Load saved draft
  loadDraft();

  // Render history
  renderHistoryList();

  // Register Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register(`${BASE}sw.js?v=1`).catch(err => console.error('SW:', err));
  }
});
