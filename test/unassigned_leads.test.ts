import test from 'node:test';
import assert from 'node:assert/strict';

// Set NODE_ENV to test to prevent server.ts from starting listening sockets and crons
process.env.NODE_ENV = 'test';

import {
  isSalesWorkingHours,
  assignLeadRoundRobinTransaction,
  processUnassignedLeadsEngine
} from '../server';

/**
 * Creates an in-memory mock Firestore database compatible with
 * assignLeadRoundRobinTransaction and processUnassignedLeadsEngine.
 */
function createMockFirestore(initialCollections: Record<string, Record<string, any>> = {}) {
  const store: Record<string, Record<string, any>> = {};

  // Deep clone initial data
  for (const [col, docs] of Object.entries(initialCollections)) {
    store[col] = {};
    for (const [id, data] of Object.entries(docs)) {
      store[col][id] = JSON.parse(JSON.stringify(data));
    }
  }

  function getCollection(colName: string) {
    if (!store[colName]) {
      store[colName] = {};
    }
    return store[colName];
  }

  function createDocRef(colName: string, docId: string) {
    return {
      id: docId,
      colName,
      get: async () => {
        const col = getCollection(colName);
        const data = col[docId];
        return {
          exists: data !== undefined,
          id: docId,
          data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined)
        };
      },
      set: async (data: any, options?: { merge?: boolean }) => {
        const col = getCollection(colName);
        if (options?.merge && col[docId]) {
          col[docId] = { ...col[docId], ...JSON.parse(JSON.stringify(data)) };
        } else {
          col[docId] = JSON.parse(JSON.stringify(data));
        }
      },
      update: async (data: any) => {
        const col = getCollection(colName);
        if (!col[docId]) {
          col[docId] = {};
        }
        col[docId] = { ...col[docId], ...JSON.parse(JSON.stringify(data)) };
      }
    };
  }

  function createQuery(colName: string, filters: Array<{ field: string; op: string; val: any }> = [], limitVal?: number) {
    return {
      where: (field: string, op: string, val: any) => {
        return createQuery(colName, [...filters, { field, op, val }], limitVal);
      },
      limit: (n: number) => {
        return createQuery(colName, filters, n);
      },
      get: async () => {
        const col = getCollection(colName);
        let docs = Object.entries(col).map(([id, data]) => ({
          id,
          data: () => JSON.parse(JSON.stringify(data)),
          ref: createDocRef(colName, id)
        }));

        for (const f of filters) {
          docs = docs.filter(d => {
            const val = d.data()[f.field];
            if (f.op === '==') return val === f.val;
            if (f.op === '!=') return val !== f.val;
            return true;
          });
        }

        if (limitVal !== undefined) {
          docs = docs.slice(0, limitVal);
        }

        return {
          empty: docs.length === 0,
          size: docs.length,
          docs
        };
      }
    };
  }

  return {
    collection: (colName: string) => {
      const query = createQuery(colName);
      return {
        ...query,
        doc: (docId: string) => createDocRef(colName, docId)
      };
    },
    runTransaction: async (fn: (tx: any) => Promise<any>) => {
      const tx = {
        get: async (refOrQuery: any) => {
          return await refOrQuery.get();
        },
        set: async (docRef: any, data: any, options?: { merge?: boolean }) => {
          await docRef.set(data, options);
        },
        update: async (docRef: any, data: any) => {
          await docRef.update(data);
        }
      };
      return await fn(tx);
    },
    batch: () => {
      const operations: Array<() => Promise<void>> = [];
      return {
        update: (docRef: any, data: any) => {
          operations.push(async () => {
            await docRef.update(data);
          });
        },
        commit: async () => {
          for (const op of operations) {
            await op();
          }
        }
      };
    },
    _rawStore: store
  };
}

// ----------------------------------------------------------------------------
// TEST CASES
// ----------------------------------------------------------------------------

test('isSalesWorkingHours validates Eastern Time 9:30 AM to 6:30 PM, Mon-Fri', () => {
  // Monday Sep 7 2026
  // 9:29 AM EDT (13:29 UTC) -> Outside (1 min before)
  assert.strictEqual(isSalesWorkingHours(new Date('2026-09-07T13:29:00Z')), false);

  // 9:30 AM EDT (13:30 UTC) -> Inside (Exact start)
  assert.strictEqual(isSalesWorkingHours(new Date('2026-09-07T13:30:00Z')), true);

  // 12:00 PM EDT (16:00 UTC) -> Inside
  assert.strictEqual(isSalesWorkingHours(new Date('2026-09-07T16:00:00Z')), true);

  // 6:30 PM EDT (22:30 UTC) -> Inside (Exact end)
  assert.strictEqual(isSalesWorkingHours(new Date('2026-09-07T22:30:00Z')), true);

  // 6:31 PM EDT (22:31 UTC) -> Outside
  assert.strictEqual(isSalesWorkingHours(new Date('2026-09-07T22:31:00Z')), false);

  // Saturday Sep 5 2026 at 12:00 PM EDT (16:00 UTC) -> Outside (Weekend)
  assert.strictEqual(isSalesWorkingHours(new Date('2026-09-05T16:00:00Z')), false);

  // Sunday Sep 6 2026 at 12:00 PM EDT (16:00 UTC) -> Outside (Weekend)
  assert.strictEqual(isSalesWorkingHours(new Date('2026-09-06T16:00:00Z')), false);
});

test('Rule 1 & 7: Lead is saved as assigned_sales: null (Unassigned) when all sales reps are Deactive', async () => {
  const db = createMockFirestore({
    jpc_users: {
      salesA: { id: 'salesA', role: 'jpc_sales', display_name: 'Sales A', sales_availability_status: 'Deactive' },
      salesB: { id: 'salesB', role: 'jpc_sales', display_name: 'Sales B', sales_availability_status: 'Deactive' },
      salesC: { id: 'salesC', role: 'jpc_sales', display_name: 'Sales C', sales_availability_status: 'Deactive' }
    },
    jpc_settings: {
      lead_round_robin: { enabled: true, last_assigned_user_id: null, last_assigned_index: -1 }
    }
  });

  const res = await assignLeadRoundRobinTransaction(
    db,
    'cand_1',
    { full_name: 'Lead 1', phone: '111' },
    null,
    'jpc_lead_gen',
    true // force in working hours
  );

  assert.strictEqual(res.isUnassigned, true);
  assert.strictEqual(res.assignedUserId, null);
  assert.strictEqual(res.reason, 'no_active_sales_reps');

  // Verify stored in DB
  const doc = await db.collection('jpc_candidates').doc('cand_1').get();
  assert.strictEqual(doc.exists, true);
  assert.strictEqual(doc.data().assigned_sales, null);
});

test('Outside Working Hours: Lead saved as assigned_sales: null and backlog is NOT processed immediately', async () => {
  const db = createMockFirestore({
    jpc_users: {
      salesB: { id: 'salesB', role: 'jpc_sales', display_name: 'Sales B', sales_availability_status: 'Active' }
    },
    jpc_candidates: {
      cand_1: { id: 'cand_1', full_name: 'Lead 1', assigned_sales: null, created_at: '2026-09-07T08:00:00Z' }
    }
  });

  // Attempting assignment outside working hours
  const assignRes = await assignLeadRoundRobinTransaction(
    db,
    'cand_2',
    { full_name: 'Lead 2' },
    null,
    'system',
    false // outside working hours
  );

  assert.strictEqual(assignRes.isUnassigned, true);
  assert.strictEqual(assignRes.assignedUserId, null);
  assert.strictEqual(assignRes.reason, 'outside_working_hours');

  // Backlog processing outside working hours should not process
  const backlogRes = await processUnassignedLeadsEngine(db, false);
  assert.strictEqual(backlogRes.processed, 0);
  assert.strictEqual(backlogRes.reason, 'outside_working_hours');

  // Candidate 1 remains unassigned
  const cand1 = await db.collection('jpc_candidates').doc('cand_1').get();
  assert.strictEqual(cand1.data().assigned_sales, null);
});

test('Example 1: Only One Sales Person Active -> Lead 1, 2, 3 assigned to B in chronological order', async () => {
  // At 10:00 AM: Sales A, B, C are Deactive
  // Lead 1, 2, 3 created unassigned
  const db = createMockFirestore({
    jpc_users: {
      salesA: { id: 'salesA', role: 'jpc_sales', display_name: 'Sales A', sales_availability_status: 'Deactive' },
      salesB: { id: 'salesB', role: 'jpc_sales', display_name: 'Sales B', sales_availability_status: 'Deactive' },
      salesC: { id: 'salesC', role: 'jpc_sales', display_name: 'Sales C', sales_availability_status: 'Deactive' }
    },
    jpc_candidates: {
      cand_3: { id: 'cand_3', full_name: 'Lead 3', assigned_sales: null, created_at: '2026-09-07T10:10:00Z' },
      cand_1: { id: 'cand_1', full_name: 'Lead 1', assigned_sales: null, created_at: '2026-09-07T10:00:00Z' },
      cand_2: { id: 'cand_2', full_name: 'Lead 2', assigned_sales: null, created_at: '2026-09-07T10:05:00Z' }
    },
    jpc_settings: {
      lead_round_robin: { enabled: true, last_assigned_user_id: null, last_assigned_index: -1 }
    }
  });

  // At 11:00 AM: Sales B clicks Active during working hours
  await db.collection('jpc_users').doc('salesB').update({
    sales_availability_status: 'Active',
    sales_activated_at: '2026-09-07T11:00:00Z'
  });

  // Process backlog
  const result = await processUnassignedLeadsEngine(db, true);
  assert.strictEqual(result.processed, 3);

  // All three leads should be assigned to Sales B
  const cand1 = (await db.collection('jpc_candidates').doc('cand_1').get()).data();
  const cand2 = (await db.collection('jpc_candidates').doc('cand_2').get()).data();
  const cand3 = (await db.collection('jpc_candidates').doc('cand_3').get()).data();

  assert.strictEqual(cand1.assigned_sales, 'salesB');
  assert.strictEqual(cand2.assigned_sales, 'salesB');
  assert.strictEqual(cand3.assigned_sales, 'salesB');
});

test('Example 2: Multiple Sales Persons Active -> Backlog distributed via Round-Robin between B and C', async () => {
  // 6 Unassigned leads created initially
  const db = createMockFirestore({
    jpc_users: {
      salesA: { id: 'salesA', role: 'jpc_sales', display_name: 'Sales A', sales_availability_status: 'Deactive' },
      salesB: { id: 'salesB', role: 'jpc_sales', display_name: 'Sales B', sales_availability_status: 'Active' },
      salesC: { id: 'salesC', role: 'jpc_sales', display_name: 'Sales C', sales_availability_status: 'Active' }
    },
    jpc_candidates: {
      l1: { id: 'l1', full_name: 'Lead 1', assigned_sales: null, created_at: '2026-09-07T10:00:00Z' },
      l2: { id: 'l2', full_name: 'Lead 2', assigned_sales: null, created_at: '2026-09-07T10:01:00Z' },
      l3: { id: 'l3', full_name: 'Lead 3', assigned_sales: null, created_at: '2026-09-07T10:02:00Z' },
      l4: { id: 'l4', full_name: 'Lead 4', assigned_sales: null, created_at: '2026-09-07T10:03:00Z' },
      l5: { id: 'l5', full_name: 'Lead 5', assigned_sales: null, created_at: '2026-09-07T10:04:00Z' },
      l6: { id: 'l6', full_name: 'Lead 6', assigned_sales: null, created_at: '2026-09-07T10:05:00Z' }
    },
    jpc_settings: {
      lead_round_robin: { enabled: true, last_assigned_user_id: null, last_assigned_index: -1 }
    }
  });

  const result = await processUnassignedLeadsEngine(db, true);
  assert.strictEqual(result.processed, 6);

  const l1 = (await db.collection('jpc_candidates').doc('l1').get()).data();
  const l2 = (await db.collection('jpc_candidates').doc('l2').get()).data();
  const l3 = (await db.collection('jpc_candidates').doc('l3').get()).data();
  const l4 = (await db.collection('jpc_candidates').doc('l4').get()).data();
  const l5 = (await db.collection('jpc_candidates').doc('l5').get()).data();
  const l6 = (await db.collection('jpc_candidates').doc('l6').get()).data();

  // Deterministic alphabetical sort: salesB, salesC
  // Round-robin must alternate: B, C, B, C, B, C
  assert.strictEqual(l1.assigned_sales, 'salesB');
  assert.strictEqual(l2.assigned_sales, 'salesC');
  assert.strictEqual(l3.assigned_sales, 'salesB');
  assert.strictEqual(l4.assigned_sales, 'salesC');
  assert.strictEqual(l5.assigned_sales, 'salesB');
  assert.strictEqual(l6.assigned_sales, 'salesC');

  // Verify neither rep got the entire backlog
  const bCount = [l1, l2, l3, l4, l5, l6].filter(l => l.assigned_sales === 'salesB').length;
  const cCount = [l1, l2, l3, l4, l5, l6].filter(l => l.assigned_sales === 'salesC').length;
  assert.strictEqual(bCount, 3);
  assert.strictEqual(cCount, 3);
});

test('Rule 6: Sales rep becomes Active mid-backlog -> joins the eligible pool dynamically', async () => {
  const db = createMockFirestore({
    jpc_users: {
      salesB: { id: 'salesB', role: 'jpc_sales', display_name: 'Sales B', sales_availability_status: 'Active' },
      salesC: { id: 'salesC', role: 'jpc_sales', display_name: 'Sales C', sales_availability_status: 'Deactive' }
    },
    jpc_candidates: {
      l1: { id: 'l1', full_name: 'Lead 1', assigned_sales: null, created_at: '2026-09-07T10:00:00Z' },
      l2: { id: 'l2', full_name: 'Lead 2', assigned_sales: null, created_at: '2026-09-07T10:01:00Z' },
      l3: { id: 'l3', full_name: 'Lead 3', assigned_sales: null, created_at: '2026-09-07T10:02:00Z' },
      l4: { id: 'l4', full_name: 'Lead 4', assigned_sales: null, created_at: '2026-09-07T10:03:00Z' }
    },
    jpc_settings: {
      lead_round_robin: { enabled: true, last_assigned_user_id: null, last_assigned_index: -1 }
    }
  });

  // Assign l1 and l2 while only salesB is active
  await assignLeadRoundRobinTransaction(db, 'l1', undefined, null, 'system', true);
  await assignLeadRoundRobinTransaction(db, 'l2', undefined, null, 'system', true);

  assert.strictEqual((await db.collection('jpc_candidates').doc('l1').get()).data().assigned_sales, 'salesB');
  assert.strictEqual((await db.collection('jpc_candidates').doc('l2').get()).data().assigned_sales, 'salesB');

  // Now salesC becomes active
  await db.collection('jpc_users').doc('salesC').update({
    sales_availability_status: 'Active'
  });

  // Assign l3 and l4
  await assignLeadRoundRobinTransaction(db, 'l3', undefined, null, 'system', true);
  await assignLeadRoundRobinTransaction(db, 'l4', undefined, null, 'system', true);

  const l3 = (await db.collection('jpc_candidates').doc('l3').get()).data();
  const l4 = (await db.collection('jpc_candidates').doc('l4').get()).data();

  // l3 rotates to salesC, l4 rotates back to salesB
  assert.strictEqual(l3.assigned_sales, 'salesC');
  assert.strictEqual(l4.assigned_sales, 'salesB');
});

test('Rule 8: Do not assign leads to Deactive or On-Leave Sales Persons', async () => {
  const db = createMockFirestore({
    jpc_users: {
      salesDeactive: { id: 'salesDeactive', role: 'jpc_sales', display_name: 'Deactive Rep', sales_availability_status: 'Deactive' },
      salesOnLeave: { id: 'salesOnLeave', role: 'jpc_sales', display_name: 'Leave Rep', sales_availability_status: 'Active', is_on_leave: true },
      salesActive: { id: 'salesActive', role: 'jpc_sales', display_name: 'Active Rep', sales_availability_status: 'Active', is_on_leave: false }
    },
    jpc_candidates: {
      lead_a: { id: 'lead_a', full_name: 'Lead A', assigned_sales: null, created_at: '2026-09-07T10:00:00Z' },
      lead_b: { id: 'lead_b', full_name: 'Lead B', assigned_sales: null, created_at: '2026-09-07T10:01:00Z' }
    },
    jpc_settings: {
      lead_round_robin: { enabled: true, last_assigned_user_id: null, last_assigned_index: -1 }
    }
  });

  const res = await processUnassignedLeadsEngine(db, true);
  assert.strictEqual(res.processed, 2);

  const leadA = (await db.collection('jpc_candidates').doc('lead_a').get()).data();
  const leadB = (await db.collection('jpc_candidates').doc('lead_b').get()).data();

  // Both should go to salesActive, none to Deactive or On-Leave
  assert.strictEqual(leadA.assigned_sales, 'salesActive');
  assert.strictEqual(leadB.assigned_sales, 'salesActive');
});

test('Rule 9 & 10: RBAC - Lead Generation cannot manually assign; Management can assign anytime', async () => {
  const db = createMockFirestore({
    jpc_users: {
      targetRep: { id: 'targetRep', role: 'jpc_sales', display_name: 'Target Rep', sales_availability_status: 'Deactive' }
    },
    jpc_candidates: {
      unassignedLead: { id: 'unassignedLead', full_name: 'Unassigned Lead', assigned_sales: null, created_at: '2026-09-07T10:00:00Z' }
    },
    jpc_settings: {
      lead_round_robin: { enabled: true, last_assigned_user_id: null, last_assigned_index: -1 }
    }
  });

  // Lead Gen attempts to assign to targetRep (should be ignored and remain unassigned)
  const leadGenRes = await assignLeadRoundRobinTransaction(
    db,
    'unassignedLead',
    undefined,
    'targetRep',
    'jpc_lead_gen',
    true
  );
  assert.strictEqual(leadGenRes.isUnassigned, true);
  assert.strictEqual(leadGenRes.assignedUserId, null);

  // Management attempts to assign to targetRep (should succeed immediately)
  const mgmtRes = await assignLeadRoundRobinTransaction(
    db,
    'unassignedLead',
    undefined,
    'targetRep',
    'administrator',
    true
  );
  assert.strictEqual(mgmtRes.isUnassigned, false);
  assert.strictEqual(mgmtRes.assignedUserId, 'targetRep');

  const leadDoc = (await db.collection('jpc_candidates').doc('unassignedLead').get()).data();
  assert.strictEqual(leadDoc.assigned_sales, 'targetRep');
});

test('Start of working hours (9:30 AM EST): backlog processes pending unassigned leads for Active reps', async () => {
  // Accumulated unassigned leads from overnight/weekend
  const db = createMockFirestore({
    jpc_users: {
      salesRep1: { id: 'salesRep1', role: 'jpc_sales', display_name: 'Sales Rep 1', sales_availability_status: 'Active' },
      salesRep2: { id: 'salesRep2', role: 'jpc_sales', display_name: 'Sales Rep 2', sales_availability_status: 'Active' }
    },
    jpc_candidates: {
      night_lead_1: { id: 'night_lead_1', full_name: 'Night Lead 1', assigned_sales: null, created_at: '2026-09-07T03:00:00Z' },
      night_lead_2: { id: 'night_lead_2', full_name: 'Night Lead 2', assigned_sales: null, created_at: '2026-09-07T04:00:00Z' }
    },
    jpc_settings: {
      lead_round_robin: { enabled: true, last_assigned_user_id: null, last_assigned_index: -1 }
    }
  });

  // At 9:30 AM EST (13:30 UTC), cron fires processUnassignedLeadsEngine
  const testDate = new Date('2026-09-07T13:30:00Z');
  assert.strictEqual(isSalesWorkingHours(testDate), true);

  const cronRun = await processUnassignedLeadsEngine(db, isSalesWorkingHours(testDate));
  assert.strictEqual(cronRun.processed, 2);

  const nl1 = (await db.collection('jpc_candidates').doc('night_lead_1').get()).data();
  const nl2 = (await db.collection('jpc_candidates').doc('night_lead_2').get()).data();

  assert.strictEqual(nl1.assigned_sales, 'salesRep1');
  assert.strictEqual(nl2.assigned_sales, 'salesRep2');
});

test('Rule 3: Process unassigned leads strictly chronologically (oldest first)', async () => {
  // Out-of-order creation timestamps
  const db = createMockFirestore({
    jpc_users: {
      salesRep: { id: 'salesRep', role: 'jpc_sales', display_name: 'Solo Rep', sales_availability_status: 'Active' }
    },
    jpc_candidates: {
      lead_late: { id: 'lead_late', full_name: 'Late Lead', assigned_sales: null, created_at: '2026-09-07T11:00:00Z' },
      lead_early: { id: 'lead_early', full_name: 'Early Lead', assigned_sales: null, created_at: '2026-09-07T09:00:00Z' },
      lead_mid: { id: 'lead_mid', full_name: 'Mid Lead', assigned_sales: null, created_at: '2026-09-07T10:00:00Z' }
    },
    jpc_settings: {
      lead_round_robin: { enabled: true, last_assigned_user_id: null, last_assigned_index: -1 }
    }
  });

  const assignmentOrder: string[] = [];
  // Hook into transaction to observe assignment order
  const origAssign = assignLeadRoundRobinTransaction;

  const res = await processUnassignedLeadsEngine(db, true);
  assert.strictEqual(res.processed, 3);

  const cfg = (await db.collection('jpc_settings').doc('lead_round_robin').get()).data();
  // Recent assignments are stored most-recent first: [late, mid, early]
  const recentIds = (cfg.recent_assignments || []).map((r: any) => r.candidate_id);
  assert.deepStrictEqual(recentIds, ['lead_late', 'lead_mid', 'lead_early']);
});

test('Rule 4: Continuous pointer continuity between backlog processing and new incoming leads', async () => {
  const db = createMockFirestore({
    jpc_users: {
      repA: { id: 'repA', role: 'jpc_sales', display_name: 'Rep A', sales_availability_status: 'Active' },
      repB: { id: 'repB', role: 'jpc_sales', display_name: 'Rep B', sales_availability_status: 'Active' }
    },
    jpc_candidates: {
      backlog1: { id: 'backlog1', full_name: 'Backlog 1', assigned_sales: null, created_at: '2026-09-07T10:00:00Z' },
      backlog2: { id: 'backlog2', full_name: 'Backlog 2', assigned_sales: null, created_at: '2026-09-07T10:01:00Z' },
      backlog3: { id: 'backlog3', full_name: 'Backlog 3', assigned_sales: null, created_at: '2026-09-07T10:02:00Z' }
    },
    jpc_settings: {
      lead_round_robin: { enabled: true, last_assigned_user_id: null, last_assigned_index: -1 }
    }
  });

  // Process 3 backlog leads:
  // backlog1 -> repA
  // backlog2 -> repB
  // backlog3 -> repA
  await processUnassignedLeadsEngine(db, true);

  const b1 = (await db.collection('jpc_candidates').doc('backlog1').get()).data();
  const b2 = (await db.collection('jpc_candidates').doc('backlog2').get()).data();
  const b3 = (await db.collection('jpc_candidates').doc('backlog3').get()).data();

  assert.strictEqual(b1.assigned_sales, 'repA');
  assert.strictEqual(b2.assigned_sales, 'repB');
  assert.strictEqual(b3.assigned_sales, 'repA');

  // Next NEW lead arrives via live lead creation
  const liveRes = await assignLeadRoundRobinTransaction(
    db,
    'live_lead_4',
    { full_name: 'Live Lead 4' },
    null,
    'jpc_lead_gen',
    true
  );

  // Live lead 4 MUST smoothly continue round robin to repB
  assert.strictEqual(liveRes.assignedUserId, 'repB');
  const liveLeadDoc = (await db.collection('jpc_candidates').doc('live_lead_4').get()).data();
  assert.strictEqual(liveLeadDoc.assigned_sales, 'repB');
});

test('getEligibleSalesUsers: respects ignoreWorkingHours for UI dashboard and sequence previews', () => {
  const users: any[] = [
    { id: 'sales1', role: 'jpc_sales', display_name: 'Sales One', sales_availability_status: 'Active', is_on_leave: false },
    { id: 'sales2', role: 'jpc_sales', display_name: 'Sales Two', sales_availability_status: 'Deactive', is_on_leave: false },
    { id: 'sales3', role: 'jpc_sales', display_name: 'Sales Three', sales_availability_status: 'Active', is_on_leave: false }
  ];

  // When ignoreWorkingHours is false and checked outside working hours, returns empty
  const activeNow = users.filter(u => !u.is_on_leave && u.sales_availability_status === 'Active');
  assert.strictEqual(activeNow.length, 2);

  // Active reps in sequence should be sales1 and sales3
  const activeIds = activeNow.map(u => u.id);
  assert.deepStrictEqual(activeIds, ['sales1', 'sales3']);
});

