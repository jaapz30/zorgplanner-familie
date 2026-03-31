function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function uniqueStrings(list) {
  return [...new Set((list || []).map(cleanText).filter(Boolean))];
}

function normalizeDateInput(value) {
  const clean = cleanText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(clean) ? clean : '';
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

function generateId() {
  return `appt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizeAppointment(a) {
  if (!a || typeof a !== 'object') return null;

  const date = normalizeDateInput(a.date);
  const time = normalizeTimeFlexible(a.time);
  if (!date || !time) return null;

  return {
    id: cleanText(a.id) || generateId(),
    date,
    time,
    location: cleanText(a.location || ''),
    department: cleanText(a.department || ''),
    description: cleanText(a.description || ''),
    driver: cleanText(a.driver || ''),
    passengers: uniqueStrings(Array.isArray(a.passengers) ? a.passengers : []),
    care: uniqueStrings(Array.isArray(a.care) ? a.care : []),
    note: cleanText(a.note || ''),
    createdAt: cleanText(a.createdAt || '') || new Date().toISOString(),
    updatedAt: cleanText(a.updatedAt || '') || new Date().toISOString()
  };
}

function sanitizeState(input) {
  const source = input && typeof input === 'object' && input.data ? input.data : input;
  const safe = {
    currentUser: '',
    names: [],
    careOptions: [],
    locations: [],
    departments: [],
    descriptions: [],
    timeOptions: [],
    appointments: [],
    deletedAppointmentIds: [],
    tombstones: []
  };

  if (!source || typeof source !== 'object') return safe;

  safe.currentUser = cleanText(source.currentUser || '');
  safe.names = uniqueStrings(Array.isArray(source.names) ? source.names : []);
  safe.careOptions = uniqueStrings(Array.isArray(source.careOptions) ? source.careOptions : []);
  safe.locations = uniqueStrings(Array.isArray(source.locations) ? source.locations : []);
  safe.departments = uniqueStrings(Array.isArray(source.departments) ? source.departments : []);
  safe.descriptions = uniqueStrings(Array.isArray(source.descriptions) ? source.descriptions : []);
  safe.timeOptions = uniqueStrings(Array.isArray(source.timeOptions) ? source.timeOptions.map(normalizeTimeFlexible).filter(Boolean) : []);
  safe.appointments = Array.isArray(source.appointments)
    ? source.appointments.map(sanitizeAppointment).filter(Boolean)
    : [];
  safe.deletedAppointmentIds = uniqueStrings(Array.isArray(source.deletedAppointmentIds) ? source.deletedAppointmentIds : []);
  safe.tombstones = Array.isArray(source.tombstones)
    ? source.tombstones
        .map(item => ({
          id: cleanText(item?.id || ''),
          deletedAt: cleanText(item?.deletedAt || '')
        }))
        .filter(item => item.id && item.deletedAt)
    : [];

  return safe;
}

function unionSorted(a, b) {
  return uniqueStrings([...(a || []), ...(b || [])]).sort((x, y) =>
    x.localeCompare(y, 'nl', { sensitivity: 'base' })
  );
}

function compareIso(a, b) {
  const aa = cleanText(a || '');
  const bb = cleanText(b || '');
  if (aa === bb) return 0;
  return aa > bb ? 1 : -1;
}

function mergeStates(existingRaw, incomingRaw) {
  const existing = sanitizeState(existingRaw);
  const incoming = sanitizeState(incomingRaw);

  const result = {
    currentUser: '',
    names: unionSorted(existing.names, incoming.names),
    careOptions: unionSorted(existing.careOptions, incoming.careOptions),
    locations: unionSorted(existing.locations, incoming.locations),
    departments: unionSorted(existing.departments, incoming.departments),
    descriptions: unionSorted(existing.descriptions, incoming.descriptions),
    timeOptions: unionSorted(existing.timeOptions, incoming.timeOptions),
    appointments: [],
    deletedAppointmentIds: [],
    tombstones: []
  };

  const tombstoneMap = new Map();

  for (const t of existing.tombstones || []) {
    if (!t.id || !t.deletedAt) continue;
    const current = tombstoneMap.get(t.id);
    if (!current || compareIso(t.deletedAt, current.deletedAt) > 0) {
      tombstoneMap.set(t.id, { id: t.id, deletedAt: t.deletedAt });
    }
  }

  const nowIso = new Date().toISOString();
  for (const id of incoming.deletedAppointmentIds || []) {
    const current = tombstoneMap.get(id);
    if (!current || compareIso(nowIso, current.deletedAt) > 0) {
      tombstoneMap.set(id, { id, deletedAt: nowIso });
    }
  }

  const appointmentMap = new Map();

  for (const appt of existing.appointments || []) {
    if (!appt?.id) continue;
    const tomb = tombstoneMap.get(appt.id);
    if (tomb && compareIso(tomb.deletedAt, appt.updatedAt) >= 0) continue;
    appointmentMap.set(appt.id, appt);
  }

  for (const appt of incoming.appointments || []) {
    if (!appt?.id) continue;

    if ((incoming.deletedAppointmentIds || []).includes(appt.id)) continue;

    const tomb = tombstoneMap.get(appt.id);
    if (tomb && compareIso(tomb.deletedAt, appt.updatedAt) >= 0) {
      continue;
    }

    const existingAppt = appointmentMap.get(appt.id);
    if (!existingAppt) {
      appointmentMap.set(appt.id, appt);
      continue;
    }

    if (compareIso(appt.updatedAt, existingAppt.updatedAt) >= 0) {
      appointmentMap.set(appt.id, appt);
    }
  }

  result.appointments = [...appointmentMap.values()].sort((a, b) =>
    `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)
  );

  result.tombstones = [...tombstoneMap.values()]
    .sort((a, b) => compareIso(b.deletedAt, a.deletedAt))
    .slice(0, 1000);

  return result;
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/appointments') {
      const auth = request.headers.get('Authorization');
      if (auth !== 'liesbeth') {
        return new Response('Unauthorized', { status: 401 });
      }

      if (request.method === 'GET') {
        const raw = await env.AFSPRAKEN_DB.get('appointments');
        const parsed = raw ? JSON.parse(raw) : {};
        const safe = sanitizeState(parsed);
        safe.deletedAppointmentIds = [];
        return jsonResponse(safe);
      }

      if (request.method === 'POST') {
        const body = await request.json();
        const raw = await env.AFSPRAKEN_DB.get('appointments');
        const parsed = raw ? JSON.parse(raw) : {};
        const merged = mergeStates(parsed, body);
        await env.AFSPRAKEN_DB.put('appointments', JSON.stringify(merged));
        const responseState = sanitizeState(merged);
        responseState.deletedAppointmentIds = [];
        return jsonResponse({ success: true, state: responseState });
      }

      return new Response('Method not allowed', { status: 405 });
    }

    return env.ASSETS.fetch(request);
  }
};
