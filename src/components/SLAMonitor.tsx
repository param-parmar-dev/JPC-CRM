import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { subscribeToCollection, saveCandidate, addNotification } from '../services/storage';
import { Candidate, User, Stage } from '../types';
import { STAGES } from '../constants';

export const SLAMonitor: React.FC = () => {
  const { user, isAuthReady } = useAuth();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    if (!isAuthReady || !user) return;
    
    // Allow admins, managers, and system-level roles to run the monitor
    if (!['administrator', 'jpc_sysadmin', 'jpc_manager'].includes(user.role)) return;

    const unsubCandidates = subscribeToCollection<Candidate>('jpc_candidates', setCandidates);
    const unsubUsers = subscribeToCollection<User>('jpc_users', setUsers);

    return () => {
      unsubCandidates();
      unsubUsers();
    };
  }, [isAuthReady, user]);

  useEffect(() => {
    if (candidates.length === 0 || users.length === 0 || !user) return;

    const monitorInterval = setInterval(() => {
      // 2.5 hours in milliseconds
      const TIMEOUT_MS = 2.5 * 60 * 60 * 1000;
      const now = Date.now();

      const ACTIVE_STAGES: Stage[] = [
        'sales', 
        'cs_qc', 
        'marketing_leader', 
        'cs_strategy_check',
        'resume_team',
        'cs_assign_recruiter', 
        'recruiter', 
        'sys_admin'
      ];

      candidates.forEach(async (candidate) => {
        if (ACTIVE_STAGES.includes(candidate.current_stage) && !candidate.flags?.sla_timeout_notified) {
          const updatedAt = new Date(candidate.updated_at).getTime();
          
          if (now - updatedAt >= TIMEOUT_MS) {
            try {
              // Try to be the one who marks it 
              const updatedFlags = {
                ...(candidate.flags || {}),
                sla_timeout_notified: true
              };
              
              await saveCandidate({ ...candidate, flags: updatedFlags } as Candidate, user.id as string);

              // Gather recipients
              const recipients = new Set<string>();

              // 1. Determine Assigned Person based on Stage
              let assignee: string | number | null = null;
              switch (candidate.current_stage) {
                case 'sales': assignee = candidate.assigned_sales; break;
                case 'cs_qc':
                case 'cs_assign_recruiter': assignee = candidate.assigned_cs; break;
                case 'marketing_leader': assignee = candidate.assigned_marketing_leader; break;
                case 'resume_team': assignee = candidate.assigned_resume; break;
                case 'recruiter':
                case 'application_tracking': assignee = candidate.assigned_recruiter; break;
                case 'marketing_active': assignee = candidate.assigned_marketing; break;
                case 'sys_admin':
                  // For sys admin stage, add all sys_admins
                  users.forEach(u => {
                    if (u.role === 'jpc_sysadmin') recipients.add(String(u.id));
                  });
                  break;
              }

              if (assignee) {
                recipients.add(String(assignee));
              }

              // 2. Lead Generation (Creator)
              if (candidate.lead_generated_by) {
                recipients.add(String(candidate.lead_generated_by));
              }

              // 3. All CS, Managers, and Admins
              users.forEach(u => {
                if (u.role === 'jpc_cs' || u.role === 'jpc_manager' || u.role === 'administrator') {
                  recipients.add(String(u.id));
                }
              });

              const stageLabel = STAGES[candidate.current_stage]?.label || candidate.current_stage;

              // Send notifications
              const notifyTasks = Array.from(recipients).map(recipientId => {
                let message = `SLA Warning: Candidate ${candidate.full_name} has been stuck in the "${stageLabel}" stage for over 2.5 hours without action.`;
                
                if (assignee && recipientId === String(assignee)) {
                  message = `Action Required: Your assigned candidate ${candidate.full_name} has been stuck in the "${stageLabel}" stage for over 2.5 hours!`;
                } else if (recipientId === String(candidate.lead_generated_by)) {
                  message = `Lead Update: A candidate you generated (${candidate.full_name}) is stuck in the "${stageLabel}" stage for over 2.5 hours.`;
                }

                return addNotification({
                  recipient_id: recipientId,
                  sender_id: 'system',
                  type: 'system_alert',
                  message
                });
              });

              await Promise.all(notifyTasks);

            } catch (err) {
              console.error('Failed to process SLA timeout for candidate:', candidate.id, err);
            }
          }
        }
      });
    }, 60 * 1000); // Check every minute

    return () => clearInterval(monitorInterval);
  }, [candidates, users, user]);

  return null;
};
