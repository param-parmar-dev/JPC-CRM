import test from 'node:test';
import assert from 'node:assert/strict';

// Set NODE_ENV to test to prevent server.ts from starting listening sockets and crons
process.env.NODE_ENV = 'test';

import {
  assignLeadRoundRobinTransaction
} from '../server';

/**
 * Creates an in-memory mock Firestore database compatible with
 * assignLeadRoundRobinTransaction, supporting transactions, docs, and lock collections.
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

  let txQueue = Promise.resolve();

  return {
    _store: store,
    collection: (name: string) => {
      return {
        doc: (id: string) => createDocRef(name, id),
        where: (field: string, op: string, val: any) => {
          return createQuery(name, [{ field, op, val }]);
        },
        get: async () => {
          return createQuery(name).get();
        }
      };
    },
    runTransaction: async (updateFunction: (transaction: any) => Promise<any>) => {
      // Simulate Firestore transaction serialization/retry on conflicting documents
      const executeTx = async () => {
        const transaction = {
          get: async (refOrQuery: any) => {
            return await refOrQuery.get();
          },
          set: (docRef: any, data: any, options?: { merge?: boolean }) => {
            const col = getCollection(docRef.colName);
            if (options?.merge && col[docRef.id]) {
              col[docRef.id] = { ...col[docRef.id], ...JSON.parse(JSON.stringify(data)) };
            } else {
              col[docRef.id] = JSON.parse(JSON.stringify(data));
            }
          },
          update: (docRef: any, data: any) => {
            const col = getCollection(docRef.colName);
            if (!col[docRef.id]) {
              col[docRef.id] = {};
            }
            col[docRef.id] = { ...col[docRef.id], ...JSON.parse(JSON.stringify(data)) };
          },
          delete: (docRef: any) => {
            const col = getCollection(docRef.colName);
            delete col[docRef.id];
          }
        };

        return await updateFunction(transaction);
      };

      const resultPromise = txQueue.then(executeTx, executeTx);
      txQueue = resultPromise.then(() => {}, () => {});
      return await resultPromise;
    }
  };
}

test('Duplicate Prevention: 1. Single normal Save creates exactly 1 lead and advances round-robin', async () => {
  const db = createMockFirestore({
    jpc_users: {
      'user_1': { id: 'user_1', display_name: 'Sales Rep A', role: 'jpc_sales', sales_availability_status: 'Active', is_on_leave: false },
      'user_2': { id: 'user_2', display_name: 'Sales Rep B', role: 'jpc_sales', sales_availability_status: 'Active', is_on_leave: false }
    },
    jpc_settings: {
      lead_round_robin: {
        enabled: true,
        last_assigned_index: -1,
        total_leads_assigned: 0,
        custom_order_user_ids: ['user_1', 'user_2']
      }
    }
  });

  const res = await assignLeadRoundRobinTransaction(
    db,
    'cand_101',
    { full_name: 'John Doe', phone: '+1 (555) 123-4567', email: 'john@example.com' },
    null,
    'jpc_sales',
    true, // force working hours
    'idemp_single_save'
  );

  assert.equal(res.duplicatePrevented, false);
  assert.equal(res.alreadyExisted, false);
  assert.equal(res.assignedUserId, 'user_1');
  assert.equal(res.candidateId, 'cand_101');

  // Verify candidate stored in database
  const candDoc = db._store['jpc_candidates']['cand_101'];
  assert.ok(candDoc);
  assert.equal(candDoc.assigned_sales, 'user_1');

  // Verify deterministic phone lock stored
  const lockDoc = db._store['jpc_lead_locks']['phone_5551234567'];
  assert.ok(lockDoc);
  assert.equal(lockDoc.candidate_id, 'cand_101');

  // Verify idempotency record stored
  const idempDoc = db._store['jpc_idempotency_keys']['idemp_single_save'];
  assert.ok(idempDoc);
  assert.equal(idempDoc.status, 'completed');
  assert.equal(idempDoc.candidate_id, 'cand_101');

  // Verify round-robin config incremented
  const configDoc = db._store['jpc_settings']['lead_round_robin'];
  assert.equal(configDoc.total_leads_assigned, 1);
  assert.equal(configDoc.last_assigned_user_id, 'user_1');
});

test('Duplicate Prevention: 2. Double-Click with same Idempotency Key creates exactly 1 lead and does NOT advance round-robin twice', async () => {
  const db = createMockFirestore({
    jpc_users: {
      'user_1': { id: 'user_1', display_name: 'Sales Rep A', role: 'jpc_sales', sales_availability_status: 'Active', is_on_leave: false },
      'user_2': { id: 'user_2', display_name: 'Sales Rep B', role: 'jpc_sales', sales_availability_status: 'Active', is_on_leave: false }
    },
    jpc_settings: {
      lead_round_robin: {
        enabled: true,
        last_assigned_index: -1,
        total_leads_assigned: 0,
        custom_order_user_ids: ['user_1', 'user_2']
      }
    }
  });

  const payload = { full_name: 'Jane Smith', phone: '555-987-6543', email: 'jane@example.com' };
  const idempotencyKey = 'idemp_double_click_test';

  // First Click
  const res1 = await assignLeadRoundRobinTransaction(
    db,
    'cand_201',
    payload,
    null,
    'jpc_sales',
    true,
    idempotencyKey
  );

  assert.equal(res1.duplicatePrevented, false);
  assert.equal(res1.assignedUserId, 'user_1');

  // Second Click (rapid duplicate)
  const res2 = await assignLeadRoundRobinTransaction(
    db,
    'cand_201',
    payload,
    null,
    'jpc_sales',
    true,
    idempotencyKey
  );

  assert.equal(res2.duplicatePrevented, true);
  assert.equal(res2.alreadyExisted, true);
  assert.equal(res2.candidateId, 'cand_201');
  assert.equal(res2.assignedUserId, 'user_1'); // Preserves the same sales rep

  // Verify round-robin only advanced ONCE
  const configDoc = db._store['jpc_settings']['lead_round_robin'];
  assert.equal(configDoc.total_leads_assigned, 1);
  assert.equal(configDoc.last_assigned_user_id, 'user_1');

  // Verify only 1 candidate document exists
  const allCandidates = Object.keys(db._store['jpc_candidates'] || {});
  assert.equal(allCandidates.length, 1);
});

test('Duplicate Prevention: 3. Ten rapid clicks with same idempotency key create exactly 1 lead record', async () => {
  const db = createMockFirestore({
    jpc_users: {
      'user_1': { id: 'user_1', display_name: 'Sales Rep A', role: 'jpc_sales', sales_availability_status: 'Active', is_on_leave: false },
      'user_2': { id: 'user_2', display_name: 'Sales Rep B', role: 'jpc_sales', sales_availability_status: 'Active', is_on_leave: false }
    },
    jpc_settings: {
      lead_round_robin: {
        enabled: true,
        last_assigned_index: -1,
        total_leads_assigned: 0,
        custom_order_user_ids: ['user_1', 'user_2']
      }
    }
  });

  const payload = { full_name: 'Rapid Clicker', phone: '555-333-4444', email: 'rapid@example.com' };
  const idempotencyKey = 'idemp_ten_clicks';

  const results = [];
  for (let i = 0; i < 10; i++) {
    const res = await assignLeadRoundRobinTransaction(
      db,
      'cand_rapid_10',
      payload,
      null,
      'jpc_sales',
      true,
      idempotencyKey
    );
    results.push(res);
  }

  // 1st was new, next 9 were duplicatePrevented
  assert.equal(results[0].duplicatePrevented, false);
  for (let i = 1; i < 10; i++) {
    assert.equal(results[i].duplicatePrevented, true);
    assert.equal(results[i].candidateId, 'cand_rapid_10');
    assert.equal(results[i].assignedUserId, 'user_1');
  }

  // Exactly 1 candidate created
  assert.equal(Object.keys(db._store['jpc_candidates'] || {}).length, 1);
  // Total assigned counter must be exactly 1
  assert.equal(db._store['jpc_settings']['lead_round_robin'].total_leads_assigned, 1);
});

test('Duplicate Prevention: 4. Concurrent requests with identical phone hit deterministic lock and prevent duplicate creation', async () => {
  const db = createMockFirestore({
    jpc_users: {
      'user_1': { id: 'user_1', display_name: 'Sales Rep A', role: 'jpc_sales', sales_availability_status: 'Active', is_on_leave: false },
      'user_2': { id: 'user_2', display_name: 'Sales Rep B', role: 'jpc_sales', sales_availability_status: 'Active', is_on_leave: false }
    },
    jpc_settings: {
      lead_round_robin: {
        enabled: true,
        last_assigned_index: -1,
        total_leads_assigned: 0,
        custom_order_user_ids: ['user_1', 'user_2']
      }
    }
  });

  // Two calls with DIFFERENT candidate IDs but the SAME phone number
  const call1 = assignLeadRoundRobinTransaction(
    db,
    'cand_race_A',
    { full_name: 'Alice Race', phone: '+1 (555) 777-8888', email: 'alice@example.com' },
    null,
    'jpc_sales',
    true,
    'key_A'
  );

  const call2 = assignLeadRoundRobinTransaction(
    db,
    'cand_race_B',
    { full_name: 'Alice Race', phone: '555-777-8888', email: 'alice@example.com' },
    null,
    'jpc_sales',
    true,
    'key_B'
  );

  const [res1, res2] = await Promise.all([call1, call2]);

  // One of them is original, the other is caught as a duplicate
  const duplicates = [res1, res2].filter(r => r.duplicatePrevented);
  const created = [res1, res2].filter(r => !r.duplicatePrevented);

  assert.equal(created.length, 1, 'Exactly one request must succeed in creating the lead');
  assert.equal(duplicates.length, 1, 'Exactly one request must be flagged as duplicate');
  assert.equal(duplicates[0].candidateId, created[0].candidateId, 'Duplicate must return the ID of the created candidate');

  // Round-robin total leads assigned is strictly 1
  assert.equal(db._store['jpc_settings']['lead_round_robin'].total_leads_assigned, 1);
});

test('Duplicate Prevention: 5. Soft-deleted candidate allows re-creation of a new legitimate lead with the same phone', async () => {
  const db = createMockFirestore({
    jpc_users: {
      'user_1': { id: 'user_1', display_name: 'Sales Rep A', role: 'jpc_sales', sales_availability_status: 'Active', is_on_leave: false }
    },
    jpc_settings: {
      lead_round_robin: {
        enabled: true,
        last_assigned_index: -1,
        total_leads_assigned: 0
      }
    },
    jpc_candidates: {
      'old_deleted_cand': {
        id: 'old_deleted_cand',
        full_name: 'Old Record',
        phone: '555-999-0000',
        deleted_at: '2026-08-01T00:00:00.000Z', // Soft-deleted!
        assigned_sales: 'user_1'
      }
    },
    jpc_lead_locks: {
      'phone_5559990000': {
        candidate_id: 'old_deleted_cand',
        phone: '5559990000'
      }
    }
  });

  // New legitimate lead with the same phone number as the deleted candidate
  const res = await assignLeadRoundRobinTransaction(
    db,
    'new_cand_2026',
    { full_name: 'Fresh Applicant', phone: '555-999-0000', email: 'fresh@example.com' },
    null,
    'jpc_sales',
    true,
    'new_sub_key'
  );

  assert.equal(res.duplicatePrevented, false, 'Should allow creating new lead when previous was deleted');
  assert.equal(res.candidateId, 'new_cand_2026');
  assert.equal(db._store['jpc_candidates']['new_cand_2026'].full_name, 'Fresh Applicant');
  assert.equal(db._store['jpc_lead_locks']['phone_5559990000'].candidate_id, 'new_cand_2026');
});

test('Duplicate Prevention: 6. Different legitimate leads rotate sequentially without interference', async () => {
  const db = createMockFirestore({
    jpc_users: {
      'user_1': { id: 'user_1', display_name: 'Sales Rep A', role: 'jpc_sales', sales_availability_status: 'Active', is_on_leave: false },
      'user_2': { id: 'user_2', display_name: 'Sales Rep B', role: 'jpc_sales', sales_availability_status: 'Active', is_on_leave: false }
    },
    jpc_settings: {
      lead_round_robin: {
        enabled: true,
        last_assigned_index: -1,
        total_leads_assigned: 0,
        custom_order_user_ids: ['user_1', 'user_2']
      }
    }
  });

  const lead1 = await assignLeadRoundRobinTransaction(
    db,
    'lead_diff_1',
    { full_name: 'First Person', phone: '555-111-0001', email: 'first@example.com' },
    null,
    'jpc_sales',
    true,
    'key_1'
  );

  const lead2 = await assignLeadRoundRobinTransaction(
    db,
    'lead_diff_2',
    { full_name: 'Second Person', phone: '555-111-0002', email: 'second@example.com' },
    null,
    'jpc_sales',
    true,
    'key_2'
  );

  assert.equal(lead1.duplicatePrevented, false);
  assert.equal(lead1.assignedUserId, 'user_1');

  assert.equal(lead2.duplicatePrevented, false);
  assert.equal(lead2.assignedUserId, 'user_2'); // Rotated to next rep!

  assert.equal(db._store['jpc_settings']['lead_round_robin'].total_leads_assigned, 2);
  assert.equal(Object.keys(db._store['jpc_candidates'] || {}).length, 2);
});

test('Duplicate Prevention: 7. No active sales reps preserves assigned_sales: null and duplicate attempt does not advance counter', async () => {
  const db = createMockFirestore({
    jpc_users: {
      'user_1': { id: 'user_1', display_name: 'Sales Rep A', role: 'jpc_sales', sales_availability_status: 'Deactive', is_on_leave: false }
    },
    jpc_settings: {
      lead_round_robin: {
        enabled: true,
        last_assigned_index: -1,
        total_leads_assigned: 0
      }
    }
  });

  const res1 = await assignLeadRoundRobinTransaction(
    db,
    'cand_unassigned_1',
    { full_name: 'Unassigned Person', phone: '555-888-9999' },
    null,
    'jpc_sales',
    true,
    'idemp_unassigned'
  );

  assert.equal(res1.isUnassigned, true);
  assert.equal(res1.assignedUserId, null);
  assert.equal(res1.duplicatePrevented, false);

  // Duplicate submission for the same lead
  const res2 = await assignLeadRoundRobinTransaction(
    db,
    'cand_unassigned_1',
    { full_name: 'Unassigned Person', phone: '555-888-9999' },
    null,
    'jpc_sales',
    true,
    'idemp_unassigned'
  );

  assert.equal(res2.isUnassigned, true);
  assert.equal(res2.assignedUserId, null);
  assert.equal(res2.duplicatePrevented, true);
  assert.equal(db._store['jpc_settings']['lead_round_robin'].total_leads_assigned, 0);
});

test('Stress Test: 8. 20 simultaneous submissions with SAME idempotency key create exactly 1 lead', async () => {
  const db = createMockFirestore({
    jpc_users: {
      'rep_1': { id: 'rep_1', display_name: 'Sales Rep 1', role: 'jpc_sales', sales_availability_status: 'Active', is_on_leave: false },
      'rep_2': { id: 'rep_2', display_name: 'Sales Rep 2', role: 'jpc_sales', sales_availability_status: 'Active', is_on_leave: false }
    },
    jpc_settings: {
      lead_round_robin: {
        enabled: true,
        last_assigned_index: -1,
        total_leads_assigned: 0
      }
    }
  });

  const SIMULTANEOUS_COUNT = 20;
  const sharedKey = 'ik_stress_same_key_2026';
  const candidateId = 'cand_stress_shared';

  const promises = Array.from({ length: SIMULTANEOUS_COUNT }, (_, i) =>
    assignLeadRoundRobinTransaction(
      db,
      candidateId,
      { full_name: 'Stress Test Candidate', phone: '555-333-8888', email: 'stress@example.com' },
      null,
      'jpc_sales',
      true,
      sharedKey
    )
  );

  const results = await Promise.all(promises);

  const newCreations = results.filter(r => !r.duplicatePrevented);
  const duplicatesPrevented = results.filter(r => r.duplicatePrevented);

  assert.equal(newCreations.length, 1, 'Exactly 1 request should create the lead');
  assert.equal(duplicatesPrevented.length, 19, 'Exactly 19 requests should be prevented as duplicates');
  assert.equal(Object.keys(db._store['jpc_candidates'] || {}).length, 1, 'Only 1 candidate doc in Firestore');
  assert.equal(db._store['jpc_settings']['lead_round_robin'].total_leads_assigned, 1, 'Pointer should advance exactly once');
});

test('Stress Test: 9. 20 simultaneous submissions with SAME phone but DIFFERENT idempotency keys create exactly 1 lead', async () => {
  const db = createMockFirestore({
    jpc_users: {
      'rep_1': { id: 'rep_1', display_name: 'Sales Rep 1', role: 'jpc_sales', sales_availability_status: 'Active', is_on_leave: false },
      'rep_2': { id: 'rep_2', display_name: 'Sales Rep 2', role: 'jpc_sales', sales_availability_status: 'Active', is_on_leave: false }
    },
    jpc_settings: {
      lead_round_robin: {
        enabled: true,
        last_assigned_index: -1,
        total_leads_assigned: 0
      }
    }
  });

  const SIMULTANEOUS_COUNT = 20;
  const targetPhone = '+1 (555) 777-9999';

  const promises = Array.from({ length: SIMULTANEOUS_COUNT }, (_, i) =>
    assignLeadRoundRobinTransaction(
      db,
      `cand_diff_key_${i}`,
      { full_name: `Phone Collision ${i}`, phone: targetPhone, email: `applicant_${i}@test.com` },
      null,
      'jpc_sales',
      true,
      `ik_unique_key_${i}`
    )
  );

  const results = await Promise.all(promises);

  const newCreations = results.filter(r => !r.duplicatePrevented);
  const duplicatesPrevented = results.filter(r => r.duplicatePrevented);

  assert.equal(newCreations.length, 1, 'Deterministic phone lock allows exactly 1 creation');
  assert.equal(duplicatesPrevented.length, 19, '19 requests collide on phone lock');
  assert.equal(Object.keys(db._store['jpc_candidates'] || {}).length, 1, 'Exactly 1 candidate in database');
  assert.equal(db._store['jpc_settings']['lead_round_robin'].total_leads_assigned, 1, 'Round-robin pointer advanced only once');
});

test('Stress Test: 10. 20 simultaneous submissions with SAME email create exactly 1 lead via deterministic email lock', async () => {
  const db = createMockFirestore({
    jpc_users: {
      'rep_1': { id: 'rep_1', display_name: 'Sales Rep 1', role: 'jpc_sales', sales_availability_status: 'Active', is_on_leave: false },
      'rep_2': { id: 'rep_2', display_name: 'Sales Rep 2', role: 'jpc_sales', sales_availability_status: 'Active', is_on_leave: false }
    },
    jpc_settings: {
      lead_round_robin: {
        enabled: true,
        last_assigned_index: -1,
        total_leads_assigned: 0
      }
    }
  });

  const SIMULTANEOUS_COUNT = 20;
  const targetEmail = 'alice.stress@placify.test';

  const promises = Array.from({ length: SIMULTANEOUS_COUNT }, (_, i) =>
    assignLeadRoundRobinTransaction(
      db,
      `cand_email_stress_${i}`,
      { full_name: `Email Applicant ${i}`, phone: `555-001-00${String(i).padStart(2, '0')}`, email: targetEmail },
      null,
      'jpc_sales',
      true,
      `ik_email_key_${i}`
    )
  );

  const results = await Promise.all(promises);

  const newCreations = results.filter(r => !r.duplicatePrevented);
  const duplicatesPrevented = results.filter(r => r.duplicatePrevented);

  assert.equal(newCreations.length, 1, 'Deterministic email lock allows exactly 1 creation');
  assert.equal(duplicatesPrevented.length, 19, '19 requests collide on email lock');
  assert.equal(Object.keys(db._store['jpc_candidates'] || {}).length, 1, 'Exactly 1 candidate in database');
  assert.equal(db._store['jpc_settings']['lead_round_robin'].total_leads_assigned, 1, 'Round-robin pointer advanced only once');
});

test('Stress Test: 11. 20 simultaneous submissions with DIFFERENT legitimate leads succeed and rotate smoothly', async () => {
  const db = createMockFirestore({
    jpc_users: {
      'rep_1': { id: 'rep_1', display_name: 'Sales Rep 1', role: 'jpc_sales', sales_availability_status: 'Active', is_on_leave: false },
      'rep_2': { id: 'rep_2', display_name: 'Sales Rep 2', role: 'jpc_sales', sales_availability_status: 'Active', is_on_leave: false }
    },
    jpc_settings: {
      lead_round_robin: {
        enabled: true,
        last_assigned_index: -1,
        total_leads_assigned: 0
      }
    }
  });

  const SIMULTANEOUS_COUNT = 20;

  const promises = Array.from({ length: SIMULTANEOUS_COUNT }, (_, i) =>
    assignLeadRoundRobinTransaction(
      db,
      `cand_legit_${i}`,
      { full_name: `Legitimate Lead ${i}`, phone: `555-999-00${String(i).padStart(2, '0')}`, email: `legit_${i}@test.com` },
      null,
      'jpc_sales',
      true,
      `ik_legit_${i}`
    )
  );

  const results = await Promise.all(promises);

  const newCreations = results.filter(r => !r.duplicatePrevented);
  const duplicatesPrevented = results.filter(r => r.duplicatePrevented);

  assert.equal(newCreations.length, 20, 'All 20 legitimate leads must be created');
  assert.equal(duplicatesPrevented.length, 0, 'No legitimate lead should be rejected');
  assert.equal(Object.keys(db._store['jpc_candidates'] || {}).length, 20, 'All 20 candidates in database');
  assert.equal(db._store['jpc_settings']['lead_round_robin'].total_leads_assigned, 20, 'Round-robin pointer moved exactly 20 times');

  // Verify fair distribution: 10 leads to rep_1, 10 leads to rep_2
  const rep1Count = results.filter(r => r.assignedUserId === 'rep_1').length;
  const rep2Count = results.filter(r => r.assignedUserId === 'rep_2').length;
  assert.equal(rep1Count, 10, 'Rep 1 received exactly 10 leads');
  assert.equal(rep2Count, 10, 'Rep 2 received exactly 10 leads');
});
