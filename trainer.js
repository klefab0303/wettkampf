// ═══════════════════════════════════════════════════════════
// trainer.js – Logik für das Trainer-Dashboard
// ═══════════════════════════════════════════════════════════

let allSwimmers = [];
let allTrainings = [];
let allDisciplines = [];
let _autoSaveTimers = {};   // Debounce-Timer für Auto-Save

// ─── Initialisierung ──────────────────────────────────────

(async () => {
  const user = await checkAuth('trainer');
  if (!user) return;
  initTabs();

  // Stammdaten parallel laden
  const [swRes, trRes, diRes] = await Promise.all([
    db.from('swimmers').select('id,name,year,user_id').order('name'),
    db.from('trainings').select('id,date,start_time,end_time').order('date'),
    db.from('disciplines').select('id,name,type,description').order('name'),
  ]);
  allSwimmers   = swRes.data || [];
  allTrainings  = trRes.data || [];
  allDisciplines = diRes.data || [];

  // Alle Bereiche befüllen
  renderTrainingsList();
  fillTrainingSelect();
  fillSwimmerSelect();
  loadDiscAssignments_einzel();
  fillStaffelDiscSelect();
  loadStaffeln();
  loadAccounts();
  initRechner();
})();

// ═══ TRAININGS ════════════════════════════════════════════

/** Neues Training anlegen. */
async function createTraining() {
  const date  = document.getElementById('t-date').value;
  const start = document.getElementById('t-start').value || null;
  const end   = document.getElementById('t-end').value || null;
  if (!date) { alert('Bitte Datum eingeben.'); return; }

  const { data, error } = await db.from('trainings')
    .insert({ date, start_time: start, end_time: end }).select().single();
  if (error) { alert('Fehler: ' + error.message); return; }

  allTrainings.push(data);
  allTrainings.sort((a, b) => a.date.localeCompare(b.date));
  renderTrainingsList();
  fillTrainingSelect();
  document.getElementById('t-date').value = '';
  document.getElementById('t-start').value = '';
  document.getElementById('t-end').value = '';
}

/** Trainingsliste als Tabelle rendern. */
function renderTrainingsList() {
  const c = document.getElementById('all-trainings');
  if (allTrainings.length === 0) {
    c.innerHTML = '<p style="color:var(--text-light)">Keine Trainings.</p>';
    return;
  }

  let html = '<table><thead><tr><th>Datum</th><th>Uhrzeit</th><th>Zugeordnet</th><th>Aktion</th></tr></thead><tbody>';
  allTrainings.forEach(t => {
    html += `<tr id="tr-row-${t.id}">
      <td>${formatDate(t.date)}</td>
      <td>${formatSlot(t.start_time, t.end_time) || '–'}</td>
      <td><button class="btn btn-sm btn-secondary" onclick="editTrainingSwimmers('${t.id}')">Schwimmer zuordnen</button></td>
      <td><button class="btn btn-sm btn-danger" onclick="deleteTraining('${t.id}')">Löschen</button></td>
    </tr>`;
  });
  html += '</tbody></table>';
  c.innerHTML = html;
}

/** Training löschen. */
async function deleteTraining(id) {
  if (!confirm('Training wirklich löschen?')) return;
  await db.from('trainings').delete().eq('id', id);
  allTrainings = allTrainings.filter(t => t.id !== id);
  renderTrainingsList();
  fillTrainingSelect();
}

// ═══ SCHWIMMER-ZUORDNUNG (Training) ══════════════════════

async function editTrainingSwimmers(trainingId) {
  const row = document.getElementById('tr-row-' + trainingId);
  const existing = document.getElementById('assign-panel-' + trainingId);
  if (existing) { existing.remove(); return; }

  const { data: assigned } = await db
    .from('training_swimmers').select('swimmer_id').eq('training_id', trainingId);
  const assignedIds = new Set((assigned || []).map(a => a.swimmer_id));

  const tr = document.createElement('tr');
  tr.id = 'assign-panel-' + trainingId;
  let html = '<td colspan="4" style="background:#fafcff;padding:1rem"><div class="checkbox-list">';
  allSwimmers.forEach(s => {
    html += `<label><input type="checkbox" value="${s.id}" ${assignedIds.has(s.id) ? 'checked' : ''} onchange="autoSaveTrainingSwimmers('${trainingId}')"> ${s.name}</label>`;
  });
  html += `</div><span class="auto-save-status" id="save-status-tr-${trainingId}" style="font-size:0.8rem;color:var(--success);margin-top:0.4rem;display:inline-block"></span></td>`;
  tr.innerHTML = html;
  row.after(tr);
}

function autoSaveTrainingSwimmers(trainingId) {
  clearTimeout(_autoSaveTimers['tr-' + trainingId]);
  _autoSaveTimers['tr-' + trainingId] = setTimeout(() => _doSaveTrainingSwimmers(trainingId), 400);
}

async function _doSaveTrainingSwimmers(trainingId) {
  const panel = document.getElementById('assign-panel-' + trainingId);
  if (!panel) return;
  const checked = [...panel.querySelectorAll('input[type=checkbox]:checked')].map(cb => cb.value);
  await db.from('training_swimmers').delete().eq('training_id', trainingId);
  if (checked.length > 0) {
    const rows = checked.map(sid => ({ training_id: trainingId, swimmer_id: sid }));
    await db.from('training_swimmers').insert(rows);
  }
  const status = document.getElementById('save-status-tr-' + trainingId);
  if (status) { status.textContent = 'Gespeichert'; setTimeout(() => status.textContent = '', 2000); }
}

// ═══ DROPDOWNS BEFÜLLEN ══════════════════════════════════

function fillTrainingSelect() {
  const sel = document.getElementById('select-training');
  sel.innerHTML = '<option value="">– bitte wählen –</option>';
  allTrainings.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = formatDate(t.date) + formatSlot(t.start_time, t.end_time);
    sel.appendChild(opt);
  });
}

function fillSwimmerSelect() {
  const sel = document.getElementById('select-swimmer-times');
  sel.innerHTML = '<option value="">– bitte wählen –</option>';
  allSwimmers.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.name + ' (' + s.year + ')';
    sel.appendChild(opt);
  });
}

// ═══ ANWESENHEIT ═════════════════════════════════════════

async function loadAttendanceOverview() {
  const trainingId = document.getElementById('select-training').value;
  const c = document.getElementById('attendance-overview');
  if (!trainingId) { c.innerHTML = ''; return; }
  c.innerHTML = '<div class="spinner">Lädt …</div>';

  const { data: att } = await db.from('attendance').select('user_id,status').eq('training_id', trainingId);
  const attMap = {};
  (att || []).forEach(a => { attMap[a.user_id] = a.status; });

  const { data: assigned } = await db.from('training_swimmers').select('swimmer_id').eq('training_id', trainingId);
  const assignedIds = new Set((assigned || []).map(a => a.swimmer_id));
  const relevantSwimmers = allSwimmers.filter(s => assignedIds.has(s.id));

  let ja = 0, nein = 0, offen = 0;
  let html = '<table><thead><tr><th>Schwimmer</th><th>Jahrgang</th><th>Status</th></tr></thead><tbody>';
  relevantSwimmers.forEach(s => {
    const status = attMap[s.user_id];
    let badge;
    if (status === 'ja')        { badge = '<span class="badge-ja">Ja</span>'; ja++; }
    else if (status === 'nein') { badge = '<span class="badge-nein">Nein</span>'; nein++; }
    else                        { badge = '<span style="color:var(--text-light)">–</span>'; offen++; }
    html += `<tr><td>${s.name}</td><td>${s.year}</td><td>${badge}</td></tr>`;
  });
  html += '</tbody></table>';
  html += `<p style="margin-top:0.8rem;font-size:0.82rem;color:var(--text-light)">Ja: <strong>${ja}</strong> | Nein: <strong>${nein}</strong> | Offen: <strong>${offen}</strong></p>`;
  if (relevantSwimmers.length === 0) html = '<p style="color:var(--text-light)">Keine Schwimmer zugeordnet.</p>';
  c.innerHTML = html;
}

// ═══ EINZEL-DISZIPLINEN (Zuordnung) ═════════════════════

async function loadDiscAssignments_einzel() {
  const discs = allDisciplines.filter(d => d.type === 'einzel');
  const container = document.getElementById('einzel-disc-list');

  if (discs.length === 0) {
    container.innerHTML = '<p style="color:var(--text-light)">Keine Einzeldisziplinen vorhanden.</p>';
    return;
  }

  const { data: allAssign } = await db.from('swimmer_disciplines').select('swimmer_id,discipline_id');
  const assignMap = {};
  (allAssign || []).forEach(a => {
    if (!assignMap[a.discipline_id]) assignMap[a.discipline_id] = new Set();
    assignMap[a.discipline_id].add(a.swimmer_id);
  });

  let html = '';
  discs.forEach(d => {
    const assigned = assignMap[d.id] || new Set();
    html += `<div class="disc-item">
      <div class="disc-item-header" onclick="toggleDisc(this)">
        <span><strong>${d.name}</strong>
          <span style="font-size:0.8rem;color:var(--text-light);margin-left:0.5rem">(${assigned.size} Schwimmer)</span>
        </span>
        <span style="font-size:0.8rem;color:var(--text-light)">▼</span>
      </div>
      <div class="disc-item-body">
        ${d.description ? '<p style="margin-bottom:0.8rem;font-style:italic">' + d.description + '</p>' : ''}
        <div class="checkbox-list" id="disc-cb-${d.id}">`;
    allSwimmers.forEach(s => {
      html += `<label><input type="checkbox" value="${s.id}" ${assigned.has(s.id) ? 'checked' : ''} onchange="autoSaveDiscAssignment('${d.id}')"> ${s.name}</label>`;
    });
    html += `</div>
        <span class="auto-save-status" id="save-status-disc-${d.id}" style="font-size:0.8rem;color:var(--success);margin-top:0.4rem;display:inline-block"></span>
      </div>
    </div>`;
  });
  container.innerHTML = html;
}

function autoSaveDiscAssignment(discId) {
  clearTimeout(_autoSaveTimers['disc-' + discId]);
  _autoSaveTimers['disc-' + discId] = setTimeout(() => _doSaveDiscAssignment(discId), 400);
}

async function _doSaveDiscAssignment(discId) {
  const container = document.getElementById('disc-cb-' + discId);
  if (!container) return;
  const checked = [...container.querySelectorAll('input[type=checkbox]:checked')].map(cb => cb.value);
  await db.from('swimmer_disciplines').delete().eq('discipline_id', discId);
  if (checked.length > 0) {
    const rows = checked.map(sid => ({ swimmer_id: sid, discipline_id: discId }));
    await db.from('swimmer_disciplines').insert(rows);
  }
  const status = document.getElementById('save-status-disc-' + discId);
  if (status) { status.textContent = 'Gespeichert'; setTimeout(() => status.textContent = '', 2000); }
}

// ═══ STAFFELN (Mannschaft) ══════════════════════════════

function fillStaffelDiscSelect() {
  const sel = document.getElementById('staffel-disc-select');
  sel.innerHTML = '<option value="">– Disziplin wählen –</option>';
  allDisciplines.filter(d => d.type === 'mannschaft').forEach(d => {
    const opt = document.createElement('option');
    opt.value = d.id;
    opt.textContent = d.name;
    sel.appendChild(opt);
  });
}

async function addStaffel() {
  const discId = document.getElementById('staffel-disc-select').value;
  if (!discId) { alert('Bitte zuerst eine Disziplin wählen.'); return; }
  const { error } = await db.from('staffeln').insert({ discipline_id: discId });
  if (error) { alert('Fehler: ' + error.message); return; }
  loadStaffeln();
}

async function loadStaffeln() {
  const { data: discs } = await db.from('disciplines')
    .select('id, name, teilstrecke_1, teilstrecke_2, teilstrecke_3, teilstrecke_4')
    .eq('type', 'mannschaft');

  const { data: teilstrecken } = await db.from('teilstrecken').select('id, name');
  const tsMap = {};
  (teilstrecken || []).forEach(t => { tsMap[t.id] = t.name; });

  const { data: gruppen } = await db.from('staffeln')
    .select('id, discipline_id, created_at').order('created_at');

  const { data: positions } = await db.from('relay_positions')
    .select('id, staffel_id, position, swimmer_id').order('position');

  const { data: swimmers } = await db.from('swimmers').select('id, name, year').order('name');

  const container = document.getElementById('staffel-list');
  let html = '';

  (discs || []).forEach(disc => {
    const discGruppen = (gruppen || []).filter(g => g.discipline_id === disc.id);
    if (discGruppen.length === 0) return;

    const legs = [
      { pos: 1, name: tsMap[disc.teilstrecke_1] || '1. Teilstrecke' },
      { pos: 2, name: tsMap[disc.teilstrecke_2] || '2. Teilstrecke' },
      { pos: 3, name: tsMap[disc.teilstrecke_3] || '3. Teilstrecke' },
      { pos: 4, name: tsMap[disc.teilstrecke_4] || '4. Teilstrecke' },
    ];

    html += `<div class="disc-item">
      <div class="disc-item-header" onclick="toggleDisc(this)">
        <strong>${disc.name}</strong>
        <span style="font-size:0.8rem;color:var(--text-light)">(${discGruppen.length} Staffel${discGruppen.length > 1 ? 'n' : ''}) ▼</span>
      </div>
      <div class="disc-item-body">`;

    discGruppen.forEach((gr, idx) => {
      const grPositions = (positions || []).filter(p => p.staffel_id === gr.id);
      const posMap = {};
      grPositions.forEach(p => { posMap[p.position] = p.swimmer_id || ''; });

      html += `<div style="margin-bottom:1.5rem;padding:1rem;border:1px solid var(--border);border-radius:8px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.8rem">
          <h4>Staffel ${idx + 1}</h4>
          <button class="btn btn-sm btn-danger" onclick="deleteStaffel('${gr.id}')">Löschen</button>
        </div>
        <table><thead><tr><th>Teilstrecke</th><th>Schwimmer</th><th></th></tr></thead><tbody>`;

      legs.forEach(leg => {
        const currentSwimmer = posMap[leg.pos] || '';
        html += `<tr>
          <td><strong>${leg.name}</strong></td>
          <td>
            <select id="pos-${gr.id}-${leg.pos}" style="padding:6px;border:1.5px solid var(--border);border-radius:6px" onchange="autoSaveStaffelPos('${gr.id}',${leg.pos})">
              <option value="">– keiner –</option>
              ${(swimmers || []).map(s =>
                `<option value="${s.id}" ${s.id === currentSwimmer ? 'selected' : ''}>${s.name} (${s.year})</option>`
              ).join('')}
            </select>
          </td>
          <td><span id="save-status-pos-${gr.id}-${leg.pos}" style="font-size:0.8rem;color:var(--success)"></span></td>
        </tr>`;
      });
      html += `</tbody></table></div>`;
    });

    html += `</div></div>`;
  });

  container.innerHTML = html || '<p style="color:var(--text-light)">Noch keine Staffeln angelegt.</p>';
}

function autoSaveStaffelPos(gruppeId, position) {
  clearTimeout(_autoSaveTimers['pos-' + gruppeId + '-' + position]);
  _autoSaveTimers['pos-' + gruppeId + '-' + position] = setTimeout(() => _doSaveStaffelPos(gruppeId, position), 300);
}

async function _doSaveStaffelPos(gruppeId, position) {
  const sel = document.getElementById(`pos-${gruppeId}-${position}`);
  const swimmerId = sel.value || null;

  const { data: existing } = await db.from('relay_positions')
    .select('id').eq('staffel_id', gruppeId).eq('position', position).maybeSingle();

  let error;
  if (swimmerId === null && existing) {
    ({ error } = await db.from('relay_positions').delete().eq('id', existing.id));
  } else if (existing) {
    ({ error } = await db.from('relay_positions').update({ swimmer_id: swimmerId }).eq('id', existing.id));
  } else if (swimmerId) {
    ({ error } = await db.from('relay_positions').insert({ staffel_id: gruppeId, position, swimmer_id: swimmerId }));
  }
  const status = document.getElementById('save-status-pos-' + gruppeId + '-' + position);
  if (status) {
    status.textContent = error ? 'Fehler' : 'Gespeichert';
    status.style.color = error ? 'var(--danger)' : 'var(--success)';
    setTimeout(() => status.textContent = '', 2000);
  }
}

async function deleteStaffel(gruppeId) {
  if (!confirm('Staffel wirklich löschen?')) return;
  await db.from('relay_positions').delete().eq('staffel_id', gruppeId);
  await db.from('staffeln').delete().eq('id', gruppeId);
  loadStaffeln();
}

// ═══ ZEITEN ═════════════════════════════════════════════

async function loadTimesForSwimmer() {
  const swId = document.getElementById('select-swimmer-times').value;
  const cE  = document.getElementById('trainer-times-einzel');
  const cTs = document.getElementById('trainer-times-teilstrecken');
  if (!swId) { cE.innerHTML = ''; cTs.innerHTML = '<p style="color:var(--text-light);font-size:0.88rem">Wähle einen Schwimmer.</p>'; return; }

  const swimmer = allSwimmers.find(s => s.id === swId);
  if (!swimmer) return;

  const [discRes, timeRes] = await Promise.all([
    db.from('swimmer_disciplines').select('discipline_id,disciplines(id,name,type)').eq('swimmer_id', swId),
    db.from('times').select('discipline_id,time,created_at').eq('user_id', swimmer.user_id).is('teilstrecke_id', null).order('created_at', { ascending: false }),
  ]);

  const timesByDisc = {};
  (timeRes.data || []).forEach(t => {
    if (!timesByDisc[t.discipline_id]) timesByDisc[t.discipline_id] = [];
    timesByDisc[t.discipline_id].push(t);
  });

  // Einzeldisziplinen
  const einzelDiscs = (discRes.data || []).filter(d => d.disciplines.type === 'einzel');
  if (einzelDiscs.length === 0) {
    cE.innerHTML = '<p style="color:var(--text-light)">Keine Einzeldisziplinen zugewiesen.</p>';
  } else {
    let html = '';
    einzelDiscs.forEach(d => {
      const discTimes = timesByDisc[d.discipline_id] || [];
      const latest = discTimes.length > 0 ? formatTime(discTimes[0].time) : '–';
      html += `<div class="disc-item">
        <div class="disc-item-header" onclick="toggleDisc(this)">
          <span><strong>${d.disciplines.name}</strong>
            <span style="font-size:0.82rem;color:var(--text-light);margin-left:0.5rem">Letzte: ${latest}</span>
          </span>
          <span style="font-size:0.8rem;color:var(--text-light)">▼</span>
        </div>
        <div class="disc-item-body">
          <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.8rem">
            <input type="text" id="trt-${d.discipline_id}" placeholder="1:23,45"
              style="width:120px;padding:6px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:0.9rem;">
            <button class="btn btn-sm btn-primary" onclick="saveEinzelTime('${swimmer.user_id}','${d.discipline_id}')">Speichern</button>
            <span id="save-status-trt-${d.discipline_id}" style="font-size:0.8rem"></span>
          </div>
          ${discTimes.length > 0 ? '<div class="section-title" style="font-size:0.82rem">Historie</div><table><thead><tr><th>Datum</th><th>Zeit</th></tr></thead><tbody>' + discTimes.map(t => `<tr><td>${formatDate(t.created_at)}</td><td>${formatTime(t.time)}</td></tr>`).join('') + '</tbody></table>' : '<p style="color:var(--text-light);font-size:0.85rem">Noch keine Zeiten.</p>'}
        </div>
      </div>`;
    });
    cE.innerHTML = html;
  }

  // Teilstrecken
  const { data: allTs } = await db.from('teilstrecken').select('id, name').order('name');
  const { data: tsTimes } = await db.from('times')
    .select('teilstrecke_id, time, created_at')
    .eq('user_id', swimmer.user_id)
    .not('teilstrecke_id', 'is', null)
    .order('created_at', { ascending: false });

  const tsTimeMap = {};
  (tsTimes || []).forEach(t => {
    if (!tsTimeMap[t.teilstrecke_id]) tsTimeMap[t.teilstrecke_id] = [];
    tsTimeMap[t.teilstrecke_id].push(t);
  });

  let tsHtml = '<table><thead><tr><th>Teilstrecke</th><th>Aktuelle Zeit</th><th>Neue Zeit</th><th></th></tr></thead><tbody>';
  (allTs || []).forEach(ts => {
    const current = tsTimeMap[ts.id] && tsTimeMap[ts.id].length > 0 ? formatTime(tsTimeMap[ts.id][0].time) : '–';
    tsHtml += `<tr>
      <td>${ts.name}</td>
      <td>${current}</td>
      <td><input type="text" id="ts-time-${ts.id}" placeholder="0:23,45"
        style="width:100px;padding:4px 8px;border:1.5px solid var(--border);border-radius:6px"></td>
      <td><button class="btn btn-sm btn-primary" onclick="saveTsTimeTrainer('${swimmer.user_id}','${ts.id}')">Speichern</button></td>
    </tr>`;
  });
  tsHtml += '</tbody></table>';
  cTs.innerHTML = tsHtml;
}

/** Einzelzeit speichern (INSERT → Historie). */
async function saveEinzelTime(userId, discId) {
  const input = document.getElementById('trt-' + discId);
  const val = input.value.trim();
  if (!val) { alert('Bitte Zeit eingeben.'); return; }
  const sec = parseTime(val);
  if (sec === null) { alert('Ungültiges Format. Bitte mm:ss,hh eingeben.'); return; }
  const { error } = await db.from('times').insert({ user_id: userId, discipline_id: discId, time: sec });
  const status = document.getElementById('save-status-trt-' + discId);
  if (status) {
    status.textContent = error ? 'Fehler: ' + error.message : 'Gespeichert ✓';
    status.style.color = error ? 'var(--danger)' : 'var(--success)';
    setTimeout(() => status.textContent = '', 3000);
  }
  if (!error) { input.value = ''; loadTimesForSwimmer(); }
}

/** Teilstreckenzeit speichern (UPSERT → überschreibt). */
async function saveTsTimeTrainer(userId, tsId) {
  const input = document.getElementById('ts-time-' + tsId);
  const val = input.value.trim();
  if (!val) { alert('Bitte Zeit eingeben.'); return; }
  const sec = parseTime(val);
  if (sec === null) { alert('Ungültiges Format. Bitte mm:ss,hh eingeben.'); return; }

  const { data: existing } = await db.from('times')
    .select('id').eq('user_id', userId).eq('teilstrecke_id', tsId).maybeSingle();

  let error;
  if (existing) {
    ({ error } = await db.from('times').update({ time: sec }).eq('id', existing.id));
  } else {
    ({ error } = await db.from('times').insert({ user_id: userId, teilstrecke_id: tsId, time: sec }));
  }

  if (error) {
    alert('Fehler: ' + error.message);
  } else {
    input.value = '';
    loadTimesForSwimmer();
  }
}

// ═══ KONTEN ═════════════════════════════════════════════

async function loadAccounts() {
  const userIds = allSwimmers.map(s => s.user_id).filter(Boolean);
  const { data: usersData } = await db.from('users').select('id,active').in('id', userIds);
  const activeMap = {};
  (usersData || []).forEach(u => { activeMap[u.id] = u.active; });

  const c = document.getElementById('accounts-list');
  if (allSwimmers.length === 0) { c.innerHTML = '<p style="color:var(--text-light)">Keine Schwimmer.</p>'; return; }

  let html = '<table><thead><tr><th>Name</th><th>Jahrgang</th><th>Status</th><th>Aktion</th></tr></thead><tbody>';
  allSwimmers.forEach(s => {
    const active = activeMap[s.user_id] !== false;
    html += `<tr>
      <td>${s.name}</td><td>${s.year}</td>
      <td>${active ? '<span class="badge-aktiv">Aktiv</span>' : '<span class="badge-inaktiv">Inaktiv</span>'}</td>
      <td><button class="btn btn-sm ${active ? 'btn-danger' : 'btn-success'}" onclick="toggleAccount('${s.user_id}',${active})">${active ? 'Deaktivieren' : 'Aktivieren'}</button></td>
    </tr>`;
  });
  html += '</tbody></table>';
  c.innerHTML = html;
}

async function toggleAccount(userId, active) {
  if (!confirm(active ? 'Konto deaktivieren?' : 'Konto aktivieren?')) return;
  await db.from('users').update({ active: !active }).eq('id', userId);
  loadAccounts();
}

// ═══ STAFFEL-RECHNER ════════════════════════════════════

let lastRechnerResult = null;

async function initRechner() {
  const { data: discs } = await db.from('disciplines')
    .select('id, name, teilstrecke_1, teilstrecke_2, teilstrecke_3, teilstrecke_4')
    .eq('type', 'mannschaft');
  const sel = document.getElementById('rechner-disc');
  (discs || []).forEach(d => {
    sel.innerHTML += `<option value="${d.id}">${d.name}</option>`;
  });

  const filterDiv = document.getElementById('rechner-swimmer-filter');
  allSwimmers.forEach(s => {
    filterDiv.innerHTML += `<label><input type="checkbox" value="${s.id}" checked onchange="berechneStaffel()"> ${s.name} (${s.year})</label>`;
  });
}

function rechnerSelectAll(checked) {
  document.querySelectorAll('#rechner-swimmer-filter input[type=checkbox]').forEach(cb => { cb.checked = checked; });
  berechneStaffel();
}

async function berechneStaffel() {
  const discId = document.getElementById('rechner-disc').value;
  const container = document.getElementById('rechner-result');
  if (!discId) { container.innerHTML = ''; lastRechnerResult = null; return; }

  const selectedSwimmerIds = new Set(
    [...document.querySelectorAll('#rechner-swimmer-filter input[type=checkbox]:checked')].map(cb => cb.value)
  );

  const { data: disc } = await db.from('disciplines')
    .select('id, name, teilstrecke_1, teilstrecke_2, teilstrecke_3, teilstrecke_4')
    .eq('id', discId).single();

  const { data: teilstrecken } = await db.from('teilstrecken').select('id, name');
  const tsMap = {};
  (teilstrecken || []).forEach(t => { tsMap[t.id] = t.name; });

  const legs = [disc.teilstrecke_1, disc.teilstrecke_2, disc.teilstrecke_3, disc.teilstrecke_4].filter(Boolean);

  const { data: swimmers } = await db.from('swimmers').select('id, name, user_id');
  const filteredSwimmers = (swimmers || []).filter(s => selectedSwimmerIds.has(s.id));

  const { data: times } = await db.from('times')
    .select('user_id, teilstrecke_id, time')
    .in('teilstrecke_id', legs)
    .order('time', { ascending: true });

  const bestTimes = {};
  (times || []).forEach(t => {
    if (!bestTimes[t.user_id]) bestTimes[t.user_id] = {};
    if (!bestTimes[t.user_id][t.teilstrecke_id]) {
      bestTimes[t.user_id][t.teilstrecke_id] = t.time;
    }
  });

  const usedSwimmers = new Set();
  const result = [];

  legs.forEach((tsId, idx) => {
    let bestUser = null;
    let bestTime = Infinity;
    filteredSwimmers.forEach(s => {
      if (usedSwimmers.has(s.user_id)) return;
      const t = bestTimes[s.user_id]?.[tsId];
      if (t != null && t < bestTime) { bestTime = t; bestUser = s; }
    });
    if (bestUser) {
      usedSwimmers.add(bestUser.user_id);
      result.push({ leg: tsMap[tsId], swimmer: bestUser.name, swimmerId: bestUser.id, time: bestTime, position: idx + 1 });
    } else {
      result.push({ leg: tsMap[tsId], swimmer: '–', swimmerId: null, time: null, position: idx + 1 });
    }
  });

  lastRechnerResult = { discId, result };

  const totalTime = result.reduce((sum, r) => sum + (r.time || 0), 0);
  const hasAllPositions = result.every(r => r.swimmerId);

  let html = '<table><thead><tr><th>Teilstrecke</th><th>Schwimmer</th><th>Bestzeit</th></tr></thead><tbody>';
  result.forEach(r => {
    html += `<tr><td>${r.leg}</td><td>${r.swimmer}</td><td>${r.time != null ? formatTime(r.time) : '–'}</td></tr>`;
  });
  html += `</tbody></table>`;
  html += `<p style="margin-top:1rem;font-weight:600">Geschätzte Gesamtzeit: ${totalTime > 0 ? formatTime(totalTime) : '–'}</p>`;

  if (hasAllPositions) {
    html += `<button class="btn btn-primary" style="margin-top:1rem" onclick="rechnerAddStaffel()">Staffel hinzufügen</button>`;
  }
  container.innerHTML = html;
}

async function rechnerAddStaffel() {
  if (!lastRechnerResult) return;
  const { discId, result } = lastRechnerResult;

  const { data: staffel, error } = await db.from('staffeln').insert({ discipline_id: discId }).select().single();
  if (error) { alert('Fehler: ' + error.message); return; }

  const positions = result.filter(r => r.swimmerId).map(r => ({
    staffel_id: staffel.id, swimmer_id: r.swimmerId, position: r.position
  }));

  if (positions.length > 0) {
    const { error: posError } = await db.from('relay_positions').insert(positions);
    if (posError) { alert('Fehler: ' + posError.message); return; }
  }

  alert('Staffel wurde im Mannschafts-Tab angelegt!');
  loadStaffeln();
}
