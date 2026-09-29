import React, { useState, useEffect, useRef } from 'react';
import { X, Upload, FileText, Sparkles, User as UserIcon, Phone, Mail, MapPin, DollarSign, Briefcase } from 'lucide-react';
import { Candidate, User } from '../../types';
import { LEAD_SOURCES } from '../../constants';
import {
  createAurrumCandidate,
  updateAurrumCandidate,
  checkDuplicateCandidate,
  addAurrumFollowUp,
} from '../../services/storage';
import { uploadFile, handleViewFile } from '../../services/fileService';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { cn } from '../../lib/utils';

interface AurrumCandidateModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidate?: Candidate | null;
  salesUsers: User[];
  onSuccess?: (saved: Candidate) => void;
}

export const AURRUM_STAGES: {
  value: NonNullable<Candidate['aurrum_stage']>;
  label: string;
  color: string;
}[] = [
  { value: 'lead', label: '1. Candidate / Lead', color: '#3B82F6' },
  { value: 'sales', label: '2. In Sales', color: '#F59E0B' },
  { value: 'converted', label: '3. Sales Converted', color: '#10B981' },
  { value: 'interview_support', label: '4. Interview Support', color: '#8B5CF6' },
  { value: 'not_interested', label: 'Not Interested', color: '#6B7280' },
  { value: 'not_eligible', label: 'Not Eligible', color: '#F43F5E' },
];

export const AURRUM_SALES_STATUSES: NonNullable<Candidate['aurrum_sales_status']>[] = [
  'New Lead',
  'Contacted',
  'Follow-Up',
  'Interested',
  'Converted',
  'Not Interested',
  'Not Eligible',
];

export const resolveAurrumStage = (c: Candidate): NonNullable<Candidate['aurrum_stage']> => {
  if (c.aurrum_stage) return c.aurrum_stage;
  if (c.current_stage === 'interviewing') return 'interview_support';
  if (c.current_stage === 'sales') return 'sales';
  if (c.current_stage === 'not_interested') return 'not_interested';
  if (c.current_stage === 'not_eligible') return 'not_eligible';
  return 'lead';
};

export const AurrumCandidateModal: React.FC<AurrumCandidateModalProps> = ({
  isOpen,
  onClose,
  candidate,
  salesUsers,
  onSuccess,
}) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [followupDate, setFollowupDate] = useState('');
  const [followupNote, setFollowupNote] = useState('');

  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    phone: '',
    whatsapp: '',
    job_interest: '',
    domain_interested: '',
    location: '',
    experience_years: '',
    skills: '',
    lead_source: 'LinkedIn',
    assigned_sales: '',
    package_name: 'Aurrum Interview Support',
    package_amount: 0,
    aurrum_stage: 'lead' as NonNullable<Candidate['aurrum_stage']>,
    aurrum_sales_status: 'New Lead' as NonNullable<Candidate['aurrum_sales_status']>,
    notes: '',
  });

  useEffect(() => {
    if (candidate) {
      setFormData({
        full_name: candidate.full_name || '',
        email: candidate.email || '',
        phone: candidate.phone || '',
        whatsapp: candidate.whatsapp || candidate.phone || '',
        job_interest: candidate.job_interest || '',
        domain_interested: candidate.domain_interested || '',
        location: candidate.location || '',
        experience_years: candidate.experience_years || '',
        skills: candidate.skills || '',
        lead_source: candidate.lead_source || 'LinkedIn',
        assigned_sales: candidate.assigned_sales ? String(candidate.assigned_sales) : '',
        package_name: candidate.package_name || 'Aurrum Interview Support',
        package_amount: Number(candidate.package_amount) || 0,
        aurrum_stage: resolveAurrumStage(candidate),
        aurrum_sales_status: candidate.aurrum_sales_status || 'New Lead',
        notes: candidate.notes || '',
      });
    } else {
      setFormData({
        full_name: '',
        email: '',
        phone: '',
        whatsapp: '',
        job_interest: '',
        domain_interested: '',
        location: '',
        experience_years: '',
        skills: '',
        lead_source: 'LinkedIn',
        assigned_sales: user?.role === 'jpc_sales' ? String(user.id) : '',
        package_name: 'Aurrum Interview Support',
        package_amount: 0,
        aurrum_stage: 'lead',
        aurrum_sales_status: 'New Lead',
        notes: '',
      });
    }
    setResumeFile(null);
    setFollowupDate('');
    setFollowupNote('');
  }, [candidate, isOpen, user]);

  if (!isOpen) return null;

  const mapAurrumStageToSystemStage = (stage: NonNullable<Candidate['aurrum_stage']>): Candidate['current_stage'] => {
    switch (stage) {
      case 'sales':
        return 'sales';
      case 'converted':
      case 'interview_support':
        return 'interviewing';
      case 'not_interested':
        return 'not_interested';
      case 'not_eligible':
        return 'not_eligible';
      default:
        return 'lead_generation';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.full_name.trim()) {
      showToast('Candidate full name is required.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      if (!candidate) {
        const dupError = await checkDuplicateCandidate(
          formData.phone,
          formData.email,
          formData.whatsapp,
          'aurrum'
        );
        if (dupError) {
          showToast(dupError, 'error');
          setIsSubmitting(false);
          return;
        }
      }

      let uploadedResumeUrl = candidate?.resume_url || null;
      let uploadedResumeFilename = candidate?.resume_filename || null;

      if (resumeFile) {
        uploadedResumeUrl = await uploadFile(resumeFile, {
          name: formData.full_name.trim(),
          email: formData.email.trim(),
          phone: formData.phone.trim(),
        });
        uploadedResumeFilename = resumeFile.name;
      }

      const mappedStage = mapAurrumStageToSystemStage(formData.aurrum_stage);

      if (candidate) {
        const updates: Partial<Candidate> = {
          full_name: formData.full_name.trim(),
          email: formData.email.trim().toLowerCase(),
          phone: formData.phone.trim(),
          whatsapp: (formData.whatsapp || formData.phone).trim(),
          job_interest: formData.job_interest.trim(),
          domain_interested: formData.domain_interested.trim(),
          location: formData.location.trim(),
          experience_years: formData.experience_years.trim(),
          skills: formData.skills.trim(),
          lead_source: formData.lead_source,
          assigned_sales: formData.assigned_sales || null,
          package_name: formData.package_name.trim(),
          package_amount: Number(formData.package_amount) || 0,
          aurrum_stage: formData.aurrum_stage,
          aurrum_sales_status: formData.aurrum_sales_status,
          current_stage: mappedStage,
          notes: formData.notes.trim(),
          resume_url: uploadedResumeUrl,
          resume_base64: uploadedResumeUrl,
          resume_filename: uploadedResumeFilename,
          crm_brand: 'aurrum',
        };
        await updateAurrumCandidate(candidate.id, updates);

        if (followupDate) {
          await addAurrumFollowUp({
            candidate_id: candidate.id,
            stage: formData.aurrum_stage,
            followup_date: followupDate,
            note: followupNote.trim() || 'Scheduled Aurrum Sales Follow-up',
            done: false,
            created_by: user?.id || null,
          });
        }

        showToast('Aurrum candidate updated successfully!', 'success');
        onSuccess?.({ ...candidate, ...updates });
      } else {
        const created = await createAurrumCandidate(
          {
            full_name: formData.full_name.trim(),
            email: formData.email.trim().toLowerCase(),
            phone: formData.phone.trim(),
            whatsapp: (formData.whatsapp || formData.phone).trim(),
            job_interest: formData.job_interest.trim(),
            domain_interested: formData.domain_interested.trim(),
            location: formData.location.trim(),
            experience_years: formData.experience_years.trim(),
            skills: formData.skills.trim(),
            lead_source: formData.lead_source,
            assigned_sales: formData.assigned_sales || null,
            package_name: formData.package_name.trim(),
            package_amount: Number(formData.package_amount) || 0,
            aurrum_stage: formData.aurrum_stage,
            aurrum_sales_status: formData.aurrum_sales_status,
            current_stage: mappedStage,
            notes: formData.notes.trim(),
            resume_url: uploadedResumeUrl,
            resume_base64: uploadedResumeUrl,
            resume_filename: uploadedResumeFilename,
          },
          user?.id ? String(user.id) : null
        );

        if (followupDate) {
          await addAurrumFollowUp({
            candidate_id: created.id,
            stage: formData.aurrum_stage,
            followup_date: followupDate,
            note: followupNote.trim() || 'Initial Aurrum Sales Follow-up',
            done: false,
            created_by: user?.id || null,
          });
        }

        showToast('Aurrum candidate added!', 'success');
        onSuccess?.(created);
      }

      onClose();
    } catch (error) {
      console.error('Error saving Aurrum candidate:', error);
      showToast('Failed to save Aurrum candidate.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-bg-secondary border border-border-primary rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-border-primary bg-bg-tertiary flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-[10px] font-black uppercase tracking-widest text-amber-500">
                Aurrum Careers Candidate
              </span>
            </div>
            <h2 className="text-xl font-black text-text-primary mt-0.5">
              {candidate ? `Edit Candidate: ${candidate.full_name}` : 'Add Aurrum Candidate'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-bg-secondary border border-border-primary text-text-secondary hover:text-text-primary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-text-muted mb-1.5">
                Full Name *
              </label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-text-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  required
                  type="text"
                  value={formData.full_name}
                  onChange={e => setFormData({ ...formData, full_name: e.target.value })}
                  placeholder="Candidate Full Name"
                  className="w-full pl-10 pr-4 py-2.5 bg-bg-tertiary border border-border-primary rounded-xl text-sm text-text-primary focus:border-accent-blue outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-text-muted mb-1.5">
                Email Address *
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-text-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  required
                  type="email"
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                  placeholder="candidate@example.com"
                  className="w-full pl-10 pr-4 py-2.5 bg-bg-tertiary border border-border-primary rounded-xl text-sm text-text-primary focus:border-accent-blue outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-text-muted mb-1.5">
                Phone Number *
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-text-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  required
                  type="tel"
                  value={formData.phone}
                  onChange={e => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+1 (555) 000-0000"
                  className="w-full pl-10 pr-4 py-2.5 bg-bg-tertiary border border-border-primary rounded-xl text-sm text-text-primary focus:border-accent-blue outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-text-muted mb-1.5">
                WhatsApp Number
              </label>
              <input
                type="tel"
                value={formData.whatsapp}
                onChange={e => setFormData({ ...formData, whatsapp: e.target.value })}
                placeholder="Defaults to Phone if blank"
                className="w-full px-4 py-2.5 bg-bg-tertiary border border-border-primary rounded-xl text-sm text-text-primary focus:border-accent-blue outline-none"
              />
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-text-muted mb-1.5">
                Target Role / Job Interest
              </label>
              <div className="relative">
                <Briefcase className="w-4 h-4 text-text-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={formData.job_interest}
                  onChange={e => setFormData({ ...formData, job_interest: e.target.value })}
                  placeholder="e.g. Senior Java Developer"
                  className="w-full pl-10 pr-4 py-2.5 bg-bg-tertiary border border-border-primary rounded-xl text-sm text-text-primary focus:border-accent-blue outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-text-muted mb-1.5">
                Location
              </label>
              <div className="relative">
                <MapPin className="w-4 h-4 text-text-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={formData.location}
                  onChange={e => setFormData({ ...formData, location: e.target.value })}
                  placeholder="City, State"
                  className="w-full pl-10 pr-4 py-2.5 bg-bg-tertiary border border-border-primary rounded-xl text-sm text-text-primary focus:border-accent-blue outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-text-muted mb-1.5">
                Aurrum Flow Stage
              </label>
              <select
                value={formData.aurrum_stage}
                onChange={e =>
                  setFormData({
                    ...formData,
                    aurrum_stage: e.target.value as NonNullable<Candidate['aurrum_stage']>,
                  })
                }
                className="w-full px-4 py-2.5 bg-bg-tertiary border border-border-primary rounded-xl text-sm font-bold text-text-primary focus:border-accent-blue outline-none cursor-pointer"
              >
                {AURRUM_STAGES.map(st => (
                  <option key={st.value} value={st.value}>
                    {st.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-text-muted mb-1.5">
                Aurrum Sales Status
              </label>
              <select
                value={formData.aurrum_sales_status}
                onChange={e =>
                  setFormData({
                    ...formData,
                    aurrum_sales_status: e.target.value as NonNullable<Candidate['aurrum_sales_status']>,
                  })
                }
                className="w-full px-4 py-2.5 bg-bg-tertiary border border-border-primary rounded-xl text-sm font-bold text-text-primary focus:border-accent-blue outline-none cursor-pointer"
              >
                {AURRUM_SALES_STATUSES.map(status => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-text-muted mb-1.5">
                Lead Source
              </label>
              <select
                value={formData.lead_source}
                onChange={e => setFormData({ ...formData, lead_source: e.target.value })}
                className="w-full px-4 py-2.5 bg-bg-tertiary border border-border-primary rounded-xl text-sm text-text-primary focus:border-accent-blue outline-none cursor-pointer"
              >
                {LEAD_SOURCES.map(src => (
                  <option key={src} value={src}>
                    {src}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-text-muted mb-1.5">
                Assigned Sales Executive
              </label>
              <select
                value={formData.assigned_sales}
                onChange={e => setFormData({ ...formData, assigned_sales: e.target.value })}
                className="w-full px-4 py-2.5 bg-bg-tertiary border border-border-primary rounded-xl text-sm text-text-primary focus:border-accent-blue outline-none cursor-pointer"
              >
                <option value="">Unassigned</option>
                {salesUsers.map(u => (
                  <option key={String(u.id)} value={String(u.id)}>
                    {u.display_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-text-muted mb-1.5">
                Package / Service Plan
              </label>
              <input
                type="text"
                value={formData.package_name}
                onChange={e => setFormData({ ...formData, package_name: e.target.value })}
                placeholder="Aurrum Interview Support"
                className="w-full px-4 py-2.5 bg-bg-tertiary border border-border-primary rounded-xl text-sm text-text-primary focus:border-accent-blue outline-none"
              />
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-text-muted mb-1.5">
                Package Amount ($)
              </label>
              <div className="relative">
                <DollarSign className="w-4 h-4 text-text-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="number"
                  min={0}
                  value={formData.package_amount}
                  onChange={e => setFormData({ ...formData, package_amount: Number(e.target.value) || 0 })}
                  className="w-full pl-10 pr-4 py-2.5 bg-bg-tertiary border border-border-primary rounded-xl text-sm text-text-primary focus:border-accent-blue outline-none"
                />
              </div>
            </div>
          </div>

          {/* Resume Upload */}
          <div className="space-y-2">
            <label className="block text-[10px] font-black uppercase tracking-wider text-text-muted">
              Candidate Resume (PDF / DOCX)
            </label>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 py-3 px-4 border-2 border-dashed border-border-primary hover:border-accent-blue rounded-xl flex items-center justify-center gap-2 text-xs font-bold text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
              >
                <Upload className="w-4 h-4 text-accent-blue" />
                <span>
                  {resumeFile
                    ? resumeFile.name
                    : candidate?.resume_filename
                    ? `Replace (${candidate.resume_filename})`
                    : 'Upload Candidate Resume'}
                </span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx"
                className="hidden"
                onChange={e => {
                  if (e.target.files?.[0]) setResumeFile(e.target.files[0]);
                }}
              />
              {candidate?.resume_url && (
                <button
                  type="button"
                  onClick={() => handleViewFile(candidate.resume_url!, candidate.resume_filename || 'Resume')}
                  className="px-4 py-3 bg-bg-tertiary border border-border-primary rounded-xl text-xs font-bold text-accent-blue hover:bg-bg-primary transition-colors flex items-center justify-center gap-1.5"
                >
                  <FileText className="w-4 h-4" />
                  <span>View Current</span>
                </button>
              )}
            </div>
          </div>

          {/* Optional Follow-Up */}
          <div className="p-4 bg-bg-tertiary/60 border border-border-primary rounded-2xl space-y-3">
            <span className="text-[10px] font-black uppercase tracking-widest text-accent-blue block">
              Schedule Aurrum Sales Follow-Up (Optional)
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="date"
                value={followupDate}
                onChange={e => setFollowupDate(e.target.value)}
                className="px-3.5 py-2 bg-bg-secondary border border-border-primary rounded-xl text-xs font-bold text-text-primary outline-none"
              />
              <input
                type="text"
                value={followupNote}
                onChange={e => setFollowupNote(e.target.value)}
                placeholder="Follow-up note (e.g. Call back at 3 PM EST)"
                className="px-3.5 py-2 bg-bg-secondary border border-border-primary rounded-xl text-xs text-text-primary outline-none"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-text-muted mb-1.5">
              Notes & Remarks
            </label>
            <textarea
              rows={3}
              value={formData.notes}
              onChange={e => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Candidate notes, sales discussion, or interview requirements..."
              className="w-full px-4 py-3 bg-bg-tertiary border border-border-primary rounded-xl text-sm text-text-primary focus:border-accent-blue outline-none resize-none"
            />
          </div>

          {/* Footer Buttons */}
          <div className="pt-4 border-t border-border-primary flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 bg-bg-tertiary border border-border-primary text-text-primary rounded-xl text-xs font-bold hover:bg-bg-primary transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={cn(
                'px-6 py-2.5 bg-accent-blue text-white rounded-xl text-xs font-bold hover:bg-accent-blue/90 transition-all shadow-lg shadow-accent-blue/20 cursor-pointer',
                isSubmitting && 'opacity-50 pointer-events-none'
              )}
            >
              {isSubmitting ? 'Saving...' : candidate ? 'Save Changes' : 'Create Aurrum Candidate'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
