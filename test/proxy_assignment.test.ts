import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';

import { findBestProxyForWindow } from '../src/services/interviewService';

const NIHAL = { id: 'u_nihal', display_name: 'Nihal', role: 'jpc_proxy', google_calendar_connected: true };
const RUDRA = { id: 'u_rudra', display_name: 'Rudra', role: 'jpc_proxy', google_calendar_connected: true };

const DATE = '2026-10-05';
const START = '10:00';
const END = '10:30';

test('Both proxies free with no history: either can be picked, no error', () => {
  const result = findBestProxyForWindow(DATE, START, END, [NIHAL, RUDRA], [], []);
  assert.ok(result.bestProxy);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.availableProxies.map(p => p.id).sort(), ['u_nihal', 'u_rudra']);
});

test('Proxy with an overlapping confirmed round is excluded from selection', () => {
  const rounds = [
    { id: 'r1', proxy_user_id: 'u_nihal', status: 'confirmed', booked_slot_time: `${DATE}T10:10:00`, booked_slot_end: `${DATE}T10:40:00` }
  ];
  const result = findBestProxyForWindow(DATE, START, END, [NIHAL, RUDRA], rounds, []);
  assert.equal(result.bestProxy?.id, 'u_rudra');
  assert.deepEqual(result.availableProxies.map(p => p.id), ['u_rudra']);
});

test('Proxy with a manual "unavailable" block is excluded from selection', () => {
  const avails = [
    { id: 'a1', proxy_user_id: 'u_rudra', slot_status: 'unavailable', slot_start: `${DATE}T09:50:00`, slot_end: `${DATE}T10:20:00` }
  ];
  const result = findBestProxyForWindow(DATE, START, END, [NIHAL, RUDRA], [], avails);
  assert.equal(result.bestProxy?.id, 'u_nihal');
  assert.deepEqual(result.availableProxies.map(p => p.id), ['u_nihal']);
});

test('Proxy with a synced Google Calendar conflict is excluded from selection', () => {
  const calEvents = [
    { proxy_user_id: 'u_nihal', start_time: `${DATE}T10:05:00`, end_time: `${DATE}T10:15:00` }
  ];
  const result = findBestProxyForWindow(DATE, START, END, [NIHAL, RUDRA], [], [], calEvents);
  assert.equal(result.bestProxy?.id, 'u_rudra');
  assert.deepEqual(result.availableProxies.map(p => p.id), ['u_rudra']);
});

test('Proxy without a connected Google Calendar is a hard exclusion, never selectable', () => {
  const rudraDisconnected = { ...RUDRA, google_calendar_connected: false };
  const result = findBestProxyForWindow(DATE, START, END, [NIHAL, rudraDisconnected], [], []);
  assert.equal(result.bestProxy?.id, 'u_nihal');
  assert.deepEqual(result.availableProxies.map(p => p.id), ['u_nihal']);
});

test('When both proxies are genuinely double-booked, no proxy is returned and an error is set', () => {
  const rounds = [
    { id: 'r1', proxy_user_id: 'u_nihal', status: 'confirmed', booked_slot_time: `${DATE}T10:00:00`, booked_slot_end: `${DATE}T10:30:00` },
    { id: 'r2', proxy_user_id: 'u_rudra', status: 'live', booked_slot_time: `${DATE}T10:00:00`, booked_slot_end: `${DATE}T10:30:00` }
  ];
  const result = findBestProxyForWindow(DATE, START, END, [NIHAL, RUDRA], rounds, []);
  assert.equal(result.bestProxy, null);
  assert.equal(result.availableProxies.length, 0);
  assert.ok(result.errors.length > 0);
});

test('A proxy on leave is excluded from selection', () => {
  const nihalOnLeave = { ...NIHAL, is_on_leave: true };
  const result = findBestProxyForWindow(DATE, START, END, [nihalOnLeave, RUDRA], [], []);
  assert.equal(result.bestProxy?.id, 'u_rudra');
  assert.deepEqual(result.availableProxies.map(p => p.id), ['u_rudra']);
});

test('Lower workload on the SAME date wins deterministically, not a coin flip', () => {
  const rounds = [
    { id: 'r1', proxy_user_id: 'u_nihal', status: 'booked', interview_date: DATE, booked_slot_time: `${DATE}T08:00:00`, booked_slot_end: `${DATE}T08:30:00` },
    { id: 'r2', proxy_user_id: 'u_nihal', status: 'confirmed', interview_date: DATE, booked_slot_time: `${DATE}T09:00:00`, booked_slot_end: `${DATE}T09:30:00` }
  ];
  // Run many times: Rudra (0 bookings that date) must ALWAYS beat Nihal (2 bookings that date).
  for (let i = 0; i < 50; i++) {
    const result = findBestProxyForWindow(DATE, START, END, [NIHAL, RUDRA], rounds, []);
    assert.equal(result.bestProxy?.id, 'u_rudra', 'Rudra should always win when genuinely less loaded that day');
  }
});

test('Workload from a DIFFERENT date does not affect selection for the target date (stays a genuine tie)', () => {
  const rounds = [
    { id: 'r1', proxy_user_id: 'u_nihal', status: 'confirmed', interview_date: '2026-10-01', booked_slot_time: `2026-10-01T08:00:00`, booked_slot_end: `2026-10-01T08:30:00` },
    { id: 'r2', proxy_user_id: 'u_nihal', status: 'confirmed', interview_date: '2026-10-01', booked_slot_time: `2026-10-01T09:00:00`, booked_slot_end: `2026-10-01T09:30:00` }
  ];
  const counts: Record<string, number> = { u_nihal: 0, u_rudra: 0 };
  for (let i = 0; i < 500; i++) {
    const result = findBestProxyForWindow(DATE, START, END, [NIHAL, RUDRA], rounds, []);
    if (result.bestProxy) counts[result.bestProxy.id]++;
  }
  // Both should win a meaningful share — history from an unrelated date must not create a fixed favorite.
  assert.ok(counts.u_nihal > 150, `expected Nihal to win a fair share, got ${counts.u_nihal}/500`);
  assert.ok(counts.u_rudra > 150, `expected Rudra to win a fair share, got ${counts.u_rudra}/500`);
});

test('Genuine ties are resolved close to 50/50 over many trials, not a fixed favorite', () => {
  const counts: Record<string, number> = { u_nihal: 0, u_rudra: 0 };
  for (let i = 0; i < 2000; i++) {
    const result = findBestProxyForWindow(DATE, START, END, [NIHAL, RUDRA], [], []);
    if (result.bestProxy) counts[result.bestProxy.id]++;
  }
  // Allow generous tolerance (35-65%) to avoid test flakiness while still catching a fixed-favorite bug.
  assert.ok(counts.u_nihal > 700 && counts.u_nihal < 1300, `Nihal win count out of expected random range: ${counts.u_nihal}/2000`);
  assert.ok(counts.u_rudra > 700 && counts.u_rudra < 1300, `Rudra win count out of expected random range: ${counts.u_rudra}/2000`);
});

test('proxy_priority field has no effect on selection, even when set to extreme opposite values', () => {
  const nihalHighPriority = { ...NIHAL, proxy_priority: 1 };
  const rudraLowPriority = { ...RUDRA, proxy_priority: 99 };
  const counts: Record<string, number> = { u_nihal: 0, u_rudra: 0 };
  for (let i = 0; i < 2000; i++) {
    const result = findBestProxyForWindow(DATE, START, END, [nihalHighPriority, rudraLowPriority], [], []);
    if (result.bestProxy) counts[result.bestProxy.id]++;
  }
  assert.ok(counts.u_nihal > 700 && counts.u_nihal < 1300, `proxy_priority appears to bias selection: ${counts.u_nihal}/2000 for Nihal (priority=1)`);
});
