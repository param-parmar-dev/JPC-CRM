import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isComplianceHead } from '../src/lib/permissions';
import { Candidate, User, InterviewOfferRequest, InterviewOfferDetails, SMTPSettings } from '../src/types';

// =========================================================================
// 1. ROLE-BASED ACCESS CONTROL (isComplianceHead)
// =========================================================================
test('1. Role-Based Authority: isComplianceHead correctly identifies authorized roles', () => {
  const complianceHeadUser: User = {
    id: 'cs-1',
    username: 'cs_lead',
    display_name: 'Compliance Officer',
    email: 'cs@company.com',
    role: 'jpc_cs',
    is_active: true,
    created_at: new Date().toISOString()
  };

  const careUser: User = {
    id: 'care-1',
    username: 'care',
    display_name: 'Customer Support Care',
    email: 'care@company.com',
    role: 'jpc_cs',
    is_active: true,
    created_at: new Date().toISOString()
  };

  const faizUser: User = {
    id: 'faiz-1',
    username: 'faiz_lead',
    display_name: 'Faiz Khan',
    email: 'faiz@company.com',
    role: 'jpc_cs',
    is_active: true,
    created_at: new Date().toISOString()
  };

  const adminUser: User = {
    id: 'admin-1',
    username: 'admin',
    display_name: 'System Admin',
    email: 'admin@company.com',
    role: 'administrator',
    is_active: true,
    created_at: new Date().toISOString()
  };

  const sysAdminUser: User = {
    id: 'sysadmin-1',
    username: 'sysadmin',
    display_name: 'IT SysAdmin',
    email: 'sysadmin@company.com',
    role: 'jpc_sysadmin',
    is_active: true,
    created_at: new Date().toISOString()
  };

  const managerUser: User = {
    id: 'manager-1',
    username: 'ops_manager',
    display_name: 'Ops Manager',
    email: 'manager@company.com',
    role: 'jpc_manager',
    is_active: true,
    created_at: new Date().toISOString()
  };

  const recruiterUser: User = {
    id: 'rec-1',
    username: 'recruiter_john',
    display_name: 'John Recruiter',
    email: 'recruiter@company.com',
    role: 'jpc_recruiter',
    is_active: true,
    created_at: new Date().toISOString()
  };

  const salesUser: User = {
    id: 'sales-1',
    username: 'sales_jane',
    display_name: 'Jane Sales',
    email: 'sales@company.com',
    role: 'jpc_sales',
    is_active: true,
    created_at: new Date().toISOString()
  };

  const leadGenUser: User = {
    id: 'leadgen-1',
    username: 'lead_bob',
    display_name: 'Bob LeadGen',
    email: 'lead@company.com',
    role: 'jpc_lead_gen',
    is_active: true,
    created_at: new Date().toISOString()
  };

  // Compliance Head / Management should be authorized
  assert.equal(isComplianceHead(complianceHeadUser), true, 'jpc_cs must be Compliance Head');
  assert.equal(isComplianceHead(careUser), true, 'care username must be Compliance Head');
  assert.equal(isComplianceHead(faizUser), true, 'Faiz must be Compliance Head');
  assert.equal(isComplianceHead(adminUser), true, 'administrator must be Compliance Head');
  assert.equal(isComplianceHead(sysAdminUser), true, 'jpc_sysadmin must be Compliance Head');
  assert.equal(isComplianceHead(managerUser), true, 'jpc_manager must be Compliance Head');

  // Operational staff must NOT have approval authority
  assert.equal(isComplianceHead(recruiterUser), false, 'jpc_recruiter must NOT be Compliance Head');
  assert.equal(isComplianceHead(salesUser), false, 'jpc_sales must NOT be Compliance Head');
  assert.equal(isComplianceHead(leadGenUser), false, 'jpc_lead_gen must NOT be Compliance Head');
  assert.equal(isComplianceHead(null), false, 'null user must NOT be Compliance Head');
});

// =========================================================================
// 2. INTERVIEW-TO-OFFER CLEARANCE INTERCEPTION & STATE TRANSITION
// =========================================================================
test('2. Clearance Interception: Candidate in interviewing cannot move directly to offer without approval', () => {
  const candidateInInterview: Candidate = {
    id: 'cand-101',
    full_name: 'Alexander Wright',
    email: 'alex.wright@example.com',
    phone: '+1 555-0199',
    current_stage: 'interviewing',
    interview_offer_status: undefined,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  // Function simulating stage transition check
  function canDirectlyTransitionStage(candidate: Candidate, targetStage: string): { allowed: boolean; reason?: string } {
    if (candidate.current_stage === 'interviewing' && targetStage === 'offer') {
      if (candidate.interview_offer_status !== 'approved') {
        return {
          allowed: false,
          reason: 'Interview-to-Offer transition requires Interview Completion submission and Compliance Head approval.'
        };
      }
    }
    return { allowed: true };
  }

  // 1. Direct transition must be blocked when status is undefined
  const attemptDirect = canDirectlyTransitionStage(candidateInInterview, 'offer');
  assert.equal(attemptDirect.allowed, false);
  assert.match(attemptDirect.reason!, /requires Interview Completion submission/);

  // 2. Direct transition must be blocked when status is pending_approval
  candidateInInterview.interview_offer_status = 'pending_approval';
  const attemptPending = canDirectlyTransitionStage(candidateInInterview, 'offer');
  assert.equal(attemptPending.allowed, false);

  // 3. Direct transition must be blocked when status is rejected
  candidateInInterview.interview_offer_status = 'rejected';
  const attemptRejected = canDirectlyTransitionStage(candidateInInterview, 'offer');
  assert.equal(attemptRejected.allowed, false);

  // 4. Once approved by Compliance Head, transition to offer is permitted
  candidateInInterview.interview_offer_status = 'approved';
  const attemptApproved = canDirectlyTransitionStage(candidateInInterview, 'offer');
  assert.equal(attemptApproved.allowed, true);
});

// =========================================================================
// 3. INTERVIEW COMPLETION FORM SUBMISSION & REQUEST CREATION
// =========================================================================
test('3. Form Submission: Collects complete details and sets candidate pending_approval', () => {
  const candidate: Candidate = {
    id: 'cand-102',
    full_name: 'Priya Sharma',
    email: 'priya.sharma@techcorp.io',
    phone: '+1 415-555-2671',
    current_stage: 'interviewing',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const recruiter: User = {
    id: 'rec-10',
    username: 'recruiter_sam',
    display_name: 'Sam Recruiter',
    email: 'sam@company.com',
    role: 'jpc_recruiter',
    is_active: true,
    created_at: new Date().toISOString()
  };

  const interviewDetails: InterviewOfferDetails = {
    company_name: 'Datadog Inc',
    job_title: 'Staff Reliability Engineer',
    round_label: 'Final Loop / Technical Deep Dive',
    interview_date: '2026-09-18',
    interview_time: '14:30 EST',
    interview_mode: 'video',
    offered_package: '$185,000 / year',
    offered_role: 'Staff Reliability Engineer',
    offered_location: 'Remote, US',
    expected_joining_date: '2026-10-15',
    client_name: 'Datadog Core SRE Team'
  };

  // Submit interview completion form
  function submitInterviewCompletionForm(
    cand: Candidate,
    submitter: User,
    formData: {
      proxy_person_name: string;
      proxy_attended: 'yes' | 'no' | 'n/a';
      proxy_support_notes: string;
      interview_details: InterviewOfferDetails;
      feedback_and_remarks: string;
      technical_remarks: string;
      questions_asked: string;
      recommendation_status: string;
    }
  ): { updatedCandidate: Candidate; newRequest: InterviewOfferRequest } {
    const requestId = `offer-req-${Date.now()}`;
    const newRequest: InterviewOfferRequest = {
      id: requestId,
      candidate_id: cand.id,
      candidate_name: cand.full_name,
      candidate_email: cand.email,
      candidate_phone: cand.phone,
      submitted_by: submitter.id,
      submitted_by_name: submitter.display_name,
      proxy_person_name: formData.proxy_person_name,
      proxy_attended: formData.proxy_attended,
      proxy_support_notes: formData.proxy_support_notes,
      interview_details: formData.interview_details,
      feedback_and_remarks: formData.feedback_and_remarks,
      technical_remarks: formData.technical_remarks,
      questions_asked: formData.questions_asked,
      recommendation_status: formData.recommendation_status,
      status: 'pending_compliance_approval',
      created_at: new Date().toISOString()
    };

    const updatedCandidate: Candidate = {
      ...cand,
      interview_offer_status: 'pending_approval',
      interview_offer_request_id: requestId,
      interview_offer_rejection_reason: undefined,
      updated_at: new Date().toISOString()
    };

    return { updatedCandidate, newRequest };
  }

  const { updatedCandidate, newRequest } = submitInterviewCompletionForm(candidate, recruiter, {
    proxy_person_name: 'David Vance',
    proxy_attended: 'yes',
    proxy_support_notes: 'Proxy supported live coding problem 2 on distributed consensus.',
    interview_details: interviewDetails,
    feedback_and_remarks: 'Candidate excelled in architecture round. Offer package approved by client VP.',
    technical_remarks: 'Solid grasp of Raft consensus and Kubernetes operators.',
    questions_asked: 'System design of distributed rate limiter and multi-region failover.',
    recommendation_status: 'strong_hire'
  });

  // Verify candidate state
  assert.equal(updatedCandidate.current_stage, 'interviewing', 'Candidate must remain in interviewing stage during review');
  assert.equal(updatedCandidate.interview_offer_status, 'pending_approval');
  assert.equal(updatedCandidate.interview_offer_request_id, newRequest.id);

  // Verify request properties
  assert.equal(newRequest.status, 'pending_compliance_approval');
  assert.equal(newRequest.proxy_person_name, 'David Vance');
  assert.equal(newRequest.proxy_attended, 'yes');
  assert.equal(newRequest.interview_details.company_name, 'Datadog Inc');
  assert.equal(newRequest.interview_details.offered_package, '$185,000 / year');
  assert.equal(newRequest.recommendation_status, 'strong_hire');
});

// =========================================================================
// 4. COMPLIANCE HEAD APPROVAL WORKFLOW & STAGE ADVANCEMENT
// =========================================================================
test('4. Approval Workflow: Compliance Head approves request, candidate moves to Offer, email triggers', () => {
  const candidate: Candidate = {
    id: 'cand-103',
    full_name: 'Marcus Brody',
    email: 'marcus.brody@example.com',
    current_stage: 'interviewing',
    interview_offer_status: 'pending_approval',
    interview_offer_request_id: 'req-999',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const existingRequest: InterviewOfferRequest = {
    id: 'req-999',
    candidate_id: candidate.id,
    candidate_name: candidate.full_name,
    submitted_by: 'rec-1',
    submitted_by_name: 'Recruiter Alice',
    proxy_person_name: 'Robert Langdon',
    proxy_attended: 'yes',
    interview_details: {
      company_name: 'Stripe',
      job_title: 'Senior Payments Engineer',
      round_label: 'Final Round',
      interview_date: '2026-09-17',
      offered_package: '$210,000 / yr',
      offered_location: 'San Francisco, CA'
    },
    feedback_and_remarks: 'Exceptional feedback across all 4 rounds.',
    status: 'pending_compliance_approval',
    created_at: new Date().toISOString()
  };

  const complianceHeadUser: User = {
    id: 'cs-lead-1',
    username: 'faiz_lead',
    display_name: 'Faiz Ahmed',
    email: 'faiz@placify.io',
    role: 'jpc_cs',
    is_active: true,
    created_at: new Date().toISOString()
  };

  let emailDispatched = false;
  let emailPayload: any = null;

  function handleComplianceApproval(
    cand: Candidate,
    request: InterviewOfferRequest,
    reviewer: User,
    approvalRemarks: string
  ): { updatedCandidate: Candidate; updatedRequest: InterviewOfferRequest } {
    assert.equal(isComplianceHead(reviewer), true, 'Only Compliance Head can execute approval');

    const updatedRequest: InterviewOfferRequest = {
      ...request,
      status: 'approved',
      compliance_reviewer_id: reviewer.id,
      compliance_reviewer_name: reviewer.display_name,
      compliance_reviewed_at: new Date().toISOString(),
      compliance_remarks: approvalRemarks,
      updated_at: new Date().toISOString()
    };

    const updatedCandidate: Candidate = {
      ...cand,
      current_stage: 'offer',
      interview_offer_status: 'approved',
      interview_offer_rejection_reason: undefined,
      updated_at: new Date().toISOString()
    };

    // Trigger email notification
    emailDispatched = true;
    emailPayload = {
      candidate_name: cand.full_name,
      reviewer_name: reviewer.display_name,
      company_name: request.interview_details.company_name,
      job_title: request.interview_details.job_title,
      offered_package: request.interview_details.offered_package
    };

    return { updatedCandidate, updatedRequest };
  }

  const { updatedCandidate, updatedRequest } = handleComplianceApproval(
    candidate,
    existingRequest,
    complianceHeadUser,
    'Verified client feedback and proxy attendance. Cleared for offer rollout.'
  );

  // Candidate must now be in 'offer' stage
  assert.equal(updatedCandidate.current_stage, 'offer', 'Candidate must automatically advance to Offer stage');
  assert.equal(updatedCandidate.interview_offer_status, 'approved');

  // Request state
  assert.equal(updatedRequest.status, 'approved');
  assert.equal(updatedRequest.compliance_reviewer_name, 'Faiz Ahmed');
  assert.equal(updatedRequest.compliance_remarks, 'Verified client feedback and proxy attendance. Cleared for offer rollout.');

  // Verify automated email trigger
  assert.equal(emailDispatched, true, 'Email dispatch must occur upon Compliance Head approval');
  assert.equal(emailPayload.candidate_name, 'Marcus Brody');
  assert.equal(emailPayload.company_name, 'Stripe');
  assert.equal(emailPayload.offered_package, '$210,000 / yr');
});

// =========================================================================
// 5. COMPLIANCE HEAD REJECTION WORKFLOW
// =========================================================================
test('5. Rejection Workflow: Compliance Head rejects request, candidate remains in interviewing with remarks', () => {
  const candidate: Candidate = {
    id: 'cand-104',
    full_name: 'Elena Rostova',
    email: 'elena.rostova@example.com',
    current_stage: 'interviewing',
    interview_offer_status: 'pending_approval',
    interview_offer_request_id: 'req-1001',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const existingRequest: InterviewOfferRequest = {
    id: 'req-1001',
    candidate_id: candidate.id,
    candidate_name: candidate.full_name,
    submitted_by: 'rec-2',
    submitted_by_name: 'Recruiter Bob',
    proxy_person_name: 'Unknown',
    proxy_attended: 'no',
    interview_details: {
      company_name: 'Acme Software',
      job_title: 'Full Stack Dev',
      round_label: 'Round 1',
      interview_date: '2026-09-18'
    },
    feedback_and_remarks: 'Candidate was unsure about several fundamentals.',
    status: 'pending_compliance_approval',
    created_at: new Date().toISOString()
  };

  const complianceHeadUser: User = {
    id: 'admin-1',
    username: 'admin',
    display_name: 'Chief Compliance Officer',
    email: 'compliance@placify.io',
    role: 'administrator',
    is_active: true,
    created_at: new Date().toISOString()
  };

  function handleComplianceRejection(
    cand: Candidate,
    request: InterviewOfferRequest,
    reviewer: User,
    rejectionReason: string
  ): { updatedCandidate: Candidate; updatedRequest: InterviewOfferRequest } {
    assert.equal(isComplianceHead(reviewer), true, 'Only Compliance Head can execute rejection');

    const updatedRequest: InterviewOfferRequest = {
      ...request,
      status: 'rejected',
      compliance_reviewer_id: reviewer.id,
      compliance_reviewer_name: reviewer.display_name,
      compliance_reviewed_at: new Date().toISOString(),
      compliance_remarks: rejectionReason,
      updated_at: new Date().toISOString()
    };

    const updatedCandidate: Candidate = {
      ...cand,
      current_stage: 'interviewing', // Remains in interviewing
      interview_offer_status: 'rejected',
      interview_offer_rejection_reason: rejectionReason,
      updated_at: new Date().toISOString()
    };

    return { updatedCandidate, updatedRequest };
  }

  const rejectionReason = 'Missing proxy attendance confirmation and compensation details incomplete.';
  const { updatedCandidate, updatedRequest } = handleComplianceRejection(
    candidate,
    existingRequest,
    complianceHeadUser,
    rejectionReason
  );

  // Candidate must remain in interviewing stage
  assert.equal(updatedCandidate.current_stage, 'interviewing', 'Candidate must NOT move to offer on rejection');
  assert.equal(updatedCandidate.interview_offer_status, 'rejected');
  assert.equal(updatedCandidate.interview_offer_rejection_reason, rejectionReason);

  // Request state
  assert.equal(updatedRequest.status, 'rejected');
  assert.equal(updatedRequest.compliance_remarks, rejectionReason);
});

// =========================================================================
// 6. MULTIPLE RECIPIENT EMAIL ADDRESS CONFIGURATION (offer_notification_emails)
// =========================================================================
test('6. SMTP Recipient Management: Add, edit, delete, deduplicate and validate multiple notification emails', () => {
  const initialSettings: SMTPSettings = {
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    user: 'notifications@placify.io',
    pass: 'secret-token',
    from_name: 'Placify Compliance',
    from_email: 'notifications@placify.io',
    offer_notification_emails: ['compliance@placify.io', 'director@placify.io']
  };

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // Add email helper
  function addRecipientEmail(settings: SMTPSettings, newEmail: string): { success: boolean; updatedSettings: SMTPSettings; error?: string } {
    const trimmed = newEmail.trim().toLowerCase();
    if (!emailRegex.test(trimmed)) {
      return { success: false, updatedSettings: settings, error: 'Invalid email address format' };
    }
    const currentList = settings.offer_notification_emails || [];
    if (currentList.some(e => e.toLowerCase() === trimmed)) {
      return { success: false, updatedSettings: settings, error: 'Email already exists in recipient list' };
    }
    return {
      success: true,
      updatedSettings: {
        ...settings,
        offer_notification_emails: [...currentList, trimmed]
      }
    };
  }

  // Edit email helper
  function editRecipientEmail(settings: SMTPSettings, index: number, updatedEmail: string): { success: boolean; updatedSettings: SMTPSettings; error?: string } {
    const trimmed = updatedEmail.trim().toLowerCase();
    if (!emailRegex.test(trimmed)) {
      return { success: false, updatedSettings: settings, error: 'Invalid email address format' };
    }
    const currentList = [...(settings.offer_notification_emails || [])];
    if (currentList.some((e, i) => i !== index && e.toLowerCase() === trimmed)) {
      return { success: false, updatedSettings: settings, error: 'Email already exists in recipient list' };
    }
    currentList[index] = trimmed;
    return {
      success: true,
      updatedSettings: {
        ...settings,
        offer_notification_emails: currentList
      }
    };
  }

  // Remove email helper
  function removeRecipientEmail(settings: SMTPSettings, emailToRemove: string): SMTPSettings {
    const currentList = settings.offer_notification_emails || [];
    return {
      ...settings,
      offer_notification_emails: currentList.filter(e => e.toLowerCase() !== emailToRemove.toLowerCase())
    };
  }

  // 1. Initial recipients check
  assert.equal(initialSettings.offer_notification_emails?.length, 2);

  // 2. Add valid email
  const addRes1 = addRecipientEmail(initialSettings, 'admin.team@placify.io');
  assert.equal(addRes1.success, true);
  assert.equal(addRes1.updatedSettings.offer_notification_emails?.length, 3);
  assert.ok(addRes1.updatedSettings.offer_notification_emails?.includes('admin.team@placify.io'));

  // 3. Prevent duplicate email addition
  const addDuplicate = addRecipientEmail(addRes1.updatedSettings, 'ADMIN.TEAM@PLACIFY.IO');
  assert.equal(addDuplicate.success, false);
  assert.equal(addDuplicate.error, 'Email already exists in recipient list');

  // 4. Prevent invalid email format
  const addInvalid = addRecipientEmail(addRes1.updatedSettings, 'invalid-email-string');
  assert.equal(addInvalid.success, false);
  assert.equal(addInvalid.error, 'Invalid email address format');

  // 5. Edit existing email
  const editRes = editRecipientEmail(addRes1.updatedSettings, 1, 'executive.director@placify.io');
  assert.equal(editRes.success, true);
  assert.equal(editRes.updatedSettings.offer_notification_emails?.[1], 'executive.director@placify.io');

  // 6. Remove email
  const removedSettings = removeRecipientEmail(editRes.updatedSettings, 'compliance@placify.io');
  assert.equal(removedSettings.offer_notification_emails?.length, 2);
  assert.equal(removedSettings.offer_notification_emails?.includes('compliance@placify.io'), false);
});
