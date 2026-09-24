import React, { useState, useRef } from 'react';
import { Modal } from './Modal';
import { Upload, FileText, X, Loader2, CheckCircle2, AlertCircle, RotateCcw, Sparkles } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { uploadFile } from '../services/fileService';
import { addResumeSubstitutionRequest, updateInterviewSupportRequest, addInterviewNotification, logInterviewActivity, now } from '../services/storage';
import { getInterviewResumeInfo } from '../services/interviewService';
import { InterviewSupportRequest, Candidate } from '../types';

interface ResumeSubstitutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  request: InterviewSupportRequest;
  candidate?: Candidate | null;
  onSuccess?: () => void;
}

export const ResumeSubstitutionModal: React.FC<ResumeSubstitutionModalProps> = ({ 
  isOpen, 
  onClose, 
  request,
  candidate,
  onSuccess
}) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const resumeInfo = getInterviewResumeInfo(request, candidate);
  const [substitutionType, setSubstitutionType] = useState<'new_resume' | 'revert_master'>(
    resumeInfo.hasOtherResume ? 'new_resume' : 'new_resume'
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleSubmit = async () => {
    setIsUploading(true);
    try {
      if (substitutionType === 'revert_master') {
        // Revert to candidate's profile master resume
        await updateInterviewSupportRequest(request.id, {
          use_other_resume: false,
          other_resume_url: null,
          other_resume_filename: null,
          latest_resume_id: 'original',
          updated_at: now()
        });

        if (user) {
          await logInterviewActivity(
            request.id, 
            'RESUME_REVERTED', 
            { action: 'reverted_to_master', candidate_id: request.candidate_id }, 
            String(user.id)
          );
        }

        showToast('Reverted to candidate profile resume.', 'success');
        onSuccess?.();
        onClose();
        return;
      }

      // Upload and apply new other resume
      if (!selectedFile) return;

      // 1. Upload the file to get URL
      const resumeUrl = await uploadFile(selectedFile);
      
      // 2. Save substitution request record for audit
      await addResumeSubstitutionRequest({
        interview_request_id: request.id,
        candidate_id: request.candidate_id,
        new_resume_url: resumeUrl,
        new_resume_filename: selectedFile.name,
        status: 'pending'
      });

      // 3. Update the main interview support request with active other resume
      await updateInterviewSupportRequest(request.id, {
        use_other_resume: true,
        other_resume_url: resumeUrl,
        other_resume_filename: selectedFile.name,
        latest_resume_id: resumeUrl,
        updated_at: now()
      });

      // 4. Notify proxy if assigned
      if (request.proxy_user_id) {
        await addInterviewNotification({
          recipient_user_id: String(request.proxy_user_id),
          interview_round_id: '',
          notification_type: 'other_resume_updated',
          message: `A custom interview resume "${selectedFile.name}" has been assigned for ${request.interview_company_name} - ${request.job_title}. Proxies will reference only this resume.`
        });
      }

      // 5. Activity log
      if (user) {
        await logInterviewActivity(
          request.id, 
          'RESUME_SUBSTITUTED', 
          { filename: selectedFile.name, candidate_id: request.candidate_id }, 
          String(user.id)
        );
      }

      showToast('Other resume uploaded, highlighted, and active for proxy!', 'success');
      onSuccess?.();
      onClose();
    } catch (e) {
      console.error(e);
      showToast('Failed to update interview resume.', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Manage Interview Resume (Other Resume)"
      footer={
        <div className="flex gap-3">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-text-secondary font-bold hover:text-text-primary transition-all"
            disabled={isUploading}
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit}
            disabled={
              (substitutionType === 'new_resume' && !selectedFile) || 
              isUploading
            }
            className="px-6 py-2 bg-accent-blue text-white font-bold rounded-xl hover:bg-accent-blue/90 disabled:opacity-50 transition-all shadow-lg shadow-accent-blue/20 flex items-center gap-2"
          >
            {isUploading && <Loader2 className="w-4 h-4 animate-spin" />}
            {substitutionType === 'revert_master' ? 'Revert to Master Resume' : 'Save & Show to Proxy'}
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Current Active Resume Indicator */}
        <div className={`p-4 rounded-2xl border ${
          resumeInfo.hasOtherResume 
            ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' 
            : 'bg-bg-tertiary border-border-primary text-text-secondary'
        }`}>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
              {resumeInfo.hasOtherResume ? (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-amber-400 font-extrabold">Active Status: Other Resume In Use</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-accent-blue" />
                  <span className="text-text-primary font-extrabold">Active Status: Candidate Profile Resume</span>
                </>
              )}
            </span>
            <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${
              resumeInfo.hasOtherResume 
                ? 'bg-amber-500 text-black' 
                : 'bg-bg-secondary text-text-muted border border-border-primary'
            }`}>
              {resumeInfo.hasOtherResume ? 'Highlighted for Proxy' : 'Default Profile'}
            </span>
          </div>
          <p className="text-xs font-bold text-text-primary truncate">
            {resumeInfo.hasOtherResume 
              ? `Current: ${resumeInfo.otherResumeFilename}` 
              : `Current: ${resumeInfo.masterResumeFilename} ${resumeInfo.masterResumeVersion ? `(v${resumeInfo.masterResumeVersion})` : ''}`
            }
          </p>
          <p className="text-[10px] text-text-muted mt-1">
            {resumeInfo.hasOtherResume 
              ? 'Proxies will only see this other resume; the master profile resume is currently hidden from them.' 
              : 'Proxies will see the latest version of the candidate profile resume.'}
          </p>
        </div>

        {/* Options */}
        <div className="space-y-3">
          <label className={`flex items-start gap-3 p-4 border rounded-2xl cursor-pointer transition-all ${
            substitutionType === 'new_resume' 
              ? 'bg-accent-blue/10 border-accent-blue/50 text-text-primary' 
              : 'hover:bg-bg-tertiary border-border-primary text-text-secondary'
          }`}>
            <input 
              type="radio" 
              name="sub-type" 
              value="new_resume" 
              checked={substitutionType === 'new_resume'}
              onChange={() => setSubstitutionType('new_resume')}
              className="mt-1"
            />
            <div>
              <span className="font-bold text-sm text-text-primary block">
                {resumeInfo.hasOtherResume ? 'Upload a different other resume' : 'Upload other resume for this interview'}
              </span>
              <span className="text-xs text-text-muted block mt-0.5">
                Highlights this resume for the interview and shows only this resume to the proxy (hides master resume).
              </span>
            </div>
          </label>

          {resumeInfo.hasOtherResume && (
            <label className={`flex items-start gap-3 p-4 border rounded-2xl cursor-pointer transition-all ${
              substitutionType === 'revert_master' 
                ? 'bg-amber-500/10 border-amber-500/50 text-text-primary' 
                : 'hover:bg-bg-tertiary border-border-primary text-text-secondary'
            }`}>
              <input 
                type="radio" 
                name="sub-type" 
                value="revert_master" 
                checked={substitutionType === 'revert_master'}
                onChange={() => setSubstitutionType('revert_master')}
                className="mt-1"
              />
              <div>
                <span className="font-bold text-sm text-text-primary flex items-center gap-1.5">
                  <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                  Revert to Candidate Profile Resume
                </span>
                <span className="text-xs text-text-muted block mt-0.5">
                  Switches back to candidate profile's latest master resume ({resumeInfo.masterResumeFilename}) and removes the other resume override.
                </span>
              </div>
            </label>
          )}
        </div>

        {/* File Uploader for new_resume */}
        {substitutionType === 'new_resume' && (
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-border-primary rounded-3xl p-8 flex flex-col items-center justify-center hover:border-accent-blue hover:bg-accent-blue/5 transition-all cursor-pointer group"
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
              accept=".pdf,.doc,.docx"
            />
            {selectedFile ? (
              <div className="flex items-center gap-3 bg-bg-secondary px-4 py-3 rounded-2xl border border-border-primary">
                <FileText className="w-8 h-8 text-accent-blue shrink-0" />
                <div className="text-left">
                  <span className="font-bold text-sm text-text-primary block truncate max-w-[220px]">{selectedFile.name}</span>
                  <span className="text-[10px] text-text-muted">{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB</span>
                </div>
                <button 
                  type="button" 
                  onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }}
                  className="p-1 hover:bg-bg-tertiary rounded-lg text-text-muted hover:text-text-primary"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <>
                <div className="w-12 h-12 bg-bg-tertiary rounded-2xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <Upload className="w-6 h-6 text-accent-blue" />
                </div>
                <p className="font-bold text-sm text-text-primary">Click to select other resume file</p>
                <p className="text-xs text-text-muted mt-1">PDF, DOC, DOCX up to 5MB</p>
              </>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};

