import { User, Candidate, Stage } from '../types';
import { saveUser, saveCandidate, generateId, now, seedQCChecklist, logActivity } from './storage';
import { collection, getDocs, query, limit } from 'firebase/firestore';
import { db } from '../firebase';

const DEMO_CANDIDATES: Partial<Candidate>[] = [
  {
    full_name: 'Arjun Sharma',
    phone: '+91 98765 43210',
    email: 'arjun.s@example.com',
    job_interest: 'Software Engineer',
    location: 'Bangalore',
    current_stage: 'lead_generation',
    package_name: 'Elite Placement',
    package_amount: 50000
  },
  {
    full_name: 'Priya Patel',
    phone: '+91 98765 43211',
    email: 'priya.p@example.com',
    job_interest: 'Data Scientist',
    location: 'Mumbai',
    current_stage: 'sales',
    package_name: 'Professional Plus',
    package_amount: 35000
  },
  {
    full_name: 'Rohan Gupta',
    phone: '+91 98765 43212',
    email: 'rohan.g@example.com',
    job_interest: 'Product Manager',
    location: 'Delhi',
    current_stage: 'cs_qc',
    package_name: 'Executive Search',
    package_amount: 75000
  }
];

export async function seedData(): Promise<void> {
  // Seed demo users if none exist
  const usersSnap = await getDocs(collection(db, 'jpc_users'));
  if (usersSnap.empty) {
    console.log('Seeding demo users...');
    const demoUsers: User[] = [
      { id: 'tl1', username: 'tl1', display_name: 'Marketing Leader 1', role: 'jpc_marketing', created_at: now() },
      { id: 'tl2', username: 'tl2', display_name: 'Marketing Leader 2', role: 'jpc_marketing', created_at: now() },
      { id: 'rec1', username: 'rec1', display_name: 'Recruiter 1 (TL1)', role: 'jpc_recruiter', leader_id: 'tl1', created_at: now() },
      { id: 'rec2', username: 'rec2', display_name: 'Recruiter 2 (TL1)', role: 'jpc_recruiter', leader_id: 'tl1', created_at: now() },
      { id: 'rec3', username: 'rec3', display_name: 'Recruiter 3 (TL2)', role: 'jpc_recruiter', leader_id: 'tl2', created_at: now() },
      { id: 'rec4', username: 'rec4', display_name: 'Recruiter 4 (TL2)', role: 'jpc_recruiter', leader_id: 'tl2', created_at: now() },
      { id: 'sales1', username: 'sales1', display_name: 'Sales Person 1', role: 'jpc_sales', sales_availability_status: 'Active', created_at: now() },
      { id: 'cs1', username: 'cs1', display_name: 'CS Person 1', role: 'jpc_cs', created_at: now() },
      { id: 'resume1', username: 'resume1', display_name: 'Resume Specialist 1', role: 'jpc_resume', created_at: now() },
    ];
    for (const u of demoUsers) {
      await saveUser(u);
    }
  }

  // Check if candidates already exist
  const q = query(collection(db, 'jpc_candidates'), limit(1));
  const snapshot = await getDocs(q);
  
  if (snapshot.empty) {
    console.log('Seeding demo candidates...');
    for (const c of DEMO_CANDIDATES) {
      const id = generateId();
      const candidate: Candidate = {
        id,
        full_name: c.full_name || '',
        phone: c.phone || '',
        email: c.email || '',
        whatsapp: '',
        job_interest: c.job_interest || '',
        domain_interested: '',
        location: c.location || '',
        education: '',
        degree: '',
        university: '',
        graduation_year: '',
        experience_years: '',
        current_company: '',
        current_designation: '',
        skills: '',
        linkedin_url: '',
        lead_source: 'Facebook',
        lead_generated_by: 'system',
        assigned_sales: null,
        assigned_cs: null,
        assigned_resume: null,
        assigned_marketing_leader: null,
        assigned_recruiter: null,
        assigned_marketing: null,
        package_name: c.package_name || '',
        package_amount: c.package_amount || 0,
        domain_suggested: '',
        notes: 'Demo candidate seeded on initial load.',
        current_stage: c.current_stage as Stage,
        flags: {
          agreement_sent: false,
          agreement_signed: false,
          qc_checklist_done: false,
          resume_approved: false,
          candidate_resume_approved: false,
          marketing_email_created: false,
          two_step_verification: false,
          linkedin_optimized: false,
          marketing_started: false
        },
        not_interested_at: c.not_interested_at || null,
        deleted_at: null,
        created_at: now(),
        updated_at: now()
      };
      
      await saveCandidate(candidate, 'system');
      await seedQCChecklist(id);
      await logActivity(id, 'Candidate created', 'Demo candidate seeded on initial load.', 'system');
    }
  }
}
