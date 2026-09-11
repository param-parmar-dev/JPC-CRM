import React, { useRef, useState } from 'react';
import Papa from 'papaparse';
import { Upload, Loader } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { saveCandidate, seedQCChecklist, checkDuplicateCandidate } from '../services/storage';
import { Candidate } from '../types';

interface CsvImportProps {
  onSuccess: () => void;
}

export const CsvImportButton: React.FC<CsvImportProps> = ({ onSuccess }) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);
  const isImportingRef = useRef(false);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (isImportingRef.current || isImporting) return;
    isImportingRef.current = true;
    setIsImporting(true);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const rows = results.data as any[];
          if (rows.length === 0) {
            showToast('CSV file is empty', 'error');
            return;
          }

          let successCount = 0;
          const seenPhonesInBatch = new Set<string>();
          const seenEmailsInBatch = new Set<string>();

          for (const row of rows) {
            // Check if this is the custom specific format
            const candidateNameStr = row['Candidate Name'] || row.name || row.full_name || '';
            if (!candidateNameStr) continue;

            const parts = candidateNameStr.split('///').map((s: string) => s.trim());
            const fullName = parts[0] || 'Unknown Candidate';
            let phone = '';
            let email = '';
            
            if (parts.length === 2) {
              if (parts[1].includes('@')) {
                email = parts[1];
              } else {
                phone = parts[1];
              }
            } else if (parts.length >= 3) {
              phone = parts[1];
              email = parts[2];
            }

            const leadGenRaw = row['Lead Generation'] || row.lead_source || '';
            const statusRaw = row['Status'] || '';
            const dateRaw = row['DATE'] || '';
            const linkedinRaw = row['Linkedin Link'] || row.linkedin_url || '';

            const digits = phone.replace(/[^0-9]/g, '');
            const cleanPhone = (digits.length === 11 && digits.startsWith('1')) ? digits.slice(1) : digits;
            const cleanEmail = email.toLowerCase().trim();

            if (cleanPhone && seenPhonesInBatch.has(cleanPhone)) continue;
            if (cleanEmail && seenEmailsInBatch.has(cleanEmail)) continue;

            if (cleanPhone) seenPhonesInBatch.add(cleanPhone);
            if (cleanEmail) seenEmailsInBatch.add(cleanEmail);

            const dup = await checkDuplicateCandidate(phone, email, phone);
            if (dup) {
              console.warn(`Skipping duplicate candidate in CSV import: ${fullName} (${phone || email})`);
              continue;
            }

            const id = 'cand_' + Date.now().toString() + Math.random().toString(36).substr(2, 5);
            const candidate: Candidate = {
              id,
              full_name: fullName,
              phone: phone,
              email: email,
              whatsapp: phone,
              job_interest: '',
              domain_interested: '',
              location: '',
              education: '',
              degree: '',
              university: '',
              graduation_year: '',
              experience_years: '',
              current_company: '',
              current_designation: '',
              skills: '',
              linkedin_url: linkedinRaw,
              lead_source: leadGenRaw || 'Custom Import',
              lead_generated_by: leadGenRaw.toLowerCase().includes('self') ? user?.id || null : null, // If self, it's the uploading user. Else null, source handles the name
              assigned_sales: user?.id || null, // assigned to self as sales
              assigned_cs: null,
              assigned_resume: null,
              assigned_marketing_leader: null,
              assigned_recruiter: null,
              assigned_marketing: null,
              package_name: '',
              package_amount: 0,
              domain_suggested: '',
              notes: dateRaw ? `DATE: ${dateRaw}\nSTATUS: ${statusRaw}` : statusRaw || 'Imported Follow up',
              current_stage: 'sales', // force stage to sales
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

            await saveCandidate(candidate, user?.id ? String(user.id) : null);
            await seedQCChecklist(candidate.id);
            successCount++;
          }

          showToast(`Successfully imported ${successCount} candidates`, 'success');
          onSuccess();
        } catch (error) {
          console.error("Import error:", error);
          showToast('Failed to import CSV data', 'error');
        } finally {
          isImportingRef.current = false;
          setIsImporting(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      },
      error: (error) => {
        showToast(`Failed to parse CSV: ${error.message}`, 'error');
        setIsImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    });
  };

  return (
    <>
      <input 
        type="file" 
        accept=".csv" 
        ref={fileInputRef} 
        onChange={handleFileUpload} 
        className="hidden" 
      />
      <button 
        onClick={() => fileInputRef.current?.click()}
        disabled={isImporting}
        className="flex items-center gap-2 px-4 py-2.5 bg-bg-tertiary border border-border-primary text-text-primary font-bold rounded-xl hover:bg-bg-tertiary/80 transition-all shadow-sm disabled:opacity-50"
      >
        {isImporting ? <Loader className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
        <span className="hidden sm:inline">{isImporting ? 'Importing...' : 'Import Processed Leads'}</span>
      </button>
    </>
  );
};
