import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { subscribeToCollection, generateId, addNotification } from '../services/storage';
import { RTRRequest, Candidate, User } from '../types';
import { 
  FileEdit, 
  Search, 
  Plus, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  ArrowRight,
  MessageSquare,
  User as UserIcon,
  Filter,
  ExternalLink,
  Upload,
  FileText,
  Download,
  Calendar,
  Edit2,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { db } from '../firebase';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { useToast } from '../contexts/ToastContext';
import { uploadFile, handleViewFile } from '../services/fileService';
import { SearchableCandidateSelect } from '../components/SearchableCandidateSelect';
import { FreeTrialBadge } from '../components/FreeTrialBadge';
import { isCSHead, canActAsTLForRequest, isManagementUser } from '../lib/permissions';
import * as XLSX from 'xlsx';

export const RTRLogBook: React.FC = () => {
  const { user, isAuthReady } = useAuth();
  const { showToast } = useToast();
  const [requests, setRequests] = useState<RTRRequest[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [team, setTeam] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isActionModalOpen, setIsActionModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportStatusFilter, setExportStatusFilter] = useState<string>('all');
  const [actionConfig, setActionConfig] = useState<{
    requestId: string;
    type: 'tl_forward' | 'tl_reject' | 'cs_forward' | 'cs_back' | 'rtr_complete' | 'rtr_back' | 'rtr_reject';
    candidateName: string;
  } | null>(null);
  const [actionNotes, setActionNotes] = useState('');
  const [completedByName, setCompletedByName] = useState('');
  const [completedById, setCompletedById] = useState<string | number | null>(null);
  const [editingCompletedByReq, setEditingCompletedByReq] = useState<RTRRequest | null>(null);
  const [editCompletedByName, setEditCompletedByName] = useState('');
  const [editCompletedById, setEditCompletedById] = useState<string | number | null>(null);
  const [isSavingCompletedBy, setIsSavingCompletedBy] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const [formData, setFormData] = useState({
    candidate_id: '',
    details: ''
  });

  useEffect(() => {
    if (!isAuthReady) return;

    const unsubRequests = subscribeToCollection<RTRRequest>('jpc_rtr_requests', (data) => {
      setRequests(data.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
      setIsLoading(false);
    });

    const unsubCandidates = subscribeToCollection<Candidate>('jpc_candidates', setCandidates);
    const unsubTeam = subscribeToCollection<User>('jpc_users', setTeam);

    return () => {
      unsubRequests();
      unsubCandidates();
      unsubTeam();
    };
  }, [isAuthReady]);

  const availableCandidates = useMemo(() => {
    if (
      user?.role === 'administrator' || 
      user?.role === 'jpc_sysadmin' || 
      user?.role === 'jpc_manager'
    ) {
      return candidates;
    }
    if (user?.role === 'jpc_cs' || user?.role === 'jpc_compliance_person') {
      const assigned = candidates.filter(c => 
        String(c.assigned_cs) === String(user.id) || 
        (user.role === 'jpc_compliance_person' && user.leader_id && String(c.assigned_cs) === String(user.leader_id))
      );
      return assigned.length > 0 ? assigned : candidates;
    }
    if (user?.role === 'jpc_marketing') {
      const assigned = candidates.filter(c => 
        String(c.assigned_marketing_leader) === String(user.id) || 
        String(c.assigned_marketing) === String(user.id)
      );
      return assigned.length > 0 ? assigned : candidates;
    }
    if (user?.role === 'jpc_recruiter') {
      return candidates.filter(c => String(c.assigned_recruiter) === String(user.id));
    }
    return candidates;
  }, [candidates, user]);

  const filteredRequests = useMemo(() => {
    return requests.filter(req => {
      const candidate = candidates.find(c => c.id === req.candidate_id);
      const recruiter = team.find(u => String(u.id) === String(req.recruiter_id));
      
      const matchesSearch = `${candidate?.full_name} ${recruiter?.display_name} ${req.details}`.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesFilter = filterStatus === 'all' || req.status === filterStatus;

      // Role-based visibility
      if (user?.role === 'jpc_recruiter') {
        if (String(req.recruiter_id) !== String(user.id)) return false;
      }

      return matchesSearch && matchesFilter;
    });
  }, [requests, candidates, team, searchTerm, filterStatus, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.candidate_id || !formData.details) {
      showToast('Please fill all required fields', 'error');
      return;
    }

    const id = generateId();
    const mohitUser = team.find(u => u.username === 'mohit.panchal' || u.email === 'mohit.panchal@auriic.co');
    const faizUser = team.find(u => u.username === 'care' || String(u.display_name).toLowerCase().includes('faiz'));
    const cand = candidates.find(c => c.id === formData.candidate_id);
    const isMohitTeam = (cand && (String(cand.assigned_marketing_leader) === String(mohitUser?.id) || String(cand.assigned_marketing_leader) === String(faizUser?.id))) || 
                        (user && (String(user.leader_id) === String(mohitUser?.id) || String(user.leader_id) === String(faizUser?.id)));
    
    let initialStatus: RTRRequest['status'] = 'pending_tl';
    if (
      user?.role === 'jpc_cs' || 
      user?.role === 'administrator' || 
      user?.role === 'jpc_sysadmin' || 
      user?.role === 'jpc_manager'
    ) {
      initialStatus = 'pending_rtr_team';
    } else if (isMohitTeam || user?.role === 'jpc_compliance_person') {
      initialStatus = 'pending_cs';
    } else {
      initialStatus = 'pending_tl';
    }

    const newRequest: RTRRequest = {
      id,
      candidate_id: formData.candidate_id,
      recruiter_id: String(user?.id),
      details: formData.details,
      status: initialStatus,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    try {
      await setDoc(doc(db, 'jpc_rtr_requests', id), newRequest);
      
      const marketingTL = team.find(u => u.role === 'jpc_marketing');
      const rtrUser = team.find(u => u.role === 'jpc_resume');
      const csUser = team.find(u => u.role === 'jpc_cs');

      let recipientId: string | number | undefined = marketingTL?.id;
      if (initialStatus === 'pending_rtr_team') {
        recipientId = rtrUser?.id || marketingTL?.id;
      } else if (initialStatus === 'pending_cs') {
        recipientId = faizUser?.id || csUser?.id || marketingTL?.id;
      }

      if (recipientId) {
        await addNotification({
          recipient_id: recipientId,
          sender_id: user?.id || null,
          type: 'rtr_request',
          message: initialStatus === 'pending_rtr_team'
            ? `New RTR request for candidate ${candidates.find(c => c.id === newRequest.candidate_id)?.full_name || 'Unknown'} submitted directly to RTR Team`
            : isMohitTeam
            ? `New RTR request for candidate ${candidates.find(c => c.id === newRequest.candidate_id)?.full_name || 'Unknown'} (Bypassed TL to Faiz)`
            : `New RTR request for candidate ${candidates.find(c => c.id === newRequest.candidate_id)?.full_name || 'Unknown'}`
        });
      }

      showToast(
        initialStatus === 'pending_rtr_team'
          ? 'RTR request submitted directly to RTR Team'
          : isMohitTeam 
          ? 'RTR request submitted directly to Faiz (CS)' 
          : 'RTR change request submitted to Marketing TL', 
        'success'
      );
      setIsAddModalOpen(false);
      setFormData({ candidate_id: '', details: '' });
    } catch (error) {
      console.error('Save error:', error);
      showToast('Failed to submit request', 'error');
    }
  };

  const handleAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actionConfig) return;

    const { requestId, type } = actionConfig;
    let newStatus: RTRRequest['status'];
    
    switch (type) {
      case 'tl_forward': newStatus = 'pending_cs'; break;
      case 'tl_reject': newStatus = 'rejected'; break;
      case 'cs_forward': newStatus = 'pending_rtr_team'; break;
      case 'cs_back': newStatus = 'pending_tl'; break;
      case 'rtr_complete': newStatus = 'completed'; break;
      case 'rtr_back': newStatus = 'pending_cs'; break;
      case 'rtr_reject': newStatus = 'rejected'; break;
      default: return;
    }

    if ((type === 'tl_reject' || type === 'rtr_reject' || type === 'cs_back' || type === 'rtr_back') && !actionNotes) {
      showToast('Please provide a reason/notes', 'error');
      return;
    }

    let finalRtrUrl = '';

    setIsUploading(true);
    setUploadProgress(0);
    
    try {
      let rtrBase64 = '';
      let rtrFilename = '';

      if (type === 'rtr_complete') {
        if (!selectedFile) {
          showToast('Please select a file to upload', 'error');
          setIsUploading(false);
          return;
        }

        try {
          setUploadProgress(30);
          const request = requests.find(r => r.id === requestId);
          const candidate = candidates.find(c => c.id === request?.candidate_id);
          
          finalRtrUrl = await uploadFile(selectedFile, {
            name: candidate?.full_name || actionConfig.candidateName || 'Candidate',
            email: candidate?.email || 'N/A',
            phone: candidate?.phone || ''
          });
          rtrFilename = selectedFile.name;
          setUploadProgress(100);
        } catch (apiError: any) {
          console.error('Upload error:', apiError);
          showToast('Upload failed', 'error');
          setIsUploading(false);
          return;
        }
      }

      await handleUpdateStatus(
        requestId, 
        newStatus, 
        actionNotes, 
        finalRtrUrl, 
        rtrBase64, 
        rtrFilename,
        type === 'rtr_complete' ? (completedById || user?.id || null) : undefined,
        type === 'rtr_complete' ? (completedByName.trim() || user?.display_name || user?.username || 'Resume Team') : undefined,
        type
      );
      
      setIsActionModalOpen(false);
      setActionNotes('');
      setSelectedFile(null);
      setUploadProgress(0);
      setActionConfig(null);
    } catch (error) {
      console.error('Action error:', error);
      showToast('An unexpected error occurred', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const getCompletedByName = (req: { completed_by?: string | number | null; completed_by_name?: string | null }) => {
    if (
      req.completed_by_name && 
      req.completed_by_name.trim() !== '' && 
      req.completed_by_name !== 'Resume Team' && 
      req.completed_by_name !== 'RTR Team' &&
      req.completed_by_name !== 'User'
    ) {
      return req.completed_by_name;
    }
    if (req.completed_by) {
      const u = team.find(t => String(t.id) === String(req.completed_by));
      if (u) {
        if (u.display_name && u.display_name !== 'User') return u.display_name;
        if (u.username) return u.username;
        if (u.email) return u.email.split('@')[0];
      }
    }
    const resumeUsers = team.filter(t => t.role === 'jpc_resume');
    if (resumeUsers.length === 1) {
      return resumeUsers[0].display_name || resumeUsers[0].username || resumeUsers[0].email?.split('@')[0] || 'Resume Team';
    }
    return req.completed_by_name || 'Resume Team';
  };

  const openEditCompletedBy = (req: RTRRequest) => {
    setEditingCompletedByReq(req);
    const currentName = getCompletedByName(req);
    setEditCompletedByName(currentName !== 'Resume Team' && currentName !== 'RTR Team' ? currentName : '');
    setEditCompletedById(req.completed_by || null);
  };

  const handleSaveCompletedBy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCompletedByReq) return;
    setIsSavingCompletedBy(true);
    try {
      const nameToSave = editCompletedByName.trim() || 'Resume Team';
      await updateDoc(doc(db, 'jpc_rtr_requests', editingCompletedByReq.id), {
        completed_by: editCompletedById || editingCompletedByReq.completed_by || user?.id || null,
        completed_by_name: nameToSave,
        updated_at: new Date().toISOString()
      });
      showToast(`Updated completed user to ${nameToSave}`, 'success');
      setEditingCompletedByReq(null);
    } catch (err) {
      console.error('Failed to update completed by:', err);
      showToast('Failed to update completed by name', 'error');
    } finally {
      setIsSavingCompletedBy(false);
    }
  };

  const openActionModal = (requestId: string, candidateName: string, type: typeof actionConfig.type) => {
    setActionConfig({ requestId, candidateName, type });
    setActionNotes('');
    setSelectedFile(null);
    const initialName = (user?.display_name && user.display_name !== 'User') 
      ? user.display_name 
      : (user?.username || (user?.email ? user.email.split('@')[0] : ''));
    setCompletedByName(initialName);
    setCompletedById(user?.id || null);
    setIsActionModalOpen(true);
  };

  const handleUpdateStatus = async (
    requestId: string, 
    newStatus: RTRRequest['status'], 
    notes?: string, 
    rtrUrl?: string, 
    rtrBase64?: string, 
    rtrFilename?: string,
    completedByParam?: string | number | null,
    completedByNameParam?: string,
    actionType?: string
  ) => {
    try {
      const updateData: any = { 
        status: newStatus, 
        updated_at: new Date().toISOString() 
      };

      if (newStatus === 'completed') {
        updateData.completed_by = completedByParam !== undefined ? completedByParam : (user?.id || null);
        updateData.completed_by_name = completedByNameParam || user?.display_name || user?.username || 'Resume Team';
        updateData.completed_at = new Date().toISOString();
      }
      
      const isCSHeadUser = isCSHead(user);
      const isManagement = isManagementUser(user);

      if (actionType === 'tl_forward' || actionType === 'tl_reject') {
        if (notes) updateData.tl_notes = notes;
      } else if (actionType === 'cs_forward' && newStatus === 'pending_rtr_team') {
        const req = requests.find(r => r.id === requestId);
        if (req?.status === 'pending_tl') {
          updateData.tl_notes = notes || 'Forwarded directly to RTR Team by CS Head';
          updateData.cs_notes = notes || 'Forwarded directly to RTR Team by CS Head';
        } else {
          if (notes) updateData.cs_notes = notes;
        }
      } else if (actionType === 'cs_back') {
        if (notes) updateData.cs_notes = notes;
      } else if (actionType === 'rtr_complete' || actionType === 'rtr_back' || actionType === 'rtr_reject') {
        if (notes) updateData.rtr_team_notes = notes;
        if (rtrUrl) updateData.new_rtr_url = rtrUrl;
        if (rtrBase64) updateData.rtr_base64 = rtrBase64;
        if (rtrFilename) updateData.rtr_filename = rtrFilename;
      } else {
        if ((user?.role === 'jpc_marketing' || isCSHeadUser || isManagement) && notes && newStatus !== 'pending_rtr_team') updateData.tl_notes = notes;
        if ((user?.role === 'jpc_cs' || user?.role === 'jpc_compliance_person' || isManagement) && notes) updateData.cs_notes = notes;
        if (user?.role === 'jpc_resume' || isManagement) {
          if (notes) updateData.rtr_team_notes = notes;
          if (rtrUrl) updateData.new_rtr_url = rtrUrl;
          if (rtrBase64) updateData.rtr_base64 = rtrBase64;
          if (rtrFilename) updateData.rtr_filename = rtrFilename;
        }
      }

      await updateDoc(doc(db, 'jpc_rtr_requests', requestId), updateData);
      
      const request = requests.find(r => r.id === requestId);
      if (request) {
        let recipientId: string | number = request.recruiter_id;
        
        if (newStatus === 'pending_cs') {
          const csUser = team.find(u => u.role === 'jpc_cs');
          if (csUser) recipientId = csUser.id;
        } else if (newStatus === 'pending_rtr_team') {
          const rtrUser = team.find(u => u.role === 'jpc_resume');
          if (rtrUser) recipientId = rtrUser.id;
        }

        await addNotification({
          recipient_id: recipientId,
          sender_id: user?.id || null,
          type: 'rtr_request',
          message: `RTR request for candidate ${candidates.find(c => c.id === request.candidate_id)?.full_name || 'Unknown'} has been updated to ${newStatus.replace('_', ' ')}`
        });

        if (recipientId !== request.recruiter_id && String(request.recruiter_id) !== String(user?.id)) {
          await addNotification({
            recipient_id: request.recruiter_id,
            sender_id: user?.id || null,
            type: 'rtr_request',
            message: `Your RTR request for candidate ${candidates.find(c => c.id === request.candidate_id)?.full_name || 'Unknown'} was moved forward to ${newStatus.replace('_', ' ')}`
          });
        }
      }

      showToast(`Request updated to ${newStatus.replace('_', ' ')}`, 'success');
    } catch (error) {
      console.error('Update error:', error);
      showToast('Failed to update request', 'error');
    }
  };

  const handleExportReport = (statusToExport: string) => {
    const filtered = requests.filter(req => {
      if (statusToExport === 'all') return true;
      if (statusToExport === 'pending_all') {
        return req.status === 'pending_tl' || req.status === 'pending_cs' || req.status === 'pending_rtr_team';
      }
      return req.status === statusToExport;
    });

    if (filtered.length === 0) {
      showToast('No records found for the selected export status', 'error');
      return;
    }

    const statusMap: Record<string, string> = {
      pending_tl: 'Pending TL Approval',
      pending_cs: 'Pending CS Review',
      pending_rtr_team: 'Pending RTR Team Action',
      completed: 'Completed',
      rejected: 'Rejected'
    };

    const exportData = filtered.map((req, idx) => {
      const candidate = candidates.find(c => c.id === req.candidate_id);
      const recruiter = team.find(u => String(u.id) === String(req.recruiter_id));
      const csUser = team.find(u => String(u.id) === String(candidate?.assigned_cs));
      const mktLeader = team.find(u => String(u.id) === String(candidate?.assigned_marketing_leader));
      
      const formattedCreated = req.created_at ? new Date(req.created_at).toLocaleString() : 'N/A';
      const formattedUpdated = req.updated_at ? new Date(req.updated_at).toLocaleString() : 'N/A';
      const formattedCompleted = req.completed_at 
        ? new Date(req.completed_at).toLocaleString() 
        : (req.status === 'completed' ? new Date(req.updated_at).toLocaleString() : 'N/A');

      const completedBy = getCompletedByName(req);

      return {
        'S.No': idx + 1,
        'Request ID': req.id,
        'Candidate Name': candidate?.full_name || 'Unknown',
        'Candidate Email': candidate?.email || 'N/A',
        'Candidate Phone': candidate?.phone || 'N/A',
        'Domain / Tech Stack': candidate?.domain_interested || candidate?.job_interest || 'N/A',
        'Target Role': candidate?.job_interest || 'N/A',
        'Current Stage': candidate?.current_stage ? candidate.current_stage.replace('_', ' ').toUpperCase() : 'N/A',
        'Assigned Recruiter': recruiter?.display_name || recruiter?.username || req.recruiter_id || 'Unassigned',
        'Assigned CS Person': csUser?.display_name || 'Unassigned',
        'Assigned Marketing Leader': mktLeader?.display_name || 'Unassigned',
        'Status': statusMap[req.status] || req.status,
        'Request Date & Time': formattedCreated,
        'RTR Details / Instructions': req.details || '',
        'TL Remarks / Notes': req.tl_notes || '',
        'CS Remarks / Notes': req.cs_notes || '',
        'RTR Team Remarks / Notes': req.rtr_team_notes || '',
        'Completed By': completedBy,
        'Completed Date & Time': formattedCompleted,
        'New RTR File Name': req.rtr_filename || '',
        'New RTR Document URL': req.new_rtr_url || req.rtr_base64 || '',
        'Last Updated At': formattedUpdated
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'RTR Log');
    
    const statusLabel = statusToExport === 'all' ? 'All_Statuses' : statusToExport;
    const fileName = `RTR_Log_Report_${statusLabel}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
    showToast(`Exported ${filtered.length} records to Excel report`, 'success');
    setIsExportModalOpen(false);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending_tl': return 'bg-accent-purple/10 text-accent-purple border-accent-purple/20';
      case 'pending_cs': return 'bg-accent-amber/10 text-accent-amber border-accent-amber/20';
      case 'pending_rtr_team': return 'bg-accent-blue/10 text-accent-blue border-accent-blue/20';
      case 'completed': return 'bg-accent-green/10 text-accent-green border-accent-green/20';
      case 'rejected': return 'bg-accent-red/10 text-accent-red border-accent-red/20';
      default: return 'bg-bg-tertiary text-text-secondary border-border-primary';
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-accent-blue/30 border-t-accent-blue rounded-full animate-spin" />
      </div>
    );
  }

  const canCreateRequest = 
    user?.role === 'administrator' || 
    user?.role === 'jpc_sysadmin' || 
    user?.role === 'jpc_manager' || 
    user?.role === 'jpc_cs' || 
    user?.role === 'jpc_compliance_person' || 
    user?.role === 'jpc_recruiter' || 
    user?.role === 'jpc_marketing';

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-text-primary tracking-tight">RTR Log Book</h1>
          <p className="text-xs sm:text-sm text-text-secondary mt-1">Track and manage RTR modification requests.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <button
            onClick={() => setIsExportModalOpen(true)}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 sm:px-5 sm:py-3 border border-border-primary hover:border-text-secondary/35 text-text-primary rounded-xl sm:rounded-2xl text-xs sm:text-sm font-bold bg-bg-secondary hover:shadow transition-all cursor-pointer"
          >
            <Download className="w-4 h-4 text-accent-blue" />
            <span>Export</span>
          </button>
          {canCreateRequest && (
            <button 
              onClick={() => setIsAddModalOpen(true)}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 sm:px-6 sm:py-3 bg-accent-blue text-white font-bold rounded-xl sm:rounded-2xl hover:bg-accent-blue/90 transition-all shadow-lg shadow-accent-blue/20 text-xs sm:text-sm cursor-pointer"
            >
              <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
              <span>Request Change</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input 
            type="text"
            placeholder="Search requests..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 sm:py-3 bg-bg-secondary border border-border-primary rounded-xl sm:rounded-2xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-accent-blue/20 transition-all"
          />
        </div>
        <div className="flex items-center gap-2 bg-bg-secondary border border-border-primary rounded-xl sm:rounded-2xl px-3.5 py-2">
          <Filter className="w-4 h-4 text-text-muted" />
          <select 
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-transparent border-none focus:ring-0 text-xs sm:text-sm font-medium text-text-primary cursor-pointer w-full sm:w-auto"
          >
            <option value="all">All Status</option>
            <option value="pending_tl">Pending TL</option>
            <option value="pending_cs">Pending CS</option>
            <option value="pending_rtr_team">Pending RTR Team</option>
            <option value="completed">Completed</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <AnimatePresence mode="popLayout">
          {filteredRequests.map((req) => {
            const candidate = candidates.find(c => c.id === req.candidate_id);
            const recruiter = team.find(u => String(u.id) === String(req.recruiter_id));

            return (
              <motion.div
                key={req.id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-bg-secondary border border-border-primary rounded-3xl p-6 hover:shadow-xl hover:shadow-black/5 transition-all group"
              >
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                  <div className="flex-1 space-y-4">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border",
                        getStatusColor(req.status)
                      )}>
                        {req.status.replace('_', ' ')}
                      </div>
                      <span className="text-xs text-text-muted font-medium">
                        {new Date(req.created_at).toLocaleDateString()} at {new Date(req.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <div>
                      <h3 className="text-xl font-bold text-text-primary flex items-center gap-2 flex-wrap">
                        <UserIcon className="w-5 h-5 text-accent-blue" />
                        {candidate?.full_name || 'Unknown Candidate'}
                        {candidate?.is_free_trial && (
                          <FreeTrialBadge 
                            size="sm" 
                            startDate={candidate.free_trial_start_date} 
                            endDate={candidate.free_trial_end_date} 
                          />
                        )}
                        {candidate?.resume_url && (
                          <button 
                            onClick={() => handleViewFile(candidate.resume_url || '', candidate.resume_filename || 'resume.pdf')}
                            className="ml-2 p-1.5 bg-bg-tertiary hover:bg-bg-tertiary/80 rounded-lg transition-all group/resume"
                            title="View Current Resume"
                          >
                            <FileText className="w-4 h-4 text-accent-blue group-hover/resume:scale-110 transition-transform" />
                          </button>
                        )}
                      </h3>
                      <p className="text-sm text-text-secondary mt-1 flex items-center gap-1">
                        Requested by <span className="font-bold text-text-primary">{recruiter?.display_name || 'Unknown Recruiter'}</span>
                      </p>
                    </div>

                    <div className="bg-bg-tertiary rounded-2xl p-4 border border-border-primary/50">
                      <p className="text-sm text-text-primary whitespace-pre-wrap leading-relaxed">
                        {req.details}
                      </p>
                    </div>

                    {(req.tl_notes || req.cs_notes || req.rtr_team_notes) && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {req.tl_notes && (
                          <div className="space-y-1">
                            <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest px-1">TL Notes</span>
                            <div className="bg-accent-purple/5 border border-accent-purple/10 rounded-xl p-3 text-xs text-text-secondary italic">
                              {req.tl_notes}
                            </div>
                          </div>
                        )}
                        {req.cs_notes && (
                          <div className="space-y-1">
                            <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest px-1">CS Notes</span>
                            <div className="bg-accent-amber/5 border border-accent-amber/10 rounded-xl p-3 text-xs text-text-secondary italic">
                              {req.cs_notes}
                            </div>
                          </div>
                        )}
                        {req.rtr_team_notes && (
                          <div className="space-y-1">
                            <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest px-1">RTR Team Notes</span>
                            <div className="bg-accent-blue/5 border border-accent-blue/10 rounded-xl p-3 text-xs text-text-secondary italic">
                              {req.rtr_team_notes}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {(req.new_rtr_url || req.rtr_base64) && (
                      <div className="flex flex-wrap items-center gap-2 pt-2">
                        <span className="text-xs font-bold text-text-primary">New RTR:</span>
                        <button 
                          onClick={() => handleViewFile(req.new_rtr_url || req.rtr_base64 || '', req.rtr_filename || 'rtr.pdf')}
                          className="inline-flex items-center gap-2 px-3 py-1.5 bg-accent-blue/10 hover:bg-accent-blue/20 text-accent-blue font-bold text-xs rounded-xl border border-accent-blue/20 transition-all cursor-pointer shadow-sm"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>View / Download Document</span>
                          {req.rtr_filename && (
                            <span className="text-[11px] text-text-muted font-normal underline decoration-dotted">
                              ({req.rtr_filename})
                            </span>
                          )}
                        </button>
                      </div>
                    )}

                    {req.status === 'completed' && (
                      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-accent-green/5 border border-accent-green/20 rounded-2xl">
                        <div className="flex flex-wrap items-center gap-3">
                          <div className="flex items-center gap-1.5 text-xs text-accent-green font-bold">
                            <CheckCircle2 className="w-4 h-4 shrink-0" />
                            <span>Completed By:</span>
                            <span className="text-text-primary font-black text-xs px-2 py-0.5 bg-accent-green/15 rounded-lg border border-accent-green/30">
                              {getCompletedByName(req)}
                            </span>
                            <span className="text-[10px] text-text-muted font-semibold ml-1">
                              (Resume Team)
                            </span>
                          </div>
                          <div className="h-3 w-px bg-accent-green/20 hidden sm:block" />
                          <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                            <Calendar className="w-3.5 h-3.5 text-text-muted shrink-0" />
                            <span>Completed Date:</span>
                            <span className="font-bold text-text-primary">
                              {new Date(req.completed_at || req.updated_at).toLocaleDateString()} at {new Date(req.completed_at || req.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>

                        {(user?.role === 'jpc_resume' || user?.role === 'administrator' || user?.role === 'jpc_sysadmin' || user?.role === 'jpc_manager') && (
                          <button
                            type="button"
                            onClick={() => openEditCompletedBy(req)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold text-accent-green hover:text-white bg-accent-green/10 hover:bg-accent-green rounded-xl transition-all border border-accent-green/30 cursor-pointer"
                            title="Edit Completed By User"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            <span>Edit Name</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-2 w-full md:w-auto md:min-w-[180px] shrink-0">
                     {/* TL Actions */}
                    {(() => {
                      const isCSHeadUser = isCSHead(user);
                      const isManagement = isManagementUser(user);
                      const canActAsTL = canActAsTLForRequest(user);
                      
                      return canActAsTL && req.status === 'pending_tl' && (
                        <>
                          <button 
                            onClick={() => openActionModal(req.id, candidate?.full_name || 'Candidate', 'tl_forward')}
                            className="w-full py-3 bg-accent-purple text-white font-bold rounded-xl hover:bg-accent-purple/90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-accent-purple/20"
                          >
                            <ArrowRight className="w-4 h-4" />
                            {isCSHeadUser ? 'Forward (Acting as TL / CS Head)' : 'Forward to CS'}
                          </button>
                          {(isCSHeadUser || isManagement) && (
                            <button 
                              onClick={() => openActionModal(req.id, candidate?.full_name || 'Candidate', 'cs_forward')}
                              className="w-full py-2.5 bg-accent-blue/10 text-accent-blue font-bold rounded-xl hover:bg-accent-blue/20 transition-all flex items-center justify-center gap-2 border border-accent-blue/30 text-xs"
                            >
                              <ArrowRight className="w-3.5 h-3.5" />
                              Forward to RTR Team
                            </button>
                          )}
                          <button 
                            onClick={() => openActionModal(req.id, candidate?.full_name || 'Candidate', 'tl_reject')}
                            className="w-full py-3 bg-bg-tertiary text-accent-red font-bold rounded-xl hover:bg-accent-red/10 transition-all flex items-center justify-center gap-2 border border-accent-red/20"
                          >
                            <XCircle className="w-4 h-4" />
                            Reject Request
                          </button>
                        </>
                      );
                    })()}

                    {/* CS Actions */}
                    {(user?.role === 'jpc_cs' || user?.role === 'jpc_compliance_person' || user?.role === 'administrator' || user?.role === 'jpc_sysadmin' || user?.role === 'jpc_manager') && req.status === 'pending_cs' && (
                      <>
                        <button 
                          onClick={() => openActionModal(req.id, candidate?.full_name || 'Candidate', 'cs_forward')}
                          className="w-full py-3 bg-accent-blue text-white font-bold rounded-xl hover:bg-accent-blue/90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-accent-blue/20"
                        >
                          <ArrowRight className="w-4 h-4" />
                          Forward to RTR Team
                        </button>
                        <button 
                          onClick={() => openActionModal(req.id, candidate?.full_name || 'Candidate', 'cs_back')}
                          className="w-full py-3 bg-bg-tertiary text-accent-amber font-bold rounded-xl hover:bg-accent-amber/10 transition-all flex items-center justify-center gap-2 border border-accent-amber/20"
                        >
                          <Clock className="w-4 h-4" />
                          Send Back to TL
                        </button>
                      </>
                    )}

                    {/* RTR Team Actions */}
                    {(user?.role === 'jpc_resume' || user?.role === 'administrator' || user?.role === 'jpc_sysadmin' || user?.role === 'jpc_manager') && req.status === 'pending_rtr_team' && (
                      <>
                        <button 
                          onClick={() => openActionModal(req.id, candidate?.full_name || 'Candidate', 'rtr_complete')}
                          className="w-full py-3 bg-accent-green text-white font-bold rounded-xl hover:bg-accent-green/90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-accent-green/20"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          Upload & Complete
                        </button>
                        <button 
                          onClick={() => openActionModal(req.id, candidate?.full_name || 'Candidate', 'rtr_back')}
                          className="w-full py-3 bg-bg-tertiary text-accent-amber font-bold rounded-xl hover:bg-accent-amber/10 transition-all flex items-center justify-center gap-2 border border-accent-amber/20"
                        >
                          <Clock className="w-4 h-4" />
                          Send Back to CS
                        </button>
                        <button 
                          onClick={() => openActionModal(req.id, candidate?.full_name || 'Candidate', 'rtr_reject')}
                          className="w-full py-3 bg-bg-tertiary text-accent-red font-bold rounded-xl hover:bg-accent-red/10 transition-all flex items-center justify-center gap-2 border border-accent-red/20"
                        >
                          <XCircle className="w-4 h-4" />
                          Reject Request
                        </button>
                      </>
                    )}

                    {(req.status === 'completed' || req.status === 'rejected') && (
                      <div className="text-center py-4 px-3 bg-bg-tertiary/60 rounded-2xl border border-border-primary/50">
                        {req.status === 'completed' ? (
                          <div className="flex flex-col items-center gap-1.5 text-accent-green">
                            <CheckCircle2 className="w-7 h-7" />
                            <span className="font-bold text-xs uppercase tracking-wider">Completed</span>
                            <span className="text-[11px] font-black text-text-primary">
                              By: {getCompletedByName(req)}
                            </span>
                            <span className="text-[10px] text-text-muted">
                              {new Date(req.completed_at || req.updated_at).toLocaleDateString()} {new Date(req.completed_at || req.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-2 text-accent-red">
                            <XCircle className="w-8 h-8" />
                            <span className="font-bold text-sm">Request Rejected</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {filteredRequests.length === 0 && (
          <div className="bg-bg-secondary border border-border-primary border-dashed rounded-3xl p-12 text-center">
            <div className="w-16 h-16 bg-bg-tertiary rounded-full flex items-center justify-center mx-auto mb-4">
              <FileEdit className="w-8 h-8 text-text-muted" />
            </div>
            <h3 className="text-lg font-bold text-text-primary">No requests found</h3>
            <p className="text-text-secondary mt-1">
              {searchTerm || filterStatus !== 'all' ? 'Try adjusting your filters' : 'New RTR change requests will appear here'}
            </p>
          </div>
        )}
      </div>

      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-bg-secondary w-full max-w-lg rounded-[32px] shadow-2xl overflow-hidden border border-border-primary"
          >
            <div className="p-8">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-2xl font-bold text-text-primary tracking-tight">Request RTR Change</h2>
                  <p className="text-text-secondary text-sm mt-1">Submit your RTR change request.</p>
                </div>
                <button 
                  onClick={() => setIsAddModalOpen(false)}
                  className="p-2 hover:bg-bg-tertiary rounded-xl transition-colors"
                >
                  <XCircle className="w-6 h-6 text-text-muted" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <SearchableCandidateSelect
                  candidates={availableCandidates}
                  value={formData.candidate_id}
                  onChange={(candId) => setFormData({ ...formData, candidate_id: candId })}
                  label="Select Candidate"
                  placeholder="Search and select candidate..."
                  required
                />

                <div className="space-y-2">
                  <label className="text-sm font-bold text-text-primary px-1">Change Details</label>
                  <textarea 
                    value={formData.details}
                    onChange={(e) => setFormData({ ...formData, details: e.target.value })}
                    placeholder="Describe the changes needed in the RTR..."
                    className="w-full px-4 py-3 bg-bg-tertiary border border-border-primary rounded-2xl focus:outline-none focus:ring-2 focus:ring-accent-blue/20 transition-all min-h-[150px] font-medium"
                    required
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button 
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="flex-1 py-4 bg-bg-tertiary text-text-primary font-bold rounded-2xl hover:bg-bg-tertiary/80 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-4 bg-accent-blue text-white font-bold rounded-2xl hover:bg-accent-blue/90 transition-all shadow-lg shadow-accent-blue/20"
                  >
                    Submit Request
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </div>
      )}

      {isActionModalOpen && actionConfig && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-bg-secondary w-full max-w-lg rounded-[32px] shadow-2xl overflow-hidden border border-border-primary"
          >
            <div className="p-8">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-2xl font-bold text-text-primary tracking-tight">
                    {actionConfig.type.includes('complete') ? 'Complete Request' : 
                     actionConfig.type.includes('reject') ? 'Reject Request' : 
                     actionConfig.type.includes('back') ? 'Send Back' : 'Forward Request'}
                  </h2>
                  <div className="text-text-secondary text-sm mt-1 flex items-center gap-2 flex-wrap">
                    <span>Candidate:</span> <span className="font-bold text-text-primary">{actionConfig.candidateName}</span>
                    {(() => {
                      const req = requests.find(r => r.id === actionConfig.requestId);
                      const cand = candidates.find(c => c.id === req?.candidate_id);
                      return cand?.is_free_trial ? (
                        <FreeTrialBadge 
                          size="sm" 
                          startDate={cand.free_trial_start_date} 
                          endDate={cand.free_trial_end_date} 
                        />
                      ) : null;
                    })()}
                  </div>
                </div>
                <button 
                  onClick={() => setIsActionModalOpen(false)}
                  className="p-2 hover:bg-bg-tertiary rounded-xl transition-colors"
                >
                  <XCircle className="w-6 h-6 text-text-muted" />
                </button>
              </div>

              <form onSubmit={handleAction} className="space-y-6">
                {actionConfig.type === 'rtr_complete' && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-text-primary px-1">
                        Completed By (Resume Team Member Name)
                      </label>
                      <input
                        type="text"
                        value={completedByName}
                        onChange={(e) => setCompletedByName(e.target.value)}
                        placeholder="e.g. Param Parmar, Mohit Panchal, Faiz..."
                        className="w-full px-4 py-3 bg-bg-tertiary border border-border-primary rounded-2xl text-sm font-semibold text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-blue/30"
                        required
                      />
                      {team.length > 0 && (
                        <div className="flex items-center gap-2 pt-1">
                          <span className="text-xs text-text-muted">Quick pick:</span>
                          <select
                            onChange={(e) => {
                              if (e.target.value) {
                                const sel = team.find(u => String(u.id) === e.target.value);
                                if (sel) {
                                  setCompletedByName(sel.display_name || sel.username);
                                  setCompletedById(sel.id);
                                }
                              }
                            }}
                            className="text-xs px-2.5 py-1 bg-bg-tertiary border border-border-primary rounded-lg text-text-secondary focus:outline-none cursor-pointer"
                          >
                            <option value="">Select Team Member...</option>
                            {team.map(u => (
                              <option key={u.id} value={u.id}>
                                {u.display_name || u.username} ({u.role.replace('jpc_', '')})
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-bold text-text-primary px-1">Upload New RTR</label>
                      <div className="relative">
                        <input 
                          type="file"
                          id="rtr-upload"
                          onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                          className="hidden"
                          accept=".pdf,.doc,.docx"
                          required
                        />
                        <label 
                          htmlFor="rtr-upload"
                          className={cn(
                            "w-full flex flex-col items-center justify-center gap-3 p-8 bg-bg-tertiary border-2 border-dashed border-border-primary rounded-2xl cursor-pointer hover:bg-bg-tertiary/80 transition-all",
                            selectedFile && "border-accent-blue bg-accent-blue/5"
                          )}
                        >
                          {selectedFile ? (
                            <>
                              <FileText className="w-10 h-10 text-accent-blue" />
                              <div className="text-center">
                                <p className="text-sm font-bold text-text-primary">{selectedFile.name}</p>
                                <p className="text-xs text-text-secondary mt-1">{(selectedFile.size / 1024).toFixed(0)} KB</p>
                              </div>
                            </>
                          ) : (
                            <>
                              <Upload className="w-10 h-10 text-text-muted" />
                              <div className="text-center">
                                <p className="text-sm font-bold text-text-primary">Click to upload RTR</p>
                                <p className="text-xs text-text-secondary mt-1">PDF, DOC, DOCX (Max 800KB)</p>
                              </div>
                            </>
                          )}
                        </label>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-sm font-bold text-text-primary px-1">
                    {actionConfig.type.includes('reject') ? 'Rejection Reason' : 
                     actionConfig.type.includes('back') ? 'Feedback' : 'Notes (Optional)'}
                  </label>
                  <textarea 
                    value={actionNotes}
                    onChange={(e) => setActionNotes(e.target.value)}
                    placeholder="Enter details here..."
                    className="w-full px-4 py-3 bg-bg-tertiary border border-border-primary rounded-2xl focus:outline-none focus:ring-2 focus:ring-accent-blue/20 transition-all min-h-[120px] font-medium"
                    required={actionConfig.type.includes('reject') || actionConfig.type.includes('back')}
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button 
                    type="button"
                    onClick={() => setIsActionModalOpen(false)}
                    className="flex-1 py-4 bg-bg-tertiary text-text-primary font-bold rounded-2xl hover:bg-bg-tertiary/80 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={isUploading}
                    className={cn(
                      "flex-1 py-4 text-white font-bold rounded-2xl transition-all shadow-lg flex items-center justify-center gap-2",
                      isUploading ? "bg-bg-tertiary text-text-muted cursor-not-allowed" :
                      actionConfig.type.includes('reject') ? "bg-accent-red shadow-accent-red/20 hover:bg-accent-red/90" :
                      actionConfig.type.includes('complete') ? "bg-accent-green shadow-accent-green/20 hover:bg-accent-green/90" :
                      "bg-accent-blue shadow-accent-blue/20 hover:bg-accent-blue/90"
                    )}
                  >
                    {isUploading ? (
                      <div className="w-full space-y-2">
                        <div className="flex items-center justify-between text-xs font-bold text-text-primary">
                          <span>Uploading...</span>
                          <span>{Math.round(uploadProgress)}%</span>
                        </div>
                        <div className="w-full h-2 bg-bg-tertiary rounded-full overflow-hidden">
                          <motion.div 
                            className="h-full bg-accent-blue"
                            initial={{ width: 0 }}
                            animate={{ width: `${uploadProgress}%` }}
                          />
                        </div>
                      </div>
                    ) : (
                      'Confirm Action'
                    )}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </div>
      )}
      {/* Export Report Modal */}
      {isExportModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-bg-secondary w-full max-w-md rounded-[32px] shadow-2xl overflow-hidden border border-border-primary p-8"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-accent-blue/10 rounded-2xl">
                  <Download className="w-6 h-6 text-accent-blue" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-text-primary">Export RTR Log</h2>
                  <p className="text-xs text-text-secondary">Comprehensive report with full tracking</p>
                </div>
              </div>
              <button 
                onClick={() => setIsExportModalOpen(false)}
                className="p-2 hover:bg-bg-tertiary rounded-xl text-text-muted hover:text-text-primary transition-all"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-5">
              <div className="space-y-2">
                <label className="text-xs font-bold text-text-muted uppercase tracking-wider px-1">
                  Status Filter
                </label>
                <select
                  value={exportStatusFilter}
                  onChange={(e) => setExportStatusFilter(e.target.value)}
                  className="w-full px-4 py-3 bg-bg-tertiary border border-border-primary rounded-2xl text-sm font-semibold text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-blue/20 cursor-pointer"
                >
                  <option value="all">All Statuses ({requests.length} total)</option>
                  <option value="pending_all">All Pending ({requests.filter(r => r.status.startsWith('pending')).length})</option>
                  <option value="pending_tl">Pending TL ({requests.filter(r => r.status === 'pending_tl').length})</option>
                  <option value="pending_cs">Pending CS ({requests.filter(r => r.status === 'pending_cs').length})</option>
                  <option value="pending_rtr_team">Pending RTR Team ({requests.filter(r => r.status === 'pending_rtr_team').length})</option>
                  <option value="completed">Completed ({requests.filter(r => r.status === 'completed').length})</option>
                  <option value="rejected">Rejected ({requests.filter(r => r.status === 'rejected').length})</option>
                </select>
              </div>

              <div className="p-4 bg-bg-tertiary rounded-2xl border border-border-primary/50 text-xs text-text-secondary space-y-1.5">
                <p className="font-bold text-text-primary">Report Highlights:</p>
                <ul className="list-disc list-inside space-y-1 text-[11px] text-text-muted">
                  <li>Candidate details (Name, contact, stage, domain)</li>
                  <li>All comments/remarks (TL, CS, RTR team)</li>
                  <li><strong>Completed By & Completed Date/Time</strong></li>
                  <li>Full RTR modification details & document links</li>
                </ul>
              </div>

              <div className="flex gap-3 pt-2">
                <button 
                  type="button"
                  onClick={() => setIsExportModalOpen(false)}
                  className="flex-1 py-3.5 bg-bg-tertiary text-text-primary font-bold rounded-2xl hover:bg-bg-tertiary/80 transition-all text-sm cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  type="button"
                  onClick={() => handleExportReport(exportStatusFilter)}
                  className="flex-1 py-3.5 bg-accent-blue text-white font-bold rounded-2xl hover:bg-accent-blue/90 transition-all shadow-lg shadow-accent-blue/20 flex items-center justify-center gap-2 text-sm cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  Export Excel (.xlsx)
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Edit Completed By Modal */}
      {editingCompletedByReq && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-bg-secondary w-full max-w-md rounded-[32px] shadow-2xl overflow-hidden border border-border-primary p-8"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-accent-green/10 rounded-2xl">
                  <Edit2 className="w-6 h-6 text-accent-green" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-text-primary">Edit Completed By</h2>
                  <p className="text-xs text-text-secondary">Assign or update the resume team member name</p>
                </div>
              </div>
              <button 
                onClick={() => setEditingCompletedByReq(null)}
                className="p-2 hover:bg-bg-tertiary rounded-xl text-text-muted hover:text-text-primary transition-all cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCompletedBy} className="space-y-5">
              <div className="space-y-2">
                <label className="text-xs font-bold text-text-muted uppercase tracking-wider px-1">
                  Team Member Name
                </label>
                <input
                  type="text"
                  value={editCompletedByName}
                  onChange={(e) => setEditCompletedByName(e.target.value)}
                  placeholder="e.g. Param Parmar, Mohit Panchal, Faiz..."
                  className="w-full px-4 py-3 bg-bg-tertiary border border-border-primary rounded-2xl text-sm font-semibold text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-green/30"
                  required
                />
              </div>

              {team.length > 0 && (
                <div className="space-y-2">
                  <label className="text-xs font-bold text-text-muted uppercase tracking-wider px-1">
                    Or Select From Team
                  </label>
                  <select
                    onChange={(e) => {
                      if (e.target.value) {
                        const sel = team.find(u => String(u.id) === e.target.value);
                        if (sel) {
                          setEditCompletedByName(sel.display_name || sel.username);
                          setEditCompletedById(sel.id);
                        }
                      }
                    }}
                    className="w-full px-4 py-3 bg-bg-tertiary border border-border-primary rounded-2xl text-sm font-semibold text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-green/30 cursor-pointer"
                  >
                    <option value="">Select Team Member...</option>
                    {team.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.display_name || u.username} ({u.role.replace('jpc_', '')})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="p-3.5 bg-accent-green/5 rounded-2xl border border-accent-green/15 text-xs text-text-secondary">
                <p className="font-semibold text-text-primary">Preview Card Display:</p>
                <p className="text-xs text-accent-green font-bold mt-1">
                  Completed By: <span className="text-text-primary font-black">{editCompletedByName.trim() || 'Resume Team'}</span> (Resume Team)
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button 
                  type="button"
                  onClick={() => setEditingCompletedByReq(null)}
                  className="flex-1 py-3.5 bg-bg-tertiary text-text-primary font-bold rounded-2xl hover:bg-bg-tertiary/80 transition-all text-sm cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={isSavingCompletedBy}
                  className="flex-1 py-3.5 bg-accent-green text-white font-bold rounded-2xl hover:bg-accent-green/90 transition-all shadow-lg shadow-accent-green/20 flex items-center justify-center gap-2 text-sm cursor-pointer font-bold disabled:opacity-50"
                >
                  {isSavingCompletedBy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Save Name
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
};
