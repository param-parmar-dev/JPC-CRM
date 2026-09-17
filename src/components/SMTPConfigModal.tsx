import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { useToast } from '../contexts/ToastContext';
import { Loader2, Plus, X, Mail, AlertCircle, Edit2, Check } from 'lucide-react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

export const SMTPConfigModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { showToast } = useToast();
  const [settings, setSettings] = useState<{
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
    from_name: string;
    from_email: string;
    offer_notification_emails: string[];
  }>({
    host: '',
    port: 587,
    secure: false,
    user: '',
    pass: '',
    from_name: '',
    from_email: '',
    offer_notification_emails: []
  });
  
  const [testEmail, setTestEmail] = useState('');
  const [newRecipient, setNewRecipient] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingEmailValue, setEditingEmailValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // 1. Try local storage cache first for instant loading
      const cached = localStorage.getItem('smtp_settings');
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (parsed && parsed.host) {
            setSettings({
              ...parsed,
              offer_notification_emails: Array.isArray(parsed.offer_notification_emails) ? parsed.offer_notification_emails : []
            });
          }
        } catch (e) {}
      }

      // 2. Load from client-side authenticated Firestore
      getDoc(doc(db, 'jpc_settings', 'smtp_settings')).then(snapshot => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          if (data && data.host) {
            const formatted = {
              ...data,
              offer_notification_emails: Array.isArray(data.offer_notification_emails) ? data.offer_notification_emails : []
            };
            setSettings(formatted as any);
            localStorage.setItem('smtp_settings', JSON.stringify(formatted));
            return;
          }
        }
        // 3. Backend custom server fallback
        fetch('/api/smtp/settings')
          .then(res => res.json())
          .then(data => {
            if (data && data.host) {
              const formatted = {
                ...data,
                offer_notification_emails: Array.isArray(data.offer_notification_emails) ? data.offer_notification_emails : []
              };
              setSettings(formatted);
              localStorage.setItem('smtp_settings', JSON.stringify(formatted));
            }
          })
          .catch(() => {});
      }).catch((err) => {
        console.warn('Client-side Firestore SMTP read omitted/failed, using API fallback:', err);
        fetch('/api/smtp/settings')
          .then(res => res.json())
          .then(data => {
            if (data && data.host) {
              const formatted = {
                ...data,
                offer_notification_emails: Array.isArray(data.offer_notification_emails) ? data.offer_notification_emails : []
              };
              setSettings(formatted);
              localStorage.setItem('smtp_settings', JSON.stringify(formatted));
            }
          })
          .catch(() => {});
      });
    }
  }, [isOpen]);

  const handleAddRecipient = () => {
    const trimmed = newRecipient.trim().toLowerCase();
    if (!trimmed) return;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      showToast('Please enter a valid email address', 'error');
      return;
    }
    const currentList = settings.offer_notification_emails || [];
    if (currentList.includes(trimmed)) {
      showToast('This email is already in the list', 'error');
      return;
    }
    setSettings({
      ...settings,
      offer_notification_emails: [...currentList, trimmed]
    });
    setNewRecipient('');
  };

  const handleRemoveRecipient = (indexToRemove: number) => {
    const currentList = settings.offer_notification_emails || [];
    setSettings({
      ...settings,
      offer_notification_emails: currentList.filter((_, i) => i !== indexToRemove)
    });
    if (editingIndex === indexToRemove) {
      setEditingIndex(null);
    }
  };

  const handleStartEdit = (index: number, email: string) => {
    setEditingIndex(index);
    setEditingEmailValue(email);
  };

  const handleSaveEdit = (index: number) => {
    const trimmed = editingEmailValue.trim().toLowerCase();
    if (!trimmed) {
      handleRemoveRecipient(index);
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      showToast('Please enter a valid email address', 'error');
      return;
    }
    const currentList = [...(settings.offer_notification_emails || [])];
    currentList[index] = trimmed;
    setSettings({
      ...settings,
      offer_notification_emails: currentList
    });
    setEditingIndex(null);
  };

  const handleSave = async () => {
    setIsLoading(true);
    try {
      const payload = {
        ...settings,
        offer_notification_emails: settings.offer_notification_emails || []
      };

      // 1. Store in local storage first
      localStorage.setItem('smtp_settings', JSON.stringify(payload));

      // 2. Store in client-side Firestore
      try {
        await setDoc(doc(db, 'jpc_settings', 'smtp_settings'), payload);
      } catch (err) {
        console.warn('Client-side Firestore write failed, using local/server fallbacks:', err);
      }

      // 3. Write via API (which handles local state caching in backend)
      await fetch('/api/smtp/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      showToast('SMTP & notification settings saved!', 'success');
      onClose();
    } catch {
      showToast('Failed to save settings', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTest = async () => {
    if (!testEmail) {
      showToast('Please enter a test recipient email', 'error');
      return;
    }
    setIsLoading(true);
    try {
      const response = await fetch('/api/smtp/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...settings, test_email: testEmail })
      });
      if (!response.ok) throw new Error(await response.text());
      showToast('Test email sent!', 'success');
    } catch (e) {
      showToast('Failed to send test email', 'error');
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="SMTP & Notification Settings">
      <div className="space-y-6 max-h-[75vh] overflow-y-auto pr-1">
        {/* Section 1: Offer Notification Emails */}
        <div className="p-4 bg-accent-blue/5 border border-accent-blue/20 rounded-2xl space-y-3">
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-accent-blue" />
            <h4 className="text-xs font-bold text-accent-blue uppercase tracking-wider">
              Offer Approval Notification Recipients
            </h4>
          </div>
          <p className="text-xs text-text-secondary">
            Configure multiple email IDs that will automatically receive notification emails at the exact moment a candidate is approved for Offer by the Compliance Head.
          </p>

          {/* Add Recipient Input */}
          <div className="flex gap-2">
            <input 
              type="email"
              placeholder="e.g. admin@auriic.com, hr@auriic.com"
              value={newRecipient}
              onChange={e => setNewRecipient(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddRecipient();
                }
              }}
              className="flex-1 p-2 text-xs bg-bg-primary rounded-xl border border-border-primary text-text-primary focus:outline-none focus:border-accent-blue"
            />
            <button 
              type="button"
              onClick={handleAddRecipient}
              className="px-3 py-2 bg-accent-blue text-white rounded-xl text-xs font-bold hover:bg-accent-blue/90 flex items-center gap-1 transition-all"
            >
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          </div>

          {/* Recipient List */}
          <div className="space-y-1.5 pt-1">
            {(!settings.offer_notification_emails || settings.offer_notification_emails.length === 0) ? (
              <div className="p-2.5 bg-bg-primary/60 border border-border-primary rounded-xl flex items-center gap-2 text-xs text-text-muted">
                <AlertCircle className="w-4 h-4 text-accent-amber shrink-0" />
                <span>No recipient email IDs configured yet. Add at least one email address above.</span>
              </div>
            ) : (
              settings.offer_notification_emails.map((email, idx) => (
                <div 
                  key={idx} 
                  className="flex items-center justify-between gap-2 p-2 bg-bg-primary border border-border-primary rounded-xl text-xs"
                >
                  {editingIndex === idx ? (
                    <div className="flex-1 flex items-center gap-2">
                      <input 
                        type="email"
                        value={editingEmailValue}
                        onChange={e => setEditingEmailValue(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleSaveEdit(idx);
                        }}
                        autoFocus
                        className="flex-1 p-1 text-xs bg-bg-secondary border border-accent-blue rounded-lg text-text-primary focus:outline-none"
                      />
                      <button 
                        type="button" 
                        onClick={() => handleSaveEdit(idx)}
                        className="p-1 text-emerald-500 hover:bg-emerald-500/10 rounded"
                        title="Save"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                      <span className="font-mono text-text-primary truncate">{email}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-1 shrink-0">
                    {editingIndex !== idx && (
                      <button 
                        type="button"
                        onClick={() => handleStartEdit(idx, email)}
                        className="p-1 text-text-muted hover:text-text-primary hover:bg-bg-tertiary rounded transition-colors"
                        title="Edit email"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button 
                      type="button"
                      onClick={() => handleRemoveRecipient(idx)}
                      className="p-1 text-rose-400 hover:text-rose-600 hover:bg-rose-500/10 rounded transition-colors"
                      title="Remove email"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Section 2: SMTP Server Configuration */}
        <div className="space-y-4">
          <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider">
            SMTP Server Credentials
          </h4>
          {[
            { label: 'Host', key: 'host', type: 'text' },
            { label: 'Port', key: 'port', type: 'number' },
            { label: 'User', key: 'user', type: 'text' },
            { label: 'Password', key: 'pass', type: 'password' },
            { label: 'From Name', key: 'from_name', type: 'text' },
            { label: 'From Email', key: 'from_email', type: 'email' },
          ].map(field => (
            <div key={field.key} className="space-y-1">
              <label className="text-xs font-bold text-text-muted uppercase">{field.label}</label>
              <input 
                type={field.type}
                value={settings[field.key as Exclude<keyof typeof settings, 'secure' | 'offer_notification_emails'>] as string | number}
                onChange={e => {
                  const val = field.type === 'number' ? (parseInt(e.target.value, 10) || 0) : e.target.value;
                  setSettings({...settings, [field.key]: val});
                }}
                className="w-full p-2.5 text-xs bg-bg-tertiary rounded-xl border border-border-primary text-text-primary focus:outline-none focus:border-accent-blue"
              />
            </div>
          ))}

          <label className="flex items-center gap-2 cursor-pointer pt-1">
            <input 
              type="checkbox" 
              checked={settings.secure} 
              onChange={e => setSettings({...settings, secure: e.target.checked})}
              className="rounded" 
            />
            <span className="text-xs font-medium text-text-secondary">Secure (SSL/TLS)</span>
          </label>
        </div>
        
        {/* Test Email */}
        <div className="pt-4 border-t border-border-primary space-y-2">
          <label className="text-xs font-bold text-text-muted uppercase">Send Test Email</label>
          <div className="flex gap-2">
            <input 
              type="email" 
              placeholder="Enter email to receive test message"
              value={testEmail} 
              onChange={e => setTestEmail(e.target.value)} 
              className="w-full p-2 text-xs bg-bg-tertiary rounded-xl border border-border-primary text-text-primary focus:outline-none focus:border-accent-blue" 
            />
            <button 
              type="button"
              onClick={handleTest} 
              className="px-4 bg-bg-tertiary border border-border-primary text-text-primary hover:bg-bg-tertiary/80 rounded-xl font-bold text-xs transition-colors shrink-0" 
              disabled={isLoading}
            >
              Test
            </button>
          </div>
        </div>
        
        {/* Save Button */}
        <button 
          type="button"
          onClick={handleSave} 
          className="w-full py-3 bg-accent-blue text-white rounded-xl font-bold text-xs sm:text-sm hover:bg-accent-blue/90 transition-all flex items-center justify-center gap-2" 
          disabled={isLoading}
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Settings'}
        </button>
      </div>
    </Modal>
  );
};

