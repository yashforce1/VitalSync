import test from 'node:test';
import assert from 'node:assert/strict';
import { DAY, CAPACITY, applyAction, careTime, createDemo, dayKey, feverFree, metrics, todayReading, todayReview } from './domain.js';

const now = new Date('2026-10-23T06:30:00.000Z');
const demo = () => createDemo(now);
const withReadings = values => ({ readings: values.map(([hours, value]) => ({ at: new Date(+now - hours * 3600000).toISOString(), value })) });
test('uses facility midnight in Asia/Kolkata, independent of host timezone', () => {
  assert.equal(dayKey('2026-10-22T18:29:00Z'), '2026-10-22');
  assert.equal(dayKey('2026-10-22T18:30:00Z'), '2026-10-23');
});
test('seed has 74 occupied beds, correct queues and real completed-case counts', () => {
  const result = metrics(demo(), now);
  assert.equal(result.active.length, CAPACITY);
  assert.equal(new Set(result.active.map(p => p.room)).size, CAPACITY);
  assert.equal(result.temperatureDone, 56);
  assert.equal(result.reviewDone, 30);
  assert.equal(result.ready.length, 6);
  assert.equal(result.approved.length, 2);
  assert.equal(result.recovered, 116);
  assert.equal(result.deceased, 14);
  assert.equal(result.resolved, 130);
  assert.equal(result.recovery, 116 / 130 * 100);
  for (const p of demo().patients) if (p.closedAt) assert.ok(new Date(p.closedAt) > new Date(p.admittedAt));
});
test('saved demo retains patient records and care counts when reopened tomorrow or later', () => {
  const state = demo();
  const patientId = state.patients[56].id;
  const updated = applyAction(state, { type: 'temperature', patientId, value: 36.8 }, careTime(state)).state;
  const saved = JSON.stringify(updated);
  for (const days of [1, 7]) {
    const reopened = JSON.parse(saved);
    const tomorrow = new Date(+now + days * DAY);
    const careDate = careTime(reopened, tomorrow);
    assert.equal(+careDate, +now);
    assert.deepEqual(metrics(reopened, careDate), metrics(updated, now));
    assert.equal(metrics(reopened, careDate).temperatureDone, 57);
    assert.equal(reopened.patients.length, 204);
    assert.throws(() => applyAction(reopened, { type: 'temperature', patientId, value: 37 }, careDate), /already/);
    const reviewed = applyAction(reopened, { type: 'review', patientId, notes: 'Reviewed' }, careDate).state;
    assert.equal(metrics(reviewed, careDate).reviewDone, 31);
    assert.equal(JSON.stringify(reopened), saved);
  }
});
test('older saved demos recover their care date without replacing patient data', () => {
  const state = demo();
  delete state.careAt;
  const original = JSON.stringify(state);
  const careDate = careTime(state, new Date(+now + DAY));
  assert.equal(dayKey(careDate), dayKey(now));
  assert.deepEqual(metrics(state, careDate), metrics(state, now));
  assert.equal(JSON.stringify(state), original);
});
test('resetting the demo starts a care session on the new date', () => {
  const tomorrow = new Date(+now + DAY);
  const reset = createDemo(tomorrow);
  assert.equal(+careTime(reset), +tomorrow);
  assert.equal(metrics(reset, careTime(reset)).temperatureDone, 56);
});
test('three daily readings alone do not make three full days', () => {
  const p = withReadings([[0, 36.8], [24, 36.8], [48, 36.8]]);
  assert.equal(feverFree(p, 38, now).eligible, false);
  assert.equal(feverFree(p, 38, now).days, 2);
});
test('exactly 72 documented hours qualify and a shorter interval does not', () => {
  assert.equal(feverFree(withReadings([[0, 37], [24, 37], [48, 37], [72, 37]]), 38, now).eligible, true);
  assert.equal(feverFree(withReadings([[0, 37], [24, 37], [48, 37], [71.99, 37]]), 38, now).eligible, false);
});
test('fever at the threshold and missing dates break the fever-free streak', () => {
  assert.equal(feverFree(withReadings([[0, 37], [24, 37], [48, 38], [72, 37], [96, 37]]), 38, now).eligible, false);
  assert.equal(feverFree(withReadings([[0, 37], [24, 37], [72, 37], [96, 37]]), 38, now).eligible, false);
  assert.equal(feverFree(withReadings([[24, 37], [48, 37], [72, 37], [96, 37]]), 38, now).eligible, false);
});
test('any fever reading on a day blocks eligibility even if a later value is low', () => {
  const p = withReadings([[0, 36.7], [1, 38.5], [24, 37], [48, 37], [72, 37]]);
  assert.equal(feverFree(p, 38, now).eligible, false);
});
test('nurse to doctor handoff, duplicate prevention and required notes', () => {
  let state = demo();
  const patientId = state.patients[56].id;
  assert.throws(() => applyAction(state, { type: 'review', patientId, notes: 'Reviewed' }, now), /temperature/);
  state = applyAction(state, { type: 'temperature', patientId, value: 36.8 }, now).state;
  assert.ok(todayReading(state.patients.find(p => p.id === patientId), now));
  assert.throws(() => applyAction(state, { type: 'temperature', patientId, value: 37 }, now), /already/);
  assert.throws(() => applyAction(state, { type: 'review', patientId, notes: '   ' }, now), /note/);
  state = applyAction(state, { type: 'review', patientId, notes: 'Reviewed; daily observation documented.' }, now).state;
  assert.ok(todayReview(state.patients.find(p => p.id === patientId), now));
  assert.throws(() => applyAction(state, { type: 'review', patientId, notes: 'Reviewed' }, now), /already/);
  assert.equal(metrics(state, now).temperatureDone, 57);
  assert.equal(metrics(state, now).reviewDone, 31);
});
test('discharge requires approval and current review; closed cases cannot be changed', () => {
  let state = demo();
  const patientId = state.patients[2].id;
  assert.throws(() => applyAction(state, { type: 'discharge', patientId }, now), /approval/);
  state = applyAction(state, { type: 'approve', patientId }, now).state;
  assert.throws(() => applyAction(state, { type: 'approve', patientId }, now), /already/);
  const tomorrow = new Date(+now + DAY);
  assert.throws(() => applyAction(state, { type: 'discharge', patientId }, tomorrow), /approval/);
  state = applyAction(state, { type: 'discharge', patientId }, now).state;
  assert.equal(metrics(state, now).active.length, 73);
  assert.equal(metrics(state, now).recovered, 117);
  assert.throws(() => applyAction(state, { type: 'deceased', patientId, notes: 'note' }, now), /no longer/);
});
test('threshold changes clear approvals and eligibility is recalculated', () => {
  const state = applyAction(demo(), { type: 'threshold', value: 37 }, now).state;
  assert.equal(state.threshold, 37);
  assert.equal(metrics(state, now).approved.length, 0);
  assert.equal(metrics(state, now).ready.length, 5);
});
test('admission capacity and occupied beds are enforced at the data layer', () => {
  let state = demo();
  const admission = { type: 'admit', name: 'Test Patient', age: 42, sex: 'Female', room: 1 };
  assert.throws(() => applyAction(state, admission, now), /occupied/);
  state = applyAction(state, { type: 'discharge', patientId: state.patients[0].id }, now).state;
  assert.throws(() => applyAction(state, { ...admission, room: 2 }, now), /available bed/);
  assert.throws(() => applyAction(state, { ...admission, age: 121 }, now), /age/);
  assert.throws(() => applyAction(state, { ...admission, room: 75 }, now), /available bed/);
  state = applyAction(state, admission, now).state;
  assert.equal(state.patients[0].name, 'Test Patient');
  assert.equal(metrics(state, now).active.length, 74);
  assert.equal(new Set(state.patients.map(p => p.id)).size, state.patients.length);
});
test('death records update mortality and release capacity, with required outcome notes', () => {
  let state = demo();
  const patientId = state.patients[10].id;
  assert.throws(() => applyAction(state, { type: 'deceased', patientId, notes: '' }, now), /note/);
  state = applyAction(state, { type: 'deceased', patientId, notes: 'Outcome documented.' }, now).state;
  assert.equal(metrics(state, now).deceased, 15);
  assert.equal(metrics(state, now).active.length, 73);
  assert.equal(metrics(state, now).mortality, 15 / 131 * 100);
});
test('outcome rates are unavailable instead of dividing by zero when no cases are closed', () => {
  const state = demo(); state.patients = state.patients.filter(p => p.status === 'active');
  assert.equal(metrics(state, now).recovery, null);
  assert.equal(metrics(state, now).mortality, null);
});
test('invalid readings are rejected and inputs are not mutated', () => {
  const state = demo();
  const patientId = state.patients[56].id;
  const original = JSON.stringify(state);
  for (const value of [NaN, 0, 44]) assert.throws(() => applyAction(state, { type: 'temperature', patientId, value }, now), /temperature between/);
  applyAction(state, { type: 'temperature', patientId, value: 37 }, now);
  assert.equal(JSON.stringify(state), original);
});
