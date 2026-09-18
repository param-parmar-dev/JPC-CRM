import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useDebounce } from '../lib/hooks';
import { 
  ShieldCheck, 
  ShieldAlert, 
  Globe, 
  Plus, 
  Search, 
  Filter, 
  Trash2, 
  Edit2, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  RefreshCw, 
  Copy, 
  Check, 
  Lock, 
  Unlock, 
  User as UserIcon, 
  Laptop, 
  Building, 
  Network,
  Clock,
  Download,
  SlidersHorizontal,
  ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Modal } from '../components/Modal';
import { List } from 'react-window';
import { OfficeIpConfig, IpAccessControlSettings, IpAccessLog, User, UserRole } from '../types';
import { isIpInCidr, normalizeIp } from '../lib/ipMatcher';
import { cn } from '../lib/utils';
import * as XLSX from 'xlsx';

export const IPAccessManagement: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'office_ips' | 'external_users' | 'audit_logs'>('office_ips');
  const [isLoading, setIsLoading] = useState(true);
  const [currentClientIp, setCurrentClientIp] = useState<string>('');
  const [ipCopied, setIpCopied] = useState(false);

  // Settings State
  const [settings, setSettings] = useState<IpAccessControlSettings>({
    office_ips: [],
    enforce_ip_control: true,
    admin_lockout_prevention: true,
    updated_at: new Date().toISOString()
  });
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Users State
  const [users, setUsers] = useState<User[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const debouncedUserSearch = useDebounce(userSearch, 300);
  const [userStatusFilter, setUserStatusFilter] = useState<'all' | 'enabled' | 'disabled' | 'specific_ips'>('all');

  // Logs State
  const [logs, setLogs] = useState<IpAccessLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logSearch, setLogSearch] = useState('');
  const debouncedLogSearch = useDebounce(logSearch, 300);
  const [logFilter, setLogFilter] = useState<'all' | 'blocked' | 'allowed'>('blocked');
  const [logDisplayCount, setLogDisplayCount] = useState(100);

  // Modals State
  const [isAddOfficeModalOpen, setIsAddOfficeModalOpen] = useState(false);
  const [editingOfficeIp, setEditingOfficeIp] = useState<OfficeIpConfig | null>(null);
  const [officeFormData, setOfficeFormData] = useState({
    ip: '',
    label: '',
    description: '',
    is_active: true
  });

  const [isUserConfigModalOpen, setIsUserConfigModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userFormData, setUserFormData] = useState({
    external_access_enabled: false,
    allowed_external_ips_text: '',
    access_status: 'active' as 'active' | 'suspended' | 'revoked',
    external_access_notes: ''
  });

  // Fetch detected client IP
  const fetchMyIp = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/ip-access/my-ip');
      if (res.ok) {
        const data = await res.json();
        if (data.ip) setCurrentClientIp(data.ip);
      }
    } catch (e) {
      console.warn('Failed to detect current client IP:', e);
    }
  }, []);

  // Fetch settings
  const fetchSettings = useCallback(async () => {
    try {
      const token = await (window as any).firebaseAuthToken?.() || localStorage.getItem('token');
      const res = await fetch('/api/admin/ip-access/settings', {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (res.ok) {
        const data = await res.json();
        setSettings({
          office_ips: data.office_ips || [],
          enforce_ip_control: data.enforce_ip_control !== false,
          admin_lockout_prevention: data.admin_lockout_prevention !== false,
          updated_at: data.updated_at || new Date().toISOString(),
          updated_by: data.updated_by
        });
      }
    } catch (e) {
      console.error('Failed to fetch IP settings:', e);
    }
  }, []);

  // Fetch users for external whitelist
  const fetchUsers = useCallback(async () => {
    try {
      const token = await (window as any).firebaseAuthToken?.() || localStorage.getItem('token');
      const res = await fetch('/api/admin/ip-access/users', {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch (e) {
      console.error('Failed to fetch users:', e);
    }
  }, []);

  // Fetch audit logs
  const fetchLogs = useCallback(async (filter?: string) => {
    setLogsLoading(true);
    try {
      const targetFilter = filter || logFilter;
      const url = `/api/admin/ip-access/logs?limit=300${targetFilter !== 'all' ? `&result=${targetFilter}` : ''}`;
      const token = await (window as any).firebaseAuthToken?.() || localStorage.getItem('token');
      const res = await fetch(url, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
      }
    } catch (e) {
      console.error('Failed to fetch IP access logs:', e);
    } finally {
      setLogsLoading(false);
    }
  }, [logFilter]);

  // Initial load
  useEffect(() => {
    const loadAll = async () => {
      setIsLoading(true);
      await Promise.all([
        fetchMyIp(),
        fetchSettings(),
        fetchUsers(),
        fetchLogs('blocked')
      ]);
      setIsLoading(false);
    };
    loadAll();
  }, [fetchMyIp, fetchSettings, fetchUsers, fetchLogs]);

  // Copy detected IP
  const handleCopyIp = () => {
    if (!currentClientIp) return;
    navigator.clipboard.writeText(currentClientIp);
    setIpCopied(true);
    setTimeout(() => setIpCopied(false), 2000);
  };

  // Toggle Global IP Enforcement
  const handleToggleEnforcement = async () => {
    const nextVal = !settings.enforce_ip_control;
    setIsSavingSettings(true);
    try {
      const token = await (window as any).firebaseAuthToken?.() || localStorage.getItem('token');
      const res = await fetch('/api/admin/ip-access/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          ...settings,
          enforce_ip_control: nextVal
        })
      });

      if (res.ok) {
        setSettings(prev => ({ ...prev, enforce_ip_control: nextVal }));
        showToast(`IP Access Control is now ${nextVal ? 'Enforced' : 'Paused'}`, nextVal ? 'success' : 'info');
      } else {
        showToast('Failed to update enforcement settings', 'error');
      }
    } catch (e) {
      console.error('Error toggling enforcement:', e);
      showToast('Error updating settings', 'error');
    } finally {
      setIsSavingSettings(false);
    }
  };

  // Save Office IP (Add or Edit)
  const handleSaveOfficeIp = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanIp = officeFormData.ip.trim();
    if (!cleanIp) {
      showToast('Please specify a valid IP address or CIDR range', 'error');
      return;
    }

    let updatedList = [...settings.office_ips];
    if (editingOfficeIp) {
      updatedList = updatedList.map(item => 
        item.id === editingOfficeIp.id 
          ? { 
              ...item, 
              ip: cleanIp, 
              label: officeFormData.label.trim() || cleanIp,
              description: officeFormData.description.trim(),
              is_active: officeFormData.is_active
            } 
          : item
      );
    } else {
      const newEntry: OfficeIpConfig = {
        id: `office-${Date.now()}`,
        ip: cleanIp,
        label: officeFormData.label.trim() || 'Office Network',
        description: officeFormData.description.trim(),
        is_active: officeFormData.is_active,
        created_at: new Date().toISOString(),
        created_by: user?.display_name || user?.username || 'Admin'
      };
      updatedList.push(newEntry);
    }

    setIsSavingSettings(true);
    try {
      const token = await (window as any).firebaseAuthToken?.() || localStorage.getItem('token');
      const res = await fetch('/api/admin/ip-access/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          ...settings,
          office_ips: updatedList
        })
      });

      if (res.ok) {
        setSettings(prev => ({ ...prev, office_ips: updatedList }));
        showToast(editingOfficeIp ? 'Office IP updated' : 'Approved office IP added successfully', 'success');
        setIsAddOfficeModalOpen(false);
        setEditingOfficeIp(null);
        setOfficeFormData({ ip: '', label: '', description: '', is_active: true });
      } else {
        showToast('Failed to save office IP', 'error');
      }
    } catch (err) {
      console.error('Error saving office IP:', err);
      showToast('Failed to save office IP', 'error');
    } finally {
      setIsSavingSettings(false);
    }
  };

  // Delete Office IP
  const handleDeleteOfficeIp = async (id: string) => {
    if (!window.confirm('Are you sure you want to remove this office IP? Users on this network will no longer have automatic access.')) {
      return;
    }

    const updatedList = settings.office_ips.filter(item => item.id !== id);
    setIsSavingSettings(true);
    try {
      const token = await (window as any).firebaseAuthToken?.() || localStorage.getItem('token');
      const res = await fetch('/api/admin/ip-access/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          ...settings,
          office_ips: updatedList
        })
      });

      if (res.ok) {
        setSettings(prev => ({ ...prev, office_ips: updatedList }));
        showToast('Office IP removed', 'success');
      }
    } catch (e) {
      console.error('Failed to delete office IP:', e);
      showToast('Failed to delete office IP', 'error');
    } finally {
      setIsSavingSettings(false);
    }
  };

  // Quick Toggle Office IP Active/Inactive
  const handleToggleOfficeIpActive = async (id: string) => {
    const updatedList = settings.office_ips.map(item => 
      item.id === id ? { ...item, is_active: !item.is_active } : item
    );

    try {
      const token = await (window as any).firebaseAuthToken?.() || localStorage.getItem('token');
      const res = await fetch('/api/admin/ip-access/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          ...settings,
          office_ips: updatedList
        })
      });

      if (res.ok) {
        setSettings(prev => ({ ...prev, office_ips: updatedList }));
        showToast('Office IP status updated', 'success');
      }
    } catch (e) {
      showToast('Failed to update office IP status', 'error');
    }
  };

  // Quick Add Current IP as Office IP
  const handleAddCurrentAsOfficeIp = () => {
    if (!currentClientIp) return;
    setEditingOfficeIp(null);
    setOfficeFormData({
      ip: currentClientIp,
      label: 'HQ / Current Office Network',
      description: 'Added via quick setup from current location',
      is_active: true
    });
    setIsAddOfficeModalOpen(true);
  };

  // Open User External Access Modal
  const handleOpenUserModal = (targetUser: User) => {
    setEditingUser(targetUser);
    setUserFormData({
      external_access_enabled: Boolean(targetUser.external_access_enabled),
      allowed_external_ips_text: (targetUser.allowed_external_ips || []).join('\n'),
      access_status: targetUser.access_status || 'active',
      external_access_notes: targetUser.external_access_notes || ''
    });
    setIsUserConfigModalOpen(true);
  };

  // Quick Toggle User External Access
  const handleQuickToggleUserAccess = async (targetUser: User) => {
    const nextVal = !targetUser.external_access_enabled;
    try {
      const token = await (window as any).firebaseAuthToken?.() || localStorage.getItem('token');
      const res = await fetch(`/api/admin/ip-access/users/${targetUser.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          external_access_enabled: nextVal,
          allowed_external_ips: targetUser.allowed_external_ips || [],
          access_status: targetUser.access_status || 'active',
          external_access_notes: targetUser.external_access_notes || ''
        })
      });

      if (res.ok) {
        setUsers(prev => prev.map(u => 
          u.id === targetUser.id ? { ...u, external_access_enabled: nextVal } : u
        ));
        showToast(`External access for ${targetUser.display_name} ${nextVal ? 'enabled' : 'disabled'}`, 'success');
      } else {
        showToast('Failed to update user access', 'error');
      }
    } catch (e) {
      showToast('Error updating user access', 'error');
    }
  };

  // Save User External Access Configuration
  const handleSaveUserConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    const rawIps = userFormData.allowed_external_ips_text
      .split(/[\n,]+/)
      .map(ip => ip.trim())
      .filter(ip => ip.length > 0);

    try {
      const token = await (window as any).firebaseAuthToken?.() || localStorage.getItem('token');
      const res = await fetch(`/api/admin/ip-access/users/${editingUser.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          external_access_enabled: userFormData.external_access_enabled,
          allowed_external_ips: rawIps,
          access_status: userFormData.access_status,
          external_access_notes: userFormData.external_access_notes
        })
      });

      if (res.ok) {
        setUsers(prev => prev.map(u => 
          u.id === editingUser.id 
            ? { 
                ...u, 
                external_access_enabled: userFormData.external_access_enabled,
                allowed_external_ips: rawIps,
                access_status: userFormData.access_status,
                external_access_notes: userFormData.external_access_notes
              } 
            : u
        ));
        showToast(`IP Access policy for ${editingUser.display_name} updated successfully`, 'success');
        setIsUserConfigModalOpen(false);
      } else {
        showToast('Failed to update user access configuration', 'error');
      }
    } catch (e) {
      showToast('Error updating user configuration', 'error');
    }
  };

  // Add Current IP to User External IPs list
  const handleAddCurrentIpToUser = () => {
    if (!currentClientIp) return;
    const current = userFormData.allowed_external_ips_text.trim();
    if (current.includes(currentClientIp)) return;
    setUserFormData(prev => ({
      ...prev,
      allowed_external_ips_text: current ? `${current}\n${currentClientIp}` : currentClientIp
    }));
  };

  // Filtered Users List
  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      // Role filter - candidate role is not CRM employee
      if (u.role === 'candidate' || u.role === 'jpc_candidate') return false;

      // Status filter
      if (userStatusFilter === 'enabled' && !u.external_access_enabled) return false;
      if (userStatusFilter === 'disabled' && u.external_access_enabled) return false;
      if (userStatusFilter === 'specific_ips' && (!u.external_access_enabled || !u.allowed_external_ips || u.allowed_external_ips.length === 0)) return false;

      // Search filter
      if (debouncedUserSearch) {
        const q = debouncedUserSearch.toLowerCase();
        const matchesName = (u.display_name || '').toLowerCase().includes(q);
        const matchesUsername = (u.username || '').toLowerCase().includes(q);
        const matchesEmail = (u.email || '').toLowerCase().includes(q);
        const matchesRole = (u.role || '').toLowerCase().includes(q);
        const matchesIp = (u.allowed_external_ips || []).some(ip => ip.toLowerCase().includes(q));
        return matchesName || matchesUsername || matchesEmail || matchesRole || matchesIp;
      }

      return true;
    });
  }, [users, userStatusFilter, debouncedUserSearch]);

  // Filtered Logs List
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      if (debouncedLogSearch) {
        const q = debouncedLogSearch.toLowerCase();
        const matchesIp = (log.ip || '').toLowerCase().includes(q);
        const matchesUser = (log.user_display_name || '').toLowerCase().includes(q) || (log.username || '').toLowerCase().includes(q);
        const matchesReason = (log.reason || '').toLowerCase().includes(q);
        const matchesRule = (log.matched_rule || '').toLowerCase().includes(q);
        return matchesIp || matchesUser || matchesReason || matchesRule;
      }
      return true;
    });
  }, [logs, debouncedLogSearch]);

  // Export audit logs to Excel/CSV
  const handleExportLogs = () => {
    if (filteredLogs.length === 0) {
      showToast('No logs available to export', 'info');
      return;
    }

    const dataToExport = filteredLogs.map(log => ({
      Timestamp: log.timestamp,
      Result: log.result.toUpperCase(),
      'Client IP': log.ip,
      'User Name': log.user_display_name,
      Username: log.username,
      Role: log.user_role,
      Email: log.user_email || '',
      Reason: log.reason,
      'Matched Rule': log.matched_rule || '',
      'User Agent': log.user_agent || '',
      Endpoint: log.endpoint || ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'IP Access Logs');
    XLSX.writeFile(workbook, `Placify_CRM_IP_Access_Logs_${new Date().toISOString().split('T')[0]}.xlsx`);
    showToast('Audit log report exported', 'success');
  };

  // Stats Counters
  const stats = useMemo(() => {
    const crmUsers = users.filter(u => u.role !== 'candidate' && u.role !== 'jpc_candidate');
    const externalEnabled = crmUsers.filter(u => u.external_access_enabled);
    const specificIps = externalEnabled.filter(u => u.allowed_external_ips && u.allowed_external_ips.length > 0);
    const blockedCount = logs.filter(l => l.result === 'blocked').length;

    return {
      totalCrmUsers: crmUsers.length,
      officeIpsCount: settings.office_ips.filter(o => o.is_active !== false).length,
      externalEnabledCount: externalEnabled.length,
      specificIpsCount: specificIps.length,
      blockedAttemptsCount: blockedCount
    };
  }, [users, settings.office_ips, logs]);

  return (
    <div className="flex-1 overflow-y-auto bg-bg-primary p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Top Banner & Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-bg-secondary border border-border-primary rounded-3xl p-6 shadow-sm">
        <div className="space-y-1.5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-accent-blue/10 border border-accent-blue/20 flex items-center justify-center text-accent-blue shadow-inner">
              <Network className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-text-primary font-heading tracking-tight flex items-center gap-2">
                <span>IP Access Control</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-accent-blue/10 text-accent-blue border border-accent-blue/20">
                  Security Gateway
                </span>
              </h1>
              <p className="text-xs text-text-secondary">
                Restrict CRM access to approved office networks with granular external user whitelisting.
              </p>
            </div>
          </div>
        </div>

        {/* Global Controls & Detected IP */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Detected Client IP */}
          <div className="flex items-center gap-2 px-3.5 py-2 bg-bg-tertiary/70 border border-border-secondary rounded-2xl">
            <Globe className="w-4 h-4 text-accent-blue shrink-0" />
            <div className="text-left">
              <span className="text-[9px] font-bold text-text-muted uppercase tracking-wider block">Your Detected IP</span>
              <span className="font-mono text-xs font-bold text-text-primary">{currentClientIp || 'Detecting...'}</span>
            </div>
            {currentClientIp && (
              <button
                onClick={handleCopyIp}
                title="Copy your detected IP"
                className="p-1 text-text-muted hover:text-text-primary transition-colors ml-1"
              >
                {ipCopied ? <Check className="w-3.5 h-3.5 text-accent-green" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>

          {/* Global Enforcement Toggle */}
          <button
            onClick={handleToggleEnforcement}
            disabled={isSavingSettings}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all border shadow-sm cursor-pointer",
              settings.enforce_ip_control
                ? "bg-accent-green/10 border-accent-green/30 text-accent-green hover:bg-accent-green/20"
                : "bg-accent-amber/10 border-accent-amber/30 text-accent-amber hover:bg-accent-amber/20"
            )}
          >
            {settings.enforce_ip_control ? (
              <>
                <ShieldCheck className="w-4 h-4 text-accent-green" />
                <span>Enforcement: ACTIVE</span>
              </>
            ) : (
              <>
                <ShieldAlert className="w-4 h-4 text-accent-amber" />
                <span>Enforcement: PAUSED</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-bg-secondary border border-border-primary rounded-2xl p-4 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Approved Office Networks</span>
            <Building className="w-4 h-4 text-accent-blue" />
          </div>
          <div className="text-2xl font-bold text-text-primary font-heading">{stats.officeIpsCount}</div>
          <p className="text-[11px] text-text-secondary">Networks where all users enter freely</p>
        </div>

        <div className="bg-bg-secondary border border-border-primary rounded-2xl p-4 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">External Whitelist</span>
            <Laptop className="w-4 h-4 text-accent-teal" />
          </div>
          <div className="text-2xl font-bold text-text-primary font-heading">
            {stats.externalEnabledCount} <span className="text-xs font-normal text-text-muted">/ {stats.totalCrmUsers} users</span>
          </div>
          <p className="text-[11px] text-text-secondary">{stats.specificIpsCount} restricted to specific IPs/CIDRs</p>
        </div>

        <div className="bg-bg-secondary border border-border-primary rounded-2xl p-4 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Blocked Outside</span>
            <XCircle className="w-4 h-4 text-accent-red" />
          </div>
          <div className="text-2xl font-bold text-text-primary font-heading">
            {stats.totalCrmUsers - stats.externalEnabledCount}
          </div>
          <p className="text-[11px] text-text-secondary">CRM staff denied outside office</p>
        </div>

        <div className="bg-bg-secondary border border-border-primary rounded-2xl p-4 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Blocked Attempts</span>
            <ShieldAlert className="w-4 h-4 text-accent-red" />
          </div>
          <div className="text-2xl font-bold text-accent-red font-heading">{stats.blockedAttemptsCount}</div>
          <p className="text-[11px] text-text-secondary">Recent unauthorized access logs</p>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border-primary pb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('office_ips')}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer",
              activeTab === 'office_ips'
                ? "bg-accent-blue text-white shadow-md shadow-accent-blue/20"
                : "bg-bg-secondary border border-border-primary text-text-secondary hover:text-text-primary"
            )}
          >
            <Building className="w-4 h-4" />
            <span>Approved Office IPs</span>
            <span className={cn(
              "px-1.5 py-0.5 rounded-full text-[10px] font-bold",
              activeTab === 'office_ips' ? "bg-white/20 text-white" : "bg-bg-tertiary text-text-muted"
            )}>
              {settings.office_ips.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('external_users')}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer",
              activeTab === 'external_users'
                ? "bg-accent-blue text-white shadow-md shadow-accent-blue/20"
                : "bg-bg-secondary border border-border-primary text-text-secondary hover:text-text-primary"
            )}
          >
            <Laptop className="w-4 h-4" />
            <span>External User Whitelist</span>
            <span className={cn(
              "px-1.5 py-0.5 rounded-full text-[10px] font-bold",
              activeTab === 'external_users' ? "bg-white/20 text-white" : "bg-bg-tertiary text-text-muted"
            )}>
              {stats.externalEnabledCount}
            </span>
          </button>

          <button
            onClick={() => {
              setActiveTab('audit_logs');
              fetchLogs();
            }}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer",
              activeTab === 'audit_logs'
                ? "bg-accent-blue text-white shadow-md shadow-accent-blue/20"
                : "bg-bg-secondary border border-border-primary text-text-secondary hover:text-text-primary"
            )}
          >
            <ShieldAlert className="w-4 h-4" />
            <span>Blocked & Access Logs</span>
            {stats.blockedAttemptsCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-accent-red text-white">
                {stats.blockedAttemptsCount}
              </span>
            )}
          </button>
        </div>

        {/* Tab Context Actions */}
        <div>
          {activeTab === 'office_ips' && (
            <div className="flex items-center gap-2">
              {currentClientIp && (
                <button
                  onClick={handleAddCurrentAsOfficeIp}
                  className="hidden sm:flex items-center gap-2 px-3 py-2 bg-bg-secondary border border-border-primary hover:border-accent-blue rounded-xl text-xs font-bold text-text-primary transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-accent-blue" />
                  <span>Use Current IP ({currentClientIp})</span>
                </button>
              )}
              <button
                onClick={() => {
                  setEditingOfficeIp(null);
                  setOfficeFormData({ ip: '', label: '', description: '', is_active: true });
                  setIsAddOfficeModalOpen(true);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-accent-blue text-white rounded-xl text-xs font-bold hover:brightness-110 shadow-md shadow-accent-blue/20 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Office IP</span>
              </button>
            </div>
          )}

          {activeTab === 'audit_logs' && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleExportLogs}
                className="flex items-center gap-1.5 px-3 py-2 bg-bg-secondary border border-border-primary rounded-xl text-xs font-bold text-text-primary hover:bg-bg-tertiary transition-all cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-accent-blue" />
                <span>Export Audit</span>
              </button>
              <button
                onClick={() => fetchLogs()}
                disabled={logsLoading}
                className="flex items-center gap-1.5 px-3 py-2 bg-bg-secondary border border-border-primary rounded-xl text-xs font-bold text-text-primary hover:bg-bg-tertiary transition-all cursor-pointer"
              >
                <RefreshCw className={cn("w-3.5 h-3.5 text-accent-blue", logsLoading && "animate-spin")} />
                <span>Refresh</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================= */}
      {/* TAB 1: APPROVED OFFICE IPS */}
      {/* ========================================================= */}
      {activeTab === 'office_ips' && (
        <div className="space-y-4">
          <div className="p-4 bg-accent-blue/5 border border-accent-blue/20 rounded-2xl flex items-start gap-3">
            <Building className="w-5 h-5 text-accent-blue shrink-0 mt-0.5" />
            <div className="text-xs text-text-secondary leading-relaxed">
              <span className="font-bold text-text-primary">Office Network Rule:</span> All active CRM users connecting from these approved IP addresses or CIDR subnets can log in normally without needing individual external permissions.
            </div>
          </div>

          {settings.office_ips.length === 0 ? (
            <div className="text-center py-16 bg-bg-secondary border border-border-primary rounded-3xl p-8 space-y-4">
              <Building className="w-12 h-12 text-text-muted mx-auto stroke-1" />
              <div className="max-w-md mx-auto space-y-1">
                <h3 className="text-base font-bold text-text-primary">No Office IPs Configured Yet</h3>
                <p className="text-xs text-text-secondary">
                  Add your office public IP address or VPN subnet. Admins remain protected from lockout while setting up the network.
                </p>
              </div>
              <div className="flex items-center justify-center gap-3 pt-2">
                {currentClientIp && (
                  <button
                    onClick={handleAddCurrentAsOfficeIp}
                    className="px-4 py-2.5 bg-accent-blue text-white font-bold rounded-xl text-xs hover:brightness-110 transition-all shadow-md shadow-accent-blue/20 flex items-center gap-2 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Current IP ({currentClientIp})</span>
                  </button>
                )}
                <button
                  onClick={() => {
                    setEditingOfficeIp(null);
                    setOfficeFormData({ ip: '', label: '', description: '', is_active: true });
                    setIsAddOfficeModalOpen(true);
                  }}
                  className="px-4 py-2.5 bg-bg-tertiary border border-border-primary text-text-primary font-bold rounded-xl text-xs hover:bg-bg-tertiary/80 transition-all cursor-pointer"
                >
                  Enter Manually
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-bg-secondary border border-border-primary rounded-3xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-bg-tertiary/50 border-b border-border-primary text-[10px] font-bold text-text-muted uppercase tracking-wider">
                    <tr>
                      <th className="px-6 py-4">Network / Label</th>
                      <th className="px-6 py-4">IP Address / CIDR</th>
                      <th className="px-6 py-4">Description</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4">Added By</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-secondary/50">
                    {settings.office_ips.map((office) => {
                      const isCurrentMatch = currentClientIp && isIpInCidr(currentClientIp, office.ip);
                      return (
                        <tr key={office.id} className="hover:bg-bg-tertiary/30 transition-colors">
                          <td className="px-6 py-4 font-semibold text-text-primary">
                            <div className="flex items-center gap-2">
                              <Building className="w-4 h-4 text-accent-blue shrink-0" />
                              <span>{office.label}</span>
                              {isCurrentMatch && (
                                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-accent-green/10 text-accent-green border border-accent-green/20">
                                  Your Current Network
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 font-mono font-bold text-text-primary">
                            {office.ip}
                          </td>
                          <td className="px-6 py-4 text-text-muted truncate max-w-xs">
                            {office.description || '—'}
                          </td>
                          <td className="px-6 py-4">
                            <button
                              onClick={() => handleToggleOfficeIpActive(office.id)}
                              className={cn(
                                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold transition-all cursor-pointer",
                                office.is_active
                                  ? "bg-accent-green/10 text-accent-green border border-accent-green/20"
                                  : "bg-text-muted/10 text-text-muted border border-border-primary"
                              )}
                            >
                              <span className={cn("w-1.5 h-1.5 rounded-full", office.is_active ? "bg-accent-green" : "bg-text-muted")} />
                              <span>{office.is_active ? 'Active' : 'Disabled'}</span>
                            </button>
                          </td>
                          <td className="px-6 py-4 text-text-muted">
                            <div className="text-[11px]">{office.created_by || 'Admin'}</div>
                            <div className="text-[9px] text-text-muted/70">{office.created_at ? new Date(office.created_at).toLocaleDateString() : ''}</div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => {
                                  setEditingOfficeIp(office);
                                  setOfficeFormData({
                                    ip: office.ip,
                                    label: office.label,
                                    description: office.description || '',
                                    is_active: office.is_active
                                  });
                                  setIsAddOfficeModalOpen(true);
                                }}
                                className="p-1.5 text-text-secondary hover:text-accent-blue transition-colors rounded-lg hover:bg-bg-tertiary"
                                title="Edit Office IP"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteOfficeIp(office.id)}
                                className="p-1.5 text-text-secondary hover:text-accent-red transition-colors rounded-lg hover:bg-bg-tertiary"
                                title="Delete Office IP"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
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
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2: EXTERNAL USER WHITELIST */}
      {/* ========================================================= */}
      {activeTab === 'external_users' && (
        <div className="space-y-4">
          <div className="p-4 bg-accent-purple/5 border border-accent-purple/20 rounded-2xl flex items-start gap-3">
            <Laptop className="w-5 h-5 text-accent-purple shrink-0 mt-0.5" />
            <div className="text-xs text-text-secondary leading-relaxed">
              <span className="font-bold text-text-primary">Outside Office Rule:</span> Access is denied by default. Grant external access to specific team members below. You can leave Allowed External IPs empty to permit any external IP (e.g. Recruiter A), or restrict to specific external IPs/CIDRs (e.g. Manager C).
            </div>
          </div>

          {/* Search & Filters */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input
                type="text"
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
                placeholder="Search team members by name, role, email, or IP..."
                className="w-full bg-bg-secondary border border-border-primary rounded-xl pl-10 pr-4 py-2 text-xs text-text-primary focus:outline-none focus:border-accent-blue transition-colors"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Filter className="w-3.5 h-3.5 text-text-muted" />
              <div className="flex bg-bg-secondary border border-border-primary rounded-xl p-1 text-xs">
                {(['all', 'enabled', 'disabled', 'specific_ips'] as const).map((filterVal) => (
                  <button
                    key={filterVal}
                    onClick={() => setUserStatusFilter(filterVal)}
                    className={cn(
                      "px-3 py-1 rounded-lg font-medium transition-all cursor-pointer capitalize",
                      userStatusFilter === filterVal
                        ? "bg-accent-blue text-white shadow-sm font-bold"
                        : "text-text-secondary hover:text-text-primary"
                    )}
                  >
                    {filterVal === 'specific_ips' ? 'Specific IPs' : filterVal}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Users Table */}
          <div className="bg-bg-secondary border border-border-primary rounded-3xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-bg-tertiary/50 border-b border-border-primary text-[10px] font-bold text-text-muted uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-4">Team Member</th>
                    <th className="px-6 py-4">Role</th>
                    <th className="px-6 py-4">External Access</th>
                    <th className="px-6 py-4">Allowed External IPs</th>
                    <th className="px-6 py-4">Access Status</th>
                    <th className="px-6 py-4 text-right">Configure</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-secondary/50">
                  {filteredUsers.map((u) => {
                    const isEnabled = Boolean(u.external_access_enabled);
                    const hasSpecificIps = u.allowed_external_ips && u.allowed_external_ips.length > 0;
                    const isSuspended = u.access_status === 'suspended' || u.access_status === 'revoked';

                    return (
                      <tr key={u.id} className="hover:bg-bg-tertiary/30 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-accent-blue/10 flex items-center justify-center text-accent-blue font-bold text-xs ring-1 ring-accent-blue/20 shrink-0">
                              {(u.display_name || u.username || 'U').slice(0, 2).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-text-primary truncate">{u.display_name || u.username}</div>
                              <div className="text-[11px] text-text-muted truncate">{u.email || `@${u.username}`}</div>
                            </div>
                          </div>
                        </td>

                        <td className="px-6 py-4">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-bg-tertiary text-text-secondary border border-border-secondary">
                            {u.role}
                          </span>
                        </td>

                        <td className="px-6 py-4">
                          <button
                            onClick={() => handleQuickToggleUserAccess(u)}
                            className={cn(
                              "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold transition-all cursor-pointer",
                              isEnabled
                                ? "bg-accent-green/10 text-accent-green border border-accent-green/30"
                                : "bg-bg-tertiary text-text-muted border border-border-secondary"
                            )}
                          >
                            {isEnabled ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                            <span>{isEnabled ? 'Enabled' : 'Disabled'}</span>
                          </button>
                        </td>

                        <td className="px-6 py-4 max-w-xs">
                          {isEnabled ? (
                            hasSpecificIps ? (
                              <div className="flex flex-wrap gap-1">
                                {u.allowed_external_ips!.map((ip, idx) => (
                                  <span 
                                    key={idx} 
                                    className="font-mono text-[10px] bg-bg-tertiary border border-border-secondary px-1.5 py-0.5 rounded text-text-primary font-semibold"
                                  >
                                    {ip}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-[11px] font-semibold text-accent-blue">
                                Any External IP (No restriction)
                              </span>
                            )
                          ) : (
                            <span className="text-text-muted text-[11px]">Denied outside office</span>
                          )}
                        </td>

                        <td className="px-6 py-4">
                          <span className={cn(
                            "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
                            isSuspended 
                              ? "bg-accent-red/10 text-accent-red border border-accent-red/20" 
                              : "bg-accent-green/10 text-accent-green border border-accent-green/20"
                          )}>
                            {u.access_status || 'active'}
                          </span>
                        </td>

                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => handleOpenUserModal(u)}
                            className="px-3 py-1.5 bg-bg-tertiary hover:bg-accent-blue hover:text-white rounded-xl text-xs font-bold text-text-primary transition-all cursor-pointer inline-flex items-center gap-1"
                          >
                            <SlidersHorizontal className="w-3 h-3" />
                            <span>Configure</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredUsers.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-12 text-text-muted">
                        No team members match the filter or search query.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 3: AUDIT & BLOCKED LOGS */}
      {/* ========================================================= */}
      {activeTab === 'audit_logs' && (
        <div className="space-y-4">
          <div className="p-4 bg-accent-red/5 border border-accent-red/20 rounded-2xl flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-accent-red shrink-0 mt-0.5" />
            <div className="text-xs text-text-secondary leading-relaxed">
              <span className="font-bold text-text-primary">Immutable Security Log:</span> Every session authentication and API access attempt is recorded with client IP, timestamp, user, and access verdict.
            </div>
          </div>

          {/* Filters Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input
                type="text"
                value={logSearch}
                onChange={e => setLogSearch(e.target.value)}
                placeholder="Search logs by IP, User, or Reason..."
                className="w-full bg-bg-secondary border border-border-primary rounded-xl pl-10 pr-4 py-2 text-xs text-text-primary focus:outline-none focus:border-accent-blue transition-colors"
              />
            </div>

            <div className="flex items-center gap-2">
              <div className="flex bg-bg-secondary border border-border-primary rounded-xl p-1 text-xs">
                {(['blocked', 'all', 'allowed'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => {
                      setLogFilter(mode);
                      fetchLogs(mode);
                    }}
                    className={cn(
                      "px-3 py-1 rounded-lg font-medium transition-all cursor-pointer capitalize",
                      logFilter === mode
                        ? (mode === 'blocked' 
                            ? "bg-accent-red text-white font-bold" 
                            : "bg-accent-blue text-white font-bold")
                        : "text-text-secondary hover:text-text-primary"
                    )}
                  >
                    {mode === 'blocked' ? 'Blocked Only' : mode === 'all' ? 'All Attempts' : 'Allowed Only'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Logs Table / List */}
          <div className="bg-bg-secondary border border-border-primary rounded-3xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-bg-tertiary/50 border-b border-border-primary text-[10px] font-bold text-text-muted uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-4">Timestamp</th>
                    <th className="px-6 py-4">Result</th>
                    <th className="px-6 py-4">Client IP</th>
                    <th className="px-6 py-4">User</th>
                    <th className="px-6 py-4">Reason / Policy</th>
                    <th className="px-6 py-4">Matched Rule</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-secondary/50">
                  {filteredLogs.slice(0, logDisplayCount).map((log) => {
                    const isBlocked = log.result === 'blocked';
                    return (
                      <tr key={log.id} className="hover:bg-bg-tertiary/30 transition-colors">
                        <td className="px-6 py-4 text-text-muted font-mono whitespace-nowrap">
                          {log.timestamp ? new Date(log.timestamp).toLocaleString() : '—'}
                        </td>

                        <td className="px-6 py-4">
                          <span className={cn(
                            "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
                            isBlocked
                              ? "bg-accent-red/10 text-accent-red border border-accent-red/30"
                              : "bg-accent-green/10 text-accent-green border border-accent-green/30"
                          )}>
                            {isBlocked ? <XCircle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                            <span>{log.result}</span>
                          </span>
                        </td>

                        <td className="px-6 py-4 font-mono font-bold text-text-primary">
                          {log.ip}
                        </td>

                        <td className="px-6 py-4">
                          <div className="font-semibold text-text-primary">{log.user_display_name || log.username || 'Anonymous'}</div>
                          <div className="text-[10px] text-text-muted">{log.user_role || 'Unknown role'}</div>
                        </td>

                        <td className="px-6 py-4 text-text-secondary">
                          <code className="bg-bg-tertiary px-2 py-0.5 rounded font-mono text-[10px] text-text-primary">
                            {log.reason}
                          </code>
                        </td>

                        <td className="px-6 py-4 text-text-muted truncate max-w-xs">
                          {log.matched_rule || '—'}
                        </td>
                      </tr>
                    );
                  })}

                  {filteredLogs.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-12 text-text-muted">
                        No access attempt logs found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Load More Pagination Button (Per AGENTS.md rule) */}
            {filteredLogs.length > logDisplayCount && (
              <div className="p-4 border-t border-border-primary text-center">
                <button
                  onClick={() => setLogDisplayCount(prev => prev + 100)}
                  className="px-6 py-2.5 bg-bg-tertiary border border-border-primary hover:bg-bg-secondary text-text-primary rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Load More ({filteredLogs.length - logDisplayCount} remaining)
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: ADD / EDIT OFFICE IP */}
      {/* ========================================================= */}
      <Modal
        isOpen={isAddOfficeModalOpen}
        onClose={() => setIsAddOfficeModalOpen(false)}
        title={editingOfficeIp ? "Edit Approved Office IP" : "Add Approved Office IP"}
      >
        <form onSubmit={handleSaveOfficeIp} className="space-y-4">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-text-primary uppercase tracking-wider">
                IP Address or CIDR Subnet <span className="text-accent-red">*</span>
              </label>
              {currentClientIp && (
                <button
                  type="button"
                  onClick={() => setOfficeFormData(prev => ({ ...prev, ip: currentClientIp }))}
                  className="text-[10px] font-bold text-accent-blue hover:underline"
                >
                  Use detected IP ({currentClientIp})
                </button>
              )}
            </div>
            <input
              type="text"
              required
              value={officeFormData.ip}
              onChange={e => setOfficeFormData({ ...officeFormData, ip: e.target.value })}
              placeholder="e.g. 198.51.100.10 or 192.168.1.0/24"
              className="w-full bg-bg-primary border border-border-primary rounded-xl px-4 py-2.5 text-xs text-text-primary font-mono focus:outline-none focus:border-accent-blue"
            />
            <p className="text-[10px] text-text-muted">
              Supports single IPv4/IPv6 addresses or CIDR notation (e.g. /24, /16).
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-text-primary uppercase tracking-wider">
              Network Label <span className="text-accent-red">*</span>
            </label>
            <input
              type="text"
              required
              value={officeFormData.label}
              onChange={e => setOfficeFormData({ ...officeFormData, label: e.target.value })}
              placeholder="e.g. Headquarters Office, Mumbai Office, Branch VPN"
              className="w-full bg-bg-primary border border-border-primary rounded-xl px-4 py-2.5 text-xs text-text-primary focus:outline-none focus:border-accent-blue"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-text-primary uppercase tracking-wider">
              Description / Notes (Optional)
            </label>
            <textarea
              value={officeFormData.description}
              onChange={e => setOfficeFormData({ ...officeFormData, description: e.target.value })}
              placeholder="e.g. Primary ISP connection, leased line router"
              rows={2}
              className="w-full bg-bg-primary border border-border-primary rounded-xl px-4 py-2 text-xs text-text-primary focus:outline-none focus:border-accent-blue resize-none"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="office_is_active"
              checked={officeFormData.is_active}
              onChange={e => setOfficeFormData({ ...officeFormData, is_active: e.target.checked })}
              className="w-4 h-4 rounded text-accent-blue border-border-primary focus:ring-accent-blue"
            />
            <label htmlFor="office_is_active" className="text-xs font-medium text-text-primary cursor-pointer">
              Active (Enforce network rule immediately)
            </label>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border-primary">
            <button
              type="button"
              onClick={() => setIsAddOfficeModalOpen(false)}
              className="px-4 py-2 bg-bg-tertiary text-text-secondary rounded-xl text-xs font-bold hover:bg-bg-tertiary/80 transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSavingSettings}
              className="px-5 py-2 bg-accent-blue text-white rounded-xl text-xs font-bold hover:brightness-110 shadow-md shadow-accent-blue/20 transition-all cursor-pointer"
            >
              {isSavingSettings ? 'Saving...' : (editingOfficeIp ? 'Save Changes' : 'Add Office IP')}
            </button>
          </div>
        </form>
      </Modal>

      {/* ========================================================= */}
      {/* MODAL: CONFIGURE USER EXTERNAL ACCESS */}
      {/* ========================================================= */}
      <Modal
        isOpen={isUserConfigModalOpen}
        onClose={() => setIsUserConfigModalOpen(false)}
        title={editingUser ? `Configure External Access: ${editingUser.display_name || editingUser.username}` : 'Configure External Access'}
      >
        <form onSubmit={handleSaveUserConfig} className="space-y-4">
          {/* User info banner */}
          <div className="p-3 bg-bg-primary border border-border-primary rounded-xl flex items-center justify-between text-xs">
            <div>
              <span className="font-bold text-text-primary">{editingUser?.display_name || editingUser?.username}</span>
              <span className="text-text-muted ml-2">({editingUser?.email || `@${editingUser?.username}`})</span>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-bg-tertiary text-text-secondary">
              {editingUser?.role}
            </span>
          </div>

          {/* Enable External Access: Yes/No */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-text-primary uppercase tracking-wider block">
              Enable External Access
            </label>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-xs font-semibold text-text-primary cursor-pointer">
                <input
                  type="radio"
                  name="external_access_enabled"
                  checked={userFormData.external_access_enabled === true}
                  onChange={() => setUserFormData(prev => ({ ...prev, external_access_enabled: true }))}
                  className="w-4 h-4 text-accent-blue"
                />
                <span>Yes (Allowed outside office)</span>
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold text-text-primary cursor-pointer">
                <input
                  type="radio"
                  name="external_access_enabled"
                  checked={userFormData.external_access_enabled === false}
                  onChange={() => setUserFormData(prev => ({ ...prev, external_access_enabled: false }))}
                  className="w-4 h-4 text-accent-blue"
                />
                <span>No (Denied outside office)</span>
              </label>
            </div>
          </div>

          {/* Allowed External IPs */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-text-primary uppercase tracking-wider">
                Allowed External IP(s) / CIDRs (Optional)
              </label>
              {currentClientIp && (
                <button
                  type="button"
                  onClick={handleAddCurrentIpToUser}
                  className="text-[10px] font-bold text-accent-blue hover:underline"
                >
                  + Add Current IP ({currentClientIp})
                </button>
              )}
            </div>
            <textarea
              rows={3}
              value={userFormData.allowed_external_ips_text}
              onChange={e => setUserFormData({ ...userFormData, allowed_external_ips_text: e.target.value })}
              placeholder="Leave empty to permit any external IP, OR enter specific IPs/CIDRs (one per line or comma-separated):&#10;203.0.113.50&#10;198.51.100.0/24"
              className="w-full bg-bg-primary border border-border-primary rounded-xl p-3 text-xs text-text-primary font-mono focus:outline-none focus:border-accent-blue resize-none"
            />
            <p className="text-[10px] text-text-muted">
              • <strong>Empty</strong> = User can log in from <em>any</em> outside IP.<br />
              • <strong>Configured IPs</strong> = User can <em>only</em> log in from matching IPs or CIDRs.
            </p>
          </div>

          {/* Access Status */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-text-primary uppercase tracking-wider block">
              Access Status
            </label>
            <select
              value={userFormData.access_status}
              onChange={e => setUserFormData({ ...userFormData, access_status: e.target.value as any })}
              className="w-full bg-bg-primary border border-border-primary rounded-xl px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-accent-blue"
            >
              <option value="active">Active (Permitted according to rules)</option>
              <option value="suspended">Suspended (Temporarily blocked outside)</option>
              <option value="revoked">Revoked (Access strictly revoked)</option>
            </select>
          </div>

          {/* Notes / Reason */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-text-primary uppercase tracking-wider block">
              Administrative Notes / Reason
            </label>
            <input
              type="text"
              value={userFormData.external_access_notes}
              onChange={e => setUserFormData({ ...userFormData, external_access_notes: e.target.value })}
              placeholder="e.g. Remote work approval for Q3, home static IP"
              className="w-full bg-bg-primary border border-border-primary rounded-xl px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-accent-blue"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border-primary">
            <button
              type="button"
              onClick={() => setIsUserConfigModalOpen(false)}
              className="px-4 py-2 bg-bg-tertiary text-text-secondary rounded-xl text-xs font-bold hover:bg-bg-tertiary/80 transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-accent-blue text-white rounded-xl text-xs font-bold hover:brightness-110 shadow-md shadow-accent-blue/20 transition-all cursor-pointer"
            >
              Save Configuration
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
