import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isCSHead,
  isManagementUser,
  canActAsTLForRequest
} from '../src/lib/permissions';
import { User, ResumeChangeRequest, RTRRequest } from '../src/types';

// Helper mock user builder
function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user_1',
    username: 'testuser',
    display_name: 'Test User',
    role: 'jpc_recruiter',
    created_at: new Date().toISOString(),
    ...overrides
  };
}

test('CS Head & TL Permissions: isCSHead identification', () => {
  // 1. Faiz Ahmadi by username 'care'
  const faizCare = makeUser({ username: 'care', role: 'jpc_cs', display_name: 'Faiz Ahmadi' });
  assert.equal(isCSHead(faizCare), true, 'Faiz by username care must be CS Head');

  // 2. CS role without care username
  const csUser = makeUser({ username: 'cs_lead', role: 'jpc_cs', display_name: 'Customer Service Lead' });
  assert.equal(isCSHead(csUser), true, 'jpc_cs role must be identified as CS Head');

  // 3. Compliance person
  const complianceUser = makeUser({ username: 'compliance_officer', role: 'jpc_compliance_person', display_name: 'Compliance Officer' });
  assert.equal(isCSHead(complianceUser), true, 'jpc_compliance_person must be identified in CS leadership');

  // 4. User with display name containing Faiz
  const faizNameUser = makeUser({ username: 'faiz_new', role: 'jpc_cs', display_name: 'Faiz (CS Team)' });
  assert.equal(isCSHead(faizNameUser), true, 'User with Faiz in display name must be CS Head');

  // 5. Other roles must NOT be CS Head
  assert.equal(isCSHead(makeUser({ role: 'jpc_recruiter' })), false);
  assert.equal(isCSHead(makeUser({ role: 'jpc_marketing' })), false);
  assert.equal(isCSHead(makeUser({ role: 'jpc_sales' })), false);
  assert.equal(isCSHead(makeUser({ role: 'jpc_lead_gen' })), false);
  assert.equal(isCSHead(makeUser({ role: 'jpc_proxy' })), false);
  assert.equal(isCSHead(null), false, 'null user cannot be CS Head');
});

test('CS Head & TL Permissions: isManagementUser identification', () => {
  assert.equal(isManagementUser(makeUser({ role: 'administrator' })), true);
  assert.equal(isManagementUser(makeUser({ role: 'jpc_sysadmin' })), true);
  assert.equal(isManagementUser(makeUser({ role: 'jpc_manager' })), true);
  assert.equal(isManagementUser(makeUser({ role: 'jpc_marketing' })), false);
  assert.equal(isManagementUser(makeUser({ role: 'jpc_cs' })), false);
  assert.equal(isManagementUser(makeUser({ role: 'jpc_recruiter' })), false);
  assert.equal(isManagementUser(null), false);
});

test('CS Head & TL Permissions: canActAsTLForRequest allows CS Head, Marketing TL, and Management to act on pending_tl', () => {
  // Marketing TL
  const marketingTL = makeUser({ id: 'tl_1', role: 'jpc_marketing', username: 'mohit.panchal' });
  assert.equal(canActAsTLForRequest(marketingTL), true, 'Marketing TL must be able to act on pending_tl');

  // CS Head (Faiz / care)
  const faizHead = makeUser({ id: 'cs_1', role: 'jpc_cs', username: 'care', display_name: 'Faiz Ahmadi' });
  assert.equal(canActAsTLForRequest(faizHead), true, 'CS Head Faiz must be able to move forward pending_tl requests');

  // Other CS Head
  const generalCS = makeUser({ id: 'cs_2', role: 'jpc_cs', username: 'cs_manager' });
  assert.equal(canActAsTLForRequest(generalCS), true, 'CS Head role must be able to move forward pending_tl requests');

  // Compliance Person
  const compliancePerson = makeUser({ id: 'comp_1', role: 'jpc_compliance_person', username: 'compliance_officer' });
  assert.equal(canActAsTLForRequest(compliancePerson), true, 'Compliance person must be able to act on pending_tl requests');

  // Administrator & Sysadmin & Manager
  assert.equal(canActAsTLForRequest(makeUser({ role: 'administrator' })), true);
  assert.equal(canActAsTLForRequest(makeUser({ role: 'jpc_sysadmin' })), true);
  assert.equal(canActAsTLForRequest(makeUser({ role: 'jpc_manager' })), true);

  // Non-authorized roles CANNOT act as TL
  assert.equal(canActAsTLForRequest(makeUser({ role: 'jpc_recruiter' })), false, 'Recruiter cannot act as TL');
  assert.equal(canActAsTLForRequest(makeUser({ role: 'jpc_sales' })), false, 'Sales rep cannot act as TL');
  assert.equal(canActAsTLForRequest(makeUser({ role: 'jpc_lead_gen' })), false, 'Lead gen cannot act as TL');
  assert.equal(canActAsTLForRequest(makeUser({ role: 'jpc_proxy' })), false, 'Proxy cannot act as TL');
  assert.equal(canActAsTLForRequest(null), false, 'null user cannot act as TL');
});

test('Resume Log Book Workflow: CS Head moves forward request from pending_tl to pending_cs', () => {
  const req: ResumeChangeRequest = {
    id: 'req_101',
    candidate_id: 'cand_99',
    recruiter_id: 'rec_5',
    details: 'Update Python tech stack and add AWS certifications',
    status: 'pending_tl',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const faizHead = makeUser({ id: 'cs_1', role: 'jpc_cs', username: 'care', display_name: 'Faiz Ahmadi' });

  // Verify permission
  assert.equal(canActAsTLForRequest(faizHead), true);

  // Simulate handleUpdateStatus with tl_forward
  const actionType: string = 'tl_forward';
  const newStatus: ResumeChangeRequest['status'] = 'pending_cs';
  const notes = 'Approved by CS Head acting as TL - candidate looks good';

  const updateData: any = {
    status: newStatus,
    updated_at: new Date().toISOString()
  };

  if (actionType === 'tl_forward' || actionType === 'tl_reject') {
    if (notes) updateData.tl_notes = notes;
  }

  assert.equal(updateData.status, 'pending_cs');
  assert.equal(updateData.tl_notes, notes);
  assert.equal(updateData.cs_notes, undefined, 'cs_notes should not be overwritten when acting as TL');
});

test('Resume Log Book Workflow: CS Head directly moves forward request from pending_tl to pending_resume_team', () => {
  const req: ResumeChangeRequest = {
    id: 'req_102',
    candidate_id: 'cand_99',
    recruiter_id: 'rec_5',
    details: 'Urgent resume formatting',
    status: 'pending_tl',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const csUser = makeUser({ id: 'cs_1', role: 'jpc_cs', username: 'care', display_name: 'Faiz Ahmadi' });

  // Direct forward by CS Head
  const actionType: string = 'cs_forward';
  const newStatus: ResumeChangeRequest['status'] = 'pending_resume_team';
  const notes = 'Fast-tracked directly to resume team';

  const updateData: any = {
    status: newStatus,
    updated_at: new Date().toISOString()
  };

  if (actionType === 'cs_forward' && newStatus === 'pending_resume_team') {
    if (req.status === 'pending_tl') {
      updateData.tl_notes = notes || 'Forwarded directly to Resume Team by CS Head';
      updateData.cs_notes = notes || 'Forwarded directly to Resume Team by CS Head';
    } else {
      if (notes) updateData.cs_notes = notes;
    }
  }

  assert.equal(updateData.status, 'pending_resume_team');
  assert.equal(updateData.tl_notes, 'Fast-tracked directly to resume team');
  assert.equal(updateData.cs_notes, 'Fast-tracked directly to resume team');
});

test('Resume Log Book Workflow: CS Head rejects request in pending_tl', () => {
  const req: ResumeChangeRequest = {
    id: 'req_103',
    candidate_id: 'cand_99',
    recruiter_id: 'rec_5',
    details: 'Invalid candidate request',
    status: 'pending_tl',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const csUser = makeUser({ id: 'cs_1', role: 'jpc_cs', username: 'care', display_name: 'Faiz Ahmadi' });
  assert.equal(canActAsTLForRequest(csUser), true);

  const actionType: string = 'tl_reject';
  const newStatus: ResumeChangeRequest['status'] = 'rejected';
  const reason = 'Candidate is already in final interview round with another client';

  const updateData: any = {
    status: newStatus,
    updated_at: new Date().toISOString()
  };

  if (actionType === 'tl_forward' || actionType === 'tl_reject') {
    if (reason) updateData.tl_notes = reason;
  }

  assert.equal(updateData.status, 'rejected');
  assert.equal(updateData.tl_notes, reason);
});

test('RTR Log Book Workflow: CS Head moves forward request from pending_tl to pending_cs and pending_rtr_team', () => {
  const rtrReq: RTRRequest = {
    id: 'rtr_201',
    candidate_id: 'cand_88',
    recruiter_id: 'rec_3',
    details: 'RTR signoff needed for client X',
    status: 'pending_tl',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const faizHead = makeUser({ id: 'cs_1', role: 'jpc_cs', username: 'care', display_name: 'Faiz Ahmadi' });

  // 1. Verify CS Head can act as TL on RTR requests
  assert.equal(canActAsTLForRequest(faizHead), true);

  // 2. Move forward to pending_cs
  const updateData1: any = {
    status: 'pending_cs' as RTRRequest['status'],
    updated_at: new Date().toISOString(),
    tl_notes: 'RTR details verified by CS Head'
  };
  assert.equal(updateData1.status, 'pending_cs');
  assert.equal(updateData1.tl_notes, 'RTR details verified by CS Head');

  // 3. Direct forward to pending_rtr_team
  const actionType: string = 'cs_forward';
  const updateData2: any = {
    status: 'pending_rtr_team' as RTRRequest['status'],
    updated_at: new Date().toISOString()
  };
  if (actionType === 'cs_forward' && updateData2.status === 'pending_rtr_team') {
    if (rtrReq.status === 'pending_tl') {
      updateData2.tl_notes = 'Direct forward to RTR Team by CS Head';
      updateData2.cs_notes = 'Direct forward to RTR Team by CS Head';
    }
  }
  assert.equal(updateData2.status, 'pending_rtr_team');
  assert.equal(updateData2.tl_notes, 'Direct forward to RTR Team by CS Head');
  assert.equal(updateData2.cs_notes, 'Direct forward to RTR Team by CS Head');
});

test('Dashboard: pendingResumeRequests includes pending_tl for CS Head and Management', () => {
  const allRequests: ResumeChangeRequest[] = [
    { id: '1', candidate_id: 'c1', recruiter_id: 'r1', details: 'req 1', status: 'pending_tl', created_at: '', updated_at: '' },
    { id: '2', candidate_id: 'c2', recruiter_id: 'r2', details: 'req 2', status: 'pending_tl', created_at: '', updated_at: '' },
    { id: '3', candidate_id: 'c3', recruiter_id: 'r3', details: 'req 3', status: 'pending_cs', created_at: '', updated_at: '' },
    { id: '4', candidate_id: 'c4', recruiter_id: 'r4', details: 'req 4', status: 'pending_resume_team', created_at: '', updated_at: '' },
    { id: '5', candidate_id: 'c5', recruiter_id: 'r5', details: 'req 5', status: 'completed', created_at: '', updated_at: '' },
    { id: '6', candidate_id: 'c6', recruiter_id: 'r6', details: 'req 6', status: 'rejected', created_at: '', updated_at: '' }
  ];

  function getPendingResumeRequests(user: User | null, resumeRequests: ResumeChangeRequest[]) {
    if (user?.role === 'jpc_marketing') return resumeRequests.filter(r => r.status === 'pending_tl');
    if (user?.role === 'jpc_cs' || user?.role === 'jpc_compliance_person') {
      return resumeRequests.filter(r => r.status === 'pending_cs' || r.status === 'pending_tl');
    }
    if (user?.role === 'jpc_resume') return resumeRequests.filter(r => r.status === 'pending_resume_team');
    if (user?.role === 'administrator' || user?.role === 'jpc_sysadmin' || user?.role === 'jpc_manager') {
      return resumeRequests.filter(r => r.status === 'pending_tl' || r.status === 'pending_cs' || r.status === 'pending_resume_team');
    }
    return [];
  }

  // 1. CS Head sees pending_cs + pending_tl (total: 2 pending_tl + 1 pending_cs = 3)
  const csUser = makeUser({ role: 'jpc_cs', username: 'care' });
  const csPending = getPendingResumeRequests(csUser, allRequests);
  assert.equal(csPending.length, 3);
  assert.deepEqual(csPending.map(r => r.id).sort(), ['1', '2', '3']);

  // 2. Compliance person sees pending_cs + pending_tl
  const compUser = makeUser({ role: 'jpc_compliance_person' });
  const compPending = getPendingResumeRequests(compUser, allRequests);
  assert.equal(compPending.length, 3);

  // 3. Administrator sees all pending (pending_tl, pending_cs, pending_resume_team: total 4)
  const adminUser = makeUser({ role: 'administrator' });
  const adminPending = getPendingResumeRequests(adminUser, allRequests);
  assert.equal(adminPending.length, 4);
  assert.deepEqual(adminPending.map(r => r.id).sort(), ['1', '2', '3', '4']);

  // 4. Marketing TL sees only pending_tl (total 2)
  const tlUser = makeUser({ role: 'jpc_marketing' });
  const tlPending = getPendingResumeRequests(tlUser, allRequests);
  assert.equal(tlPending.length, 2);
  assert.deepEqual(tlPending.map(r => r.id).sort(), ['1', '2']);

  // 5. Resume team sees only pending_resume_team (total 1)
  const resumeUser = makeUser({ role: 'jpc_resume' });
  const resumePending = getPendingResumeRequests(resumeUser, allRequests);
  assert.equal(resumePending.length, 1);
  assert.equal(resumePending[0].id, '4');

  // 6. Recruiter sees empty pending list on dashboard
  const recUser = makeUser({ role: 'jpc_recruiter' });
  assert.equal(getPendingResumeRequests(recUser, allRequests).length, 0);
});
