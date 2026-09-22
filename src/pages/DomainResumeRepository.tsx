import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { subscribeToCollection, saveCandidate, logActivity } from '../services/storage';
import { uploadFile, handleViewFile, getFileBinary } from '../services/fileService';
import { Candidate, ResumeVersion, ResumeChangeRequest, User } from '../types';
import JSZip from 'jszip';
import { 
  FolderTree,
  Folder,
  FolderOpen,
  FileText,
  Download,
  Upload,
  Search,
  RefreshCw,
  Eye,
  History,
  Layers,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  ChevronRight,
  ChevronDown,
  Filter,
  Grid,
  List,
  CheckSquare,
  Square,
  ArrowUpDown,
  ExternalLink,
  RotateCcw,
  X,
  FileCheck,
  Building,
  Briefcase
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { FreeTrialBadge } from '../components/FreeTrialBadge';

interface CandidateWithVersions extends Candidate {
  all_versions: ResumeVersion[];
  domain_name: string;
  role_name: string;
}

export const DomainResumeRepository: React.FC = () => {
  const { user, isAuthReady } = useAuth();
  const { showToast } = useToast();

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [resumeRequests, setResumeRequests] = useState<ResumeChangeRequest[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters & State
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDomain, setSelectedDomain] = useState<string>('ALL');
  const [selectedRole, setSelectedRole] = useState<string>('ALL');
  const [stageFilter, setStageFilter] = useState<'active_and_interviewing' | 'marketing_active' | 'interviewing' | 'all'>('active_and_interviewing');
  const [viewMode, setViewMode] = useState<'explorer' | 'grid' | 'table'>('explorer');
  const [openDomains, setOpenDomains] = useState<Record<string, boolean>>({});
  const [openRoles, setOpenRoles] = useState<Record<string, boolean>>({});
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<Set<string>>(new Set());

  // Modals
  const [uploadModalCandidate, setUploadModalCandidate] = useState<CandidateWithVersions | null>(null);
  const [uploadFileState, setUploadFileState] = useState<File | null>(null);
  const [uploadNotes, setUploadNotes] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  const [historyModalCandidate, setHistoryModalCandidate] = useState<CandidateWithVersions | null>(null);
  const [revertingVersionId, setRevertingVersionId] = useState<string | null>(null);

  // Bulk download state
  const [isZipping, setIsZipping] = useState(false);
  const [zipProgress, setZipProgress] = useState<{ current: number; total: number; message: string }>({ current: 0, total: 0, message: '' });

  useEffect(() => {
    if (!isAuthReady) return;

    const unsubCandidates = subscribeToCollection<Candidate>('jpc_candidates', (data) => {
      setCandidates(data.filter(c => !c.deleted_at));
      setLoading(false);
    });

    const unsubRequests = subscribeToCollection<ResumeChangeRequest>('jpc_resume_requests', (data) => {
      setResumeRequests(data);
    });

    const unsubUsers = subscribeToCollection<User>('jpc_users', (data) => {
      setUsers(data);
    });

    return () => {
      unsubCandidates();
      unsubRequests();
      unsubUsers();
    };
  }, [isAuthReady]);

  // Process and normalize candidates with version history
  const enrichedCandidates: CandidateWithVersions[] = useMemo(() => {
    return candidates.map(c => {
      const domain = (c.domain_suggested?.trim() || c.domain_interested?.trim() || 'General Domain').trim();
      const role = (c.job_interest?.trim() || c.current_designation?.trim() || 'General Role').trim();

      // Collect all versions
      const versionsMap = new Map<string, ResumeVersion>();

      // 1. Existing stored resume_versions on candidate
      if (c.resume_versions && Array.isArray(c.resume_versions)) {
        c.resume_versions.forEach(v => {
          if (v && (v.url || v.filename)) {
            versionsMap.set(v.id || v.url, v);
          }
        });
      }

      // 2. Current resume_url if not in versions
      if (c.resume_url || c.resume_base64) {
        const currentUrl = c.resume_url || c.resume_base64 || '';
        const found = Array.from(versionsMap.values()).find(v => v.url === currentUrl);
        if (!found) {
          versionsMap.set('current_active', {
            id: 'current_active',
            url: currentUrl,
            filename: c.resume_filename || `${c.full_name.replace(/\s+/g, '_')}_Resume.pdf`,
            uploaded_at: c.updated_at || c.created_at || new Date().toISOString(),
            version_number: 1,
            is_current: true,
            notes: c.resume_phrases ? `Phrases: ${c.resume_phrases}` : 'Current resume'
          });
        }
      }

      // 3. Completed resume requests from jpc_resume_requests
      const completedReqs = resumeRequests.filter(r => r.candidate_id === c.id && r.status === 'completed' && (r.new_resume_url || r.resume_base64));
      completedReqs.forEach((req, idx) => {
        const reqUrl = req.new_resume_url || req.resume_base64 || '';
        const found = Array.from(versionsMap.values()).find(v => v.url === reqUrl);
        if (!found) {
          versionsMap.set(`req_${req.id}`, {
            id: `req_${req.id}`,
            url: reqUrl,
            filename: req.resume_filename || `Patch_${idx + 1}_${c.full_name.replace(/\s+/g, '_')}.pdf`,
            uploaded_at: req.updated_at || req.created_at || new Date().toISOString(),
            version_number: idx + 2,
            is_current: false,
            notes: req.details ? `Patching: ${req.details}` : 'Resume Patch Request'
          });
        }
      });

      // Sort versions by date or version number
      const sortedVersions = Array.from(versionsMap.values()).sort((a, b) => {
        const dateA = new Date(a.uploaded_at).getTime();
        const dateB = new Date(b.uploaded_at).getTime();
        return dateB - dateA;
      });

      // Make sure the current resume has is_current set
      const currentUrl = c.resume_url || c.resume_base64;
      const normalizedVersions = sortedVersions.map((v, index) => {
        const isCur = currentUrl ? (v.url === currentUrl) : (index === 0);
        return {
          ...v,
          is_current: isCur,
          version_number: sortedVersions.length - index
        };
      });

      return {
        ...c,
        domain_name: domain,
        role_name: role,
        all_versions: normalizedVersions
      };
    });
  }, [candidates, resumeRequests]);

  // Filter candidates by stage (Marketing Active & Interviewing by default)
  const targetCandidates = useMemo(() => {
    return enrichedCandidates.filter(c => {
      if (stageFilter === 'active_and_interviewing') {
        return c.current_stage === 'marketing_active' || c.current_stage === 'interviewing';
      }
      if (stageFilter === 'marketing_active') {
        return c.current_stage === 'marketing_active';
      }
      if (stageFilter === 'interviewing') {
        return c.current_stage === 'interviewing';
      }
      return true; // all
    });
  }, [enrichedCandidates, stageFilter]);

  // Available unique domains and roles
  const allDomains = useMemo(() => {
    const domainMap = new Map<string, number>();
    targetCandidates.forEach(c => {
      domainMap.set(c.domain_name, (domainMap.get(c.domain_name) || 0) + 1);
    });
    return Array.from(domainMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [targetCandidates]);

  const allRoles = useMemo(() => {
    const roleMap = new Map<string, number>();
    targetCandidates.forEach(c => {
      if (selectedDomain === 'ALL' || c.domain_name === selectedDomain) {
        roleMap.set(c.role_name, (roleMap.get(c.role_name) || 0) + 1);
      }
    });
    return Array.from(roleMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [targetCandidates, selectedDomain]);

  // Filtered candidate list based on search and domain/role selection
  const filteredCandidates = useMemo(() => {
    return targetCandidates.filter(c => {
      // Domain filter
      if (selectedDomain !== 'ALL' && c.domain_name !== selectedDomain) {
        return false;
      }
      // Role filter
      if (selectedRole !== 'ALL' && c.role_name !== selectedRole) {
        return false;
      }
      // Search term
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchesName = c.full_name?.toLowerCase().includes(query);
        const matchesDomain = c.domain_name?.toLowerCase().includes(query);
        const matchesRole = c.role_name?.toLowerCase().includes(query);
        const matchesEmail = c.email?.toLowerCase().includes(query);
        const matchesPhone = c.phone?.toLowerCase().includes(query);
        const matchesFilename = (c.resume_filename || '').toLowerCase().includes(query);
        if (!matchesName && !matchesDomain && !matchesRole && !matchesEmail && !matchesPhone && !matchesFilename) {
          return false;
        }
      }
      return true;
    });
  }, [targetCandidates, selectedDomain, selectedRole, searchTerm]);

  // Grouped structure: Domain -> Role -> Candidates
  const domainTree = useMemo(() => {
    const tree: Record<string, Record<string, CandidateWithVersions[]>> = {};

    filteredCandidates.forEach(c => {
      if (!tree[c.domain_name]) {
        tree[c.domain_name] = {};
      }
      if (!tree[c.domain_name][c.role_name]) {
        tree[c.domain_name][c.role_name] = [];
      }
      tree[c.domain_name][c.role_name].push(c);
    });

    return tree;
  }, [filteredCandidates]);

  // Auto-expand top domains initially
  useEffect(() => {
    if (Object.keys(openDomains).length === 0 && allDomains.length > 0) {
      const initialOpen: Record<string, boolean> = {};
      allDomains.forEach(([d]) => {
        initialOpen[d] = true;
      });
      setOpenDomains(initialOpen);

      const initialRolesOpen: Record<string, boolean> = {};
      filteredCandidates.forEach(c => {
        initialRolesOpen[`${c.domain_name}__${c.role_name}`] = true;
      });
      setOpenRoles(initialRolesOpen);
    }
  }, [allDomains, filteredCandidates]);

  const toggleDomain = (domain: string) => {
    setOpenDomains(prev => ({ ...prev, [domain]: !prev[domain] }));
  };

  const toggleRole = (domain: string, role: string) => {
    const key = `${domain}__${role}`;
    setOpenRoles(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleSelectCandidate = (id: string) => {
    setSelectedCandidateIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedCandidateIds.size === filteredCandidates.length) {
      setSelectedCandidateIds(new Set());
    } else {
      setSelectedCandidateIds(new Set(filteredCandidates.map(c => c.id)));
    }
  };

  // Helper to sanitize folder & file names
  const sanitizeName = (name: string) => {
    return (name || 'Unassigned').replace(/[/\\?%*:|"<>]/g, '_').trim();
  };

  // Bulk ZIP Download Function maintaining Domain -> Role -> Candidate -> Resume structure
  const handleBulkDownload = async (candidateList: CandidateWithVersions[], zipLabel: string = 'Resumes') => {
    if (candidateList.length === 0) {
      showToast('No candidates selected for download', 'error');
      return;
    }

    setIsZipping(true);
    setZipProgress({ current: 0, total: candidateList.length, message: 'Initializing Archive...' });

    try {
      const zip = new JSZip();
      let processedCount = 0;
      let totalFilesAdded = 0;

      for (let i = 0; i < candidateList.length; i++) {
        const cand = candidateList[i];
        setZipProgress({
          current: i + 1,
          total: candidateList.length,
          message: `Packing resume for ${cand.full_name} (${i + 1}/${candidateList.length})...`
        });

        const domainFolder = sanitizeName(cand.domain_name);
        const roleFolder = sanitizeName(cand.role_name);
        const candidateFolder = sanitizeName(cand.full_name);

        // Path: Domain / Role / Candidate
        const targetPath = `${domainFolder}/${roleFolder}/${candidateFolder}`;

        // 1. Download Current Resume
        const currentUrl = cand.resume_url || cand.resume_base64;
        if (currentUrl) {
          const binary = await getFileBinary(currentUrl);
          if (binary && binary.data) {
            let extension = 'pdf';
            if (cand.resume_filename && cand.resume_filename.includes('.')) {
              extension = cand.resume_filename.split('.').pop() || 'pdf';
            } else if (binary.mimeType.includes('word')) {
              extension = 'docx';
            }
            const cleanFileName = sanitizeName(`${cand.full_name}_Current_Resume.${extension}`);
            zip.file(`${targetPath}/${cleanFileName}`, binary.data);
            totalFilesAdded++;
          }
        }

        // 2. Download Previous Resume Versions in Previous_Versions/ subfolder
        const previousVersions = cand.all_versions.filter(v => !v.is_current && v.url);
        if (previousVersions.length > 0) {
          for (let vIdx = 0; vIdx < previousVersions.length; vIdx++) {
            const ver = previousVersions[vIdx];
            if (ver.url && ver.url !== currentUrl) {
              const verBinary = await getFileBinary(ver.url);
              if (verBinary && verBinary.data) {
                let ext = 'pdf';
                if (ver.filename && ver.filename.includes('.')) {
                  ext = ver.filename.split('.').pop() || 'pdf';
                }
                const dateStr = ver.uploaded_at ? new Date(ver.uploaded_at).toISOString().split('T')[0] : 'prev';
                const verFileName = sanitizeName(`${cand.full_name}_v${ver.version_number || vIdx + 1}_${dateStr}.${ext}`);
                zip.file(`${targetPath}/Previous_Versions/${verFileName}`, verBinary.data);
                totalFilesAdded++;
              }
            }
          }
        }

        processedCount++;
      }

      if (totalFilesAdded === 0) {
        showToast('No resume files found for the selected candidates', 'error');
        setIsZipping(false);
        return;
      }

      setZipProgress({
        current: candidateList.length,
        total: candidateList.length,
        message: 'Compiling ZIP package...'
      });

      const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      });

      const dateTag = new Date().toISOString().split('T')[0];
      const zipFileName = `Placify_${sanitizeName(zipLabel)}_${dateTag}.zip`;

      const downloadUrl = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = zipFileName;
      document.body.appendChild(a);
      a.click();

      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(downloadUrl);
      }, 500);

      showToast(`Successfully downloaded ${totalFilesAdded} resumes across ${candidateList.length} candidates in proper Domain → Role → Candidate folder structure`, 'success');
    } catch (error) {
      console.error('Bulk zip error:', error);
      showToast('Failed to create resume archive', 'error');
    } finally {
      setIsZipping(false);
    }
  };

  // Upload a new resume version for candidate
  const handleUploadNewVersion = async () => {
    if (!uploadModalCandidate || !uploadFileState) return;

    setIsUploading(true);
    try {
      showToast('Uploading new resume version...', 'info');

      const url = await uploadFile(uploadFileState, {
        name: uploadModalCandidate.full_name,
        email: uploadModalCandidate.email || 'N/A',
        phone: uploadModalCandidate.phone || '',
        filename: uploadFileState.name
      });

      // Prepare previous versions
      const currentList = uploadModalCandidate.all_versions || [];
      const updatedPrevVersions: ResumeVersion[] = currentList.map(v => ({
        ...v,
        is_current: false
      }));

      const newVersionNumber = updatedPrevVersions.length + 1;
      const newVersionObj: ResumeVersion = {
        id: `v${newVersionNumber}_${Date.now()}`,
        url: url,
        filename: uploadFileState.name,
        uploaded_at: new Date().toISOString(),
        uploaded_by: user?.id || null,
        uploaded_by_name: user?.display_name || user?.username || 'Resume Team',
        notes: uploadNotes || 'New version uploaded from Domain Resume Section',
        version_number: newVersionNumber,
        is_current: true
      };

      const finalVersions = [...updatedPrevVersions, newVersionObj];

      const updatedCandidate: Candidate = {
        ...uploadModalCandidate,
        resume_url: url,
        resume_base64: url,
        resume_filename: uploadFileState.name,
        resume_versions: finalVersions,
        updated_at: new Date().toISOString()
      };

      await saveCandidate(updatedCandidate, user?.id ? String(user.id) : null);
      await logActivity(
        uploadModalCandidate.id,
        'Resume Version Added',
        `Version ${newVersionNumber} (${uploadFileState.name}) uploaded by ${user?.display_name || 'Resume Team'}. Notes: ${uploadNotes || 'None'}`,
        user?.id || null
      );

      showToast(`Resume Version ${newVersionNumber} uploaded successfully without overwriting previous versions`, 'success');
      setUploadModalCandidate(null);
      setUploadFileState(null);
      setUploadNotes('');
    } catch (error) {
      console.error('Upload error:', error);
      showToast('Failed to upload new resume version', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  // Revert / Set a previous version as Current
  const handleRestoreVersion = async (cand: CandidateWithVersions, version: ResumeVersion) => {
    setRevertingVersionId(version.id);
    try {
      const updatedVersions = cand.all_versions.map(v => ({
        ...v,
        is_current: v.id === version.id
      }));

      const updatedCandidate: Candidate = {
        ...cand,
        resume_url: version.url,
        resume_base64: version.url,
        resume_filename: version.filename,
        resume_versions: updatedVersions,
        updated_at: new Date().toISOString()
      };

      await saveCandidate(updatedCandidate, user?.id ? String(user.id) : null);
      await logActivity(
        cand.id,
        'Resume Version Restored',
        `Restored Version ${version.version_number || ''} (${version.filename}) as active resume by ${user?.display_name || 'Resume Team'}`,
        user?.id || null
      );

      showToast(`Version ${version.version_number || ''} is now active`, 'success');
      setHistoryModalCandidate(null);
    } catch (error) {
      console.error('Restore error:', error);
      showToast('Failed to set active version', 'error');
    } finally {
      setRevertingVersionId(null);
    }
  };

  // Calculate high level stats
  const stats = useMemo(() => {
    const totalCandidates = targetCandidates.length;
    const candidatesWithResume = targetCandidates.filter(c => c.resume_url || c.resume_base64).length;
    const totalVersionsCount = targetCandidates.reduce((sum, c) => sum + (c.all_versions?.length || 0), 0);
    const domainCount = allDomains.length;
    const roleCount = allRoles.length;

    return {
      totalCandidates,
      candidatesWithResume,
      totalVersionsCount,
      domainCount,
      roleCount
    };
  }, [targetCandidates, allDomains, allRoles]);

  return (
    <div className="space-y-8 pb-16">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-accent-purple/10 flex items-center justify-center text-accent-purple shrink-0">
              <FolderTree className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-text-primary tracking-tight font-heading">
                Domain & Role Resumes
              </h1>
              <p className="text-text-secondary text-xs sm:text-sm mt-0.5">
                Centralized Domain → Role → Candidate resume repository with version preservation and bulk structured download.
              </p>
            </div>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex flex-wrap items-center gap-3">
          {selectedCandidateIds.size > 0 && (
            <button
              onClick={() => {
                const selected = filteredCandidates.filter(c => selectedCandidateIds.has(c.id));
                handleBulkDownload(selected, `Selected_${selected.length}_Candidates`);
              }}
              disabled={isZipping}
              className="flex items-center gap-2 px-5 py-3 bg-accent-blue text-white font-bold rounded-2xl hover:bg-accent-blue/90 transition-all shadow-lg shadow-accent-blue/20 text-sm disabled:opacity-50 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Download Selected ({selectedCandidateIds.size})
            </button>
          )}

          <button
            onClick={() => handleBulkDownload(filteredCandidates, selectedDomain !== 'ALL' ? `${selectedDomain}_Resumes` : 'All_Active_Resumes')}
            disabled={isZipping || filteredCandidates.length === 0}
            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-accent-purple to-accent-blue text-white font-black rounded-2xl hover:opacity-95 transition-all shadow-lg shadow-accent-purple/20 text-sm disabled:opacity-50 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            Download All Structured ZIP ({filteredCandidates.length})
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="bg-bg-secondary p-5 rounded-3xl border border-border-primary shadow-sm">
          <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest mb-1 flex items-center gap-1.5">
            <Building className="w-3.5 h-3.5 text-accent-blue" />
            Domains
          </p>
          <p className="text-2xl font-black text-text-primary">{stats.domainCount}</p>
        </div>

        <div className="bg-bg-secondary p-5 rounded-3xl border border-border-primary shadow-sm">
          <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest mb-1 flex items-center gap-1.5">
            <Briefcase className="w-3.5 h-3.5 text-accent-purple" />
            Roles / Profiles
          </p>
          <p className="text-2xl font-black text-text-primary">{stats.roleCount}</p>
        </div>

        <div className="bg-bg-secondary p-5 rounded-3xl border border-border-primary shadow-sm">
          <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest mb-1 flex items-center gap-1.5">
            <FileCheck className="w-3.5 h-3.5 text-emerald-500" />
            Active Candidates
          </p>
          <p className="text-2xl font-black text-emerald-600">{stats.totalCandidates}</p>
        </div>

        <div className="bg-bg-secondary p-5 rounded-3xl border border-border-primary shadow-sm">
          <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest mb-1 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-accent-blue" />
            Current Resumes
          </p>
          <p className="text-2xl font-black text-accent-blue">{stats.candidatesWithResume}</p>
        </div>

        <div className="bg-bg-secondary p-5 rounded-3xl border border-border-primary shadow-sm col-span-2 sm:col-span-1">
          <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest mb-1 flex items-center gap-1.5">
            <History className="w-3.5 h-3.5 text-amber-500" />
            Stored Versions
          </p>
          <p className="text-2xl font-black text-amber-500">{stats.totalVersionsCount}</p>
        </div>
      </div>

      {/* Search & Filter Controls Bar */}
      <div className="bg-bg-secondary p-5 rounded-3xl border border-border-primary shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
          {/* Search input */}
          <div className="md:col-span-4 relative group">
            <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-accent-purple transition-colors" />
            <input
              type="text"
              placeholder="Search candidate, domain, role, filename..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-bg-tertiary border border-border-primary rounded-2xl pl-11 pr-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent-purple transition-all"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Domain dropdown */}
          <div className="md:col-span-3">
            <select
              value={selectedDomain}
              onChange={e => {
                setSelectedDomain(e.target.value);
                setSelectedRole('ALL');
              }}
              className="w-full bg-bg-tertiary border border-border-primary rounded-2xl px-4 py-3 text-sm text-text-primary font-medium focus:outline-none focus:border-accent-purple"
            >
              <option value="ALL">All Domains ({stats.domainCount})</option>
              {allDomains.map(([dom, count]) => (
                <option key={dom} value={dom}>
                  {dom} ({count})
                </option>
              ))}
            </select>
          </div>

          {/* Role dropdown */}
          <div className="md:col-span-3">
            <select
              value={selectedRole}
              onChange={e => setSelectedRole(e.target.value)}
              className="w-full bg-bg-tertiary border border-border-primary rounded-2xl px-4 py-3 text-sm text-text-primary font-medium focus:outline-none focus:border-accent-purple"
            >
              <option value="ALL">All Roles ({allRoles.length})</option>
              {allRoles.map(([rol, count]) => (
                <option key={rol} value={rol}>
                  {rol} ({count})
                </option>
              ))}
            </select>
          </div>

          {/* View mode switcher */}
          <div className="md:col-span-2 flex items-center justify-end gap-1 bg-bg-tertiary p-1 rounded-2xl border border-border-primary">
            <button
              onClick={() => setViewMode('explorer')}
              title="Folder Tree View"
              className={`flex-1 flex items-center justify-center p-2 rounded-xl text-xs font-bold transition-all ${
                viewMode === 'explorer'
                  ? 'bg-accent-purple text-white shadow-sm'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <FolderTree className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              title="Card Grid View"
              className={`flex-1 flex items-center justify-center p-2 rounded-xl text-xs font-bold transition-all ${
                viewMode === 'grid'
                  ? 'bg-accent-purple text-white shadow-sm'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              title="Dense Table View"
              className={`flex-1 flex items-center justify-center p-2 rounded-xl text-xs font-bold transition-all ${
                viewMode === 'table'
                  ? 'bg-accent-purple text-white shadow-sm'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Stage Scope Filter Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border-primary/60 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-text-muted font-bold uppercase tracking-wider">Candidate Stage:</span>
            <button
              onClick={() => setStageFilter('active_and_interviewing')}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
                stageFilter === 'active_and_interviewing'
                  ? 'bg-accent-purple/20 text-accent-purple border border-accent-purple/30'
                  : 'bg-bg-tertiary text-text-secondary hover:text-text-primary'
              }`}
            >
              Marketing Active & Interviewing
            </button>
            <button
              onClick={() => setStageFilter('marketing_active')}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
                stageFilter === 'marketing_active'
                  ? 'bg-emerald-500/20 text-emerald-600 border border-emerald-500/30'
                  : 'bg-bg-tertiary text-text-secondary hover:text-text-primary'
              }`}
            >
              Marketing Active Only
            </button>
            <button
              onClick={() => setStageFilter('interviewing')}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
                stageFilter === 'interviewing'
                  ? 'bg-accent-blue/20 text-accent-blue border border-accent-blue/30'
                  : 'bg-bg-tertiary text-text-secondary hover:text-text-primary'
              }`}
            >
              Interviewing Only
            </button>
            <button
              onClick={() => setStageFilter('all')}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
                stageFilter === 'all'
                  ? 'bg-text-secondary/20 text-text-primary border border-border-primary'
                  : 'bg-bg-tertiary text-text-secondary hover:text-text-primary'
              }`}
            >
              All Stages
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={toggleSelectAll}
              className="flex items-center gap-1.5 text-text-secondary hover:text-text-primary font-bold cursor-pointer"
            >
              {selectedCandidateIds.size === filteredCandidates.length && filteredCandidates.length > 0 ? (
                <CheckSquare className="w-4 h-4 text-accent-purple" />
              ) : (
                <Square className="w-4 h-4 text-text-muted" />
              )}
              Select All Filtered ({filteredCandidates.length})
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="py-24 text-center bg-bg-secondary rounded-3xl border border-border-primary flex flex-col items-center justify-center">
          <RefreshCw className="w-10 h-10 text-accent-purple animate-spin mb-4" />
          <p className="text-text-primary font-bold">Organizing Domain & Role Resumes...</p>
        </div>
      ) : filteredCandidates.length === 0 ? (
        <div className="py-20 text-center bg-bg-secondary rounded-3xl border border-border-primary border-dashed p-8">
          <FolderTree className="w-12 h-12 text-text-muted mx-auto mb-3 opacity-60" />
          <h3 className="text-lg font-bold text-text-primary">No matching candidates or resumes found</h3>
          <p className="text-text-secondary text-sm mt-1">Try broadening your domain, role, or search filters.</p>
        </div>
      ) : (
        <>
          {/* VIEW MODE 1: HIERARCHY TREE / EXPLORER VIEW */}
          {viewMode === 'explorer' && (
            <div className="space-y-6">
              {Object.entries(domainTree).map(([domainName, roleTree]) => {
                const domainCandidateCount = Object.values(roleTree).flat().length;
                const domainCandidates = Object.values(roleTree).flat();
                const isOpen = openDomains[domainName] !== false;

                return (
                  <div
                    key={domainName}
                    className="bg-bg-secondary rounded-3xl border border-border-primary overflow-hidden shadow-sm transition-all"
                  >
                    {/* Domain Header */}
                    <div className="px-6 py-5 bg-bg-tertiary/40 border-b border-border-primary flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <button
                        onClick={() => toggleDomain(domainName)}
                        className="flex items-center gap-3 text-left font-heading group"
                      >
                        <div className="w-10 h-10 rounded-2xl bg-accent-purple/10 flex items-center justify-center text-accent-purple group-hover:scale-105 transition-transform">
                          {isOpen ? <FolderOpen className="w-5 h-5" /> : <Folder className="w-5 h-5" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h2 className="text-lg font-bold text-text-primary">{domainName}</h2>
                            <span className="px-2.5 py-0.5 rounded-full bg-accent-purple/15 text-accent-purple text-xs font-black">
                              {domainCandidateCount} candidates
                            </span>
                          </div>
                          <p className="text-xs text-text-muted font-medium">
                            {Object.keys(roleTree).length} roles in this domain
                          </p>
                        </div>
                        {isOpen ? <ChevronDown className="w-4 h-4 text-text-muted ml-2" /> : <ChevronRight className="w-4 h-4 text-text-muted ml-2" />}
                      </button>

                      {/* Domain Bulk Action */}
                      <div className="flex items-center gap-2 self-end sm:self-center">
                        <button
                          onClick={() => handleBulkDownload(domainCandidates, `${domainName}_Resumes`)}
                          disabled={isZipping}
                          className="flex items-center gap-2 px-4 py-2 bg-bg-secondary hover:bg-bg-tertiary border border-border-primary text-text-primary font-bold rounded-xl text-xs transition-all shadow-sm"
                          title={`Download all ${domainName} resumes in Domain → Role → Candidate folder structure`}
                        >
                          <Download className="w-3.5 h-3.5 text-accent-purple" />
                          Download Domain ZIP ({domainCandidateCount})
                        </button>
                      </div>
                    </div>

                    {/* Roles in Domain */}
                    {isOpen && (
                      <div className="p-6 space-y-6">
                        {Object.entries(roleTree).map(([roleName, candidateList]) => {
                          const roleKey = `${domainName}__${roleName}`;
                          const isRoleOpen = openRoles[roleKey] !== false;

                          return (
                            <div
                              key={roleName}
                              className="bg-bg-tertiary/20 rounded-2xl border border-border-primary overflow-hidden"
                            >
                              {/* Role Sub-Header */}
                              <div className="px-5 py-3.5 bg-bg-tertiary/60 border-b border-border-primary flex items-center justify-between">
                                <button
                                  onClick={() => toggleRole(domainName, roleName)}
                                  className="flex items-center gap-2.5 text-left group"
                                >
                                  {isRoleOpen ? (
                                    <ChevronDown className="w-4 h-4 text-accent-purple" />
                                  ) : (
                                    <ChevronRight className="w-4 h-4 text-text-muted" />
                                  )}
                                  <Briefcase className="w-4 h-4 text-accent-blue" />
                                  <span className="font-bold text-sm text-text-primary">{roleName}</span>
                                  <span className="px-2 py-0.5 rounded-full bg-accent-blue/15 text-accent-blue text-[11px] font-bold">
                                    {candidateList.length}
                                  </span>
                                </button>

                                <button
                                  onClick={() => handleBulkDownload(candidateList, `${domainName}_${roleName}_Resumes`)}
                                  disabled={isZipping}
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-bg-secondary hover:bg-bg-tertiary border border-border-primary text-text-secondary hover:text-text-primary rounded-lg text-xs font-bold transition-all"
                                  title={`Download ${roleName} resumes`}
                                >
                                  <Download className="w-3 h-3 text-accent-blue" />
                                  Download Role ZIP
                                </button>
                              </div>

                              {/* Candidate Resume Cards in Role */}
                              {isRoleOpen && (
                                <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                  {candidateList.map(cand => {
                                    const isSelected = selectedCandidateIds.has(cand.id);
                                    const currentUrl = cand.resume_url || cand.resume_base64;
                                    const hasResume = !!currentUrl;

                                    return (
                                      <div
                                        key={cand.id}
                                        className={`relative bg-bg-secondary rounded-2xl border p-4 transition-all flex flex-col justify-between ${
                                          isSelected
                                            ? 'border-accent-purple shadow-md bg-accent-purple/[0.02]'
                                            : 'border-border-primary hover:border-border-primary/80'
                                        }`}
                                      >
                                        <div className="space-y-3">
                                          {/* Candidate header & checkbox */}
                                          <div className="flex items-start justify-between gap-2">
                                            <div className="flex items-start gap-2.5 min-w-0">
                                              <button
                                                onClick={() => toggleSelectCandidate(cand.id)}
                                                className="mt-0.5 text-text-muted hover:text-accent-purple shrink-0"
                                              >
                                                {isSelected ? (
                                                  <CheckSquare className="w-4 h-4 text-accent-purple" />
                                                ) : (
                                                  <Square className="w-4 h-4" />
                                                )}
                                              </button>
                                              <div className="min-w-0">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                  <a
                                                    href={`#candidate/${cand.id}`}
                                                    className="font-bold text-text-primary hover:text-accent-purple transition-colors text-sm truncate block"
                                                  >
                                                    {cand.full_name}
                                                  </a>
                                                  {cand.is_free_trial && (
                                                    <FreeTrialBadge 
                                                      size="sm" 
                                                      startDate={cand.free_trial_start_date} 
                                                      endDate={cand.free_trial_end_date} 
                                                    />
                                                  )}
                                                </div>
                                                <div className="flex items-center gap-1.5 mt-0.5">
                                                  <span
                                                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                                      cand.current_stage === 'marketing_active'
                                                        ? 'bg-emerald-500/15 text-emerald-600'
                                                        : cand.current_stage === 'interviewing'
                                                        ? 'bg-accent-blue/15 text-accent-blue'
                                                        : 'bg-bg-tertiary text-text-muted'
                                                    }`}
                                                  >
                                                    {cand.current_stage.replace('_', ' ')}
                                                  </span>
                                                  {cand.all_versions.length > 1 && (
                                                    <span className="px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-600 text-[10px] font-bold">
                                                      {cand.all_versions.length} versions
                                                    </span>
                                                  )}
                                                </div>
                                              </div>
                                            </div>
                                          </div>

                                          {/* Current Resume Info box */}
                                          <div className="bg-bg-tertiary/40 rounded-xl p-2.5 border border-border-primary/60 text-xs">
                                            {hasResume ? (
                                              <div className="flex items-center gap-2">
                                                <FileText className="w-4 h-4 text-accent-purple shrink-0" />
                                                <div className="min-w-0 flex-1">
                                                  <p className="font-bold text-text-primary truncate">
                                                    {cand.resume_filename || 'Current Resume.pdf'}
                                                  </p>
                                                  <p className="text-[10px] text-text-muted">
                                                    Updated {new Date(cand.updated_at).toLocaleDateString()}
                                                  </p>
                                                </div>
                                              </div>
                                            ) : (
                                              <div className="flex items-center gap-2 text-text-muted">
                                                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                                                <span className="text-[11px]">No resume uploaded</span>
                                              </div>
                                            )}
                                          </div>
                                        </div>

                                        {/* Actions footer */}
                                        <div className="mt-4 pt-3 border-t border-border-primary/50 flex items-center justify-between gap-2">
                                          <div className="flex items-center gap-1">
                                            {hasResume && (
                                              <>
                                                <button
                                                  onClick={() => handleViewFile(currentUrl!, cand.resume_filename || 'resume.pdf')}
                                                  className="p-2 text-text-secondary hover:text-accent-blue hover:bg-accent-blue/10 rounded-xl transition-all"
                                                  title="View Resume"
                                                >
                                                  <Eye className="w-4 h-4" />
                                                </button>
                                                <button
                                                  onClick={() => handleViewFile(currentUrl!, cand.resume_filename || `${cand.full_name}_Resume.pdf`)}
                                                  className="p-2 text-text-secondary hover:text-emerald-600 hover:bg-emerald-500/10 rounded-xl transition-all"
                                                  title="Download Resume"
                                                >
                                                  <Download className="w-4 h-4" />
                                                </button>
                                              </>
                                            )}
                                            <button
                                              onClick={() => setHistoryModalCandidate(cand)}
                                              className="p-2 text-text-secondary hover:text-amber-500 hover:bg-amber-500/10 rounded-xl transition-all relative"
                                              title="Version History"
                                            >
                                              <History className="w-4 h-4" />
                                              {cand.all_versions.length > 0 && (
                                                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 text-white text-[9px] font-black flex items-center justify-center">
                                                  {cand.all_versions.length}
                                                </span>
                                              )}
                                            </button>
                                          </div>

                                          <button
                                            onClick={() => {
                                              setUploadModalCandidate(cand);
                                              setUploadFileState(null);
                                              setUploadNotes('');
                                            }}
                                            className="flex items-center gap-1 px-2.5 py-1.5 bg-bg-tertiary hover:bg-accent-purple hover:text-white border border-border-primary text-text-primary rounded-xl text-xs font-bold transition-all"
                                            title="Upload new version"
                                          >
                                            <Upload className="w-3 h-3" />
                                            New Version
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* VIEW MODE 2: CARD GRID VIEW */}
          {viewMode === 'grid' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredCandidates.map(cand => {
                const isSelected = selectedCandidateIds.has(cand.id);
                const currentUrl = cand.resume_url || cand.resume_base64;
                const hasResume = !!currentUrl;

                return (
                  <div
                    key={cand.id}
                    className={`bg-bg-secondary rounded-3xl border p-6 flex flex-col justify-between transition-all shadow-sm ${
                      isSelected ? 'border-accent-purple ring-2 ring-accent-purple/20' : 'border-border-primary'
                    }`}
                  >
                    <div className="space-y-4">
                      {/* Domain & Role Tag */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <span className="inline-block px-2.5 py-1 rounded-xl bg-accent-purple/10 text-accent-purple text-xs font-bold truncate max-w-full">
                            {cand.domain_name}
                          </span>
                          <p className="text-xs text-text-secondary font-bold mt-1 truncate">
                            {cand.role_name}
                          </p>
                        </div>
                        <button
                          onClick={() => toggleSelectCandidate(cand.id)}
                          className="text-text-muted hover:text-accent-purple shrink-0 mt-0.5"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-5 h-5 text-accent-purple" />
                          ) : (
                            <Square className="w-5 h-5" />
                          )}
                        </button>
                      </div>

                      {/* Candidate Name & Stage */}
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <a
                            href={`#candidate/${cand.id}`}
                            className="text-lg font-bold text-text-primary hover:text-accent-purple transition-colors block truncate"
                          >
                            {cand.full_name}
                          </a>
                          {cand.is_free_trial && (
                            <FreeTrialBadge 
                              size="sm" 
                              startDate={cand.free_trial_start_date} 
                              endDate={cand.free_trial_end_date} 
                            />
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              cand.current_stage === 'marketing_active'
                                ? 'bg-emerald-500/15 text-emerald-600'
                                : 'bg-accent-blue/15 text-accent-blue'
                            }`}
                          >
                            {cand.current_stage.replace('_', ' ')}
                          </span>
                          <span className="text-xs text-text-muted">
                            {cand.all_versions.length} {cand.all_versions.length === 1 ? 'version' : 'versions'}
                          </span>
                        </div>
                      </div>

                      {/* Resume details */}
                      <div className="bg-bg-tertiary/50 p-3 rounded-2xl border border-border-primary/60">
                        {hasResume ? (
                          <div className="flex items-center gap-2.5">
                            <FileText className="w-5 h-5 text-accent-purple shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-bold text-text-primary truncate">
                                {cand.resume_filename || 'Candidate Resume.pdf'}
                              </p>
                              <p className="text-[10px] text-text-muted">
                                {new Date(cand.updated_at).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <div className="text-xs text-amber-500 flex items-center gap-1.5">
                            <AlertCircle className="w-4 h-4" />
                            <span>No resume on file</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Bottom Actions */}
                    <div className="mt-5 pt-4 border-t border-border-primary flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1">
                        {hasResume && (
                          <>
                            <button
                              onClick={() => handleViewFile(currentUrl!, cand.resume_filename || 'resume.pdf')}
                              className="p-2 text-text-secondary hover:text-accent-blue hover:bg-accent-blue/10 rounded-xl"
                              title="View"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleViewFile(currentUrl!, cand.resume_filename || `${cand.full_name}_Resume.pdf`)}
                              className="p-2 text-text-secondary hover:text-emerald-600 hover:bg-emerald-500/10 rounded-xl"
                              title="Download"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => setHistoryModalCandidate(cand)}
                          className="p-2 text-text-secondary hover:text-amber-500 hover:bg-amber-500/10 rounded-xl"
                          title="Version History"
                        >
                          <History className="w-4 h-4" />
                        </button>
                      </div>

                      <button
                        onClick={() => {
                          setUploadModalCandidate(cand);
                          setUploadFileState(null);
                          setUploadNotes('');
                        }}
                        className="flex items-center gap-1.5 px-3 py-2 bg-bg-tertiary hover:bg-accent-purple hover:text-white border border-border-primary rounded-xl text-xs font-bold transition-all"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        Upload
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* VIEW MODE 3: DENSE TABLE VIEW */}
          {viewMode === 'table' && (
            <div className="bg-bg-secondary rounded-3xl border border-border-primary overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-bg-tertiary/70 border-b border-border-primary text-text-muted font-bold uppercase tracking-wider">
                    <tr>
                      <th className="p-4 w-10">
                        <button onClick={toggleSelectAll} className="text-text-muted hover:text-accent-purple">
                          {selectedCandidateIds.size === filteredCandidates.length && filteredCandidates.length > 0 ? (
                            <CheckSquare className="w-4 h-4 text-accent-purple" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </th>
                      <th className="p-4">Candidate</th>
                      <th className="p-4">Domain</th>
                      <th className="p-4">Role / Designation</th>
                      <th className="p-4">Stage</th>
                      <th className="p-4">Current Resume File</th>
                      <th className="p-4 text-center">Versions</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-primary/50 text-text-primary">
                    {filteredCandidates.map(cand => {
                      const isSelected = selectedCandidateIds.has(cand.id);
                      const currentUrl = cand.resume_url || cand.resume_base64;
                      const hasResume = !!currentUrl;

                      return (
                        <tr
                          key={cand.id}
                          className={`hover:bg-bg-tertiary/30 transition-colors ${
                            isSelected ? 'bg-accent-purple/[0.03]' : ''
                          }`}
                        >
                          <td className="p-4">
                            <button
                              onClick={() => toggleSelectCandidate(cand.id)}
                              className="text-text-muted hover:text-accent-purple"
                            >
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4 text-accent-purple" />
                              ) : (
                                <Square className="w-4 h-4" />
                              )}
                            </button>
                          </td>
                          <td className="p-4">
                            <div className="flex items-center gap-2 flex-wrap">
                              <a
                                href={`#candidate/${cand.id}`}
                                className="font-bold text-text-primary hover:text-accent-purple transition-colors block"
                              >
                                {cand.full_name}
                              </a>
                              {cand.is_free_trial && (
                                <FreeTrialBadge 
                                  size="sm" 
                                  startDate={cand.free_trial_start_date} 
                                  endDate={cand.free_trial_end_date} 
                                />
                              )}
                            </div>
                            <span className="text-[11px] text-text-muted">{cand.email || cand.phone}</span>
                          </td>
                          <td className="p-4 font-bold text-accent-purple">
                            {cand.domain_name}
                          </td>
                          <td className="p-4 font-medium text-text-secondary">
                            {cand.role_name}
                          </td>
                          <td className="p-4">
                            <span
                              className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                                cand.current_stage === 'marketing_active'
                                  ? 'bg-emerald-500/15 text-emerald-600'
                                  : 'bg-accent-blue/15 text-accent-blue'
                              }`}
                            >
                              {cand.current_stage.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="p-4">
                            {hasResume ? (
                              <div className="flex items-center gap-2">
                                <FileText className="w-4 h-4 text-accent-purple shrink-0" />
                                <span className="font-medium truncate max-w-[200px]">
                                  {cand.resume_filename || 'Resume.pdf'}
                                </span>
                              </div>
                            ) : (
                              <span className="text-text-muted italic">No resume</span>
                            )}
                          </td>
                          <td className="p-4 text-center">
                            <button
                              onClick={() => setHistoryModalCandidate(cand)}
                              className="px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-600 hover:bg-amber-500 hover:text-white transition-all font-bold text-xs"
                            >
                              {cand.all_versions.length} {cand.all_versions.length === 1 ? 'ver' : 'vers'}
                            </button>
                          </td>
                          <td className="p-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {hasResume && (
                                <>
                                  <button
                                    onClick={() => handleViewFile(currentUrl!, cand.resume_filename || 'resume.pdf')}
                                    className="p-1.5 text-text-secondary hover:text-accent-blue rounded-lg"
                                    title="View"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => handleViewFile(currentUrl!, cand.resume_filename || `${cand.full_name}_Resume.pdf`)}
                                    className="p-1.5 text-text-secondary hover:text-emerald-600 rounded-lg"
                                    title="Download"
                                  >
                                    <Download className="w-4 h-4" />
                                  </button>
                                </>
                              )}
                              <button
                                onClick={() => {
                                  setUploadModalCandidate(cand);
                                  setUploadFileState(null);
                                  setUploadNotes('');
                                }}
                                className="px-2.5 py-1 bg-bg-tertiary hover:bg-accent-purple hover:text-white border border-border-primary rounded-lg font-bold transition-all text-xs"
                              >
                                Upload
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* UPLOAD NEW VERSION MODAL */}
      <AnimatePresence>
        {uploadModalCandidate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-bg-secondary w-full max-w-lg rounded-2xl sm:rounded-3xl border border-border-primary p-4 sm:p-6 shadow-2xl space-y-6 max-h-[94vh] flex flex-col overflow-y-auto touch-scroll"
            >
              <div className="flex items-center justify-between border-b border-border-primary pb-4">
                <div>
                  <h3 className="text-xl font-bold text-text-primary">
                    Upload Resume Version
                  </h3>
                  <p className="text-xs text-text-secondary mt-0.5">
                    For <span className="font-bold text-text-primary">{uploadModalCandidate.full_name}</span> ({uploadModalCandidate.domain_name} → {uploadModalCandidate.role_name})
                  </p>
                </div>
                <button
                  onClick={() => setUploadModalCandidate(null)}
                  className="p-2 text-text-muted hover:text-text-primary rounded-xl"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                {/* File picker */}
                <div>
                  <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-2">
                    Resume File (PDF / DOCX)
                  </label>
                  <div className="border-2 border-dashed border-border-primary rounded-2xl p-6 text-center hover:border-accent-purple/50 transition-colors bg-bg-tertiary/30">
                    <input
                      type="file"
                      id="resume-version-file"
                      accept=".pdf,.doc,.docx"
                      onChange={e => {
                        if (e.target.files && e.target.files[0]) {
                          setUploadFileState(e.target.files[0]);
                        }
                      }}
                      className="hidden"
                    />
                    <label
                      htmlFor="resume-version-file"
                      className="cursor-pointer flex flex-col items-center justify-center gap-2"
                    >
                      <Upload className="w-8 h-8 text-accent-purple" />
                      {uploadFileState ? (
                        <p className="text-sm font-bold text-accent-purple">{uploadFileState.name}</p>
                      ) : (
                        <>
                          <p className="text-sm font-bold text-text-primary">Click to select resume</p>
                          <p className="text-xs text-text-muted">PDF, DOC, DOCX up to 5MB</p>
                        </>
                      )}
                    </label>
                  </div>
                </div>

                {/* Version Notes */}
                <div>
                  <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-2">
                    Version Notes / Change Summary
                  </label>
                  <textarea
                    rows={3}
                    placeholder="e.g. Updated skills, added 2026 experience, patched for fintech domain..."
                    value={uploadNotes}
                    onChange={e => setUploadNotes(e.target.value)}
                    className="w-full bg-bg-tertiary border border-border-primary rounded-2xl p-3 text-sm text-text-primary focus:outline-none focus:border-accent-purple"
                  />
                </div>

                <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-3.5 text-xs text-amber-700 dark:text-amber-300 space-y-1">
                  <p className="font-bold flex items-center gap-1.5">
                    <History className="w-4 h-4" />
                    Automatic Version Preservation
                  </p>
                  <p className="text-[11px] opacity-90">
                    The current resume will be preserved in version history as Version {uploadModalCandidate.all_versions.length || 1}. It will never be overwritten.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-border-primary">
                <button
                  onClick={() => setUploadModalCandidate(null)}
                  className="px-5 py-2.5 rounded-xl border border-border-primary text-text-secondary hover:text-text-primary text-sm font-bold"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUploadNewVersion}
                  disabled={!uploadFileState || isUploading}
                  className="px-6 py-2.5 bg-accent-purple text-white rounded-xl text-sm font-bold hover:bg-accent-purple/90 transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  {isUploading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      Upload Version {uploadModalCandidate.all_versions.length + 1}
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* VERSION HISTORY DRAWER / MODAL */}
      <AnimatePresence>
        {historyModalCandidate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-bg-secondary w-full max-w-2xl rounded-2xl sm:rounded-3xl border border-border-primary p-4 sm:p-6 shadow-2xl space-y-6 max-h-[94vh] sm:max-h-[85vh] flex flex-col"
            >
              <div className="flex items-center justify-between border-b border-border-primary pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-500">
                    <History className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-text-primary">Resume Version History</h3>
                    <p className="text-xs text-text-secondary">
                      {historyModalCandidate.full_name} • {historyModalCandidate.domain_name} / {historyModalCandidate.role_name}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setHistoryModalCandidate(null)}
                  className="p-2 text-text-muted hover:text-text-primary rounded-xl"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="overflow-y-auto flex-1 space-y-3 pr-1">
                {historyModalCandidate.all_versions.length === 0 ? (
                  <p className="text-center py-10 text-text-muted text-sm">No resume versions found</p>
                ) : (
                  historyModalCandidate.all_versions.map((ver, idx) => {
                    const isCur = ver.is_current;

                    return (
                      <div
                        key={ver.id || idx}
                        className={`p-4 rounded-2xl border transition-all ${
                          isCur
                            ? 'bg-accent-purple/5 border-accent-purple/40 shadow-sm'
                            : 'bg-bg-tertiary/40 border-border-primary'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <div
                              className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-xs shrink-0 ${
                                isCur
                                  ? 'bg-accent-purple text-white'
                                  : 'bg-bg-tertiary border border-border-primary text-text-muted'
                              }`}
                            >
                              v{ver.version_number || historyModalCandidate.all_versions.length - idx}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="font-bold text-text-primary text-sm">{ver.filename}</h4>
                                {isCur && (
                                  <span className="px-2 py-0.5 rounded-full bg-accent-purple text-white text-[10px] font-black uppercase">
                                    Current Active
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-text-muted mt-0.5">
                                Uploaded on {new Date(ver.uploaded_at).toLocaleString()}
                                {ver.uploaded_by_name ? ` by ${ver.uploaded_by_name}` : ''}
                              </p>
                              {ver.notes && (
                                <p className="text-xs text-text-secondary mt-2 bg-bg-secondary/80 p-2 rounded-xl border border-border-primary/50">
                                  {ver.notes}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {ver.url && (
                              <>
                                <button
                                  onClick={() => handleViewFile(ver.url, ver.filename)}
                                  className="p-2 text-text-secondary hover:text-accent-blue hover:bg-accent-blue/10 rounded-xl transition-all"
                                  title="View"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleViewFile(ver.url, ver.filename)}
                                  className="p-2 text-text-secondary hover:text-emerald-600 hover:bg-emerald-500/10 rounded-xl transition-all"
                                  title="Download"
                                >
                                  <Download className="w-4 h-4" />
                                </button>
                              </>
                            )}
                            {!isCur && ver.url && (
                              <button
                                onClick={() => handleRestoreVersion(historyModalCandidate, ver)}
                                disabled={revertingVersionId === ver.id}
                                className="flex items-center gap-1 px-3 py-1.5 bg-bg-secondary hover:bg-accent-purple hover:text-white border border-border-primary rounded-xl text-xs font-bold transition-all text-text-primary"
                                title="Make this version the active resume"
                              >
                                {revertingVersionId === ver.id ? (
                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                ) : (
                                  <RotateCcw className="w-3 h-3" />
                                )}
                                Restore Active
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="pt-4 border-t border-border-primary flex items-center justify-between">
                <button
                  onClick={() => {
                    setUploadModalCandidate(historyModalCandidate);
                    setHistoryModalCandidate(null);
                    setUploadFileState(null);
                    setUploadNotes('');
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-accent-purple text-white rounded-xl text-xs font-bold hover:bg-accent-purple/90"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Upload New Version
                </button>

                <button
                  onClick={() => setHistoryModalCandidate(null)}
                  className="px-5 py-2 rounded-xl bg-bg-tertiary border border-border-primary text-text-primary text-xs font-bold"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ZIP PROGRESS OVERLAY MODAL */}
      <AnimatePresence>
        {isZipping && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/70 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-bg-secondary w-full max-w-md rounded-2xl sm:rounded-3xl border border-border-primary p-5 sm:p-8 shadow-2xl text-center space-y-6"
            >
              <div className="w-16 h-16 rounded-3xl bg-accent-purple/10 flex items-center justify-center text-accent-purple mx-auto">
                <Download className="w-8 h-8 animate-bounce" />
              </div>

              <div className="space-y-2">
                <h3 className="text-xl font-black text-text-primary">Generating Resume Package</h3>
                <p className="text-xs text-text-secondary">
                  Structuring folder hierarchy: <span className="font-bold text-accent-purple">Domain → Role → Candidate → Resumes</span>
                </p>
              </div>

              {/* Progress Bar */}
              <div className="space-y-2">
                <div className="w-full h-3 bg-bg-tertiary rounded-full overflow-hidden border border-border-primary p-0.5">
                  <div
                    className="h-full bg-gradient-to-r from-accent-purple to-accent-blue rounded-full transition-all duration-300"
                    style={{
                      width: `${zipProgress.total > 0 ? (zipProgress.current / zipProgress.total) * 100 : 10}%`
                    }}
                  />
                </div>
                <div className="flex justify-between text-[11px] font-bold text-text-muted">
                  <span>{zipProgress.message || 'Processing resumes...'}</span>
                  <span>
                    {zipProgress.current} / {zipProgress.total}
                  </span>
                </div>
              </div>

              <p className="text-[11px] text-text-muted italic">
                Please keep this tab open while the ZIP archive is being compiled.
              </p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
