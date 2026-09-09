import { Candidate, User } from '../types';

export function canUserAccessCandidate(candidate: Candidate, user: User | null, teamUsers: User[] = []): boolean {
  if (!user) return true;

  // Administrators, System Admins, and Managers have unrestricted access
  if (user.role === 'administrator' || user.role === 'jpc_sysadmin' || user.role === 'jpc_manager') {
    return true;
  }

  // Candidates can only view their own candidate record
  if (user.role === 'candidate' || user.role === 'jpc_candidate') {
    if (user.candidate_id && String(candidate.id) === String(user.candidate_id)) return true;
    if (user.email && candidate.email && user.email.toLowerCase().trim() === candidate.email.toLowerCase().trim()) return true;
    if (user.username && (candidate.phone?.includes(user.username) || candidate.id === user.username)) return true;
    return false;
  }

  // CS Leader (Faiz / Care) has full access
  const isFaiz = user.role === 'jpc_cs' && (user.username === 'care' || String(user.display_name).toLowerCase().includes('faiz'));
  if (isFaiz) return true;

  // Helper function to check if a field matches any user identifier (id, username, email, display_name)
  const userMatches = (targetVal: any): boolean => {
    if (targetVal === null || targetVal === undefined || targetVal === '') return false;
    const targetStr = String(targetVal).toLowerCase().trim();
    if (user.id && targetStr === String(user.id).toLowerCase().trim()) return true;
    if (user.username && targetStr === String(user.username).toLowerCase().trim()) return true;
    if (user.email && targetStr === String(user.email).toLowerCase().trim()) return true;
    if (user.display_name && targetStr === String(user.display_name).toLowerCase().trim()) return true;
    return false;
  };

  // Check if candidate is unassigned / auto candidate (no explicit assignment set)
  const isUnassigned = 
    !candidate.assigned_recruiter && 
    !candidate.assigned_sales && 
    !candidate.assigned_cs && 
    !candidate.assigned_resume && 
    !candidate.assigned_marketing_leader && 
    !candidate.assigned_marketing && 
    !candidate.lead_generated_by;

  // If candidate is unassigned, all staff members can see and process auto candidates
  if (isUnassigned) return true;

  // 1. Lead Gen: created/generated the lead or unassigned
  if (user.role === 'jpc_lead_gen') {
    return userMatches(candidate.lead_generated_by);
  }

  // 2. Sales: assigned sales rep or generated lead
  if (user.role === 'jpc_sales') {
    return userMatches(candidate.assigned_sales) || userMatches(candidate.lead_generated_by);
  }

  // 3. Compliance Head & Compliance Person: assigned CS or assigned sales
  if (user.role === 'jpc_cs' || user.role === 'jpc_compliance_person') {
    if (userMatches(candidate.assigned_cs) || userMatches(candidate.assigned_sales)) return true;
    if (user.role === 'jpc_cs' && candidate.assigned_cs && teamUsers.length > 0) {
      const isMyPerson = teamUsers.some(u => 
        (String(u.leader_id) === String(user.id) || userMatches(u.leader_id)) &&
        (String(u.id) === String(candidate.assigned_cs) || String(u.username) === String(candidate.assigned_cs))
      );
      if (isMyPerson) return true;
    }
    if (user.role === 'jpc_compliance_person' && user.leader_id) {
      if (String(candidate.assigned_cs) === String(user.leader_id) || userMatches(candidate.assigned_cs)) return true;
    }
    return false;
  }

  // 4. Resume Team: assigned resume member or any candidate in Marketing Active / Interviewing stages
  if (user.role === 'jpc_resume') {
    if (candidate.current_stage === 'marketing_active' || candidate.current_stage === 'interviewing') {
      return true;
    }
    return userMatches(candidate.assigned_resume);
  }

  // 5. Marketing Leader / Support:
  // - assigned marketing leader / assigned marketing
  // - assigned recruiter
  // - or any recruiter whose leader_id === user.id
  if (user.role === 'jpc_marketing' || user.role === 'jpc_marketing_support') {
    if (userMatches(candidate.assigned_marketing_leader)) return true;
    if (userMatches(candidate.assigned_marketing)) return true;
    if (userMatches(candidate.assigned_recruiter)) return true;
    
    // Check team recruiters under this leader
    if (candidate.assigned_recruiter && teamUsers.length > 0) {
      const isMyRecruiter = teamUsers.some(u => 
        (userMatches(u.leader_id) || String(u.leader_id) === String(user.id)) &&
        (String(u.id) === String(candidate.assigned_recruiter) || String(u.username) === String(candidate.assigned_recruiter))
      );
      if (isMyRecruiter) return true;
    }
    return false;
  }

  // 6. Recruiter: assigned recruiter or assigned marketing leader or team match
  if (user.role === 'jpc_recruiter') {
    if (userMatches(candidate.assigned_recruiter)) return true;
    if (userMatches(candidate.assigned_marketing_leader)) return true;
    if (user.leader_id && candidate.assigned_marketing_leader && (
      String(candidate.assigned_marketing_leader) === String(user.leader_id) ||
      userMatches(candidate.assigned_marketing_leader)
    )) return true;
    return false;
  }

  // 7. Proxy: assigned recruiter or assigned proxy
  if (user.role === 'jpc_proxy') {
    return userMatches(candidate.assigned_recruiter);
  }

  return true;
}

/**
 * Checks if a user has authority to enable, disable, and manage 15-day Free Trial status.
 * Allowed roles: CS (Compliance Team Head), Manager, Sales, Admin.
 */
export function canManageFreeTrial(user: User | null): boolean {
  if (!user) return false;
  return [
    'administrator',
    'jpc_sysadmin',
    'jpc_manager',
    'jpc_sales',
    'jpc_cs',
    'jpc_compliance_person'
  ].includes(user.role);
}
