'use strict';

// ─── Versie ───────────────────────────────────────────────────
const APP_VERSION    = '29';
const SCHEMA_VERSION = 29;
const STORAGE_KEY    = 'zorgplanner_v29_data';
const LEGACY_STORAGE_KEYS = [
  'zorgplanner_v28_data','zorgplanner_v27_data','zorgplanner_v26_data','zorgplanner_v24_data','zorgplanner_v25_data','zorgplanner_v24_data','zorgplanner_v23_data','zorgplanner_v22_data',
  'zorgplanner_v21_data','zorgplanner_v20_data',
  'zorgplanner_v16_data','zorgplanner_v13_data'
];

// ─── Supabase ─────────────────────────────────────────────────
const SB_URL  = 'https://esxwozxxhbtzgwewwbyk.supabase.co';
const SB_KEY  = 'sb_publishable_O28om6jTGH67z7x4QM2KIQ_8Bzv84Ct';
const FAMILY_META_LS_KEY  = 'zorgplanner_v29_family_meta';

// ─── Constanten ───────────────────────────────────────────────
const NAME_MIN = 2;
const NAME_MAX = 80;
const NAME_RE  = /^[\p{L}0-9][\p{L}0-9 .,'''\-()]*$/u;

const EMPTY_STATE = {
  currentUser: '', names: [], careOptions: [],
  locations: [], departments: [], descriptions: [],
  timeOptions: [], appointments: []
};

function loadFamilyMeta() {
  try {
    const raw = localStorage.getItem(FAMILY_META_LS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      code: cleanText(parsed.code || ''),
      familyId: cleanText(parsed.familyId || ''),
      mode: cleanText(parsed.mode || 'none')
    };
  } catch {
    return { code: '', familyId: '', mode: 'none' };
  }
}

function saveFamilyMeta() {
  localStorage.setItem(FAMILY_META_LS_KEY, JSON.stringify({
    code: activeFamilyCode || '',
    familyId: activeFamilyId || '',
    mode: activeBackendMode || 'none'
  }));
}

function setFamilySession(code, mode, familyId = '') {
  activeFamilyCode = cleanText(code).toLowerCase();
  activeBackendMode = mode || 'none';
  activeFamilyId = cleanText(familyId || '');
  familyUnlocked = Boolean(activeFamilyCode);
  familyMeta = { code: activeFamilyCode, familyId: activeFamilyId, mode: activeBackendMode };
  saveFamilyMeta();
}

function clearFamilySession() {
  activeFamilyCode = '';
  activeFamilyId = '';
  activeBackendMode = 'none';
  familyUnlocked = false;
  familyMeta = { code: '', familyId: '', mode: 'none' };
  saveFamilyMeta();
}

function parseArrayish(value) {
  if (Array.isArray(value)) return value.map(cleanText).filter(Boolean);
  if (value == null) return [];
  if (typeof value === 'string') {
    const clean = cleanText(value);
    if (!clean) return [];
    try {
      const parsed = JSON.parse(clean);
      if (Array.isArray(parsed)) return parsed.map(cleanText).filter(Boolean);
    } catch {}
    return [clean];
  }
  return [];
}

async function detectBackendForFamily(code) {
  const normalized = cleanText(code).toLowerCase();
  const safeCode = encodeURIComponent(normalized);

  try {
    let rows = await sbFetch(`families?select=id,code,name&code=eq.${safeCode}&limit=1`);
    if (!Array.isArray(rows)) rows = [];
    if (!rows.length) {
      rows = await sbFetch('families', {
        method: 'POST',
        body: JSON.stringify([{ code: normalized, name: normalized }])
      });
    }
    const familyId = rows?.[0]?.id;
    if (familyId) return { mode: 'familyTables', familyId, code: normalized };
  } catch (e) {
    console.info('Families-schema niet bruikbaar, platte tabel wordt geprobeerd:', e?.message || e);
  }

  try {
    await sbFetch('appointments?select=id&limit=1');
    return { mode: 'flatAppointments', familyId: '', code: normalized };
  } catch (e) {
    throw new Error('Geen bruikbare gedeelde opslag gevonden in Supabase.');
  }
}

// ─── App state ────────────────────────────────────────────────
let state             = loadState();
let currentView       = 'homeView';
let selectedDate      = todayString();
let selectedMonthDate = todayString();
let editingId         = null;
let tempPassengers    = [];
let tempCare          = [];
let familyMeta        = loadFamilyMeta();
let familyUnlocked    = Boolean(familyMeta.code);
let activeFamilyCode  = familyMeta.code || '';
let activeFamilyId    = familyMeta.familyId || '';
let activeBackendMode = familyMeta.mode || 'none';
let syncTimer         = null;

// ─── DOM refs ─────────────────────────────────────────────────
const els = {
  views:    document.querySelectorAll('.view'),
  navBtns:  document.querySelectorAll('.navbtn'),
  quickAddBtn:     document.getElementById('quickAddBtn'),
  userButton:      document.getElementById('userButton'),
  userButtonLabel: document.getElementById('userButtonLabel'),
  openNavBtn:      document.getElementById('openNavBtn'),

  homeView:     document.getElementById('homeView'),
  dayView:      document.getElementById('dayView'),
  weekView:     document.getElementById('weekView'),
  monthView:    document.getElementById('monthView'),
  openView:     document.getElementById('openView'),
  settingsView: document.getElementById('settingsView'),

  nameDialog:      document.getElementById('nameDialog'),
  currentUserName: document.getElementById('currentUserName'),
  saveUserNameBtn: document.getElementById('saveUserNameBtn'),
  userNameError:   document.getElementById('userNameError'),
  cancelNameBtn:   document.getElementById('cancelNameBtn'),

  appointmentDialog:   document.getElementById('appointmentDialog'),
  appointmentTitle:    document.getElementById('appointmentTitle'),
  closeAppointmentBtn: document.getElementById('closeAppointmentBtn'),
  apptDate:            document.getElementById('apptDate'),
  apptTime:            document.getElementById('apptTime'),
  apptLocation:        document.getElementById('apptLocation'),
  apptDepartment:      document.getElementById('apptDepartment'),
  apptDescription:     document.getElementById('apptDescription'),
  timeQuickPicks:        document.getElementById('timeQuickPicks'),
  locationQuickPicks:    document.getElementById('locationQuickPicks'),
  departmentQuickPicks:  document.getElementById('departmentQuickPicks'),
  descriptionQuickPicks: document.getElementById('descriptionQuickPicks'),
  apptDriver:       document.getElementById('apptDriver'),
  useMeAsDriver:    document.getElementById('useMeAsDriver'),
  apptPassengers:   document.getElementById('apptPassengers'),
  addPassengerBtn:  document.getElementById('addPassengerBtn'),
  useMeAsPassenger: document.getElementById('useMeAsPassenger'),
  passengerChips:   document.getElementById('passengerChips'),
  apptCareOption:   document.getElementById('apptCareOption'),
  addCareBtn:       document.getElementById('addCareBtn'),
  useMeAsCare:      document.getElementById('useMeAsCare'),
  careChips:        document.getElementById('careChips'),
  apptNote:             document.getElementById('apptNote'),
  saveAppointmentBtn:   document.getElementById('saveAppointmentBtn'),
  deleteAppointmentBtn: document.getElementById('deleteAppointmentBtn'),
  cancelAppointmentBtn: document.getElementById('cancelAppointmentBtn'),
  saveMessage:          document.getElementById('saveMessage'),
  appointmentErrorList: document.getElementById('appointmentErrorList'),

  manageDialog:     document.getElementById('manageDialog'),
  closeManageBtn:   document.getElementById('closeManageBtn'),
  manageNameInput:  document.getElementById('manageNameInput'),
  manageNameError:  document.getElementById('manageNameError'),
  addManageNameBtn: document.getElementById('addManageNameBtn'),
  manageNamesList:  document.getElementById('manageNamesList'),
  manageCareInput:  document.getElementById('manageCareInput'),
  addManageCareBtn: document.getElementById('addManageCareBtn'),
  manageCareList:   document.getElementById('manageCareList'),
  copyShareCodeBtn:   document.getElementById('copyShareCodeBtn'),
  pasteShareCodeBtn:  document.getElementById('pasteShareCodeBtn'),
  shareCodeArea:      document.getElementById('shareCodeArea'),
  shareCodeInput:     document.getElementById('shareCodeInput'),
  importShareCodeBtn: document.getElementById('importShareCodeBtn'),
  cancelShareCodeBtn: document.getElementById('cancelShareCodeBtn'),
  exportBtn:   document.getElementById('exportBtn'),
  importInput: document.getElementById('importInput'),

  toast:          document.getElementById('appToast'),
  toastMessage:   document.getElementById('toastMessage'),
  toastActionBtn: document.getElementById('toastActionBtn'),
  toastCloseBtn:  document.getElementById('toastCloseBtn'),

  timeError:     document.getElementById('apptTimeError'),
  driverError:   document.getElementById('apptDriverError'),
  passengerError:document.getElementById('apptPassengersError'),
  careError:     document.getElementById('apptCareError'),

  confirmDialog:    document.getElementById('confirmDialog'),
  confirmCancelBtn: document.getElementById('confirmCancelBtn'),
  confirmDeleteBtn: document.getElementById('confirmDeleteBtn'),

  nameSuggestions:        document.getElementById('nameSuggestions'),
  careSuggestions:        document.getElementById('careSuggestions'),
  timeSuggestions:        document.getElementById('timeSuggestions'),
  locationSuggestions:    document.getElementById('locationSuggestions'),
  departmentSuggestions:  document.getElementById('departmentSuggestions'),
  descriptionSuggestions: document.getElementById('descriptionSuggestions'),

  familyDialog:    document.getElementById('familyDialog'),
  familyCodeInput: document.getElementById('familyCodeInput'),
  familyCodeError: document.getElementById('familyCodeError'),
  joinFamilyBtn:   document.getElementById('joinFamilyBtn'),
  closeFamilyBtn:  document.getElementById('closeFamilyBtn'),
};

// ══════════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════════

init();

function init() {
  attachEvents();
  ensureStateShape();
  selectedDate      = todayString();
  selectedMonthDate = todayString();
  refreshAll();
  if (!state.currentUser) openNameDialog();
  clearValidationState();
  registerServiceWorker();
  if (familyUnlocked) {
    const startSync = async () => {
      try {
        if (activeBackendMode === 'none' && activeFamilyCode) {
          const conn = await detectBackendForFamily(activeFamilyCode);
          setFamilySession(conn.code, conn.mode, conn.familyId);
        }
      } catch (e) {
        console.error('Familiesynchronisatie kon niet worden hersteld:', e);
      }
      loadFromSupabase();
      startPolling();
    };
    startSync();
  }
}

// ══════════════════════════════════════════════════════════════
// SUPABASE
// ══════════════════════════════════════════════════════════════

async function sbFetch(path, opts = {}) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    method: opts.method || 'GET',
    headers: {
      'apikey':        SB_KEY,
      'Authorization': `Bearer ${SB_KEY}`,
      'Content-Type':  'application/json',
      'Prefer':        opts.prefer || 'return=representation',
    },
    body: opts.body || undefined
  });
  if (!res.ok) { const b = await res.text().catch(() => ''); throw new Error(`HTTP ${res.status}: ${b}`); }
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

async function loadFromSupabase() {
  if (!familyUnlocked) return;
  setSyncDot('syncing');
  try {
    let appointments = [];
    let remoteNames = [];
    let remoteCare = [];

    if (activeBackendMode === 'familyTables') {
      if (!activeFamilyId) {
        const conn = await detectBackendForFamily(activeFamilyCode);
        setFamilySession(conn.code, conn.mode, conn.familyId);
      }
      const rows = await sbFetch(`appointments?select=id,family_id,date,time,location,department,description,driver,passengers,care,note,created_at,updated_at&family_id=eq.${activeFamilyId}&order=date.asc,time.asc`);
      appointments = rows.map(rowToLocalFamily).filter(Boolean);
      try {
        const nameRows = await sbFetch(`family_names?select=name&family_id=eq.${activeFamilyId}&order=name.asc`);
        remoteNames = (nameRows || []).map(r => cleanText(r.name)).filter(Boolean);
      } catch {}
      try {
        const careRows = await sbFetch(`family_care_options?select=option&family_id=eq.${activeFamilyId}&order=option.asc`);
        remoteCare = (careRows || []).map(r => cleanText(r.option)).filter(Boolean);
      } catch {}
    } else {
      const rows = await sbFetch('appointments?select=id,appointment_date,appointment_time,location,department,description,chauffeur,attendees,opvang,notes,created_by,created_at,updated_at&order=appointment_date.asc,appointment_time.asc');
      appointments = rows.map(rowToLocalFlat).filter(Boolean);
    }

    state.appointments = appointments;
    state.names = uniqueStrings([...state.names, ...remoteNames]);
    state.careOptions = uniqueStrings([...state.careOptions, ...remoteCare]);
    saveState();
    refreshAll();
    setSyncDot('ok');
  } catch (e) {
    console.error('Laden mislukt:', e);
    setSyncDot('error');
  }
}

async function upsertToSupabase(appt) {
  if (!familyUnlocked) return;
  setSyncDot('syncing');
  try {
    if (activeBackendMode === 'familyTables') {
      if (!activeFamilyId) {
        const conn = await detectBackendForFamily(activeFamilyCode);
        setFamilySession(conn.code, conn.mode, conn.familyId);
      }
      await sbFetch('appointments?on_conflict=id', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=minimal',
        body: JSON.stringify(localToFamilyRow(appt))
      });
      await syncFamilyLists(appt);
    } else {
      await sbFetch('appointments?on_conflict=id', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=minimal',
        body: JSON.stringify(localToFlatRow(appt))
      });
    }
    setSyncDot('ok');
  } catch (e) {
    console.error('Opslaan Supabase mislukt:', e);
    setSyncDot('error');
    showToast('Opslaan bij familie mislukt. Controleer je verbinding.', true);
  }
}

async function deleteFromSupabase(id) {
  if (!familyUnlocked) return;
  try {
    if (activeBackendMode === 'familyTables' && activeFamilyId) {
      await sbFetch(`appointments?id=eq.${encodeURIComponent(id)}&family_id=eq.${encodeURIComponent(activeFamilyId)}`, { method: 'DELETE', prefer: 'return=minimal' });
    } else {
      await sbFetch(`appointments?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', prefer: 'return=minimal' });
    }
  } catch (e) { console.error('Verwijderen Supabase mislukt:', e); }
}

async function syncFamilyLists(appt) {
  if (activeBackendMode !== 'familyTables' || !activeFamilyId) return;
  const names = uniqueStrings([state.currentUser, appt.driver, ...(appt.passengers || [])]);
  const care = uniqueStrings(appt.care || []);
  if (names.length) {
    try {
      await sbFetch('family_names?on_conflict=family_id,name', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=minimal',
        body: JSON.stringify(names.map(name => ({ family_id: activeFamilyId, name })))
      });
    } catch (e) { console.info('family_names sync mislukt:', e?.message || e); }
  }
  if (care.length) {
    try {
      await sbFetch('family_care_options?on_conflict=family_id,option', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=minimal',
        body: JSON.stringify(care.map(option => ({ family_id: activeFamilyId, option })))
      });
    } catch (e) { console.info('family_care_options sync mislukt:', e?.message || e); }
  }
}

function startPolling() {
  if (syncTimer) clearInterval(syncTimer);
  syncTimer = setInterval(() => { if (document.visibilityState !== 'hidden') loadFromSupabase(); }, 15000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && familyUnlocked) loadFromSupabase(); });
}

function rowToLocalFlat(row) {
  if (!row) return null;
  const date = normalizeDateInput(row.appointment_date);
  const rawTime = row.appointment_time || '00:00';
  const time = normalizeTimeInput(rawTime) || '00:00';
  if (!date) return null;
  return {
    id: String(row.id),
    date,
    time,
    location: cleanText(row.location || ''),
    department: cleanText(row.department || ''),
    description: cleanText(row.description || ''),
    driver: cleanText(row.chauffeur || ''),
    passengers: parseArrayish(row.attendees),
    care: parseArrayish(row.opvang),
    note: cleanText(row.notes || ''),
    createdBy: cleanText(row.created_by || ''),
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString()
  };
}

function rowToLocalFamily(row) {
  if (!row) return null;
  const date = normalizeDateInput(String(row.date || ''));
  const rawTime = row.time || '00:00';
  const time = normalizeTimeInput(rawTime) || '00:00';
  if (!date) return null;
  return {
    id: String(row.id),
    date,
    time,
    location: cleanText(row.location || ''),
    department: cleanText(row.department || ''),
    description: cleanText(row.description || ''),
    driver: cleanText(row.driver || ''),
    passengers: parseArrayish(row.passengers),
    care: parseArrayish(row.care),
    note: cleanText(row.note || ''),
    createdBy: '',
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString()
  };
}

function localToFlatRow(a) {
  return {
    id: a.id,
    appointment_date: a.date,
    appointment_time: a.time,
    location: a.location || '',
    department: a.department || '',
    description: a.description || '',
    chauffeur: a.driver || '',
    attendees: a.passengers || [],
    opvang: a.care || [],
    notes: a.note || '',
    created_by: a.createdBy || state.currentUser || '',
    updated_at: new Date().toISOString()
  };
}

function localToFamilyRow(a) {
  return {
    id: a.id,
    family_id: activeFamilyId,
    date: a.date,
    time: a.time,
    location: a.location || '',
    department: a.department || '',
    description: a.description || '',
    driver: a.driver || '',
    passengers: a.passengers || [],
    care: a.care || [],
    note: a.note || '',
    updated_at: new Date().toISOString()
  };
}

let syncDotEl = null;
function setSyncDot(status) {
  if (!syncDotEl) syncDotEl = document.getElementById('syncDot');
  if (!syncDotEl) return;
  syncDotEl.className = `syncDot ${status}`;
  syncDotEl.title = { ok:'Gesynchroniseerd ✓', syncing:'Synchroniseren…', error:'Sync mislukt ✗' }[status] || '';
}

// ══════════════════════════════════════════════════════════════
// FAMILIE TOEGANG
// ══════════════════════════════════════════════════════════════

function openFamilyDialog() {
  if (els.familyCodeInput) els.familyCodeInput.value = activeFamilyCode || '';
  if (els.familyCodeError) els.familyCodeError.textContent = '';
  els.familyDialog?.showModal();
}

async function submitFamilyCode() {
  const entered = cleanText(els.familyCodeInput?.value || '');
  if (entered.length < 2) {
    if (els.familyCodeError) els.familyCodeError.textContent = 'Vul een geldige familiecode in.';
    return;
  }
  if (els.familyCodeError) els.familyCodeError.textContent = 'Verbinden…';
  try {
    const conn = await detectBackendForFamily(entered);
    setFamilySession(conn.code, conn.mode, conn.familyId);
    els.familyDialog?.close();

    const localAppts = [...state.appointments];
    if (localAppts.length > 0) {
      for (const a of localAppts) {
        await upsertToSupabase(a);
      }
    }
    await loadFromSupabase();
    startPolling();
    refreshAll();
    showToast('Verbonden met de familie.');
  } catch (e) {
    console.error('Verbinden met familie mislukt:', e);
    if (els.familyCodeError) {
      els.familyCodeError.textContent = 'Verbinden met familie mislukt. Controleer de code en Supabase-tabellen.';
    }
    setSyncDot('error');
  }
}

function attachEvents() {
  els.navBtns.forEach(btn => {
    let tapped = false;
    btn.addEventListener('touchend', e => {
      e.preventDefault(); e.stopPropagation();
      tapped = true;
      setView(btn.dataset.view);
      setTimeout(() => { tapped = false; }, 400);
    }, { passive: false });
    btn.addEventListener('click', e => {
      if (tapped) return; // al afgehandeld door touchend
      setView(btn.dataset.view);
    });
  });

  els.quickAddBtn.addEventListener('click', () => openAppointmentDialog());
  els.quickAddBtn.addEventListener('touchend', e => { e.preventDefault(); openAppointmentDialog(); }, { passive: false });
  els.userButton.addEventListener('click', openNameDialog);

  els.saveUserNameBtn.addEventListener('click', saveUserName);
  els.cancelNameBtn.addEventListener('click', () => els.nameDialog.close());
  els.currentUserName.addEventListener('keydown', e => { if (e.key === 'Enter') saveUserName(); });

  els.closeAppointmentBtn.addEventListener('click', closeAppointmentDialog);
  els.cancelAppointmentBtn.addEventListener('click', closeAppointmentDialog);
  els.saveAppointmentBtn.addEventListener('click', saveAppointment);
  els.deleteAppointmentBtn.addEventListener('click', () => { if (editingId) els.confirmDialog.showModal(); });

  els.useMeAsDriver.addEventListener('click', () => { if (!state.currentUser) return openNameDialog(); els.apptDriver.value = state.currentUser; });
  els.useMeAsPassenger.addEventListener('click', () => { if (!state.currentUser) return openNameDialog(); addTempPassenger(state.currentUser); });
  els.useMeAsCare.addEventListener('click', () => { if (!state.currentUser) return openNameDialog(); addTempCare(state.currentUser); });

  els.addPassengerBtn.addEventListener('click', () => { addTempPassenger(els.apptPassengers.value); els.apptPassengers.value = ''; els.apptPassengers.focus(); });
  els.apptPassengers.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); els.addPassengerBtn.click(); } });
  // Geen auto-add op blur — voorkomt race condition met saveAppointment

  els.apptTime.addEventListener('blur', () => { const n = normalizeTimeInput(els.apptTime.value); if (n) els.apptTime.value = n; });

  [els.currentUserName, els.manageNameInput, els.apptDriver, els.apptPassengers, els.apptCareOption, els.apptTime, els.apptDate]
    .forEach(inp => { if (inp) inp.addEventListener('input', () => clearFieldError(inp)); });

  els.addCareBtn.addEventListener('click', () => { addTempCare(els.apptCareOption.value); els.apptCareOption.value = ''; els.apptCareOption.focus(); });
  els.apptCareOption.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); els.addCareBtn.click(); } });
  els.apptCareOption.addEventListener('blur', () => {
    const v = cleanText(els.apptCareOption.value);
    if (!v) return;
    setTimeout(() => {
      const latest = cleanText(els.apptCareOption.value);
      if (!latest) return;
      addTempCare(latest);
      els.apptCareOption.value = '';
    }, 60);
  });

  setupFieldSuggestions();

  els.confirmDeleteBtn.addEventListener('click', deleteAppointment);
  els.confirmCancelBtn.addEventListener('click', () => els.confirmDialog.close());

  els.closeManageBtn.addEventListener('click', () => els.manageDialog.close());
  els.addManageNameBtn.addEventListener('click', () => {
    const value = cleanText(els.manageNameInput.value);
    const error = validatePersonName(value, 'Naam');
    if (error) { if (els.manageNameError) els.manageNameError.textContent = error; els.manageNameInput.classList.add('fieldError'); els.manageNameInput.focus(); return; }
    if (els.manageNameError) els.manageNameError.textContent = '';
    els.manageNameInput.classList.remove('fieldError');
    rememberName(value); els.manageNameInput.value = '';
    persistAndRefresh(); renderManageDialog(); showToast('Naam toegevoegd.');
  });
  els.manageNameInput.addEventListener('keydown', e => { if (e.key === 'Enter') els.addManageNameBtn.click(); });
  els.addManageCareBtn.addEventListener('click', () => {
    const value = cleanText(els.manageCareInput.value); if (!value) return;
    rememberCareOption(value); els.manageCareInput.value = '';
    persistAndRefresh(); renderManageDialog(); showToast('Opvangoptie toegevoegd.');
  });
  els.manageCareInput.addEventListener('keydown', e => { if (e.key === 'Enter') els.addManageCareBtn.click(); });

  els.copyShareCodeBtn?.addEventListener('click', copyShareCode);
  els.pasteShareCodeBtn?.addEventListener('click', () => {
    els.shareCodeArea.classList.toggle('hidden');
    if (!els.shareCodeArea.classList.contains('hidden')) { els.shareCodeInput.value = ''; els.shareCodeInput.focus(); }
  });
  els.importShareCodeBtn?.addEventListener('click', () => importShareCode(els.shareCodeInput.value));
  els.cancelShareCodeBtn?.addEventListener('click', () => { els.shareCodeArea.classList.add('hidden'); els.shareCodeInput.value = ''; });

  els.exportBtn?.addEventListener('click', exportData);
  els.importInput?.addEventListener('change', importData);
  els.toastCloseBtn?.addEventListener('click', hideToast);

  els.joinFamilyBtn?.addEventListener('click', submitFamilyCode);
  els.closeFamilyBtn?.addEventListener('click', () => els.familyDialog?.close());
  els.familyCodeInput?.addEventListener('keydown', e => { if (e.key === 'Enter') submitFamilyCode(); });
}

// ══════════════════════════════════════════════════════════════
// VIEWS
// ══════════════════════════════════════════════════════════════

function setView(viewId) {
  currentView = viewId || 'homeView';
  els.views.forEach(v => v.classList.toggle('active', v.id === currentView));
  els.navBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.view === currentView));
  refreshAll();
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function refreshAll() {
  ensureStateShape();
  state.appointments = sortAppointments(state.appointments);
  renderSuggestions(); renderQuickPicks(); renderUserButton(); renderNavBadge();
  renderHome(); renderDay(); renderWeek(); renderMonth(); renderOpenTasks(); renderSettings();
}

function renderUserButton() {
  els.userButtonLabel.textContent = state.currentUser ? `${state.currentUser} ✓` : 'Jouw naam';
}

function renderNavBadge() {
  const existing = els.openNavBtn.querySelector('.navBadge');
  if (existing) existing.remove();
  const count = state.appointments.filter(a => appointmentStatus(a).key !== 'green').length;
  if (count > 0) {
    const badge = document.createElement('span');
    badge.className = 'navBadge';
    badge.textContent = String(count);
    els.openNavBtn.appendChild(badge);
  }
}

function renderHome() {
  const upcoming  = getUpcomingAppointment();
  const openItems = state.appointments.filter(a => appointmentStatus(a).key !== 'green').slice(0, 4);

  let html = familyUnlocked
    ? `<div class="syncBanner synced">🔄 Familiesynchronisatie actief${activeFamilyCode ? ' (' + escapeHtml(activeFamilyCode) + ')' : ''} <span id="syncDot" class="syncDot ok" title="Gesynchroniseerd ✓"></span></div>`
    : `<div class="syncBanner offline">📱 Lokale modus — <button class="linkBtn" id="homeFamilyBtn">Verbind met familie</button></div>`;

  html += '<section class="card"><h2 class="sectionTitle">Eerstvolgende afspraak</h2>';
  html += upcoming ? cardHtml(upcoming, { noMargin: true }) : '<div class="emptyState">Nog niets ingepland.</div>';
  html += '</section>';

  html += '<section class="card"><h2 class="sectionTitle">Nog te regelen</h2>';
  if (!openItems.length) {
    html += '<div class="emptyState">Alles is op dit moment geregeld. ✓</div>';
  } else {
    openItems.forEach(a => {
      const st = appointmentStatus(a);
      html += `<div class="openTaskRow">
        <div class="openTaskInfo">
          <strong>${escapeHtml(formatDateDutch(a.date))} · ${escapeHtml(a.time)}</strong>
          <div class="muted">${escapeHtml(a.location || 'Locatie onbekend')}</div>
          <div class="reason">${escapeHtml(st.reason)}</div>
        </div>
        <button class="ghost small" data-edit="${a.id}">Invullen</button>
      </div>`;
    });
  }
  html += '</section>';

  els.homeView.innerHTML = html;
  syncDotEl = document.getElementById('syncDot');
  document.getElementById('homeFamilyBtn')?.addEventListener('click', openFamilyDialog);
  bindDynamicActions(els.homeView);
}

function renderDay() { try {
  const appts   = getAppointmentsForDate(selectedDate);
  const isToday = selectedDate === todayString();
  let html = `<section class="card"><div class="dayNav">
    <button class="ghost small" id="prevDayBtn">← Vorige</button>
    <div class="dayNavCenter">
      <h2>${escapeHtml(formatDateDutch(selectedDate))}${isToday ? ' <span class="todayBadge">Vandaag</span>' : ''}</h2>
      <p class="muted">${appts.length ? telAfspraken(appts.length) : 'Geen planning'}</p>
    </div>
    <button class="ghost small" id="nextDayBtn">Volgende →</button>
  </div></section>`;

  if (!appts.length) {
    html += '<div class="emptyState">Geen afspraken op deze dag.</div>';
  } else {
    appts.forEach(a => { html += cardHtml(a); });
  }
  els.dayView.innerHTML = html;
  document.getElementById('prevDayBtn')?.addEventListener('click', () => { selectedDate = addDays(selectedDate, -1); renderDay(); });
  document.getElementById('nextDayBtn')?.addEventListener('click', () => { selectedDate = addDays(selectedDate,  1); renderDay(); });
  bindDynamicActions(els.dayView);
  } catch(e) { console.error('renderDay fout:', e); els.dayView.innerHTML = '<div class="emptyState" style="margin:20px">Dagweergave kon niet worden geladen. Probeer opnieuw.</div>'; }
}

function renderWeek() { try {
  const monday    = getWeekStart(selectedDate);
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const weekAppts = weekDates.flatMap(d => getAppointmentsForDate(d));
  const weekSummary = aggregateStatuses(weekAppts.map(appointmentStatusKey));
  const weekCount   = weekAppts.length;
  const weekBadge   = weekCount
    ? `<span class="weekBadge ${weekSummary}">${telAfspraken(weekCount)}</span>`
    : '<span class="weekBadge empty">Geen planning</span>';

  let html = `<section class="card"><div class="dayNav">
    <button class="ghost small" id="prevWeekBtn">← Vorige</button>
    <div class="dayNavCenter">
      <h2>${escapeHtml(formatDateShortNL(monday))} t/m ${escapeHtml(formatDateShortNL(addDays(monday, 6)))}</h2>
      <div class="weekHeaderMeta">${weekBadge}</div>
    </div>
    <button class="ghost small" id="nextWeekBtn">Volgende →</button>
  </div></section>`;

  weekDates.forEach(date => {
    const dayAppts = getAppointmentsForDate(date);
    const isToday  = date === todayString();
    html += `<section class="weekDayBlock ${isToday ? 'isToday' : ''}">`;
    html += `<div class="weekDayTitle">${escapeHtml(formatDateDutch(date))}${isToday ? ' <span class="todayBadge">Vandaag</span>' : ''}`;
    if (dayAppts.length) html += `<span class="miniStatus ${dayStatus(date)}"></span><span class="miniCount">${dayAppts.length}</span>`;
    html += '</div>';
    if (!dayAppts.length) {
      html += '<div class="emptyState">Geen planning voor deze dag.</div>';
    } else {
      dayAppts.forEach(a => { html += cardHtml(a, { compact: true }); });
    }
    html += '</section>';
  });

  els.weekView.innerHTML = html;
  document.getElementById('prevWeekBtn')?.addEventListener('click', () => { selectedDate = addDays(monday, -7); renderWeek(); });
  document.getElementById('nextWeekBtn')?.addEventListener('click', () => { selectedDate = addDays(monday,  7); renderWeek(); });
  bindDynamicActions(els.weekView);
  } catch(e) { console.error('renderWeek fout:', e); els.weekView.innerHTML = '<div class="emptyState" style="margin:20px">Weekweergave kon niet worden geladen. Probeer opnieuw.</div>'; }
}

function renderMonth() { try {
  const first      = monthStart(selectedMonthDate);
  const gridStart  = getWeekStart(first);
  const monthLabel = first.slice(0, 7);

  const monthAppts = state.appointments.filter(a => a.date.startsWith(monthLabel));
  const monthCount = monthAppts.length;
  const openCount  = monthAppts.filter(a => appointmentStatus(a).key !== 'green').length;

  let html = `<section class="card">
    <div class="monthNavRow">
      <button class="navArrowBtn" id="prevMonthBtn" aria-label="Vorige maand">‹</button>
      <div class="monthNavCenter">
        <h2 class="monthTitle">${escapeHtml(formatMonthYear(first))}</h2>
        <div class="monthSummaryLine">
          ${monthCount
            ? `<span class="monthSummaryBadge total">${monthCount} gepland</span>`
            : '<span class="monthSummaryBadge empty">Geen planning</span>'}
          ${openCount ? `<span class="monthSummaryBadge open">${openCount} open</span>` : ''}
        </div>
      </div>
      <button class="navArrowBtn" id="nextMonthBtn" aria-label="Volgende maand">›</button>
    </div>
    <div class="monthGridHeader">
      ${['Ma','Di','Wo','Do','Vr','Za','Zo'].map(d => `<div class="weekdayLabel">${d}</div>`).join('')}
    </div>
    <div class="monthGrid">`;

  for (let i = 0; i < 42; i++) {
    const date     = addDays(gridStart, i);
    const dayAppts = getAppointmentsForDate(date);
    const inMonth  = date.startsWith(monthLabel);
    const isToday  = date === todayString();
    const status   = dayStatus(date);

    const cls = ['monthCell',
      !inMonth              ? 'otherMonth'          : '',
      isToday               ? 'isToday'             : '',
      date === selectedDate ? 'isSelected'          : '',
      dayAppts.length       ? `hasDot status-${status}` : ''
    ].filter(Boolean).join(' ');

    const dayNum = date.slice(8, 10).replace(/^0/, '');
    let dotHtml = '';
    if (dayAppts.length) {
      dotHtml = `<div class="monthDots"><span class="monthDotSingle ${status}"></span>${dayAppts.length > 1 ? `<span class="monthApptCount status-${status}">${dayAppts.length}</span>` : ''}</div>`;
    }

    html += `<button type="button" class="${cls}" data-goto-date="${date}"
      aria-label="${escapeHtml(formatDateDutch(date))}${dayAppts.length ? `, ${dayAppts.length} gepland` : ''}">
      <div class="monthDayNum">${escapeHtml(dayNum)}${isToday ? '<span class="todayDot"></span>' : ''}</div>
      ${dotHtml}
    </button>`;
  }

  html += '</div></section>';

  // Detail-paneel — altijd zichtbaar
  const detailDate    = selectedDate.startsWith(monthLabel) ? selectedDate : first;
  const selAppts      = getAppointmentsForDate(detailDate);
  const isDetailToday = detailDate === todayString();

  html += `<section class="card monthDayDetail">
    <div class="monthDayDetailHeader">
      <h3 class="monthDayDetailTitle">${escapeHtml(formatDateDutch(detailDate))}${isDetailToday ? ' <span class="todayBadge">Vandaag</span>' : ''}</h3>
      <button class="ghost small" data-add-date="${detailDate}">+ Toevoegen</button>
    </div>`;

  if (!selAppts.length) {
    html += '<div class="emptyState">Geen afspraken op deze dag.</div>';
  } else {
    selAppts.forEach(a => { html += cardHtml(a, { compact: true }); });
  }
  html += '</section>';

  els.monthView.innerHTML = html;

  document.getElementById('prevMonthBtn')?.addEventListener('click', () => { selectedMonthDate = addMonths(first, -1); renderMonth(); });
  document.getElementById('nextMonthBtn')?.addEventListener('click', () => { selectedMonthDate = addMonths(first,  1); renderMonth(); });

  els.monthView.querySelectorAll('[data-goto-date]').forEach(btn => {
    btn.addEventListener('click', () => {
      const date = btn.dataset.gotoDate;
      if (selectedDate === date) {
        setView('dayView');
      } else {
        selectedDate = date; selectedMonthDate = date; renderMonth();
        setTimeout(() => els.monthView.querySelector('.monthDayDetail')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 30);
      }
    });
  });
  els.monthView.querySelectorAll('[data-add-date]').forEach(btn => {
    btn.addEventListener('click', () => { selectedDate = btn.dataset.addDate; openAppointmentDialog(); });
  });
  bindDynamicActions(els.monthView);
  } catch(e) { console.error('renderMonth fout:', e); els.monthView.innerHTML = '<div class="emptyState" style="margin:20px">Maandweergave kon niet worden geladen. Probeer opnieuw.</div>'; }
}

function renderOpenTasks() { try {
  const open = state.appointments.filter(a => appointmentStatus(a).key !== 'green');
  let html = '<section class="card"><h2 class="sectionTitle">Open taken</h2>';
  if (!open.length) {
    html += '<div class="emptyState">Er staan nu geen open taken. ✓</div>';
  } else {
    open.forEach(a => {
      const st = appointmentStatus(a);
      html += `<div class="openTaskRow">
        <div class="openTaskInfo">
          <strong>${escapeHtml(formatDateDutch(a.date))} · ${escapeHtml(a.time)}</strong>
          <div class="muted">${escapeHtml(a.location || 'Locatie onbekend')}</div>
          <div class="reason">${escapeHtml(st.reason)}</div>
        </div>
        <button class="ghost small" data-edit="${a.id}">Invullen</button>
      </div>`;
    });
  }
  html += '</section>';
  els.openView.innerHTML = html;
  bindDynamicActions(els.openView);
  } catch(e) { console.error('renderOpenTasks fout:', e); els.openView.innerHTML = '<div class="emptyState" style="margin:20px">Kon taken niet laden. Probeer opnieuw.</div>'; }
}

function renderSettings() { try {
  const syncStatus = familyUnlocked
    ? `<span style="color:var(--ok);font-weight:800">✓ Verbonden${activeFamilyCode ? ' met code ' + escapeHtml(activeFamilyCode) : ''} — synchroniseert automatisch</span>`
    : `<span class="muted">Niet verbonden met de familie</span>`;

  els.settingsView.innerHTML = `
    <section class="card">
      <h2 class="sectionTitle">Beheer</h2>
      <div class="openTaskRow">
        <div class="openTaskInfo"><strong>Jouw naam</strong>
          <div class="muted">${escapeHtml(state.currentUser || 'Nog niet ingevuld')}</div></div>
        <button class="ghost small" id="editUserBtn">Aanpassen</button>
      </div>
      <div class="openTaskRow">
        <div class="openTaskInfo"><strong>🔄 Familiesynchronisatie</strong>
          <div class="muted">${syncStatus}</div></div>
        ${familyUnlocked
          ? `<button class="ghost small" id="reloadBtn">↻ Herladen</button>`
          : `<button class="primary small" id="openFamilySettingsBtn">Verbinden</button>`}
      </div>
      <div class="openTaskRow">
        <div class="openTaskInfo"><strong>Namen en opvangopties</strong>
          <div class="muted">${state.names.length} namen · ${state.careOptions.length} opvangopties</div></div>
        <button class="primary small" id="openManageBtn">Beheer</button>
      </div>
      <div class="openTaskRow">
        <div class="openTaskInfo"><strong>Afspraken</strong>
          <div class="muted">${telAfspraken(state.appointments.length)}</div></div>
      </div>
      <div class="openTaskRow">
        <div class="openTaskInfo"><strong>Back-up</strong>
          <div class="muted">Exporteer of importeer als bestand</div></div>
        <div style="display:flex;gap:8px">
          <button class="ghost small" id="exportBtnS">⬇️ Export</button>
          <label class="ghost small importLabel" style="min-height:40px;padding:9px 14px;font-size:.9rem">
            ⬆️ Import<input id="importInputS" type="file" accept="application/json">
          </label>
        </div>
      </div>
      <div class="openTaskRow">
        <div class="openTaskInfo"><strong>Versie</strong>
          <div class="muted">Zorgplanner v${APP_VERSION}</div></div>
      </div>
    </section>
    <section class="card">
      <h2 class="sectionTitle">Installeren als app</h2>
      <p class="muted">Open de browser-opties en kies <strong>Installeren</strong> of <strong>Toevoegen aan beginscherm</strong> voor een volledig scherm ervaring.</p>
    </section>`;

  document.getElementById('editUserBtn')?.addEventListener('click', openNameDialog);
  document.getElementById('openManageBtn')?.addEventListener('click', () => { renderManageDialog(); els.manageDialog.showModal(); });
  document.getElementById('openFamilySettingsBtn')?.addEventListener('click', openFamilyDialog);
  document.getElementById('reloadBtn')?.addEventListener('click', () => { loadFromSupabase(); showToast('Afspraken worden herladen…'); });
  document.getElementById('exportBtnS')?.addEventListener('click', exportData);
  document.getElementById('importInputS')?.addEventListener('change', importData);
  } catch(e) { console.error('renderSettings fout:', e); els.settingsView.innerHTML = '<div class="emptyState" style="margin:20px">Instellingen konden niet worden geladen. Probeer opnieuw.</div>'; }
}

function renderManageDialog() {
  els.manageNamesList.innerHTML = state.names.length
    ? state.names.map(v => chipHtml(v, 'remove-name')).join('')
    : '<div class="emptyState" style="font-size:.95rem">Nog geen namen toegevoegd.</div>';
  els.manageCareList.innerHTML = state.careOptions.length
    ? state.careOptions.map(v => chipHtml(v, 'remove-care')).join('')
    : '<div class="emptyState" style="font-size:.95rem">Nog geen opvangopties toegevoegd.</div>';

  els.manageNamesList.querySelectorAll('[data-remove-name]').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.removeName;
      state.names = state.names.filter(n => n !== val);
      state.appointments.forEach(a => { if (a.driver === val) a.driver = ''; a.passengers = (a.passengers || []).filter(p => p !== val); });
      if (state.currentUser === val) state.currentUser = '';
      persistAndRefresh(); renderManageDialog();
      if (!state.currentUser) openNameDialog();
      showToast('Naam verwijderd.');
    });
  });
  els.manageCareList.querySelectorAll('[data-remove-care]').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.removeCare;
      state.careOptions = state.careOptions.filter(n => n !== val);
      state.appointments.forEach(a => { a.care = (a.care || []).filter(c => c !== val); });
      persistAndRefresh(); renderManageDialog();
    });
  });
}

// ══════════════════════════════════════════════════════════════
// AFSPRAKEN
// ══════════════════════════════════════════════════════════════

function openAppointmentDialog(id = null) {
  editingId = id; tempPassengers = []; tempCare = [];
  els.saveMessage.textContent = '';

  if (id) {
    const a = state.appointments.find(x => x.id === id);
    if (!a) return;
    els.appointmentTitle.textContent = 'Afspraak bewerken';
    els.apptDate.value        = a.date;
    els.apptTime.value        = a.time;
    els.apptLocation.value    = a.location    || '';
    els.apptDepartment.value  = a.department  || '';
    els.apptDescription.value = a.description || '';
    els.apptDriver.value      = a.driver      || '';
    els.apptNote.value        = a.note        || '';
    tempPassengers = [...(a.passengers || [])];
    tempCare       = [...(a.care       || [])];
    els.deleteAppointmentBtn.classList.remove('hidden');
  } else {
    els.appointmentTitle.textContent = 'Nieuwe afspraak';
    els.apptDate.value        = selectedDate || todayString();
    els.apptTime.value        = '09:00';
    els.apptLocation.value    = '';
    els.apptDepartment.value  = '';
    els.apptDescription.value = '';
    els.apptDriver.value      = '';
    els.apptNote.value        = '';
    els.deleteAppointmentBtn.classList.add('hidden');
  }
  els.apptPassengers.value = '';
  els.apptCareOption.value = '';
  clearAppointmentErrors(); renderTempChips(); renderQuickPicks();
  els.appointmentDialog.showModal();
}

function closeAppointmentDialog() { els.appointmentDialog.close(); }

async function saveAppointment() {
  clearAppointmentErrors();

  const date = normalizeDateInput(els.apptDate.value);
  const rawTime = cleanText(els.apptTime.value);
  const timeResult = parseAndNormalizeTime(rawTime);
  const driver = cleanText(els.apptDriver.value);
  const pendingPassenger = cleanText(els.apptPassengers.value);
  const pendingCare = cleanText(els.apptCareOption.value);
  const passengers = uniqueStrings([...tempPassengers, ...(pendingPassenger ? [pendingPassenger] : [])]);
  const care = uniqueStrings([...tempCare, ...(pendingCare ? [pendingCare] : [])]);

  const errors = [];
  clearInlineAppointmentErrors();

  if (!date) errors.push({ field: els.apptDate, message: 'Vul een geldige datum in.' });
  if (!timeResult.ok) {
    const msg = timeResult.message || 'Ongeldige tijd. Gebruik 09:00.';
    setFieldError(els.apptTime, msg, els.timeError);
    errors.push({ field: els.apptTime, message: msg });
  }

  const driverError = driver ? validatePersonName(driver, 'Chauffeur') : '';
  if (driverError) {
    setFieldError(els.apptDriver, driverError, els.driverError);
    errors.push({ field: els.apptDriver, message: driverError });
  }

  const passengerErrors = passengers.map(n => validateOptionalPersonName(n, 'Naam')).filter(Boolean);
  if (passengerErrors.length) {
    setFieldError(els.apptPassengers, passengerErrors[0], els.passengerError);
    errors.push({ field: els.apptPassengers, message: passengerErrors[0] });
  }

  const careErrors = care.map(v => validateOptionalPersonName(v, 'Oppas / opvang')).filter(Boolean);
  if (careErrors.length) {
    setFieldError(els.apptCareOption, careErrors[0], els.careError);
    errors.push({ field: els.apptCareOption, message: careErrors[0] });
  }

  if (errors.length) {
    showAppointmentErrors(errors);
    return;
  }

  const appt = {
    id: editingId || generateId(),
    date,
    time: timeResult.value,
    location: cleanText(els.apptLocation.value),
    department: cleanText(els.apptDepartment.value),
    description: cleanText(els.apptDescription.value),
    driver,
    passengers,
    care,
    note: cleanText(els.apptNote.value),
    createdBy: state.currentUser || '',
    createdAt: editingId ? (state.appointments.find(a => a.id === editingId)?.createdAt || new Date().toISOString()) : new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (driver) rememberName(driver);
  appt.passengers.forEach(rememberName);
  appt.care.forEach(rememberCareOption);
  rememberLocation(appt.location);
  rememberDepartment(appt.department);
  rememberDescription(appt.description);
  rememberTimeOption(appt.time);

  const existingIndex = state.appointments.findIndex(a => a.id === appt.id);
  if (existingIndex >= 0) state.appointments[existingIndex] = appt;
  else state.appointments.push(appt);

  selectedDate = appt.date;
  selectedMonthDate = appt.date;

  closeAppointmentDialog();
  setView('dayView');

  try {
    persistAndRefresh();
    showToast('Afspraak opgeslagen.');
  } catch (e) {
    console.error('Lokaal opslaan mislukt:', e);
    showToast('Opslaan is deels gelukt, maar de weergave kon niet direct verversen.', true);
  }

  if (familyUnlocked) {
    try {
      await upsertToSupabase(appt);
      await loadFromSupabase();
      showToast('Afspraak opgeslagen en gedeeld met de familie.');
    } catch (e) {
      console.error('Familie-opslag mislukt:', e);
      showToast('Lokaal opgeslagen, maar delen met familie mislukte.', true);
    }
  }
}

async function deleteAppointment() {
  els.confirmDialog.close();
  if (!editingId) return;
  const id = editingId; editingId = null;
  state.appointments = state.appointments.filter(a => a.id !== id);
  persistAndRefresh();
  closeAppointmentDialog();
  deleteFromSupabase(id);
}

// ── Tijdelijke chips ──────────────────────────────────────────

function addTempPassenger(value) {
  const clean = cleanText(value); if (!clean) return;
  const error = validatePersonName(clean, 'Naam');
  if (error) { setFieldError(els.apptPassengers, error, els.passengerError); return; }
  clearFieldError(els.apptPassengers);
  tempPassengers = uniqueStrings([...tempPassengers, clean]);
  rememberName(clean); renderTempChips(); renderSuggestions();
}

function addTempCare(value) {
  const clean = cleanText(value); if (!clean) return;
  const error = validatePersonName(clean, 'Oppas / opvang');
  if (error) { setFieldError(els.apptCareOption, error, els.careError); return; }
  clearFieldError(els.apptCareOption);
  tempCare = uniqueStrings([...tempCare, clean]);
  rememberCareOption(clean); renderTempChips(); renderSuggestions();
}

function renderTempChips() {
  els.passengerChips.innerHTML = tempPassengers.map(v => chipHtml(v, 'remove-passenger')).join('');
  els.careChips.innerHTML      = tempCare.map(v => chipHtml(v, 'remove-care-temp')).join('');
  els.passengerChips.querySelectorAll('[data-remove-passenger]').forEach(btn => {
    btn.addEventListener('click', () => { tempPassengers = tempPassengers.filter(v => v !== btn.dataset.removePassenger); renderTempChips(); });
  });
  els.careChips.querySelectorAll('[data-remove-care-temp]').forEach(btn => {
    btn.addEventListener('click', () => { tempCare = tempCare.filter(v => v !== btn.dataset.removeCareTemp); renderTempChips(); });
  });
}

// ── Suggesties ────────────────────────────────────────────────

function renderSuggestions() {
  els.nameSuggestions.innerHTML        = state.names.map(n  => `<option value="${escapeHtmlAttr(n)}"></option>`).join('');
  els.careSuggestions.innerHTML        = state.careOptions.map(o => `<option value="${escapeHtmlAttr(o)}"></option>`).join('');
  els.timeSuggestions.innerHTML        = state.timeOptions.map(o => `<option value="${escapeHtmlAttr(o)}"></option>`).join('');
  els.locationSuggestions.innerHTML    = state.locations.map(o   => `<option value="${escapeHtmlAttr(o)}"></option>`).join('');
  els.departmentSuggestions.innerHTML  = state.departments.map(o => `<option value="${escapeHtmlAttr(o)}"></option>`).join('');
  els.descriptionSuggestions.innerHTML = state.descriptions.map(o=> `<option value="${escapeHtmlAttr(o)}"></option>`).join('');
}

function renderQuickPicks() {
  [els.timeQuickPicks, els.locationQuickPicks, els.departmentQuickPicks, els.descriptionQuickPicks]
    .forEach(c => { if (c) c.innerHTML = ''; });
}

function setupFieldSuggestions() {
  const defs = [
    { input: els.apptTime,        container: els.timeQuickPicks,        source: () => state.timeOptions,  apply: v => { els.apptTime.value = v; } },
    { input: els.apptLocation,    container: els.locationQuickPicks,    source: () => state.locations,    apply: v => { els.apptLocation.value = v; } },
    { input: els.apptDepartment,  container: els.departmentQuickPicks,  source: () => state.departments,  apply: v => { els.apptDepartment.value = v; } },
    { input: els.apptDescription, container: els.descriptionQuickPicks, source: () => state.descriptions, apply: v => { els.apptDescription.value = v; } }
  ];
  defs.forEach(def => {
    if (!def.input || !def.container) return;
    const refresh = () => renderContextSuggestions(def.container, def.source(), def.input.value, def.apply);
    def.input.addEventListener('focus', refresh);
    def.input.addEventListener('input', refresh);
    def.input.addEventListener('blur',  () => setTimeout(() => { def.container.innerHTML = ''; }, 140));
  });
}

function renderContextSuggestions(container, values, query, onPick) {
  if (!container) return;
  const q = cleanText(query).toLocaleLowerCase('nl-NL');
  let items = uniqueStrings(values || []).filter(Boolean);
  items = q ? items.filter(v => v.toLocaleLowerCase('nl-NL').includes(q)) : items;
  items = items.slice(0, 3);
  if (!items.length) { container.innerHTML = ''; return; }
  container.innerHTML = items.map(v => `<button type="button" class="quickPickBtn" data-quick-pick="${escapeHtmlAttr(v)}">${escapeHtml(v)}</button>`).join('');
  container.querySelectorAll('[data-quick-pick]').forEach(btn => {
    btn.addEventListener('mousedown', e => e.preventDefault());
    btn.addEventListener('click', () => { onPick(btn.dataset.quickPick || ''); container.innerHTML = ''; });
  });
}

function bindDynamicActions(root) {
  root.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', () => openAppointmentDialog(btn.dataset.edit)));
  root.querySelectorAll('[data-open-view]').forEach(btn => btn.addEventListener('click', () => setView(btn.dataset.openView)));
}

// ── Kaartweergave ─────────────────────────────────────────────

function cardHtml(a, opts = {}) {
  const st      = appointmentStatus(a);
  const compact  = Boolean(opts.compact);
  const noMargin = Boolean(opts.noMargin);
  const klass    = ['card', compact ? 'compactCard' : '', noMargin ? 'noMargin' : ''].filter(Boolean).join(' ');
  return `<section class="${klass}">
    <div class="cardTopRow">
      <div>
        <div class="apptHeading">${escapeHtml(a.time)} · ${escapeHtml(a.location || 'Locatie onbekend')}</div>
        <div class="apptSub">${escapeHtml(a.department || a.description || '')}</div>
      </div>
      <span class="statusBadge status-${st.key}">${st.label}</span>
    </div>
    <div class="detailGrid">
      <div><strong>Datum</strong><span>${escapeHtml(formatDateDutch(a.date))}</span></div>
      <div><strong>Chauffeur</strong><span>${escapeHtml(a.driver || '— open')}</span></div>
      <div><strong>Mee naar afspraak</strong><span>${escapeHtml((a.passengers || []).join(', ') || 'Geen')}</span></div>
      <div><strong>Oppas / opvang</strong><span>${escapeHtml((a.care || []).join(', ') || '— open')}</span></div>
      ${a.note ? `<div><strong>Notitie</strong><span>${escapeHtml(a.note)}</span></div>` : ''}
    </div>
    <div class="btnRow"><button class="ghost small" data-edit="${a.id}">Bewerken</button></div>
  </section>`;
}

// ── Status ────────────────────────────────────────────────────

function appointmentStatus(a) {
  const hasDriver = Boolean(cleanText(a.driver));
  const hasCare   = Array.isArray(a.care) && a.care.some(v => cleanText(v));
  if (hasDriver && hasCare)   return { key: 'green',  label: 'Geregeld',       reason: 'Alles is geregeld.' };
  if (!hasDriver && !hasCare) return { key: 'red',    label: 'Actie nodig',    reason: 'Chauffeur en oppas/opvang ontbreken.' };
  if (!hasDriver)             return { key: 'orange', label: 'Deels geregeld', reason: 'Chauffeur ontbreekt nog.' };
  return                             { key: 'orange', label: 'Deels geregeld', reason: 'Oppas / opvang ontbreekt nog.' };
}

function appointmentStatusKey(a) { return appointmentStatus(a).key; }

function aggregateStatuses(keys) {
  const k = (keys || []).filter(Boolean);
  if (!k.length)           return 'none';
  if (k.includes('red'))   return 'red';
  if (k.includes('orange'))return 'orange';
  return 'green';
}

function dayStatus(date) { return aggregateStatuses(getAppointmentsForDate(date).map(appointmentStatusKey)); }

function getUpcomingAppointment() {
  const nowDate = todayString(); const nowTime = currentTimeString();
  const sorted  = sortAppointments(state.appointments);
  return sorted.find(a => a.date > nowDate || (a.date === nowDate && a.time >= nowTime)) || sorted[0] || null;
}

function getAppointmentsForDate(date) { return sortAppointments(state.appointments.filter(a => a.date === date)); }
function sortAppointments(list) { return [...list].sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)); }

// ── Naam / validatie ──────────────────────────────────────────

function saveUserName() {
  const name  = cleanText(els.currentUserName.value);
  const error = validatePersonName(name, 'Jouw naam');
  if (error) { showUserNameError(error, els.currentUserName); return; }
  clearUserNameError();
  state.currentUser = name; rememberName(name); persistAndRefresh(); els.nameDialog.close();
}

function showUserNameError(msg, input) { if (els.userNameError) els.userNameError.textContent = msg; if (input) input.classList.add('fieldError'); }
function clearUserNameError() { if (els.userNameError) els.userNameError.textContent = ''; if (els.currentUserName) els.currentUserName.classList.remove('fieldError'); }
function openNameDialog() { if (state.currentUser) els.currentUserName.value = state.currentUser; clearUserNameError(); els.nameDialog.showModal(); }

function validatePersonName(value, label) {
  const clean = cleanText(value);
  if (!clean)                  return `${label} is verplicht.`;
  if (clean.length < NAME_MIN) return `${label} moet minimaal ${NAME_MIN} tekens hebben.`;
  if (clean.length > NAME_MAX) return `${label} mag maximaal ${NAME_MAX} tekens hebben.`;
  if (!NAME_RE.test(clean))    return `${label} bevat ongeldige tekens.`;
  return '';
}

function validateOptionalPersonName(value, label) { const c = cleanText(value); return c ? validatePersonName(c, label) : ''; }

function parseAndNormalizeTime(value) {
  // Normaliseer: punt/komma als scheidingsteken (23.19 → 23:19)
  let clean = cleanText(value);
  if (clean) clean = clean.replace(/[.,]/, ':');
  if (!clean) return { ok: false, message: 'Tijd is verplicht. Gebruik 09:00.' };
  if (/^\d{2}:\d{2}$/.test(clean)) {
    const [h, m] = clean.split(':').map(Number);
    if (h <= 23 && m <= 59) return { ok: true, value: `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}` };
    return { ok: false, message: 'Ongeldige tijd. Bereik: 00:00–23:59.' };
  }
  if (/^\d{3,4}$/.test(clean)) {
    const p = clean.padStart(4,'0'); const h = Number(p.slice(0,2)), m = Number(p.slice(2,4));
    if (h <= 23 && m <= 59) return { ok: true, value: `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}` };
    return { ok: false, message: 'Ongeldige tijd. Bereik: 00:00–23:59.' };
  }
  return { ok: false, message: 'Ongeldige tijd. Gebruik 09:00 of 0900.' };
}

// ── Remember helpers ──────────────────────────────────────────

function rememberName(n)        { _rem('names',       n, v => v); }
function rememberCareOption(v)  { _rem('careOptions', v, v => v); }
function rememberLocation(v)    { _rem('locations',   v, v => v); }
function rememberDepartment(v)  { _rem('departments', v, v => v); }
function rememberDescription(v) { _rem('descriptions',v, v => v); }
function rememberTimeOption(v)  { _rem('timeOptions', v, normalizeTimeInput); }
function _rem(key, raw, norm) {
  const c = norm(cleanText(raw)); if (!c) return;
  if (!state[key].includes(c)) state[key].push(c);
  state[key] = uniqueStrings(state[key]).sort(localeSort);
}

// ── Export / Import ───────────────────────────────────────────

function exportData() {
  const blob = new Blob([JSON.stringify({ meta: { appVersion: APP_VERSION, exportedAt: new Date().toISOString() }, data: sanitizeState(state) }, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `zorgplanner-v${APP_VERSION}-backup-${todayString()}.json`; a.click();
  URL.revokeObjectURL(url);
  showToast('Back-upbestand gedownload.');
}

function importData(event) {
  const file = event.target.files?.[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const result = importPayload(String(reader.result || '{}'));
    if (!result.ok) { showToast(result.message || 'Importeren mislukt.', true); event.target.value = ''; return; }
    state = result.state; selectedDate = todayString(); selectedMonthDate = todayString();
    persistAndRefresh(); showToast(result.message || 'Geïmporteerd.'); event.target.value = '';
  };
  reader.readAsText(file);
}

async function copyShareCode() {
  try {
    const code = btoa(unescape(encodeURIComponent(JSON.stringify({ data: sanitizeState(state) }))));
    await navigator.clipboard.writeText(code);
    showToast('Deelcode gekopieerd.');
  } catch { showToast('Kopiëren mislukt.', true); }
}

function importShareCode(code) {
  const clean = cleanText(code); if (!clean) { showToast('Plak eerst een deelcode.', true); return; }
  let decoded = '';
  try { decoded = decodeURIComponent(escape(atob(clean))); } catch { showToast('Deelcode ongeldig.', true); return; }
  const result = importPayload(decoded);
  if (!result.ok) { showToast(result.message || 'Deelcode ongeldig.', true); return; }
  state = result.state; selectedDate = todayString(); selectedMonthDate = todayString();
  persistAndRefresh();
  if (els.shareCodeArea) els.shareCodeArea.classList.add('hidden');
  if (els.shareCodeInput) els.shareCodeInput.value = '';
  showToast(result.message || 'Geïmporteerd.');
}

function importPayload(rawText) {
  try {
    const parsed = JSON.parse(rawText);
    const source = parsed?.data ?? parsed;
    const s = sanitizeState(source);
    const n = s.appointments.length;
    return { ok: true, state: s, message: `${telAfspraken(n)} geïmporteerd.` };
  } catch { return { ok: false, message: 'Importeren mislukt. Gebruik een geldige back-up of deelcode.' }; }
}

// ── Foutafhandeling formulier ─────────────────────────────────

function showAppointmentErrors(errors) {
  const msgs = [];
  (errors || []).forEach(item => {
    if (!item?.message) return;
    if (!msgs.includes(item.message)) msgs.push(item.message);
    item.field?.classList.add('fieldError');
  });
  if (els.appointmentErrorList) {
    els.appointmentErrorList.innerHTML = msgs.map(m => `<li>${escapeHtml(m)}</li>`).join('');
    els.appointmentErrorList.classList.remove('hidden');
  }
  setSaveMessage(msgs[0] || 'Controleer de invoer.', true);
  (errors || []).find(i => i.field)?.field.focus();
}

function clearAppointmentErrors() {
  if (els.appointmentErrorList) { els.appointmentErrorList.innerHTML = ''; els.appointmentErrorList.classList.add('hidden'); }
  clearInlineAppointmentErrors();
  [els.apptDate, els.apptTime, els.apptDriver, els.apptPassengers, els.apptCareOption].forEach(clearFieldError);
  setSaveMessage('');
}

function clearFieldError(input) {
  if (!input) return;
  input.classList.remove('fieldError');
  if (typeof input.setCustomValidity === 'function') input.setCustomValidity('');
  if (input === els.currentUserName)  clearUserNameError();
  if (input === els.manageNameInput  && els.manageNameError)  els.manageNameError.textContent = '';
  if (input === els.apptTime         && els.timeError)        els.timeError.textContent = '';
  if (input === els.apptDriver       && els.driverError)      els.driverError.textContent = '';
  if (input === els.apptPassengers   && els.passengerError)   els.passengerError.textContent = '';
  if (input === els.apptCareOption   && els.careError)        els.careError.textContent = '';
}

function clearValidationState() { clearUserNameError(); clearAppointmentErrors(); if (els.manageNameError) els.manageNameError.textContent = ''; }
function clearInlineAppointmentErrors() { [els.timeError, els.driverError, els.passengerError, els.careError].forEach(n => { if (n) n.textContent = ''; }); }
function setFieldError(input, msg, target) { if (input) { input.classList.add('fieldError'); if (typeof input.setCustomValidity === 'function') input.setCustomValidity(msg); } if (target) target.textContent = msg; }

// ── Toast ─────────────────────────────────────────────────────

function showToast(message, isError = false, actionLabel = '', action = null) {
  if (!els.toast || !els.toastMessage) return;
  els.toastMessage.textContent = message || '';
  els.toast.classList.remove('hidden', 'isError');
  if (isError) els.toast.classList.add('isError');
  if (els.toastActionBtn) {
    if (actionLabel && typeof action === 'function') {
      els.toastActionBtn.textContent = actionLabel; els.toastActionBtn.onclick = action; els.toastActionBtn.classList.remove('hidden');
    } else {
      els.toastActionBtn.textContent = ''; els.toastActionBtn.onclick = null; els.toastActionBtn.classList.add('hidden');
    }
  }
  if (!isError && !actionLabel) setTimeout(hideToast, 4000);
}

function hideToast() {
  if (!els.toast) return;
  els.toast.classList.add('hidden');
  if (els.toastActionBtn) { els.toastActionBtn.textContent = ''; els.toastActionBtn.onclick = null; els.toastActionBtn.classList.add('hidden'); }
}

// ── Storage ───────────────────────────────────────────────────

function persistAndRefresh() { saveState(); refreshAll(); }

function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizeState(state))); }

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return sanitizeState(JSON.parse(raw));
    for (const key of LEGACY_STORAGE_KEYS) {
      const legacyRaw = localStorage.getItem(key);
      if (!legacyRaw) continue;
      const parsed   = JSON.parse(legacyRaw);
      const migrated = sanitizeState(parsed?.data ?? parsed);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    }
    return structuredCloneSafe(EMPTY_STATE);
  } catch { return structuredCloneSafe(EMPTY_STATE); }
}

function sanitizeState(input) {
  const safe   = structuredCloneSafe(EMPTY_STATE);
  const source = input?.data ?? input;
  if (source && typeof source === 'object') {
    safe.currentUser  = cleanText(source.currentUser  || '');
    safe.names        = uniqueStrings((source.names        || []).map(cleanText));
    safe.careOptions  = uniqueStrings((source.careOptions  || []).map(cleanText));
    safe.locations    = uniqueStrings((source.locations    || []).map(cleanText));
    safe.departments  = uniqueStrings((source.departments  || []).map(cleanText));
    safe.descriptions = uniqueStrings((source.descriptions || []).map(cleanText));
    safe.timeOptions  = uniqueStrings((source.timeOptions  || []).map(normalizeTimeInput).filter(Boolean));
    safe.appointments = (source.appointments || []).map(sanitizeAppointment).filter(Boolean);
  }
  return safe;
}

function sanitizeAppointment(a) {
  if (!a || typeof a !== 'object') return null;
  const date = normalizeDateInput(a.date);
  const time = normalizeTimeInput(a.time);
  if (!date || !time) return null;
  return {
    id:          cleanText(a.id)          || generateId(),
    date,      time,
    location:    cleanText(a.location    || ''),
    department:  cleanText(a.department  || ''),
    description: cleanText(a.description || ''),
    driver:      cleanText(a.driver      || ''),
    passengers:  uniqueStrings((a.passengers || []).map(cleanText)),
    care:        uniqueStrings((a.care       || []).map(cleanText)),
    note:        cleanText(a.note        || ''),
    createdBy:   cleanText(a.createdBy   || ''),
    createdAt:   cleanText(a.createdAt   || '') || new Date().toISOString(),
    updatedAt:   cleanText(a.updatedAt   || '') || new Date().toISOString()
  };
}

function ensureStateShape() { state = sanitizeState(state); }

function setSaveMessage(msg, isError = false) {
  els.saveMessage.textContent = msg;
  els.saveMessage.style.color = isError ? 'var(--danger)' : 'var(--ok)';
}

// ── Hulpfuncties ──────────────────────────────────────────────

/** Correcte spelling: 1 afspraak, 2 afspraken */
function telAfspraken(n) { return `${n} afspraak${n === 1 ? '' : 'en'}`; }

function chipHtml(value, mode) {
  const attr = { 'remove-name': `data-remove-name="${escapeHtmlAttr(value)}"`, 'remove-care': `data-remove-care="${escapeHtmlAttr(value)}"`, 'remove-passenger': `data-remove-passenger="${escapeHtmlAttr(value)}"` }[mode] || `data-remove-care-temp="${escapeHtmlAttr(value)}"`;
  return `<span class="chip">${escapeHtml(value)}<button type="button" ${attr} aria-label="Verwijderen">×</button></span>`;
}

function currentTimeString() { const d = new Date(); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; }

function todayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function normalizeDateInput(v) { const c = cleanText(v); return /^\d{4}-\d{2}-\d{2}$/.test(c) ? c : ''; }

function normalizeTimeInput(value) {
  let clean = cleanText(value); if (!clean) return '';
  // Vervang punt of komma door dubbele punt: 23.19 -> 23:19, 23,19 -> 23:19
  clean = clean.replace(/[.,]/, ':');
  if (/^\d{1,2}:\d{2}$/.test(clean)) { const [h,m]=clean.split(':').map(Number); if (h<=23&&m<=59) return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`; }
  if (/^\d{3,4}$/.test(clean)) { const p=clean.padStart(4,'0'),h=Number(p.slice(0,2)),m=Number(p.slice(2,4)); if (h<=23&&m<=59) return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`; }
  return '';
}

function addDays(s, n)  { const d=parseDateString(s); d.setDate(d.getDate()+n); return formatDateObj(d); }
function addMonths(s,n) { const d=parseDateString(s); d.setDate(1); d.setMonth(d.getMonth()+n); return formatDateObj(d); }
function monthStart(s)  { const d=parseDateString(s); d.setDate(1); return formatDateObj(d); }
function getWeekStart(s){ const d=parseDateString(s),day=d.getDay(); d.setDate(d.getDate()+(day===0?-6:1-day)); return formatDateObj(d); }
function parseDateString(s){ const[y,m,day]=s.split('-').map(Number); return new Date(y,m-1,day,12,0,0,0); }
function formatDateObj(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }

function formatDateDutch(s) {
  const days  =['zondag','maandag','dinsdag','woensdag','donderdag','vrijdag','zaterdag'];
  const months=['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'];
  const d=parseDateString(s); return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
}

function formatDateShortNL(s) {
  const months=['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];
  const d=parseDateString(s); return `${d.getDate()} ${months[d.getMonth()]}`;
}

function formatMonthYear(s) {
  const months=['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'];
  const d=parseDateString(s); return `${months[d.getMonth()]} ${d.getFullYear()}`;
}

function uniqueStrings(list) { return [...new Set((list||[]).map(cleanText).filter(Boolean))]; }
function cleanText(v)        { return String(v??'').replace(/\s+/g,' ').trim(); }
function localeSort(a,b)     { return a.localeCompare(b,'nl',{sensitivity:'base'}); }
function generateId() {
  // Gebruik crypto.randomUUID() voor Supabase UUID-kolom compatibiliteit
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback: RFC4122 v4 UUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}
function structuredCloneSafe(v){ return JSON.parse(JSON.stringify(v)); }

function escapeHtml(v) { return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function escapeHtmlAttr(v){ return escapeHtml(v); }

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map(r => r.unregister().catch(() => false)));
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k).catch(() => false)));
    }
  } catch (e) {
    console.info('Service worker reset overgeslagen:', e);
  }
}
