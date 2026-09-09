import React, { useState, useEffect, useRef } from 'react';
import { Modal } from './Modal';
import { LEAD_SOURCES } from '../constants';
import { 
  generateId, 
  saveCandidate, 
  seedQCChecklist, 
  logActivity, 
  addNotification, 
  checkDuplicateCandidate, 
  addFollowUp,
  advanceLeadRoundRobin
} from '../services/storage';
import { uploadFile } from '../services/fileService';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Candidate } from '../types';
import { cn } from '../lib/utils';
import { parseResume } from '../services/aiService';
import { FileText, Upload, Loader2, Sparkles, Brain, Search, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface AddCandidateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const AddCandidateModal: React.FC<AddCandidateModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [isParsing, setIsParsing] = useState(false);
  const [parsingStep, setParsingStep] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parsingSteps = [
    { icon: FileText, text: '📄 Reading resume file...', color: 'text-accent-blue' },
    { icon: Brain, text: '🧠 Analyzing structure...', color: 'text-accent-purple' },
    { icon: Search, text: '🔍 Extracting candidate details...', color: 'text-accent-teal' },
    { icon: Sparkles, text: '✨ Finalizing data...', color: 'text-accent-amber' }
  ];

  useEffect(() => {
    let interval: any;
    if (isParsing) {
      setParsingStep(0);
      interval = setInterval(() => {
        setParsingStep(prev => (prev < parsingSteps.length - 1 ? prev + 1 : prev));
      }, 1500);
    }
    return () => clearInterval(interval);
  }, [isParsing]);

  const [formData, setFormData] = useState({
    full_name: '',
    phone: '',
    whatsapp: '',
    email: '',
    job_interest: '',
    domain_interested: '',
    location: '',
    education: '',
    lead_source: 'Facebook',
    notes: '',
    marketing_entity: [] as ('sivium' | 'recruiter')[],
    schedule_call_date: '',
    schedule_call_time: '',
    schedule_call_timezone: 'EST (Eastern Time)'
  });

  const [extraData, setExtraData] = useState({
    degree: '',
    university: '',
    graduation_year: '',
    experience_years: '',
    current_designation: '',
    skills: '',
    linkedin_url: ''
  });

  const [resumeData, setResumeData] = useState<{ base64: string | null, url: string | null, filename: string | null }>({
    base64: null,
    url: null,
    filename: null
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file type broadly
    const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword', 'text/plain'];
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    const isAllowedExtension = ['pdf', 'doc', 'docx', 'txt'].includes(fileExtension || '');
    
    if (!allowedTypes.includes(file.type) && !isAllowedExtension) {
      showToast('Please upload a PDF, DOC, DOCX, or Text file', 'error');
      return;
    }

    setIsParsing(true);
    try {
      // 1. Upload to external API and save to Firestore repository
      const url = await uploadFile(file, {
        name: formData.full_name || file.name.split('.')[0],
        email: formData.email || 'Not Provided',
        phone: formData.phone || ''
      });
      
      // 2. Read locally for parsing and wait for it
      await new Promise<void>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (event) => {
          try {
            const fullBase64 = event.target?.result?.toString();
            const base64 = fullBase64?.split(',')[1];
            if (base64) {
              setResumeData({
                base64: url,
                url: url,
                filename: file.name
              });
              const parsed = await parseResume(base64, file.type);
              if (parsed) {
                setFormData(prev => ({
                  ...prev,
                  full_name: parsed.full_name || prev.full_name,
                  phone: parsed.phone || prev.phone,
                  email: parsed.email || prev.email,
                  job_interest: parsed.job_interest || prev.job_interest,
                  location: parsed.location || prev.location,
                  education: parsed.education || prev.education,
                  notes: parsed.notes || prev.notes
                }));
                setExtraData({
                  degree: parsed.degree || '',
                  university: parsed.university || '',
                  graduation_year: parsed.graduation_year || '',
                  experience_years: parsed.experience_years || '',
                  current_designation: parsed.current_designation || '',
                  skills: parsed.skills || '',
                  linkedin_url: parsed.linkedin_url || ''
                });
                showToast('Resume parsed successfully!', 'success');
              } else {
                showToast('Failed to parse resume details', 'error');
              }
            }
            resolve();
          } catch (e: any) {
            console.error("FileReader onload error:", e);
            reject(e);
          }
        };
        reader.onerror = (e) => reject(e);
        reader.readAsDataURL(file);
      });
    } catch (error: any) {
      console.error('Error uploading/reading file:', error);
      showToast(error.message || 'Error processing file', 'error');
    } finally {
      setIsParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.full_name || !formData.phone) {
      showToast('Name and Phone are required', 'error');
      return;
    }

    const duplicateError = await checkDuplicateCandidate(formData.phone, formData.email, formData.whatsapp);
    if (duplicateError) {
      showToast(duplicateError, 'error');
      return;
    }

    const id = generateId();

    // Advance Round-Robin assignment automatically
    let finalAssignedSales: string | null = null;
    let assignedSalesDisplayName = '';
    try {
      const rrResult = await advanceLeadRoundRobin(
        id,
        formData.full_name
      );
      if (rrResult?.assignedUser) {
        finalAssignedSales = String(rrResult.assignedUser.id);
        assignedSalesDisplayName = rrResult.assignedUser.display_name;
      }
    } catch (rrErr) {
      console.error('Failed to advance round robin assignment:', rrErr);
    }

    const newCandidate: Candidate = {
      id,
      full_name: formData.full_name,
      phone: formData.phone,
      whatsapp: formData.whatsapp,
      email: formData.email,
      job_interest: formData.job_interest,
      domain_interested: formData.domain_interested,
      location: formData.location,
      education: formData.education,
      degree: extraData.degree,
      university: extraData.university,
      graduation_year: extraData.graduation_year,
      experience_years: extraData.experience_years,
      current_company: 'N/A',
      current_designation: extraData.current_designation,
      skills: extraData.skills,
      linkedin_url: extraData.linkedin_url,
      lead_source: formData.lead_source,
      lead_generated_by: user?.id || null,
      assigned_sales: finalAssignedSales || null,
      assigned_cs: null,
      assigned_resume: null,
      assigned_marketing_leader: null,
      assigned_recruiter: null,
      assigned_marketing: null,
      package_name: '',
      package_amount: 0,
      domain_suggested: '',
      marketing_entity: formData.marketing_entity,
      notes: formData.notes,
      current_stage: 'lead_generation',
      resume_url: resumeData.url,
      resume_base64: resumeData.base64,
      resume_filename: resumeData.filename,
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
      not_interested_at: null,
      deleted_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    await saveCandidate(newCandidate, user?.id ? String(user.id) : null);
    await seedQCChecklist(id);
    const assignedLogText = assignedSalesDisplayName
      ? `Assigned to ${assignedSalesDisplayName} via Round-Robin rotation.`
      : `Candidate ${formData.full_name} created as Unassigned (no active sales rep available).`;
    logActivity(id, 'Candidate created', `Candidate ${formData.full_name} added to the system. ${assignedLogText}`, user?.id ? String(user.id) : null);
    
    if (finalAssignedSales) {
      addNotification({
        recipient_id: finalAssignedSales,
        sender_id: user?.id || null,
        type: 'system_alert',
        message: `You have been automatically assigned to a new candidate via Round-Robin: ${formData.full_name}`
      });
    }

    if (formData.schedule_call_date && formData.schedule_call_time) {
      const timezoneStr = formData.schedule_call_timezone || 'EST (Eastern Time)';
      const t12 = new Date(`1970-01-01T${formData.schedule_call_time}:00`).toLocaleTimeString('en-US', { hour: 'numeric', minute: 'numeric', hour12: true });
      addFollowUp({
        candidate_id: id,
        stage: 'lead_generation',
        followup_date: formData.schedule_call_date,
        note: `Initial Call Scheduled at ${t12} ${timezoneStr}`,
        done: false,
        created_by: user?.id || null,
      });
      logActivity(id, 'Follow-up scheduled', `Scheduled initial call for ${formData.schedule_call_date} at ${t12} ${timezoneStr}`, user?.id || null);
    }

    showToast('Candidate added successfully', 'success');
    onSuccess();
    onClose();
    setFormData({
      full_name: '',
      phone: '',
      whatsapp: '',
      email: '',
      job_interest: '',
      domain_interested: '',
      location: '',
      education: '',
      lead_source: 'Facebook',
      notes: '',
      marketing_entity: [],
      schedule_call_date: '',
      schedule_call_time: '',
      schedule_call_timezone: 'EST (Eastern Time)'
    });
    setResumeData({ base64: null, url: null, filename: null });
    setExtraData({
      degree: '',
      university: '',
      graduation_year: '',
      experience_years: '',
      current_designation: '',
      skills: '',
      linkedin_url: ''
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isParsing ? "AI Parsing in Progress" : "Add New Candidate"}
      footer={!isParsing ? (
        <>
          <div className="mr-auto">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              className="hidden"
              accept=".pdf,.doc,.docx,.txt"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isParsing}
              className="flex items-center gap-2 px-4 py-2 bg-bg-tertiary text-text-primary font-medium rounded-xl hover:bg-bg-tertiary/80 transition-all disabled:opacity-50"
            >
              <Upload className="w-4 h-4" />
              Upload Resume
            </button>
          </div>
          <button 
            onClick={onClose}
            className="px-4 py-2 text-text-secondary font-medium hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit}
            className="px-6 py-2 bg-accent-blue text-white font-bold rounded-xl hover:bg-accent-blue/90 transition-all shadow-lg shadow-accent-blue/20"
          >
            Save Candidate
          </button>
        </>
      ) : null}
    >
      <div className="relative min-h-[400px] flex items-center justify-center">
        <AnimatePresence mode="wait">
          {isParsing ? (
            <motion.div
              key="preloader"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1 }}
              className="flex flex-col items-center justify-center p-8 text-center w-full"
            >
              <div className="relative mb-12">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                  className="w-32 h-32 border-4 border-accent-blue/10 border-t-accent-blue rounded-full shadow-[0_0_20px_rgba(0,173,140,0.2)]"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <motion.div
                    key={parsingStep}
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", damping: 12 }}
                  >
                    {React.createElement(parsingSteps[parsingStep].icon, { 
                      className: cn("w-12 h-12", parsingSteps[parsingStep].color) 
                    })}
                  </motion.div>
                </div>
              </div>
              
              <motion.div
                key={parsingStep}
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="space-y-4"
              >
                <h3 className="text-2xl font-bold text-text-primary tracking-tight">AI is working...</h3>
                <p className="text-lg text-text-secondary font-medium min-h-[1.5em]">
                  {parsingSteps[parsingStep].text}
                </p>
              </motion.div>

              <div className="mt-12 flex gap-3">
                {parsingSteps.map((_, idx) => (
                  <div 
                    key={idx}
                    className={cn(
                      "h-1.5 rounded-full transition-all duration-700",
                      idx === parsingStep ? "bg-accent-blue w-12" : 
                      idx < parsingStep ? "bg-accent-blue/40 w-4" : "bg-bg-tertiary w-4"
                    )}
                  />
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.form 
              key="form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full"
            >
        <div className="space-y-1">
          <label className="text-xs font-bold text-text-secondary uppercase tracking-wider">Full Name *</label>
          <input
            type="text"
            value={formData.full_name}
            onChange={e => setFormData({ ...formData, full_name: e.target.value })}
            className="w-full bg-bg-tertiary border border-border-primary rounded-xl px-4 py-2.5 text-text-primary focus:outline-none focus:border-accent-blue transition-colors"
            placeholder="John Doe"
            required
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-bold text-text-secondary uppercase tracking-wider">Phone *</label>
          <input
            type="text"
            value={formData.phone}
            onChange={e => setFormData({ ...formData, phone: e.target.value })}
            className="w-full bg-bg-tertiary border border-border-primary rounded-xl px-4 py-2.5 text-text-primary focus:outline-none focus:border-accent-blue transition-colors"
            placeholder="+91 00000 00000"
            required
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-bold text-text-secondary uppercase tracking-wider">WhatsApp</label>
          <input
            type="text"
            value={formData.whatsapp}
            onChange={e => setFormData({ ...formData, whatsapp: e.target.value })}
            className="w-full bg-bg-tertiary border border-border-primary rounded-xl px-4 py-2.5 text-text-primary focus:outline-none focus:border-accent-blue transition-colors"
            placeholder="Same as phone"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-bold text-text-secondary uppercase tracking-wider">Email</label>
          <input
            type="email"
            value={formData.email}
            onChange={e => setFormData({ ...formData, email: e.target.value })}
            className="w-full bg-bg-tertiary border border-border-primary rounded-xl px-4 py-2.5 text-text-primary focus:outline-none focus:border-accent-blue transition-colors"
            placeholder="john@example.com"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-bold text-text-secondary uppercase tracking-wider">Job Interest</label>
          <input
            type="text"
            value={formData.job_interest}
            onChange={e => setFormData({ ...formData, job_interest: e.target.value })}
            className="w-full bg-bg-tertiary border border-border-primary rounded-xl px-4 py-2.5 text-text-primary focus:outline-none focus:border-accent-blue transition-colors"
            placeholder="e.g. Software Engineer"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-bold text-text-secondary uppercase tracking-wider">Location</label>
          <input
            type="text"
            value={formData.location}
            onChange={e => setFormData({ ...formData, location: e.target.value })}
            className="w-full bg-bg-tertiary border border-border-primary rounded-xl px-4 py-2.5 text-text-primary focus:outline-none focus:border-accent-blue transition-colors"
            placeholder="e.g. Bangalore"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-bold text-text-secondary uppercase tracking-wider">Lead Source</label>
          <select
            value={formData.lead_source}
            onChange={e => setFormData({ ...formData, lead_source: e.target.value })}
            className="w-full bg-bg-tertiary border border-border-primary rounded-xl px-4 py-2.5 text-text-primary focus:outline-none focus:border-accent-blue transition-colors"
          >
            {LEAD_SOURCES.map(source => (
              <option key={source} value={source}>{source}</option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-text-secondary uppercase tracking-wider">Schedule Call Date</label>
            <input
              type="date"
              value={formData.schedule_call_date}
              onChange={e => setFormData({ ...formData, schedule_call_date: e.target.value })}
              className="w-full bg-bg-tertiary border border-border-primary rounded-xl px-4 py-2.5 text-text-primary focus:outline-none focus:border-accent-blue transition-colors"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-text-secondary uppercase tracking-wider">Call Time</label>
            <input
              type="time"
              value={formData.schedule_call_time}
              onChange={e => setFormData({ ...formData, schedule_call_time: e.target.value })}
              className="w-full bg-bg-tertiary border border-border-primary rounded-xl px-4 py-2.5 text-text-primary focus:outline-none focus:border-accent-blue transition-colors"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-text-secondary uppercase tracking-wider">Timezone (US)</label>
            <select
              value={formData.schedule_call_timezone}
              onChange={e => setFormData({ ...formData, schedule_call_timezone: e.target.value })}
              className="w-full bg-bg-tertiary border border-border-primary rounded-xl px-4 py-2.5 text-text-primary focus:outline-none focus:border-accent-blue transition-colors"
            >
              <option value="EST (Eastern Time)">EST (Eastern Time)</option>
              <option value="CST (Central Time)">CST (Central Time)</option>
              <option value="MST (Mountain Time)">MST (Mountain Time)</option>
              <option value="PST (Pacific Time)">PST (Pacific Time)</option>
              <option value="AST (Alaska Time)">AST (Alaska Time)</option>
              <option value="HST (Hawaii Time)">HST (Hawaii Time)</option>
            </select>
          </div>
        </div>
        <div className="md:col-span-2 space-y-1">
          <label className="text-xs font-bold text-text-secondary uppercase tracking-wider">Notes</label>
          <textarea
            value={formData.notes}
            onChange={e => setFormData({ ...formData, notes: e.target.value })}
            className="w-full bg-bg-tertiary border border-border-primary rounded-xl px-4 py-2.5 text-text-primary focus:outline-none focus:border-accent-blue transition-colors min-h-[100px]"
            placeholder="Any additional details..."
          />
        </div>
      </motion.form>
    )}
  </AnimatePresence>
</div>
</Modal>
);
};
