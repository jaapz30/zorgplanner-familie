'use strict';

const APP_VERSION = '31';
const SCHEMA_VERSION = 31;
const STORAGE_KEY = 'zorgplanner_v22_data';
const LEGACY_STORAGE_KEYS = [
  'zorgplanner_v21_data',
  'zorgplanner_v20_data',
  'zorgplanner_v16_data',
  'zorgplanner_v13_data'
];
const NAME_MIN = 2;
const NAME_MAX = 80;
const NAME_RE = /^[\p{L}0-9][\p{L}0-9 .,'''\-()]*$/u;
const EMPTY_STATE = {
  currentUser: '',
  names: [],
  careOptions: [],
  locations: [],
  departments: [],
  descriptions: [],
  timeOptions: [],
  appointments: []
};

let state = loadState();
let currentView = 'homeView';
let selectedDate = todayString();
let selectedMonthDate = todayString(); // separate month navigation state
let editingId = null;
let tempPassengers = [];
let tempCare = [];

const els = {
  views: document.querySelectorAll('.view'),
  navBtns: document.querySelectorAll('.navbtn'),
  quickAddBtn: document.getElementById('quickAddBtn'),
  userButton: document.getElementById('userButton'),
  userButtonLabel: document.getElementById('userButtonLabel'),
  openNavBtn: document.getElementById('openNavBtn'),

  homeView: document.getElementById('homeView'),
  dayView: document.getElementById('dayView'),
  weekView: document.getElementById('weekView'),
  monthView: document.getElementById('monthView'),
  openView: document.getElementById('openView'),
  settingsView: document.getElementById('settingsView'),

  nameDialog: document.getElementById('nameDialog'),
  currentUserName: document.getElementById('currentUserName'),
  saveUserNameBtn: document.getElementById('saveUserNameBtn'),
  userNameError: document.getElementById('userNameError'),
  cancelNameBtn: document.getElementById('cancelNameBtn'),

  appointmentDialog: document.getElementById('appointmentDialog'),
  appointmentTitle: document.getElementById('appointmentTitle'),
  closeAppointmentBtn: document.getElementById('closeAppointmentBtn'),
  apptDate: document.getElementById('apptDate'),
  apptTime: document.getElementById('apptTime'),
  apptLocation: document.getElementById('apptLocation'),
  apptDepartment: document.getElementById('apptDepartment'),
  apptDescription: document.getElementById('apptDescription'),
  timeQuickPicks: document.getElementById('timeQuickPicks'),
  locationQuickPicks: document.getElementById('locationQuickPicks'),
  departmentQuickPicks: document.getElementById('departmentQuickPicks'),
  descriptionQuickPicks: document.getElementById('descriptionQuickPicks'),
  apptDriver: document.getElementById('apptDriver'),
  useMeAsDriver: document.getElementById('useMeAsDriver'),
  apptPassengers: document.getElementById('apptPassengers'),
  addPassengerBtn: document.getElementById('addPassengerBtn'),
  useMeAsPassenger: document.getElementById('useMeAsPassenger'),
  passengerChips: document.getElementById('passengerChips'),
  apptCareOption: document.getElementById('apptCareOption'),
  addCareBtn: document.getElementById('addCareBtn'),
  useMeAsCare: document.getElementById('useMeAsCare'),
  careChips: document.getElementById('careChips'),
  apptNote: document.getElementById('apptNote'),
  saveAppointmentBtn: document.getElementById('saveAppointmentBtn'),
  deleteAppointmentBtn: document.getElementById('deleteAppointmentBtn'),
  cancelAppointmentBtn: document.getElementById('cancelAppointmentBtn'),
  saveMessage: document.getElementById('saveMessage'),
  appointmentErrorList: document.getElementById('appointmentErrorList'),

  manageDialog: document.getElementById('manageDialog'),
  closeManageBtn: document.getElementById('closeManageBtn'),
  manageNameInput: document.getElementById('manageNameInput'),
  manageNameError: document.getElementById('manageNameError'),
  addManageNameBtn: document.getElementById('addManageNameBtn'),
  manageNamesList: document.getElementById('manageNamesList'),
  manageCareInput: document.getElementById('manageCareInput'),
  addManageCareBtn: document.getElementById('addManageCareBtn'),
  manageCareList: document.getElementById('manageCareList'),
  copyShareCodeBtn: document.getElementById('copyShareCodeBtn'),
  pasteShareCodeBtn: document.getElementById('pasteShareCodeBtn'),
  shareCodeArea: document.getElementById('shareCodeArea'),
  shareCodeInput: document.getElementById('shareCodeInput'),
  importShareCodeBtn: document.getElementById('importShareCodeBtn'),
  cancelShareCodeBtn: document.getElementById('cancelShareCodeBtn'),
  exportBtn: document.getElementById('exportBtn'),
  importInput: document.getElementById('importInput'),
  toast: document.getElementById('appToast'),
  toastMessage: document.getElementById('toastMessage'),
  toastActionBtn: document.getElementById('toastActionBtn'),
  toastCloseBtn: document.getElementById('toastCloseBtn'),
  timeError: document.getElementById('apptTimeError'),
  driverError: document.getElementById('apptDriverError'),
  passengerError: document.getElementById('apptPassengersError'),
  careError: document.getElementById('apptCareError'),

  confirmDialog: document.getElementById('confirmDialog'),
  confirmCancelBtn: document.getElementById('confirmCancelBtn'),
  confirmDeleteBtn: document.getElementById('confirmDeleteBtn'),

  nameSuggestions: document.getElementById('nameSuggestions'),
  careSuggestions: document.getElementById('careSuggestions'),
  timeSuggestions: document.getElementById('timeSuggestions'),
  locationSuggestions: document.getElementById('locationSuggestions'),
  departmentSuggestions: document.getElementById('departmentSuggestions'),
  descriptionSuggestions: document.getElementById('descriptionSuggestions')
};

init();

function init() {
  attachEvents();
  ensureStateShape();
  selectedDate = todayString();
  selectedMonthDate = todayString();
  refreshAll();
  if (!state.currentUser) openNameDialog();
  clearValidationState();
  registerServiceWorker();
}

function attachEvents() {
  els.navBtns.forEach(btn => {
    const go = (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      setView(btn.dataset.view);
    };
    btn.addEventListener('click', go);
    btn.addEventListener('touchend', go, { passive: false });
  });

  els.quickAddBtn.addEventListener('click', () => openAppointmentDialog());
  els.quickAddBtn.addEventListener('touchend', (e) => {
    e.preventDefault();
    openAppointmentDialog();
  }, { passive: false });
  els.userButton.addEventListener('click', openNameDialog);

  els.saveUserNameBtn.addEventListener('click', saveUserName);
  els.cancelNameBtn.addEventListener('click', () => els.nameDialog.close());
  els.currentUserName.addEventListener('keydown', e => {
    if (e.key === 'Enter') saveUserName();
  });

  els.closeAppointmentBtn.addEventListener('click', closeAppointmentDialog);
  els.cancelAppointmentBtn.addEventListener('click', closeAppointmentDialog);
  els.saveAppointmentBtn.addEventListener('click', saveAppointment);
  els.deleteAppointmentBtn.addEventListener('click', () => {
    if (editingId) els.confirmDialog.showModal();
  });

  els.useMeAsDriver.addEventListener('click', () => {
    if (!state.currentUser) return openNameDialog();
    els.apptDriver.value = state.currentUser;
  });
  els.useMeAsPassenger.addEventListener('click', () => {
    if (!state.currentUser) return openNameDialog();
    addTempPassenger(state.currentUser);
  });
  els.useMeAsCare.addEventListener('click', () => {
    if (!state.currentUser) return openNameDialog();
    addTempCare(state.currentUser);
  });

  els.addPassengerBtn.addEventListener('click', () => {
    addTempPassenger(els.apptPassengers.value);
    els.apptPassengers.value = '';
    els.apptPassengers.focus();
  });
  els.apptPassengers.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      els.addPassengerBtn.click();
    }
  });
  els.apptPassengers.addEventListener('blur', () => {
    const value = cleanText(els.apptPassengers.value);
    if (!value) return;
    setTimeout(() => { commitPendingPassengers(); }, 120);
  });

  els.apptTime.addEventListener('blur', () => {
    const normalized = normalizeTimeInput(els.apptTime.value);
    if (normalized) els.apptTime.value = normalized;
  });

  [els.currentUserName, els.manageNameInput, els.apptDriver, els.apptPassengers, els.apptCareOption, els.apptTime, els.apptDate].forEach(input => {
    if (!input) return;
    input.addEventListener('input', () => clearFieldError(input));
  });

  els.addCareBtn.addEventListener('click', () => {
    addTempCare(els.apptCareOption.value);
    els.apptCareOption.value = '';
    els.apptCareOption.focus();
  });
  els.apptCareOption.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      els.addCareBtn.click();
    }
  });
  els.apptCareOption.addEventListener('blur', () => {
    const value = cleanText(els.apptCareOption.value);
    if (!value) return;
    setTimeout(() => { commitPendingCare(); }, 120);
  });

  setupFieldSuggestions();

  els.confirmDeleteBtn.addEventListener('click', deleteAppointment);
  els.confirmCancelBtn.addEventListener('click', () => els.confirmDialog.close());

  els.closeManageBtn.addEventListener('click', () => els.manageDialog.close());
  els.addManageNameBtn.addEventListener('click', () => {
    const value = cleanText(els.manageNameInput.value);
    const error = validatePersonName(value, 'Naam');
    if (error) {
      if (els.manageNameError) els.manageNameError.textContent = error;
      els.manageNameInput.classList.add('fieldError');
      els.manageNameInput.focus();
      return;
    }
    if (els.manageNameError) els.manageNameError.textContent = '';
    els.manageNameInput.classList.remove('fieldError');
    rememberName(value);
    els.manageNameInput.value = '';
    persistAndRefresh();
    renderManageDialog();
    showToast('Naam toegevoegd.');
  });
  els.manageNameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') els.addManageNameBtn.click();
  });
  els.addManageCareBtn.addEventListener('click', () => {
    const value = cleanText(els.manageCareInput.value);
    if (!value) return;
    rememberCareOption(value);
    els.manageCareInput.value = '';
    persistAndRefresh();
    renderManageDialog();
    showToast('Oppas- of opvangoptie toegevoegd.');
  });
  els.manageCareInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') els.addManageCareBtn.click();
  });

  els.copyShareCodeBtn.addEventListener('click', copyShareCode);
  els.pasteShareCodeBtn.addEventListener('click', () => {
    els.shareCodeArea.classList.toggle('hidden');
    if (!els.shareCodeArea.classList.contains('hidden')) {
      els.shareCodeInput.value = '';
      els.shareCodeInput.focus();
    }
  });
  els.importShareCodeBtn.addEventListener('click', () => importShareCode(els.shareCodeInput.value));
  els.cancelShareCodeBtn.addEventListener('click', () => {
    els.shareCodeArea.classList.add('hidden');
    els.shareCodeInput.value = '';
  });

  els.exportBtn.addEventListener('click', exportData);
  els.importInput.addEventListener('change', importData);
  els.toastCloseBtn?.addEventListener('click', hideToast);
}

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
  renderSuggestions();
  renderQuickPicks();
  renderUserButton();
  renderNavBadge();
  renderHome();
  renderDay();
  renderWeek();
  renderMonth();
  renderOpenTasks();
  renderSettings();
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
  const upcoming = getUpcomingAppointment();
  const openItems = state.appointments.filter(a => appointmentStatus(a).key !== 'green').slice(0, 4);
  let html = '';

  html += '<section class="card">';
  html += '<h2 class="sectionTitle">Eerstvolgende afspraak</h2>';
  if (!upcoming) {
    html += '<div class="emptyState">Nog niets ingepland.</div>';
  } else {
    html += cardHtml(upcoming, { compact: false, noMargin: true });
  }
  html += '</section>';

  html += '<section class="card">';
  html += '<h2 class="sectionTitle">Nog te regelen</h2>';
  if (!openItems.length) {
    html += '<div class="emptyState">Alles is op dit moment geregeld. ✓</div>';
  } else {
    openItems.forEach(a => {
      const st = appointmentStatus(a);
      html += `
        <div class="openTaskRow">
          <div class="openTaskInfo">
            <strong>${escapeHtml(formatDateDutch(a.date))} • ${escapeHtml(a.time)}</strong>
            <div class="muted">${escapeHtml(a.location || 'Locatie onbekend')}</div>
            <div class="reason">${escapeHtml(st.reason)}</div>
          </div>
          <button class="ghost small" data-edit="${a.id}">Invullen</button>
        </div>`;
    });
  }
  html += '</section>';

  els.homeView.innerHTML = html;
  bindDynamicActions(els.homeView);
}

function renderDay() {
  const appts = getAppointmentsForDate(selectedDate);
  const isToday = selectedDate === todayString();
  let html = `
    <section class="card">
      <div class="dayNav">
        <button class="ghost small" id="prevDayBtn">← Vorige</button>
        <div class="dayNavCenter">
          <h2>${escapeHtml(formatDateDutch(selectedDate))}${isToday ? ' <span class="todayBadge">Vandaag</span>' : ''}</h2>
          <p class="muted">${appts.length ? `${appts.length} gepland` : 'Geen planning'}</p>
        </div>
        <button class="ghost small" id="nextDayBtn">Volgende →</button>
      </div>
    </section>`;

  if (!appts.length) {
    html += '<div class="emptyState">Geen afspraken op deze dag.</div>';
  } else {
    appts.forEach(a => {
      html += cardHtml(a);
    });
  }

  els.dayView.innerHTML = html;
  document.getElementById('prevDayBtn')?.addEventListener('click', () => {
    selectedDate = addDays(selectedDate, -1);
    renderDay();
  });
  document.getElementById('nextDayBtn')?.addEventListener('click', () => {
    selectedDate = addDays(selectedDate, 1);
    renderDay();
  });
  bindDynamicActions(els.dayView);
}

function renderWeek() {
  const monday = getWeekStart(selectedDate);
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const weekAppts = weekDates.flatMap(date => getAppointmentsForDate(date));
  const weekSummary = aggregateStatuses(weekAppts.map(appointmentStatusKey));
  const weekCount = weekAppts.length;
  const weekBadge = weekCount
    ? `<span class="weekBadge ${weekSummary}">${weekCount} gepland</span>`
    : '<span class="weekBadge empty">Geen planning</span>';

  let html = `
    <section class="card">
      <div class="dayNav">
        <button class="ghost small" id="prevWeekBtn">← Vorige</button>
        <div class="dayNavCenter">
          <h2>${escapeHtml(formatDateShortNL(monday))} t/m ${escapeHtml(formatDateShortNL(addDays(monday, 6)))}</h2>
          <div class="weekHeaderMeta">${weekBadge}</div>
        </div>
        <button class="ghost small" id="nextWeekBtn">Volgende →</button>
      </div>
    </section>`;

  for (let i = 0; i < 7; i += 1) {
    const date = weekDates[i];
    const dayAppts = getAppointmentsForDate(date);
    const isToday = date === todayString();
    html += `<section class="weekDayBlock ${isToday ? 'isToday' : ''}">`;
    html += `<div class="weekDayTitle">${escapeHtml(formatDateDutch(date))}${isToday ? ' <span class="todayBadge">Vandaag</span>' : ''}`;
    if (dayAppts.length) {
      html += `<span class="miniStatus ${dayStatus(date)}"></span><span class="miniCount">${dayAppts.length}</span>`;
    }
    html += `</div>`;
    if (!dayAppts.length) {
      html += '<div class="emptyState">Geen planning voor deze dag.</div>';
    } else {
      dayAppts.forEach(a => { html += cardHtml(a, { compact: true }); });
    }
    html += '</section>';
  }

  els.weekView.innerHTML = html;
  document.getElementById('prevWeekBtn')?.addEventListener('click', () => {
    selectedDate = addDays(monday, -7);
    renderWeek();
  });
  document.getElementById('nextWeekBtn')?.addEventListener('click', () => {
    selectedDate = addDays(monday, 7);
    renderWeek();
  });
  bindDynamicActions(els.weekView);
}

// ── MONTH VIEW (v22: full rewrite for clarity and readability) ───────────────

function renderMonth() {
  const first = monthStart(selectedMonthDate);
  const gridStart = getWeekStart(first);
  const monthLabel = first.slice(0, 7);

  const monthAppts = state.appointments.filter(a => a.date.startsWith(monthLabel));
  const monthCount = monthAppts.length;
  const openCount = monthAppts.filter(a => appointmentStatus(a).key !== 'green').length;

  let html = `
    <section class="card">
      <div class="monthNavRow">
        <button class="navArrowBtn" id="prevMonthBtn" aria-label="Vorige maand">‹</button>
        <div class="monthNavCenter">
          <h2 class="monthTitle">${escapeHtml(formatMonthYear(first))}</h2>
          <div class="monthSummaryLine">
            ${monthCount ? `<span class="monthSummaryBadge total">${monthCount} afspraak${monthCount === 1 ? '' : 'en'}</span>` : '<span class="monthSummaryBadge empty">Geen afspraken</span>'}
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
    const date = addDays(gridStart, i);
    const dayAppts = getAppointmentsForDate(date);
    const inMonth = date.startsWith(monthLabel);
    const isToday = date === todayString();
    const isSelected = selectedDate === date;
    const status = dayStatus(date);

    const cls = [
      'monthCell',
      !inMonth ? 'otherMonth' : '',
      isToday ? 'isToday' : '',
      isSelected ? 'isSelected' : '',
      dayAppts.length ? 'hasAppointments' : ''
    ].filter(Boolean).join(' ');

    const dayNum = date.slice(8, 10).replace(/^0/, '');
    const countHtml = dayAppts.length ? `<span class="monthCountBadge">${dayAppts.length}</span>` : '';
    const dotHtml = dayAppts.length ? `<span class="monthStatusDot status-${status}" aria-hidden="true"></span>` : '';

    html += `
      <button type="button" class="${cls}" data-goto-date="${date}" aria-label="${escapeHtml(formatDateDutch(date))}${dayAppts.length ? `, ${dayAppts.length} gepland` : ''}">
        <div class="monthCellTop">
          <div class="monthDayNum">${escapeHtml(dayNum)}${isToday ? '<span class="todayDot"></span>' : ''}</div>
          ${countHtml}
        </div>
        <div class="monthCellBottom">${dotHtml}</div>
      </button>`;
  }

  html += `</div></section>`;

  const selectedInMonth = selectedDate.startsWith(monthLabel);
  if (selectedInMonth) {
    const selAppts = getAppointmentsForDate(selectedDate);
    html += `<section class="card monthDayDetail">
      <h3 class="monthDayDetailTitle">${escapeHtml(formatDateDutch(selectedDate))}</h3>`;
    if (!selAppts.length) {
      html += '<div class="emptyState">Geen afspraken op deze dag.</div>';
    } else {
      selAppts.forEach(a => { html += cardHtml(a, { compact: true }); });
    }
    html += `<button class="ghost small addOnDay" data-add-date="${selectedDate}">+ Afspraak toevoegen</button>`;
    html += '</section>';
  }

  els.monthView.innerHTML = html;

  document.getElementById('prevMonthBtn')?.addEventListener('click', () => {
    selectedMonthDate = addMonths(first, -1);
    if (!selectedDate.startsWith(selectedMonthDate.slice(0, 7))) {
      selectedDate = selectedMonthDate;
    }
    renderMonth();
  });
  document.getElementById('nextMonthBtn')?.addEventListener('click', () => {
    selectedMonthDate = addMonths(first, 1);
    if (!selectedDate.startsWith(selectedMonthDate.slice(0, 7))) {
      selectedDate = selectedMonthDate;
    }
    renderMonth();
  });

  els.monthView.querySelectorAll('[data-goto-date]').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedDate = btn.dataset.gotoDate;
      if (selectedDate.startsWith(monthLabel)) {
        selectedMonthDate = selectedDate;
      }
      renderMonth();
    });
  });

  els.monthView.querySelectorAll('[data-add-date]').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedDate = btn.dataset.addDate;
      openAppointmentDialog();
    });
  });

  bindDynamicActions(els.monthView);
}

function renderOpenTasks() {
  const open = state.appointments.filter(a => appointmentStatus(a).key !== 'green');
  let html = '<section class="card"><h2 class="sectionTitle">Open taken</h2>';
  if (!open.length) {
    html += '<div class="emptyState">Er staan nu geen open taken. ✓</div>';
  } else {
    open.forEach(a => {
      const st = appointmentStatus(a);
      html += `
        <div class="openTaskRow">
          <div class="openTaskInfo">
            <strong>${escapeHtml(formatDateDutch(a.date))} • ${escapeHtml(a.time)}</strong>
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
}

function renderSettings() {
  els.settingsView.innerHTML = `
    <section class="card">
      <h2 class="sectionTitle">Beheer</h2>
      <div class="openTaskRow">
        <div class="openTaskInfo">
          <strong>Jouw naam</strong>
          <div class="muted">${escapeHtml(state.currentUser || 'Nog niet ingevuld')}</div>
        </div>
        <button class="ghost small" id="editUserBtn">Aanpassen</button>
      </div>
      <div class="openTaskRow">
        <div class="openTaskInfo">
          <strong>Namen en opvangopties</strong>
          <div class="muted">${state.names.length} namen • ${state.careOptions.length} opvangopties</div>
        </div>
        <button class="primary small" id="openManageBtn">Beheer</button>
      </div>
      <div class="openTaskRow">
        <div class="openTaskInfo">
          <strong>Afspraken</strong>
          <div class="muted">${state.appointments.length} opgeslagen op dit apparaat</div>
        </div>
      </div>
      <div class="openTaskRow">
        <div class="openTaskInfo">
          <strong>Versie</strong>
          <div class="muted">Zorgplanner v${APP_VERSION} • lokaal opgeslagen op dit apparaat</div>
        </div>
      </div>
    </section>
    <section class="card">
      <h2 class="sectionTitle">Installeren als app</h2>
      <p class="muted">Open de browser-opties en kies <strong>Installeren</strong> of <strong>Toevoegen aan beginscherm</strong> voor een ervaring op volledig scherm.</p>
    </section>`;

  document.getElementById('editUserBtn')?.addEventListener('click', openNameDialog);
  document.getElementById('openManageBtn')?.addEventListener('click', () => {
    renderManageDialog();
    els.manageDialog.showModal();
  });
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
      state.appointments.forEach(a => {
        if (a.driver === val) a.driver = '';
        a.passengers = (a.passengers || []).filter(p => p !== val);
      });
      if (state.currentUser === val) state.currentUser = '';
      persistAndRefresh();
      renderManageDialog();
      if (!state.currentUser) openNameDialog();
      clearValidationState();
      showToast('Naam verwijderd.');
    });
  });

  els.manageCareList.querySelectorAll('[data-remove-care]').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.removeCare;
      state.careOptions = state.careOptions.filter(n => n !== val);
      state.appointments.forEach(a => {
        a.care = (a.care || []).filter(c => c !== val);
      });
      persistAndRefresh();
      renderManageDialog();
    });
  });
}

function openAppointmentDialog(id = null) {
  editingId = id;
  tempPassengers = [];
  tempCare = [];
  els.saveMessage.textContent = '';

  if (id) {
    const a = state.appointments.find(x => x.id === id);
    if (!a) return;
    els.appointmentTitle.textContent = 'Afspraak bewerken';
    els.apptDate.value = a.date;
    els.apptTime.value = a.time;
    els.apptLocation.value = a.location || '';
    els.apptDepartment.value = a.department || '';
    els.apptDescription.value = a.description || '';
    els.apptDriver.value = a.driver || '';
    els.apptNote.value = a.note || '';
    tempPassengers = [...(a.passengers || [])];
    tempCare = [...(a.care || [])];
    els.deleteAppointmentBtn.classList.remove('hidden');
  } else {
    els.appointmentTitle.textContent = 'Nieuwe afspraak';
    els.apptDate.value = selectedDate || todayString();
    els.apptTime.value = '09:00';
    els.apptLocation.value = '';
    els.apptDepartment.value = '';
    els.apptDescription.value = '';
    els.apptDriver.value = '';
    els.apptNote.value = '';
    els.deleteAppointmentBtn.classList.add('hidden');
  }
  els.apptPassengers.value = '';
  els.apptCareOption.value = '';
  clearAppointmentErrors();
  renderTempChips();
  renderQuickPicks();
  els.appointmentDialog.showModal();
}

function closeAppointmentDialog() {
  els.appointmentDialog.close();
}

function saveAppointment() {
  clearAppointmentErrors();

  const date = normalizeDateInput(els.apptDate.value);
  const rawTime = cleanText(els.apptTime.value);
  const timeResult = parseAndNormalizeTime(rawTime);
  const driver = cleanText(els.apptDriver.value);
  const pendingPassengerValues = splitManualEntryValues(els.apptPassengers.value);
  const pendingCareValues = splitManualEntryValues(els.apptCareOption.value);
  const passengers = uniqueStrings([...tempPassengers, ...pendingPassengerValues]);
  const care = uniqueStrings([...tempCare, ...pendingCareValues]);

  const errors = [];
  clearInlineAppointmentErrors();

  if (!date) {
    errors.push({ field: els.apptDate, message: 'Vul een geldige datum in.' });
  }

  if (!timeResult.ok) {
    const message = timeResult.message || 'Ongeldige tijd. Gebruik 09:00 of 0900. Bereik: 00:00–23:59.';
    setFieldError(els.apptTime, message, els.timeError);
    errors.push({ field: els.apptTime, message });
  }

  const driverError = driver ? validatePersonName(driver, 'Chauffeur') : '';
  if (driverError) {
    setFieldError(els.apptDriver, driverError, els.driverError);
    errors.push({ field: els.apptDriver, message: driverError });
  }

  const passengerErrors = passengers
    .map(name => validateOptionalPersonName(name, 'Naam bij mee naar afspraak'))
    .filter(Boolean);
  if (passengerErrors.length) {
    setFieldError(els.apptPassengers, passengerErrors[0], els.passengerError);
    errors.push({ field: els.apptPassengers, message: passengerErrors[0] });
  }

  const careErrors = care
    .map(value => validateOptionalPersonName(value, 'Oppas / opvang'))
    .filter(Boolean);
  if (careErrors.length) {
    setFieldError(els.apptCareOption, careErrors[0], els.careError);
    errors.push({ field: els.apptCareOption, message: careErrors[0] });
  }

  if (errors.length) {
    showAppointmentErrors(errors);
    return;
  }

  const time = timeResult.value;
  els.apptTime.value = time;

  const appointment = {
    id: editingId || generateId(),
    date,
    time,
    location: cleanText(els.apptLocation.value),
    department: cleanText(els.apptDepartment.value),
    description: cleanText(els.apptDescription.value),
    driver,
    passengers,
    care,
    note: cleanText(els.apptNote.value),
    createdAt: editingId ? (state.appointments.find(a => a.id === editingId)?.createdAt || new Date().toISOString()) : new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (driver) rememberName(driver);
  appointment.passengers.forEach(rememberName);
  appointment.care.forEach(rememberCareOption);
  rememberLocation(appointment.location);
  rememberDepartment(appointment.department);
  rememberDescription(appointment.description);
  rememberTimeOption(appointment.time);

  const idx = state.appointments.findIndex(a => a.id === appointment.id);
  if (idx >= 0) {
    state.appointments[idx] = appointment;
  } else {
    state.appointments.push(appointment);
  }

  selectedDate = appointment.date;
  selectedMonthDate = appointment.date;
  persistAndRefresh();
  setSaveMessage('Afspraak opgeslagen.');
  showToast('Afspraak opgeslagen.');
  closeAppointmentDialog();
  setView('dayView');
}

function deleteAppointment() {
  els.confirmDialog.close();
  if (!editingId) return;
  state.appointments = state.appointments.filter(a => a.id !== editingId);
  editingId = null;
  persistAndRefresh();
  closeAppointmentDialog();
}


function splitManualEntryValues(value) {
  return uniqueStrings(
    String(value || '')
      .split(/[;,\n]+/)
      .map(part => cleanText(part))
      .filter(Boolean)
  );
}

function commitPendingPassengers() {
  const values = splitManualEntryValues(els.apptPassengers.value);
  if (!values.length) return;
  let hasError = false;
  values.forEach(value => {
    const before = tempPassengers.length;
    addTempPassenger(value);
    if (tempPassengers.length === before && validatePersonName(value, 'Naam bij mee naar afspraak')) {
      hasError = true;
    }
  });
  if (!hasError) {
    els.apptPassengers.value = '';
  }
}

function commitPendingCare() {
  const values = splitManualEntryValues(els.apptCareOption.value);
  if (!values.length) return;
  let hasError = false;
  values.forEach(value => {
    const before = tempCare.length;
    addTempCare(value);
    if (tempCare.length === before && validatePersonName(value, 'Oppas / opvang')) {
      hasError = true;
    }
  });
  if (!hasError) {
    els.apptCareOption.value = '';
  }
}

function addTempPassenger(value) {
  const clean = cleanText(value);
  if (!clean) return;
  const error = validatePersonName(clean, 'Naam bij mee naar afspraak');
  if (error) {
    setFieldError(els.apptPassengers, error, els.passengerError);
    return;
  }
  clearFieldError(els.apptPassengers);
  tempPassengers = uniqueStrings([...tempPassengers, clean]);
  rememberName(clean);
  renderTempChips();
  renderSuggestions();
}

function addTempCare(value) {
  const clean = cleanText(value);
  if (!clean) return;
  const error = validatePersonName(clean, 'Oppas / opvang');
  if (error) {
    setFieldError(els.apptCareOption, error, els.careError);
    return;
  }
  clearFieldError(els.apptCareOption);
  tempCare = uniqueStrings([...tempCare, clean]);
  rememberCareOption(clean);
  renderTempChips();
  renderSuggestions();
}

function renderTempChips() {
  els.passengerChips.innerHTML = tempPassengers.map(v => chipHtml(v, 'remove-passenger')).join('');
  els.careChips.innerHTML = tempCare.map(v => chipHtml(v, 'remove-care-temp')).join('');
  els.passengerChips.querySelectorAll('[data-remove-passenger]').forEach(btn => {
    btn.addEventListener('click', () => {
      tempPassengers = tempPassengers.filter(v => v !== btn.dataset.removePassenger);
      renderTempChips();
    });
  });
  els.careChips.querySelectorAll('[data-remove-care-temp]').forEach(btn => {
    btn.addEventListener('click', () => {
      tempCare = tempCare.filter(v => v !== btn.dataset.removeCareTemp);
      renderTempChips();
    });
  });
}

function renderSuggestions() {
  els.nameSuggestions.innerHTML = state.names.map(name => `<option value="${escapeHtmlAttr(name)}"></option>`).join('');
  els.careSuggestions.innerHTML = state.careOptions.map(opt => `<option value="${escapeHtmlAttr(opt)}"></option>`).join('');
  els.timeSuggestions.innerHTML = state.timeOptions.map(opt => `<option value="${escapeHtmlAttr(opt)}"></option>`).join('');
  els.locationSuggestions.innerHTML = state.locations.map(opt => `<option value="${escapeHtmlAttr(opt)}"></option>`).join('');
  els.departmentSuggestions.innerHTML = state.departments.map(opt => `<option value="${escapeHtmlAttr(opt)}"></option>`).join('');
  els.descriptionSuggestions.innerHTML = state.descriptions.map(opt => `<option value="${escapeHtmlAttr(opt)}"></option>`).join('');
}

function renderQuickPicks() {
  [els.timeQuickPicks, els.locationQuickPicks, els.departmentQuickPicks, els.descriptionQuickPicks].forEach(container => {
    if (container) container.innerHTML = '';
  });
}

function setupFieldSuggestions() {
  const defs = [
    { input: els.apptTime, container: els.timeQuickPicks, source: () => state.timeOptions, apply: value => { els.apptTime.value = value; } },
    { input: els.apptLocation, container: els.locationQuickPicks, source: () => state.locations, apply: value => { els.apptLocation.value = value; } },
    { input: els.apptDepartment, container: els.departmentQuickPicks, source: () => state.departments, apply: value => { els.apptDepartment.value = value; } },
    { input: els.apptDescription, container: els.descriptionQuickPicks, source: () => state.descriptions, apply: value => { els.apptDescription.value = value; } }
  ];

  defs.forEach(def => {
    if (!def.input || !def.container) return;
    const refresh = () => renderContextSuggestions(def.container, def.source(), def.input.value, def.apply);
    def.input.addEventListener('focus', refresh);
    def.input.addEventListener('input', refresh);
    def.input.addEventListener('blur', () => {
      setTimeout(() => { def.container.innerHTML = ''; }, 140);
    });
  });
}

function renderContextSuggestions(container, values, query, onPick) {
  if (!container) return;
  const q = cleanText(query).toLocaleLowerCase('nl-NL');
  let items = uniqueStrings(values || []).filter(Boolean);
  items = q ? items.filter(v => v.toLocaleLowerCase('nl-NL').includes(q)) : items;
  items = items.slice(0, 3);
  if (!items.length) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = items.map(v => `<button type="button" class="quickPickBtn" data-quick-pick="${escapeHtmlAttr(v)}">${escapeHtml(v)}</button>`).join('');
  container.querySelectorAll('[data-quick-pick]').forEach(btn => {
    btn.addEventListener('mousedown', e => e.preventDefault());
    btn.addEventListener('click', () => {
      onPick(btn.dataset.quickPick || '');
      container.innerHTML = '';
    });
  });
}

function bindDynamicActions(root) {
  root.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => openAppointmentDialog(btn.dataset.edit));
  });
  root.querySelectorAll('[data-open-view]').forEach(btn => {
    btn.addEventListener('click', () => setView(btn.dataset.openView));
  });
}

function cardHtml(a, options = {}) {
  const st = appointmentStatus(a);
  const compact = Boolean(options.compact);
  const noMargin = Boolean(options.noMargin);
  const klass = ['card', compact ? 'compactCard' : '', noMargin ? 'noMargin' : ''].filter(Boolean).join(' ');
  return `
    <section class="${klass}">
      <div class="cardTopRow">
        <div>
          <div class="apptHeading">${escapeHtml(a.time)} • ${escapeHtml(a.location || 'Locatie onbekend')}</div>
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
      <div class="btnRow">
        <button class="ghost small" data-edit="${a.id}">Bewerken</button>
      </div>
    </section>`;
}

function appointmentStatus(a) {
  const hasDriver = Boolean(cleanText(a.driver));
  const hasCare = Array.isArray(a.care) && a.care.some(v => cleanText(v));
  if (hasDriver && hasCare) return { key: 'green', label: 'Geregeld', reason: 'Alles is geregeld.' };
  if (!hasDriver && !hasCare) return { key: 'red', label: 'Actie nodig', reason: 'Chauffeur en oppas/opvang ontbreken.' };
  if (!hasDriver) return { key: 'orange', label: 'Deels geregeld', reason: 'Chauffeur ontbreekt nog.' };
  return { key: 'orange', label: 'Deels geregeld', reason: 'Oppas / opvang ontbreekt nog.' };
}

function appointmentStatusKey(a) {
  return appointmentStatus(a).key;
}

function aggregateStatuses(keys) {
  const cleanKeys = (keys || []).filter(Boolean);
  if (!cleanKeys.length) return 'none';
  if (cleanKeys.includes('red')) return 'red';
  if (cleanKeys.includes('orange')) return 'orange';
  return 'green';
}

function dayStatus(date) {
  return aggregateStatuses(getAppointmentsForDate(date).map(appointmentStatusKey));
}

function getUpcomingAppointment() {
  const nowDate = todayString();
  const nowTime = currentTimeString();
  const sorted = sortAppointments(state.appointments);
  return sorted.find(a => a.date > nowDate || (a.date === nowDate && a.time >= nowTime)) || sorted[0] || null;
}

function getAppointmentsForDate(date) {
  return sortAppointments(state.appointments.filter(a => a.date === date));
}

function sortAppointments(list) {
  return [...list].sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
}

function saveUserName() {
  const name = cleanText(els.currentUserName.value);
  const error = validatePersonName(name, 'Jouw naam');
  if (error) {
    showUserNameError(error, els.currentUserName);
    return;
  }
  clearUserNameError();
  state.currentUser = name;
  rememberName(name);
  persistAndRefresh();
  els.nameDialog.close();
}

function showUserNameError(message, input) {
  if (els.userNameError) els.userNameError.textContent = message;
  if (input) input.classList.add('fieldError');
}

function clearUserNameError() {
  if (els.userNameError) els.userNameError.textContent = '';
  if (els.currentUserName) els.currentUserName.classList.remove('fieldError');
}

function openNameDialog() {
  if (state.currentUser) els.currentUserName.value = state.currentUser;
  clearUserNameError();
  els.nameDialog.showModal();
}

function rememberName(name) {
  const clean = cleanText(name);
  if (!clean) return;
  if (!state.names.includes(clean)) state.names.push(clean);
  state.names = uniqueStrings(state.names).sort(localeSort);
}

function rememberCareOption(value) {
  const clean = cleanText(value);
  if (!clean) return;
  if (!state.careOptions.includes(clean)) state.careOptions.push(clean);
  state.careOptions = uniqueStrings(state.careOptions).sort(localeSort);
}

function rememberLocation(value) {
  const clean = cleanText(value);
  if (!clean) return;
  if (!state.locations.includes(clean)) state.locations.push(clean);
  state.locations = uniqueStrings(state.locations).sort(localeSort);
}

function rememberDepartment(value) {
  const clean = cleanText(value);
  if (!clean) return;
  if (!state.departments.includes(clean)) state.departments.push(clean);
  state.departments = uniqueStrings(state.departments).sort(localeSort);
}

function rememberDescription(value) {
  const clean = cleanText(value);
  if (!clean) return;
  if (!state.descriptions.includes(clean)) state.descriptions.push(clean);
  state.descriptions = uniqueStrings(state.descriptions).sort(localeSort);
}

function rememberTimeOption(value) {
  const clean = normalizeTimeInput(value);
  if (!clean) return;
  if (!state.timeOptions.includes(clean)) state.timeOptions.push(clean);
  state.timeOptions = uniqueStrings(state.timeOptions).sort(localeSort);
}

function exportData() {
  const payload = {
    meta: {
      appVersion: APP_VERSION,
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      mode: 'local-first'
    },
    data: sanitizeState(state)
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `zorgplanner-v${APP_VERSION}-backup-${todayString()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Back-upbestand gedownload.');
}

function importData(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const result = importPayload(String(reader.result || '{}'));
    if (!result.ok) {
      showToast(result.message || 'Importeren mislukt.', true);
      event.target.value = '';
      return;
    }
    state = result.state;
    selectedDate = todayString();
    selectedMonthDate = todayString();
    persistAndRefresh();
    showToast(result.message || 'Back-up geïmporteerd.');
    event.target.value = '';
  };
  reader.readAsText(file);
}

async function copyShareCode() {
  try {
    const payload = {
      meta: {
        appVersion: APP_VERSION,
        schemaVersion: SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        mode: 'share-code'
      },
      data: sanitizeState(state)
    };
    const code = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    await navigator.clipboard.writeText(code);
    showToast('Deelcode gekopieerd.');
  } catch {
    showToast('Kopiëren mislukt.', true);
  }
}

function importShareCode(code) {
  const clean = cleanText(code);
  if (!clean) {
    showToast('Plak eerst een deelcode.', true);
    return;
  }
  let decodedText = '';
  try {
    decodedText = decodeURIComponent(escape(atob(clean)));
  } catch {
    showToast('Deelcode ongeldig.', true);
    return;
  }
  const result = importPayload(decodedText);
  if (!result.ok) {
    showToast(result.message || 'Deelcode ongeldig.', true);
    return;
  }
  state = result.state;
  selectedDate = todayString();
  selectedMonthDate = todayString();
  persistAndRefresh();
  els.shareCodeArea.classList.add('hidden');
  els.shareCodeInput.value = '';
  showToast(result.message || 'Gegevens geïmporteerd.');
}

function importPayload(rawText) {
  try {
    const parsed = JSON.parse(rawText);
    const source = parsed && typeof parsed === 'object' && parsed.data ? parsed.data : parsed;
    const importedState = sanitizeState(source);
    const totalAppointments = Array.isArray(importedState.appointments) ? importedState.appointments.length : 0;
    return {
      ok: true,
      state: importedState,
      message: `${totalAppointments} afspraak${totalAppointments === 1 ? '' : 'en'} geïmporteerd.`
    };
  } catch {
    return {
      ok: false,
      message: 'Importeren mislukt. Gebruik een geldige Zorgplanner-back-up of deelcode.'
    };
  }
}

function showAppointmentErrors(errors) {
  const uniqueMessages = [];
  (errors || []).forEach(item => {
    if (!item || !item.message) return;
    if (!uniqueMessages.includes(item.message)) uniqueMessages.push(item.message);
    if (item.field) item.field.classList.add('fieldError');
  });

  if (els.appointmentErrorList) {
    els.appointmentErrorList.innerHTML = uniqueMessages.map(msg => `<li>${escapeHtml(msg)}</li>`).join('');
    els.appointmentErrorList.classList.remove('hidden');
  }

  setSaveMessage(uniqueMessages[0] || 'Controleer de invoer.', true);

  const firstField = (errors || []).find(item => item.field)?.field;
  if (firstField) firstField.focus();
}

function clearAppointmentErrors() {
  if (els.appointmentErrorList) {
    els.appointmentErrorList.innerHTML = '';
    els.appointmentErrorList.classList.add('hidden');
  }
  clearInlineAppointmentErrors();
  [els.apptDate, els.apptTime, els.apptDriver, els.apptPassengers, els.apptCareOption].forEach(clearFieldError);
  setSaveMessage('');
}

function clearFieldError(input) {
  if (input && input.classList) input.classList.remove('fieldError');
  if (input && typeof input.setCustomValidity === 'function') input.setCustomValidity('');
  if (input === els.currentUserName) clearUserNameError();
  if (input === els.manageNameInput && els.manageNameError) els.manageNameError.textContent = '';
  if (input === els.apptTime && els.timeError) els.timeError.textContent = '';
  if (input === els.apptDriver && els.driverError) els.driverError.textContent = '';
  if (input === els.apptPassengers && els.passengerError) els.passengerError.textContent = '';
  if (input === els.apptCareOption && els.careError) els.careError.textContent = '';
}

function clearValidationState() {
  clearUserNameError();
  clearAppointmentErrors();
  if (els.manageNameError) els.manageNameError.textContent = '';
  if (els.manageNameInput) els.manageNameInput.classList.remove('fieldError');
}

function clearInlineAppointmentErrors() {
  [els.timeError, els.driverError, els.passengerError, els.careError].forEach(node => {
    if (node) node.textContent = '';
  });
}

function setFieldError(input, message, target) {
  if (input && input.classList) input.classList.add('fieldError');
  if (input && typeof input.setCustomValidity === 'function') input.setCustomValidity(message || '');
  if (target) target.textContent = message || '';
}

function showToast(message, isError = false, actionLabel = '', action = null) {
  if (!els.toast || !els.toastMessage) return;
  els.toastMessage.textContent = message || '';
  els.toast.classList.remove('hidden', 'isError');
  if (isError) els.toast.classList.add('isError');
  if (els.toastActionBtn) {
    if (actionLabel && typeof action === 'function') {
      els.toastActionBtn.textContent = actionLabel;
      els.toastActionBtn.onclick = action;
      els.toastActionBtn.classList.remove('hidden');
    } else {
      els.toastActionBtn.textContent = '';
      els.toastActionBtn.onclick = null;
      els.toastActionBtn.classList.add('hidden');
    }
  }
  // Auto-hide after 4 seconds for non-error toasts
  if (!isError && !actionLabel) {
    setTimeout(() => hideToast(), 4000);
  }
}

function hideToast() {
  if (!els.toast) return;
  els.toast.classList.add('hidden');
  if (els.toastActionBtn) {
    els.toastActionBtn.textContent = '';
    els.toastActionBtn.onclick = null;
    els.toastActionBtn.classList.add('hidden');
  }
}

function parseAndNormalizeTime(value) {
  const normalized = normalizeTimeFlexible(value);
  if (!normalized) {
    return { ok: false, message: 'Ongeldige tijd. Voorbeelden: 9, 09, 9:30, 930, 09.30 of 9u30.' };
  }
  return { ok: true, value: normalized };
}

function validatePersonName(value, label) {
  const clean = cleanText(value);
  if (!clean) return `${label} is verplicht.`;
  if (clean.length < NAME_MIN) return `${label} moet minimaal ${NAME_MIN} tekens hebben.`;
  if (clean.length > NAME_MAX) return `${label} mag maximaal ${NAME_MAX} tekens hebben.`;
  if (!NAME_RE.test(clean)) return `${label} bevat ongeldige tekens. Gebruik letters, cijfers, spaties en - ' . ( ).`;
  return '';
}

function validateOptionalPersonName(value, label) {
  const clean = cleanText(value);
  if (!clean) return '';
  return validatePersonName(clean, label);
}

function persistAndRefresh() {
  saveState();
  refreshAll();
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizeState(state)));
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return sanitizeState(JSON.parse(raw));

    for (const legacyKey of LEGACY_STORAGE_KEYS) {
      const legacyRaw = localStorage.getItem(legacyKey);
      if (!legacyRaw) continue;
      const parsed = JSON.parse(legacyRaw);
      const source = parsed && typeof parsed === 'object' && parsed.data ? parsed.data : parsed;
      const migrated = sanitizeState(source);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    }

    return structuredCloneSafe(EMPTY_STATE);
  } catch {
    return structuredCloneSafe(EMPTY_STATE);
  }
}

function sanitizeState(input) {
  const safe = structuredCloneSafe(EMPTY_STATE);
  const source = input && typeof input === 'object' && input.data ? input.data : input;
  if (source && typeof source === 'object') {
    safe.currentUser = cleanText(source.currentUser || '');
    safe.names = uniqueStrings(Array.isArray(source.names) ? source.names.map(cleanText).filter(Boolean) : []);
    safe.careOptions = uniqueStrings(Array.isArray(source.careOptions) ? source.careOptions.map(cleanText).filter(Boolean) : []);
    safe.locations = uniqueStrings(Array.isArray(source.locations) ? source.locations.map(cleanText).filter(Boolean) : []);
    safe.departments = uniqueStrings(Array.isArray(source.departments) ? source.departments.map(cleanText).filter(Boolean) : []);
    safe.descriptions = uniqueStrings(Array.isArray(source.descriptions) ? source.descriptions.map(cleanText).filter(Boolean) : []);
    safe.timeOptions = uniqueStrings(Array.isArray(source.timeOptions) ? source.timeOptions.map(normalizeTimeInput).filter(Boolean) : []);
    safe.appointments = Array.isArray(source.appointments)
      ? source.appointments.map(sanitizeAppointment).filter(Boolean)
      : [];
  }
  return safe;
}

function sanitizeAppointment(a) {
  if (!a || typeof a !== 'object') return null;
  const date = normalizeDateInput(a.date);
  const time = normalizeTimeInput(a.time);
  if (!date || !time) return null;
  return {
    id: cleanText(a.id) || generateId(),
    date,
    time,
    location: cleanText(a.location || ''),
    department: cleanText(a.department || ''),
    description: cleanText(a.description || ''),
    driver: cleanText(a.driver || ''),
    passengers: uniqueStrings(Array.isArray(a.passengers) ? a.passengers.map(cleanText).filter(Boolean) : []),
    care: uniqueStrings(Array.isArray(a.care) ? a.care.map(cleanText).filter(Boolean) : []),
    note: cleanText(a.note || ''),
    createdAt: cleanText(a.createdAt || '') || new Date().toISOString(),
    updatedAt: cleanText(a.updatedAt || '') || new Date().toISOString()
  };
}

function ensureStateShape() {
  state = sanitizeState(state);
}

function setSaveMessage(message, isError = false) {
  els.saveMessage.textContent = message;
  els.saveMessage.style.color = isError ? 'var(--danger)' : 'var(--ok)';
}

function chipHtml(value, mode) {
  const attr = mode === 'remove-name'
    ? `data-remove-name="${escapeHtmlAttr(value)}"`
    : mode === 'remove-care'
      ? `data-remove-care="${escapeHtmlAttr(value)}"`
      : mode === 'remove-passenger'
        ? `data-remove-passenger="${escapeHtmlAttr(value)}"`
        : `data-remove-care-temp="${escapeHtmlAttr(value)}"`;
  return `<span class="chip">${escapeHtml(value)}<button type="button" ${attr} aria-label="Verwijderen">×</button></span>`;
}

function currentTimeString() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function todayString() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function normalizeDateInput(value) {
  const clean = cleanText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(clean) ? clean : '';
}

function normalizeTimeInput(value) {
  return normalizeTimeFlexible(value);
}

function normalizeTimeFlexible(value) {
  const clean = cleanText(value).toLowerCase();
  if (!clean) return '';

  let raw = clean
    .replace(/uur/g, ':')
    .replace(/u/g, ':')
    .replace(/[.,\-]/g, ':')
    .replace(/\s+/g, '');

  raw = raw.replace(/:+/g, ':').replace(/^:/, '').replace(/:$/, '');

  if (/^\d{1,2}$/.test(raw)) {
    const h = Number(raw);
    if (h >= 0 && h <= 23) return `${String(h).padStart(2, '0')}:00`;
    return '';
  }

  if (/^\d{1,2}:\d{1,2}$/.test(raw)) {
    const [hStr, mStr] = raw.split(':');
    const h = Number(hStr);
    const m = Number(mStr);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
    return '';
  }

  if (/^\d{3,4}$/.test(raw)) {
    const padded = raw.padStart(4, '0');
    const h = Number(padded.slice(0, 2));
    const m = Number(padded.slice(2, 4));
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
    return '';
  }

  return '';
}

function addDays(dateString, amount) {
  const d = parseDateString(dateString);
  d.setDate(d.getDate() + amount);
  return formatDateObj(d);
}

function addMonths(dateString, amount) {
  const d = parseDateString(dateString);
  d.setDate(1);
  d.setMonth(d.getMonth() + amount);
  return formatDateObj(d);
}

function monthStart(dateString) {
  const d = parseDateString(dateString);
  d.setDate(1);
  return formatDateObj(d);
}

function getWeekStart(dateString) {
  const d = parseDateString(dateString);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return formatDateObj(d);
}

function parseDateString(dateString) {
  const [y, m, d] = dateString.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

function formatDateObj(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateDutch(dateString) {
  const days = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
  const months = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
  const d = parseDateString(dateString);
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
}

function formatDateShortNL(dateString) {
  const months = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  const d = parseDateString(dateString);
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

function formatMonthYear(dateString) {
  const months = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
  const d = parseDateString(dateString);
  return `${months[d.getMonth()]} ${d.getFullYear()}`;
}

function uniqueStrings(list) {
  return [...new Set((list || []).map(cleanText).filter(Boolean))];
}

function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function localeSort(a, b) {
  return a.localeCompare(b, 'nl', { sensitivity: 'base' });
}

function shortText(text, len) {
  const clean = cleanText(text);
  return clean.length > len ? `${clean.slice(0, len - 1)}…` : clean;
}

function generateId() {
  return `appt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function structuredCloneSafe(value) {
  return JSON.parse(JSON.stringify(value));
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeHtmlAttr(value) {
  return escapeHtml(value);
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });

    const reg = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none'
    });
    reg.update();

    if (reg.waiting) {
      showToast(`Nieuwe versie beschikbaar.`, false, 'Vernieuwen', () => {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      });
    }

    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      if (!newWorker) return;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          showToast(`Update beschikbaar.`, false, 'Vernieuwen', () => {
            newWorker.postMessage({ type: 'SKIP_WAITING' });
          });
        }
      });
    });
  } catch {
    // stil falen is acceptabel
  }
}
