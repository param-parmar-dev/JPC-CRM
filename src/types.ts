export type Role = 
  | 'administrator'
  | 'jpc_manager'
  | 'jpc_sysadmin'
  | 'jpc_lead_gen'
  | 'jpc_sales'
  | 'jpc_cs'
  | 'jpc_compliance_person'
  | 'jpc_resume'
  | 'jpc_marketing'
  | 'jpc_marketing_support'
  | 'jpc_recruiter'
  | 'jpc_proxy'
  | 'jpc_candidate'
  | 'candidate';

export type UserRole = Role;

export interface User {
  id: number | string;
  username: string;
  password?: string;
  display_name: string;
  role: Role;
  email?: string;
  temp_password?: string | null;
  candidate_id?: string | null;
  leader_id?: string | number | null;
  created_at: string;
  is_on_leave?: boolean;
  leave_return_date?: string | null;
  deleted_at?: string | null;
  google_calendar_connected?: boolean;
  google_calendar_email?: string | null;
  google_access_token?: string | null;
  google_access_token_expires_at?: number | null;
  google_refresh_token?: string | null;
  google_calendar_status?: 'connected' | 'attention_required' | 'disconnected' | null;
  auto_booking_enabled?: boolean;
  sales_availability_status?: 'Active' | 'Deactive';
  sales_activated_at?: string | null;
  sales_deactivated_at?: string | null;
}

export type Stage = 
  | 'lead_generation'
  | 'sales'
  | 'cs_qc'
  | 'marketing_leader'
  | 'cs_strategy_check'
  | 'resume_team'
  | 'cs_assign_recruiter'
  | 'recruiter'
  | 'sys_admin'
  | 'marketing_active'
  | 'marketing_inactive'
  | 'interviewing'
  | 'application_tracking'
  | 'offer'
  | 'backout'
  | 'completed'
  | 'not_eligible'
  | 'not_interested';

export interface CandidateFlags {
  agreement_sent: boolean;
  agreement_signed: boolean;
  qc_checklist_done: boolean;
  resume_approved: boolean;
  candidate_resume_approved: boolean;
  marketing_email_created: boolean;
  two_step_verification: boolean;
  linkedin_optimized: boolean;
  marketing_started: boolean;
  sla_timeout_notified?: boolean;
  marketing_strategy_done?: boolean;
  resume_briefing_call_done?: boolean;
}

export interface Candidate {
  id: string;
  full_name: string;
  phone: string;
  email: string;
  whatsapp: string;
  job_interest: string;
  domain_interested: string;
  location: string;
  education: string;
  degree: string;
  university: string;
  graduation_year: string;
  experience_years: string;
  current_company: string;
  current_designation: string;
  skills: string;
  linkedin_url: string;
  lead_source: string;
  lead_generated_by: string | number | null;
  updated_behalf_of?: string | number | null;
  assigned_sales: string | number | null;
  assigned_cs: string | number | null;
  assigned_resume: string | number | null;
  assigned_marketing_leader: string | number | null;
  assigned_recruiter: string | number | null;
  assigned_marketing: string | number | null;
  package_name: string;
  package_amount: number;
  domain_suggested: string;
  notes: string;
  current_stage: Stage;
  flags: CandidateFlags;
  profiles_count?: number;
  custom_daily_target?: number;
  not_interested_at?: string | null;
  not_eligible_at?: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  temp_portal_password?: string | null;
  resume_url?: string | null;
  resume_base64?: string | null;
  resume_filename?: string | null;
  resume_versions?: ResumeVersion[];
  agreement_url?: string | null;
  agreement_base64?: string | null;
  agreement_filename?: string | null;
  portal_link?: string | null;
  remarks?: string;
  resume_phrases?: string;
  marketing_entity?: ('sivium' | 'recruiter')[];
  is_free_trial?: boolean;
  free_trial_start_date?: string | null;
  free_trial_end_date?: string | null;
  free_trial_managed_by?: string | number | null;
  free_trial_updated_at?: string | null;
}

export interface ResumeVersion {
  id: string;
  url: string;
  filename: string;
  uploaded_at: string;
  uploaded_by?: string | number | null;
  uploaded_by_name?: string | null;
  notes?: string;
  version_number?: number;
  is_current?: boolean;
}

export interface TargetReductionRequest {
  id: string;
  candidate_id: string;
  recruiter_id: string;
  requested_target: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  cs_id?: string;
  cs_notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  candidate_id: string;
  part_number: number;
  amount: number;
  due_date: string;
  paid_on: string | null;
  status: 'pending' | 'paid';
  receipt_number: string;
  payment_method: string;
  notes: string;
  created_by: string | number | null;
  created_at: string;
  proof_url?: string | null;
  proof_base64?: string | null;
  proof_filename?: string | null;
}

export interface FollowUp {
  id: string;
  candidate_id: string;
  stage: string;
  followup_date: string;
  note: string;
  done: boolean;
  created_by: string | number | null;
  created_at: string;
}

export interface Promise {
  id: string;
  candidate_id: string;
  promise_text: string;
  made_by: string | number | null;
  stage: string;
  status: 'active' | 'fulfilled' | 'broken';
  created_at: string;
}

export interface QCChecklistItem {
  id: string;
  candidate_id: string;
  item_key: string;
  item_label: string;
  checked: boolean;
  value?: string;
  has_text_box?: boolean;
  created_at: string;
}

export interface ActivityLog {
  id: string;
  candidate_id: string;
  user_id: string | number | null;
  action: string;
  details: string;
  created_at: string;
}

export interface Application {
  id: string;
  candidate_id: string;
  recruiter_id: string;
  job_link: string;
  company_name: string;
  job_title?: string;
  status?: string;
  notes?: string;
  sheet_type?: string;
  applied_at: string;
  created_at: string;
}

export interface Notification {
  id: string;
  recipient_id: string | number;
  sender_id: string | number | null;
  type: 'target_not_met' | 'system_alert' | 'resume_request' | 'rtr_request' | 'target_reduction_request' | 'resume_understanding_request' | 'interview_question_request';
  message: string;
  read: boolean;
  created_at: string;
}

export interface ResumeChangeRequest {
  id: string;
  candidate_id: string;
  recruiter_id: string;
  details: string;
  status: 'pending_tl' | 'pending_cs' | 'pending_resume_team' | 'completed' | 'rejected';
  tl_notes?: string;
  cs_notes?: string;
  resume_team_notes?: string;
  new_resume_url?: string;
  resume_base64?: string;
  resume_filename?: string;
  completed_by?: string | number | null;
  completed_by_name?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface RTRRequest {
  id: string;
  candidate_id: string;
  recruiter_id: string;
  details: string;
  status: 'pending_tl' | 'pending_cs' | 'pending_rtr_team' | 'completed' | 'rejected';
  tl_notes?: string;
  cs_notes?: string;
  rtr_team_notes?: string;
  new_rtr_url?: string;
  rtr_base64?: string;
  rtr_filename?: string;
  completed_by?: string | number | null;
  completed_by_name?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface InterviewSupportRequest {
  id: string;
  candidate_id: string;
  recruiter_id: string;
  cs_id: string | null;
  company_name: string;
  interview_company_name: string;
  job_title: string;
  interview_type: 'intro_call' | 'screening' | 'assessment' | 'technical' | 'hr' | 'final' | 'custom';
  timezone: string;
  notes: string;
  whatsapp_number: string;
  job_link: string;
  application_link: string;
  job_description?: string;
  latest_resume_id: string;
  proxy_required: boolean;
  proxy_user_id?: string | null;
  overall_status: 'pending_request' | 'booking_link_generated' | 'candidate_slot_selected' | 'proxy_assigned' | 'confirmed' | 'live' | 'completed' | 'feedback_added' | 'next_round' | 'rejected' | 'cancelled' | 'rescheduled' | 'placed';
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface InterviewRound {
  id: string;
  request_id: string;
  round_label: string;
  round_type: 'screening' | 'technical' | 'assessment' | 'hr' | 'final' | 'custom';
  interview_date: string | null;
  duration_minutes: number;
  status: 'pending' | 'booked' | 'confirmed' | 'live' | 'completed' | 'cancelled';
  proxy_user_id: string | null;
  booking_link_token: string | null;
  booked_slot_time: string | null;
  booked_slot_end: string | null;
  live_started_at: string | null;
  completed_at: string | null;
  feedback_submitted_at: string | null;
  result: 'next_round' | 'rejected' | 'pending' | 'offer' | 'custom' | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ProxyAvailability {
  id: string;
  proxy_user_id: string;
  slot_start: string;
  slot_end: string;
  slot_status: 'available' | 'booked' | 'unavailable' | 'leave' | 'break' | 'completed';
  leave_reason?: string;
  recurrence_type: 'none' | 'daily' | 'weekly';
  timezone: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface InterviewFeedback {
  id: string;
  interview_round_id: string;
  attended: boolean;
  proxy_support_provided: boolean;
  interview_notes: string;
  candidate_performance: string;
  questions_asked: string;
  issues_faced: string;
  suggested_next_steps: string;
  result: 'next_round' | 'rejected' | 'pending' | 'offer' | 'custom';
  submitted_by: string;
  created_at: string;
}

export interface BookingLink {
  id: string;
  interview_round_id: string;
  generated_by_recruiter_id: string;
  token: string;
  expires_at: string;
  is_active: boolean;
  opened_at: string | null;
  booked_at: string | null;
  created_at: string;
}

export interface InterviewNotification {
  id: string;
  interview_round_id: string;
  notification_type: 'request_created' | 'link_generated' | 'slot_selected' | 'proxy_assigned' | 'feedback_submitted' | 'completed' | 'reminder' | 'link_opened' | 'result_updated' | 'rescheduled';
  recipient_user_id: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

export interface InterviewActivityLog {
  id: string;
  interview_round_id: string;
  action: string;
  action_by: string;
  meta_data: any;
  created_at: string;
}

export interface CVFile {
  id: number;
  title: string;
  url: string;
  name: string;
  email: string;
  phone: string;
  date: string;
}

export interface FeatureAnnouncement {
  id: string;
  title: string;
  summary: string;
  image_url?: string | null;
  pdf_url?: string | null;
  target_teams: Role[] | 'ALL';
  created_by: string;
  created_at: string;
  is_active: boolean;
}

export interface ResumeSubstitutionRequest {
  id: string;
  interview_request_id: string;
  candidate_id: string;
  new_resume_url: string;
  new_resume_filename: string;
  status: 'pending' | 'reviewed';
  created_at: string;
  updated_at: string;
}

export interface SMTPSettings {
  id: 'global_smtp';
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from_name: string;
  from_email: string;
}

export interface ResumePrepRequest {
  id: string;
  type: 'resume_understanding' | 'interview_questions';
  candidate_id: string;
  recruiter_id: string;
  details: string;
  status: 'pending_resume_team' | 'completed' | 'rejected';
  resume_team_notes?: string;
  document_url?: string;
  document_filename?: string;
  completed_by?: string | number | null;
  completed_by_name?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface IPVerifyResponse {
  allowed: boolean;
  ip: string;
  error?: string;
  message?: string;
}

export interface LeadRoundRobinAssignment {
  candidate_id: string;
  candidate_name: string;
  assigned_to_user_id: string | number;
  assigned_to_name: string;
  assigned_at: string;
}

export interface LeadRoundRobinConfig {
  id: string;
  last_assigned_user_id: string | number | null;
  last_assigned_index: number;
  last_assigned_at: string | null;
  enabled: boolean;
  excluded_user_ids?: (string | number)[];
  custom_order_user_ids?: (string | number)[];
  total_leads_assigned?: number;
  recent_assignments?: LeadRoundRobinAssignment[];
}
