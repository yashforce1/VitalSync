export const CAPACITY = 74;
export const TIMEZONE = 'Asia/Kolkata';
export const STORAGE_KEY = 'careflow-demo-v1';
export const DAY = 86400000;
const dayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
export function dayKey(value = new Date()) {
  return dayFormatter.format(new Date(value));
}
export function timeLabel(value) {
  return new Intl.DateTimeFormat('en-IN', { timeZone: TIMEZONE, hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}
export function dateLabel(value, options = {}) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, day: 'numeric', month: 'short', ...options }).format(new Date(value));
}
// Keep the demo's care session stable when the computer's date changes.
// Older saved workspaces infer their care date from their most recent record.
export function careTime(state, fallback = new Date()) {
  if (state.careAt && Number.isFinite(Date.parse(state.careAt))) return new Date(state.careAt);
  const timestamps = [
    ...state.activity.map(entry => entry.at),
    ...state.patients.flatMap(patient => [patient.admittedAt, patient.closedAt, patient.approvedAt,
      ...patient.readings.map(reading => reading.at), ...patient.reviews.map(review => review.at)]),
  ].map(value => Date.parse(value)).filter(Number.isFinite);
  return timestamps.length ? new Date(Math.max(...timestamps)) : new Date(fallback);
}
export const todayReading = (patient, now = new Date()) => patient.readings.find(r => dayKey(r.at) === dayKey(now));
export const todayReview = (patient, now = new Date()) => patient.reviews.find(r => dayKey(r.at) === dayKey(now));
export function feverFree(patient, threshold = 38, now = new Date()) {
  let earliest = null;
  for (let offset = 0; offset < 366; offset++) {
    const key = dayKey(new Date(+new Date(now) - offset * DAY));
    const readings = patient.readings.filter(r => dayKey(r.at) === key && +new Date(r.at) <= +new Date(now));
    if (!readings.length || readings.some(r => r.value >= threshold)) break;
    earliest = Math.min(...readings.map(r => +new Date(r.at)));
  }
  const hours = earliest === null ? 0 : (+new Date(now) - earliest) / 3600000;
  return { hours, days: Math.floor(hours / 24), eligible: hours >= 72 };
}
export function statusOf(patient, threshold, now = new Date()) {
  if (patient.status !== 'active') return patient.status === 'recovered' ? 'Discharged' : 'Deceased';
  const free = feverFree(patient, threshold, now);
  if (patient.approvedAt && free.eligible && todayReview(patient, now)) return 'Discharge approved';
  if (free.eligible) return todayReview(patient, now) ? 'Awaiting approval' : 'Ready for review';
  if (!todayReading(patient, now)) return 'Temperature due';
  if (!todayReview(patient, now)) return 'Doctor review due';
  return 'Care complete';
}
export function metrics(state, now = new Date()) {
  const active = state.patients.filter(p => p.status === 'active');
  const recovered = state.patients.filter(p => p.status === 'recovered').length;
  const deceased = state.patients.filter(p => p.status === 'deceased').length;
  const resolved = recovered + deceased;
  return { active, recovered, deceased, resolved, recovery: resolved ? recovered / resolved * 100 : null,
    mortality: resolved ? deceased / resolved * 100 : null,
    temperatureDone: active.filter(p => todayReading(p, now)).length,
    reviewDone: active.filter(p => todayReview(p, now)).length,
    ready: active.filter(p => feverFree(p, state.threshold, now).eligible),
    approved: active.filter(p => p.approvedAt && feverFree(p, state.threshold, now).eligible && todayReview(p, now)),
  };
}
export function applyAction(state, action, now = new Date()) {
  const timestamp = new Date(now).toISOString();
  const next = structuredClone(state);
  const patient = next.patients.find(p => p.id === action.patientId);
  let message;
  if (action.type === 'admit') {
    const active = next.patients.filter(p => p.status === 'active');
    if (active.length >= CAPACITY) throw new Error('All 74 beds are occupied. Complete a discharge before admitting a patient.');
    if (!action.name?.trim() || !Number.isInteger(action.age) || action.age < 0 || action.age > 120) throw new Error('Enter a patient name and an age from 0 to 120.');
    const room = Number(action.room);
    if (!Number.isInteger(room) || room < 1 || room > CAPACITY || active.some(p => p.room === room)) throw new Error('Choose an available bed.');
    const number = Math.max(...next.patients.map(p => Number(p.id.slice(3))), 1000) + 1;
    next.patients.unshift({ id: `CF-${number}`, name: action.name.trim(), age: action.age, sex: action.sex, room, admittedAt: timestamp, status: 'active', readings: [], reviews: [], approvedAt: null, closedAt: null });
    message = `${action.name.trim()} admitted to bed ${String(room).padStart(2, '0')}`;
  } else if (action.type === 'threshold') {
    if (!Number.isFinite(action.value) || action.value < 37 || action.value > 40) throw new Error('Enter a demo threshold between 37°C and 40°C.');
    next.threshold = action.value;
    next.patients.forEach(p => { if (p.status === 'active') p.approvedAt = null; });
    message = `Demo fever threshold changed to ${action.value.toFixed(1)}°C; discharge approvals cleared`;
  } else {
    if (!patient || patient.status !== 'active') throw new Error('This patient is no longer in the active care queue.');
    if (action.type === 'temperature') {
      if (todayReading(patient, now)) throw new Error('Today’s routine temperature has already been recorded.');
      if (!Number.isFinite(action.value) || action.value < 34 || action.value > 43) throw new Error('Enter a temperature between 34°C and 43°C.');
      patient.readings.unshift({ at: timestamp, value: action.value, by: 'Nurse Alex Morgan' });
      patient.approvedAt = null;
      message = `Temperature recorded for ${patient.name} · ${action.value.toFixed(1)}°C`;
    } else if (action.type === 'review') {
      if (!todayReading(patient, now)) throw new Error('Record today’s temperature before the doctor review.');
      if (todayReview(patient, now)) throw new Error('Today’s doctor review is already complete.');
      if (!action.notes?.trim()) throw new Error('Add a clinical review note before saving.');
      patient.reviews.unshift({ at: timestamp, notes: action.notes.trim(), by: 'Dr. Sarah Mitchell' });
      message = `Doctor review completed for ${patient.name}`;
    } else if (action.type === 'approve') {
      if (!feverFree(patient, next.threshold, now).eligible || !todayReview(patient, now)) throw new Error('Approval requires 72 documented fever-free hours and today’s doctor review.');
      if (patient.approvedAt) throw new Error('Discharge has already been approved.');
      patient.approvedAt = timestamp;
      message = `Discharge approved for ${patient.name} · admin queue updated`;
    } else if (action.type === 'discharge') {
      if (!patient.approvedAt || !feverFree(patient, next.threshold, now).eligible || !todayReview(patient, now)) throw new Error('A valid doctor approval and today’s review are required for discharge.');
      patient.status = 'recovered';
      patient.closedAt = timestamp;
      message = `${patient.name} discharged · bed ${String(patient.room).padStart(2, '0')} is now available`;
    } else if (action.type === 'deceased') {
      if (!action.notes?.trim()) throw new Error('An outcome note is required.');
      patient.status = 'deceased';
      patient.closedAt = timestamp;
      patient.outcomeNote = action.notes.trim();
      message = `Death recorded for ${patient.name} · outcome reporting updated`;
    } else throw new Error('Unknown action.');
  }
  next.activity.unshift({ id: crypto.randomUUID(), at: timestamp, message, kind: action.type });
  return { state: next, message };
}

const firstNames = ['Olivia', 'Liam', 'Emma', 'Noah', 'Amelia', 'Elijah', 'Charlotte', 'James', 'Sophia', 'Lucas', 'Isabella', 'Mason', 'Mia', 'Ethan', 'Harper', 'Aiden', 'Evelyn', 'Henry', 'Aria', 'Leo', 'Priya', 'Arjun', 'Ananya', 'Rohan', 'Ishaan', 'Meera', 'Aarav', 'Diya', 'Sofia', 'Oliver', 'Grace', 'William', 'Chloe', 'Benjamin', 'Zoe', 'Alexander', 'Lily'];
const lastNames = ['Bennett', 'Anderson', 'Wilson', 'Thompson', 'Patel', 'Davis', 'Martin', 'Taylor', 'Clark', 'Lewis', 'Walker', 'Hall', 'Young', 'Allen', 'Wright', 'Scott', 'Green', 'Adams', 'Baker', 'Nelson', 'Sharma', 'Kapoor', 'Shah', 'Mehta', 'Singh', 'Rao', 'Gupta', 'Nair', 'Carter', 'Mitchell', 'Phillips', 'Campbell', 'Parker', 'Evans', 'Collins', 'Edwards', 'Stewart'];
export function createDemo(now = new Date()) {
  const base = +new Date(now) - 60000;
  const at = (days, minutes = 0) => new Date(base - days * DAY - minutes * 60000).toISOString();
  const patients = Array.from({ length: 74 }, (_, i) => {
    const readings = [];
    for (let day = i < 56 ? 0 : 1; day <= 5; day++) {
      const value = i < 6 ? (day < 5 ? 36.5 + (i % 4) * .2 : 38.3) : day < (i % 3) ? 36.7 + (i % 3) * .2 : 38 + ((i + day) % 12) / 10;
      readings.push({ at: at(day, 1), value: Number(value.toFixed(1)), by: 'Nurse Alex Morgan' });
    }
    return { id: `CF-${1042 + i}`, name: `${firstNames[i % 37]} ${lastNames[(i + Math.floor(i / 37) * 9) % 37]}`, age: 24 + i * 7 % 52, sex: i % 2 ? 'Male' : 'Female', room: i + 1,
      admittedAt: at(6 + i % 5), status: 'active', readings,
      reviews: i < 30 ? [{ at: at(0), by: 'Dr. Sarah Mitchell', notes: i < 6 ? 'Daily review complete. Documented fever-free period meets the facility discharge criterion.' : 'Daily review complete. Continue the documented care plan and daily observation.' }] : [],
      approvedAt: i < 2 ? at(0) : null, closedAt: null };
  });
  for (let i = 0; i < 130; i++) {
    const deceased = i % 10 === 0 || i === 129;
    patients.push({ id: `CF-${800 + i}`, name: `${firstNames[i % 37]} ${lastNames[(i + 13) % 37]}`, age: 26 + i % 50, sex: i % 2 ? 'Male' : 'Female', room: 1 + i % 74,
      admittedAt: at(8 + i % 28 + i % 8), closedAt: at(1 + i % 28), status: deceased ? 'deceased' : 'recovered', readings: [], reviews: [], approvedAt: null });
  }
  return { version: 1, careAt: new Date(now).toISOString(), threshold: 38, patients, activity: [
    { id: 'seed-1', at: at(0), kind: 'approve', message: 'Discharge approved for Olivia Bennett · admin queue updated' },
    { id: 'seed-2', at: at(0, 1), kind: 'temperature', message: 'Nurse Alex Morgan recorded the latest daily temperatures' },
    { id: 'seed-3', at: at(0, 2), kind: 'review', message: 'Dr. Sarah Mitchell completed 30 patient reviews' },
  ] };
}
