import { Stage, Role } from './types';

export const STAGES: Record<Stage, { label: string; color: string; icon: string }> = {
  lead_generation:     { label: '1. Lead Generation',      color: '#3B82F6', icon: '◎' },
  sales:               { label: '2. Sales',                color: '#10B981', icon: '◈' },
  cs_qc:               { label: '3. CS QC Call',          color: '#8B5CF6', icon: '◉' },
  marketing_leader:    { label: '4. Marketing Leader',     color: '#059669', icon: '◆' },
  cs_strategy_check:   { label: '5. CS Strategy Check',    color: '#8B5CF6', icon: '◉' },
  resume_team:         { label: '6. Resume Team',          color: '#F59E0B', icon: '◐' },
  cs_assign_recruiter: { label: '7. CS Assign Recruiter', color: '#8B5CF6', icon: '◉' },
  recruiter:           { label: '8. Recruiter',            color: '#3B82F6', icon: '◎' },
  sys_admin:           { label: '9. System Admin',         color: '#64748B', icon: '◧' },
  marketing_active:    { label: '10. Marketing Active',     color: '#059669', icon: '◆' },
  marketing_inactive:  { label: 'Marketing Inactive',      color: '#F43F5E', icon: '⏸' },
  interviewing:        { label: '11. Interviewing',        color: '#8B5CF6', icon: '◉' },
  application_tracking: { label: '12. App Tracking',       color: '#3B82F6', icon: '◎' },
  offer:               { label: 'Offer',                   color: '#10B981', icon: '✉' },
  backout:             { label: 'Backout',                 color: '#6B7280', icon: '↩' },
  completed:           { label: 'Completed',               color: '#10B981', icon: '✓' },
  not_eligible:        { label: 'Not Eligible',            color: '#F43F5E', icon: '⊘' },
  not_interested:      { label: 'Not Interested',          color: '#6B7280', icon: '✕' },
};

export const TRANSITIONS: Record<Stage, Stage[]> = {
  lead_generation:     ['sales', 'not_eligible'],
  sales:               ['cs_qc', 'not_interested', 'not_eligible'],
  cs_qc:               ['marketing_leader'],
  marketing_leader:    ['cs_strategy_check'],
  cs_strategy_check:   ['resume_team'],
  resume_team:         ['cs_assign_recruiter'],
  cs_assign_recruiter: ['recruiter'],
  recruiter:           ['sys_admin'],
  sys_admin:           ['marketing_active'],
  marketing_active:    ['completed', 'marketing_inactive', 'offer', 'backout', 'interviewing'],
  marketing_inactive:  ['marketing_active'],
  interviewing:        ['offer', 'backout', 'application_tracking'],
  application_tracking: [],
  offer:               ['completed', 'backout'],
  backout:             [],
  completed:           [],
  not_eligible:        [],
  not_interested:      [],
};

// Maps a stage to its logical previous stage, allowing users to move a candidate back if moved by mistake
export const PREVIOUS_STAGES: Record<Stage, Stage | null> = {
  lead_generation:     null,
  sales:               'lead_generation',
  cs_qc:               'sales',
  marketing_leader:    'cs_qc',
  cs_strategy_check:   'marketing_leader',
  resume_team:         'cs_strategy_check',
  cs_assign_recruiter: 'resume_team',
  recruiter:           'cs_assign_recruiter',
  sys_admin:           'recruiter',
  marketing_active:    'sys_admin',
  marketing_inactive:  'marketing_active',
  interviewing:        'marketing_active',
  application_tracking: 'interviewing',
  offer:               'interviewing',
  backout:             'offer',
  completed:           'marketing_active',
  not_eligible:        null,
  not_interested:      null, // Usually moved to from Sales, but could be anywhere, so let's keep it null for back tracking (or handle specifically)
};

export const ROLE_PERMISSIONS: Record<Role, { allowedStages: Stage[] | 'ALL'; adminFeatures?: boolean; teamManagement?: boolean }> = {
  administrator: { allowedStages: 'ALL', adminFeatures: true, teamManagement: true },
  jpc_manager: { allowedStages: 'ALL', teamManagement: true },
  jpc_sysadmin: { allowedStages: 'ALL', adminFeatures: true, teamManagement: true },
  jpc_lead_gen: { allowedStages: ['lead_generation'] },
  jpc_sales: { allowedStages: ['lead_generation', 'sales'] },
  jpc_cs: { allowedStages: 'ALL' },
  jpc_compliance_person: { allowedStages: 'ALL' },
  jpc_resume: { allowedStages: ['resume_team', 'marketing_active', 'interviewing'] },
  jpc_marketing: { allowedStages: ['marketing_leader', 'marketing_active', 'application_tracking', 'interviewing'] },
  jpc_marketing_support: { allowedStages: ['marketing_active', 'application_tracking', 'interviewing'] },
  jpc_recruiter: { allowedStages: ['recruiter', 'sys_admin', 'marketing_active', 'application_tracking', 'interviewing'] },
  jpc_proxy: { allowedStages: 'ALL' },
  jpc_candidate: { allowedStages: [] },
  candidate: { allowedStages: [] },
  aurrum_admin: { allowedStages: ['lead_generation', 'sales', 'interviewing', 'offer', 'completed'], teamManagement: true },
  aurrum_sales: { allowedStages: ['lead_generation', 'sales', 'interviewing'] },
  aurrum_team: { allowedStages: ['lead_generation', 'sales', 'interviewing', 'offer', 'completed'] },
};

export const LEAD_SOURCES = [
  'Facebook', 'Instagram', 'Google Ads', 'Referral', 'Walk-in', 'WhatsApp', 'LinkedIn', 'Event', 'Self Lead', 'Other'
];

export const QC_CHECKLIST_TEMPLATE = [
  { key: 'name_verified', label: 'Full name verified' },
  { key: 'phone_verified', label: 'Phone number verified' },
  { key: 'email_verified', label: 'Email address verified' },
  { key: 'job_interest_conf', label: 'Job interest confirmed' },
  { key: 'package_explained', label: 'Package explained to candidate' },
  { key: 'payment_plan_conf', label: 'Payment plan confirmed' },
  { key: 'promises_discussed', label: 'Promises discussed' },
  { key: 'agreement_ready', label: 'Agreement ready to send' },
];
