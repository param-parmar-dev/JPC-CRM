import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { doc, onSnapshot, collection, query, where, orderBy, limit, setDoc } from 'firebase/firestore';
import { Candidate, Payment, Application, InterviewSupportRequest, ActivityLog, InterviewRound, User } from '../types';
import { FreeTrialBadge } from '../components/FreeTrialBadge';
import { STAGES } from '../constants';
import { 
  TrendingUp, 
  CheckCircle2, 
  Clock, 
  CreditCard, 
  FileText, 
  Video, 
  Activity,
  History,
  Calendar,
  ArrowUpRight,
  Download,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  X,
  LayoutDashboard,
  Zap,
  Layout,
  Briefcase,
  CheckCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { handleViewFile } from '../services/fileService';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell,
  LineChart,
  Line
} from 'recharts';

export const CandidateDashboard: React.FC = () => {
  const { user, isAuthReady } = useAuth();
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [interviews, setInterviews] = useState<InterviewSupportRequest[]>([]);
  const [interviewRounds, setInterviewRounds] = useState<InterviewRound[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedJD, setSelectedJD] = useState<string | null>(null);
  const [assignedCS, setAssignedCS] = useState<User | null>(null);
  const [assignedRecruiter, setAssignedRecruiter] = useState<User | null>(null);
  const [isSupportModalOpen, setIsSupportModalOpen] = useState(false);
  const [supportType, setSupportType] = useState<'Mock Interview' | 'Resume Briefing' | 'Technical Support' | null>(null);
  const [supportMessage, setSupportMessage] = useState('');
  const [isSubmittingSupport, setIsSubmittingSupport] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'applications' | 'interviews'>('dashboard');

  // Pagination for applications
  const [appsPage, setAppsPage] = useState(1);
  const appsPerPage = 10;
  const paginatedApps = useMemo(() => {
    const start = (appsPage - 1) * appsPerPage;
    return applications.slice(start, start + appsPerPage);
  }, [applications, appsPage]);
  const totalAppPages = Math.ceil(applications.length / appsPerPage);

  useEffect(() => {
    if (!isAuthReady || !user?.candidate_id) return;

    const id = user.candidate_id;

    const unsubCandidate = onSnapshot(doc(db, 'jpc_candidates', id), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as Candidate;
        setCandidate(data);
        setIsLoading(false);

        // Fetch CS and Recruiter details
        if (data.assigned_cs) {
          onSnapshot(doc(db, 'jpc_users', String(data.assigned_cs)), (userSnap) => {
            if (userSnap.exists()) setAssignedCS(userSnap.data() as User);
          });
        }
        if (data.assigned_recruiter) {
          onSnapshot(doc(db, 'jpc_users', String(data.assigned_recruiter)), (userSnap) => {
            if (userSnap.exists()) setAssignedRecruiter(userSnap.data() as User);
          });
        }
      }
    });

    const unsubPayments = onSnapshot(query(collection(db, 'jpc_payments'), where('candidate_id', '==', id)), (snap) => {
      setPayments(snap.docs.map(d => d.data() as Payment));
    });

    const unsubApps = onSnapshot(query(collection(db, 'jpc_applications'), where('candidate_id', '==', id), orderBy('applied_at', 'desc'), limit(50)), (snap) => {
      setApplications(snap.docs.map(d => d.data() as Application));
    });

    const unsubInterviews = onSnapshot(query(collection(db, 'jpc_interview_requests'), where('candidate_id', '==', id)), (snap) => {
      const requests = snap.docs.map(d => d.data() as InterviewSupportRequest);
      setInterviews(requests);

      // Fetch rounds for these requests
      if (requests.length > 0) {
        const requestIds = requests.map(r => r.id);
        // Firebase 'in' query limit is 30, we likely have fewer requests
        const roundsQuery = query(collection(db, 'jpc_interview_rounds'), where('request_id', 'in', requestIds.slice(0, 30)));
        onSnapshot(roundsQuery, (roundsSnap) => {
          setInterviewRounds(roundsSnap.docs.map(d => d.data() as InterviewRound));
        });
      }
    });

    const unsubActivity = onSnapshot(query(collection(db, 'jpc_activity_logs'), where('candidate_id', '==', id)), (snap) => {
      setActivityLogs(snap.docs.map(d => d.data() as ActivityLog).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
    });

    return () => {
      unsubCandidate();
      unsubPayments();
      unsubApps();
      unsubInterviews();
      unsubActivity();
    };
  }, [isAuthReady, user]);

  const paymentData = useMemo(() => {
    const total = candidate?.package_amount || 0;
    const paid = payments.filter(p => p.status === 'paid').reduce((sum, p) => sum + p.amount, 0);
    const pending = payments.filter(p => p.status === 'pending').reduce((sum, p) => sum + p.amount, 0);
    return [
      { name: 'Paid', value: paid, color: '#10B981' },
      { name: 'Pending', value: pending, color: '#F59E0B' },
      { name: 'Remaining', value: Math.max(0, total - paid - pending), color: '#6B7280' }
    ];
  }, [candidate, payments]);

  const activityData = useMemo(() => {
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return d.toISOString().split('T')[0];
    }).reverse();

    return last7Days.map(date => ({
      date: date.split('-').slice(1).join('/'),
      count: activityLogs.filter(log => log.created_at.startsWith(date)).length
    }));
  }, [activityLogs]);

  if (isLoading) {
    return (
      <div className="h-[60vh] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-accent-blue/30 border-t-accent-blue rounded-full animate-spin" />
      </div>
    );
  }

  if (!candidate) return null;

  const overduePayments = payments.filter(p => p.status === 'pending' && p.due_date && new Date(p.due_date) < new Date());

  const currentStageInfo = STAGES[candidate.current_stage];
  const stageIndex = Object.keys(STAGES).indexOf(candidate.current_stage);
  const totalStages = Object.keys(STAGES).length - 2; // Exclude completed and not_interested
  const progress = Math.min(100, Math.max(0, (stageIndex / totalStages) * 100));

  const handleDownloadResume = () => {
    const resumeUrl = candidate.resume_url || candidate.resume_base64;
    if (resumeUrl) {
      handleViewFile(resumeUrl, candidate.resume_filename || 'resume.pdf');
    }
  };

  const handleSubmitSupport = async () => {
    if (!supportType || !supportMessage.trim()) return;
    setIsSubmittingSupport(true);
    try {
      const logRef = doc(collection(db, 'jpc_activity_logs'));
      await setDoc(logRef, {
        id: logRef.id,
        candidate_id: candidate.id,
        candidate_name: candidate.full_name,
        type: 'support_request',
        action: `Requested ${supportType}`,
        details: supportMessage,
        timestamp: new Date().toISOString(),
        status: 'pending',
        assigned_to: candidate.assigned_cs || candidate.assigned_recruiter || 'admin',
        created_at: new Date().toISOString()
      });
      alert(`${supportType} request submitted successfully`);
      setIsSupportModalOpen(false);
      setSupportMessage('');
    } catch (error) {
      console.error('Error submitting support:', error);
      alert('Failed to submit request. Please try again.');
    } finally {
      setIsSubmittingSupport(false);
    }
  };

  const upcomingInterviews = interviews
    .filter(i => {
      const rounds = interviewRounds.filter(r => r.request_id === i.id);
      return rounds.some(r => r.booked_slot_time && new Date(r.booked_slot_time) > new Date());
    })
    .sort((a, b) => {
      const aTime = interviewRounds.find(r => r.request_id === a.id)?.booked_slot_time || '';
      const bTime = interviewRounds.find(r => r.request_id === b.id)?.booked_slot_time || '';
      return new Date(aTime).getTime() - new Date(bTime).getTime();
    });

  return (
    <div className="space-y-8 pb-10">
      {/* Support Request Modal */}
      <AnimatePresence>
        {isSupportModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-bg-secondary border border-border-primary rounded-3xl p-8 max-w-lg w-full shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-xl font-bold text-text-primary">{supportType}</h3>
                  <p className="text-sm text-text-secondary mt-1">Submit your request to our CS team</p>
                </div>
                <button onClick={() => setIsSupportModalOpen(false)} className="p-2 hover:bg-bg-tertiary rounded-xl transition-colors">
                  <X className="w-5 h-5 text-text-secondary" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-2">Message Details</label>
                  <textarea 
                    value={supportMessage}
                    onChange={(e) => setSupportMessage(e.target.value)}
                    placeholder={
                      supportType === 'Mock Interview' ? "Mention preferred tech stack and time slots..." :
                      supportType === 'Resume Briefing' ? "Which sections would you like us to review?" :
                      "How can we help you today?"
                    }
                    className="w-full bg-bg-tertiary border border-border-primary rounded-2xl p-4 text-text-primary text-sm min-h-[150px] focus:outline-none focus:ring-2 focus:ring-accent-blue/50"
                  />
                </div>
                <button 
                  onClick={handleSubmitSupport}
                  disabled={isSubmittingSupport || !supportMessage.trim()}
                  className="w-full py-4 bg-accent-blue text-white font-bold rounded-2xl hover:bg-accent-blue/90 transition-all shadow-lg shadow-accent-blue/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSubmittingSupport ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : 'Submit Request'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* JD Modal */}
      <AnimatePresence>
        {selectedJD && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-bg-secondary border border-border-primary rounded-3xl p-8 max-w-2xl w-full max-h-[80vh] overflow-y-auto custom-scrollbar shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-text-primary">Job Description</h3>
                <button onClick={() => setSelectedJD(null)} className="p-2 hover:bg-bg-tertiary rounded-xl transition-colors">
                  <X className="w-5 h-5 text-text-secondary" />
                </button>
              </div>
              <div className="prose prose-invert max-w-none">
                <p className="text-text-secondary whitespace-pre-wrap leading-relaxed">{selectedJD}</p>
              </div>
              <div className="mt-8 flex justify-end">
                <button 
                  onClick={() => setSelectedJD(null)}
                  className="px-6 py-2 bg-accent-blue text-white font-bold rounded-xl hover:bg-accent-blue/90 transition-colors"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Welcome Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-black text-text-primary tracking-tight">
              Hello, <span className="text-accent-blue">{candidate.full_name.split(' ')[0]}!</span>
            </h1>
            {candidate.is_free_trial && (
              <FreeTrialBadge 
                startDate={candidate.free_trial_start_date}
                endDate={candidate.free_trial_end_date}
                size="md"
                showDaysRemaining={true}
              />
            )}
          </div>
          <p className="text-text-secondary mt-1">Track your progress and manage your applications.</p>
        </div>
        <div className="flex items-center gap-2 p-1 bg-bg-secondary border border-border-primary rounded-2xl">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={cn(
              "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
              activeTab === 'dashboard' ? "bg-accent-blue text-white shadow-lg shadow-accent-blue/20" : "text-text-muted hover:text-text-primary hover:bg-bg-tertiary"
            )}
          >
            <LayoutDashboard className="w-4 h-4" />
            Overview
          </button>
          <button 
            onClick={() => setActiveTab('applications')}
            className={cn(
              "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
              activeTab === 'applications' ? "bg-accent-blue text-white shadow-lg shadow-accent-blue/20" : "text-text-muted hover:text-text-primary hover:bg-bg-tertiary"
            )}
          >
            <FileText className="w-4 h-4" />
            Links
          </button>
          <button 
            onClick={() => setActiveTab('interviews')}
            className={cn(
              "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
              activeTab === 'interviews' ? "bg-accent-blue text-white shadow-lg shadow-accent-blue/20" : "text-text-muted hover:text-text-primary hover:bg-bg-tertiary"
            )}
          >
            <Video className="w-4 h-4" />
            Interviews
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="space-y-8">
        {activeTab === 'dashboard' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-8">
              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-bg-secondary border border-border-primary rounded-3xl p-6 shadow-sm">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-accent-blue/10 flex items-center justify-center">
                      <FileText className="w-4 h-4 text-accent-blue" />
                    </div>
                    <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Total Links</span>
                  </div>
                  <p className="text-2xl font-black text-text-primary">{applications.length}</p>
                </div>
                <div className="bg-bg-secondary border border-border-primary rounded-3xl p-6 shadow-sm">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-accent-purple/10 flex items-center justify-center">
                      <Video className="w-4 h-4 text-accent-purple" />
                    </div>
                    <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Interviews</span>
                  </div>
                  <p className="text-2xl font-black text-text-primary">{interviews.length}</p>
                </div>
                <div className="bg-bg-secondary border border-border-primary rounded-3xl p-6 shadow-sm">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-accent-teal/10 flex items-center justify-center">
                      <CheckCircle className="w-4 h-4 text-accent-teal" />
                    </div>
                    <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Journey Progress</span>
                  </div>
                  <p className="text-2xl font-black text-text-primary">{Math.round((stageIndex / totalStages) * 100)}%</p>
                </div>
              </div>

              {/* Hiring Journey */}
              <div className="bg-bg-secondary border border-border-primary rounded-3xl p-8 shadow-sm">
                <h3 className="text-lg font-bold text-text-primary mb-6 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-accent-teal" />
                  Your Hiring Journey
                </h3>
                <div className="space-y-6">
                  <div className="h-2 bg-bg-tertiary rounded-full overflow-hidden">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${(stageIndex / totalStages) * 100}%` }} className="h-full bg-accent-blue" />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(STAGES).slice(0, 10).map(([key, info], idx) => (
                      <div key={key} className={cn(
                        "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border",
                        idx <= stageIndex ? "bg-accent-blue/10 text-accent-blue border-accent-blue/20" : "bg-bg-tertiary text-text-muted border-border-primary"
                      )}>
                        {info.label}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Upcoming Interview Highlight */}
              {upcomingInterviews.length > 0 && (
                <div className="bg-accent-blue/5 border border-accent-blue/20 rounded-3xl p-8 shadow-sm relative overflow-hidden">
                  <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div>
                      <span className="px-2 py-0.5 bg-accent-blue text-white text-[10px] font-bold rounded uppercase tracking-wider mb-3 inline-block">Upcoming Interview</span>
                      <h4 className="text-2xl font-black text-text-primary">{upcomingInterviews[0].interview_company_name || upcomingInterviews[0].company_name}</h4>
                      <p className="text-accent-blue font-bold mt-1">{upcomingInterviews[0].job_title}</p>
                    </div>
                    <div className="flex flex-wrap gap-4">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest mb-1">When</span>
                        <div className="flex items-center gap-2 text-text-primary font-bold">
                          <Clock className="w-4 h-4" />
                          {(() => {
                            const rounds = interviewRounds.filter(r => r.request_id === upcomingInterviews[0].id);
                            const next = rounds.find(r => r.booked_slot_time && new Date(r.booked_slot_time) > new Date());
                            return next ? new Date(next.booked_slot_time).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Pending';
                          })()}
                        </div>
                      </div>
                      <button 
                        onClick={() => setActiveTab('interviews')}
                        className="px-6 py-3 bg-accent-blue text-white font-bold rounded-2xl hover:bg-accent-blue/90 transition-all shadow-lg shadow-accent-blue/20"
                      >
                        View Details
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-8">
              {/* Quick Actions */}
              <div className="bg-bg-secondary border border-border-primary rounded-3xl p-8 shadow-sm">
                <h3 className="text-lg font-bold text-text-primary mb-6 flex items-center gap-2">
                  <Zap className="w-5 h-5 text-accent-amber" />
                  Quick Actions
                </h3>
                <div className="space-y-3">
                  <button 
                    onClick={() => { setSupportType('Mock Interview'); setIsSupportModalOpen(true); }}
                    className="w-full p-4 text-left bg-bg-tertiary hover:bg-accent-blue/5 rounded-2xl border border-border-primary hover:border-accent-blue/30 transition-all flex items-center justify-between group"
                  >
                    <span className="text-sm font-bold text-text-primary group-hover:text-accent-blue">Request Mock Interview</span>
                    <ChevronRight className="w-4 h-4 text-text-muted group-hover:text-accent-blue" />
                  </button>
                  <button 
                    onClick={() => { setSupportType('Resume Briefing'); setIsSupportModalOpen(true); }}
                    className="w-full p-4 text-left bg-bg-tertiary hover:bg-accent-purple/5 rounded-2xl border border-border-primary hover:border-accent-purple/30 transition-all flex items-center justify-between group"
                  >
                    <span className="text-sm font-bold text-text-primary group-hover:text-accent-purple">Resume Briefing</span>
                    <ChevronRight className="w-4 h-4 text-text-muted group-hover:text-accent-purple" />
                  </button>
                  <button 
                    onClick={() => { setSupportType('Technical Support'); setIsSupportModalOpen(true); }}
                    className="w-full p-4 text-left bg-bg-tertiary hover:bg-accent-amber/5 rounded-2xl border border-border-primary hover:border-accent-amber/30 transition-all flex items-center justify-between group"
                  >
                    <span className="text-sm font-bold text-text-primary group-hover:text-accent-amber">Support Ticket</span>
                    <ChevronRight className="w-4 h-4 text-text-muted group-hover:text-accent-amber" />
                  </button>
                </div>
              </div>

              {/* Resume Download */}
              <div className="bg-bg-secondary border border-border-primary rounded-3xl p-8 shadow-sm">
                <h3 className="text-lg font-bold text-text-primary mb-6 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-accent-blue" />
                  My Resume
                </h3>
                <div className="p-4 bg-bg-tertiary/50 rounded-2xl border border-border-primary/50 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-accent-blue/10 flex items-center justify-center">
                      <FileText className="w-5 h-5 text-accent-blue" />
                    </div>
                    <p className="text-xs font-bold text-text-primary truncate max-w-[120px]">{candidate.resume_filename || 'Resume.pdf'}</p>
                  </div>
                  <button onClick={handleDownloadResume} className="p-2 bg-bg-secondary border border-border-primary rounded-lg text-text-primary hover:text-accent-blue transition-all">
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'applications' && (
          <div className="bg-bg-secondary border border-border-primary rounded-3xl p-8 shadow-sm">
            <h3 className="text-2xl font-black text-text-primary mb-8">Applied Links Portfolio</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {paginatedApps.map((app) => (
                <div key={app.id} className="p-6 bg-bg-tertiary/50 rounded-3xl border border-border-primary/50 group hover:border-accent-blue/30 transition-all">
                  <div className="flex items-start justify-between mb-6">
                    <div className="w-12 h-12 rounded-2xl bg-bg-secondary border border-border-primary flex items-center justify-center">
                      <ExternalLink className="w-6 h-6 text-text-muted group-hover:text-accent-blue transition-colors" />
                    </div>
                    <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">{new Date(app.applied_at).toLocaleDateString()}</span>
                  </div>
                  <h4 className="text-lg font-black text-text-primary line-clamp-1">{app.company_name}</h4>
                  <p className="text-sm text-text-secondary mt-1 line-clamp-1">{app.job_title}</p>
                  <a 
                    href={app.job_link} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="mt-6 w-full py-3 bg-bg-secondary border border-border-primary rounded-xl text-xs font-bold text-text-primary hover:bg-accent-blue hover:text-white hover:border-accent-blue transition-all flex items-center justify-center gap-2"
                  >
                    Go to Portal <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              ))}
            </div>

            {totalAppPages > 1 && (
              <div className="mt-12 flex items-center justify-center gap-4">
                <button 
                  onClick={() => setAppsPage(p => Math.max(1, p - 1))}
                  disabled={appsPage === 1}
                  className="p-2 rounded-xl border border-border-primary disabled:opacity-30"
                >
                  <ChevronRight className="w-5 h-5 rotate-180" />
                </button>
                <span className="text-sm font-bold text-text-primary">Page {appsPage} of {totalAppPages}</span>
                <button 
                  onClick={() => setAppsPage(p => Math.min(totalAppPages, p + 1))}
                  disabled={appsPage === totalAppPages}
                  className="p-2 rounded-xl border border-border-primary disabled:opacity-30"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'interviews' && (
          <div className="bg-bg-secondary border border-border-primary rounded-3xl p-8 shadow-sm">
            <h3 className="text-2xl font-black text-text-primary mb-8">Interview Schedule</h3>
            <div className="space-y-6">
              {interviews.map((interview) => {
                const rounds = interviewRounds.filter(r => r.request_id === interview.id);
                const isUpcoming = rounds.some(r => r.booked_slot_time && new Date(r.booked_slot_time) > new Date());
                
                return (
                  <div key={interview.id} className={cn(
                    "p-8 rounded-3xl border transition-all",
                    isUpcoming ? "border-accent-blue bg-accent-blue/5" : "border-border-primary bg-bg-tertiary/30"
                  )}>
                    <div className="flex flex-col lg:flex-row justify-between gap-8">
                      <div className="flex-1 space-y-6">
                        <div className="flex items-start justify-between">
                          <div>
                            <h4 className="text-2xl font-black text-text-primary">{interview.interview_company_name || interview.company_name}</h4>
                            <p className="text-lg text-accent-blue font-bold">{interview.job_title}</p>
                          </div>
                          <span className="px-4 py-1 rounded-xl bg-bg-secondary border border-border-primary text-[10px] font-bold uppercase tracking-widest">
                            {interview.overall_status.replace('_', ' ')}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-4">
                            <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Round Details</p>
                            {rounds.length > 0 ? rounds.map((round) => (
                              <div key={round.id} className="p-4 bg-bg-secondary rounded-2xl border border-border-primary/50 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                  <div className="w-10 h-10 rounded-xl bg-accent-purple/10 flex items-center justify-center">
                                    <Clock className="w-5 h-5 text-accent-purple" />
                                  </div>
                                  <div>
                                    <p className="text-sm font-bold text-text-primary">{round.round_label}</p>
                                    <p className="text-xs text-text-secondary">{round.booked_slot_time ? new Date(round.booked_slot_time).toLocaleString() : 'TBD'}</p>
                                  </div>
                                </div>
                                <span className="text-[10px] font-bold text-accent-purple">{round.status}</span>
                              </div>
                            )) : (
                              <p className="text-xs text-text-muted italic">No rounds scheduled yet.</p>
                            )}
                          </div>
                          <div className="space-y-4">
                            <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Job Information</p>
                            <div className="p-6 bg-bg-secondary rounded-2xl border border-border-primary/50 space-y-4">
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-text-muted">Type:</span>
                                <span className="font-bold text-text-primary capitalize">{interview.interview_type.replace('_', ' ')}</span>
                              </div>
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-text-muted">Timezone:</span>
                                <span className="font-bold text-text-primary">{interview.timezone}</span>
                              </div>
                              <button 
                                onClick={() => interview.job_description ? setSelectedJD(interview.job_description) : window.open(interview.job_link, '_blank')}
                                className="w-full py-3 bg-accent-blue text-white text-xs font-bold rounded-xl hover:bg-accent-blue/90 transition-all"
                              >
                                View Job Description
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {interviews.length === 0 && (
                <div className="py-20 text-center text-text-muted italic">No interviews scheduled yet.</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
