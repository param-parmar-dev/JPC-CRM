import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Bell, X, Check, Clock, CheckCheck, Loader2 } from 'lucide-react';
import { collection, query, where, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { subscribeToQuery, markNotificationAsRead, markAllNotificationsAsRead, addNotification } from '../services/storage';
import { Notification as AppNotification, InterviewNotification } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { cn } from '../lib/utils';

// Global audio context to avoid being blocked by autoplay policies
let audioCtx: AudioContext | null = null;

const initAudio = () => {
  if (typeof window === 'undefined') return;
  try {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(e => console.warn("Could not resume audio", e));
    }
  } catch (error) {
    console.warn("Audio initialization failed", error);
  }
};

const playNotificationSound = () => {
  try {
    if (!audioCtx) initAudio();
    if (!audioCtx) return;
    
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const t = audioCtx.currentTime;
    
    // Helper to create a single "glassy" pluck with layered detuned oscillators
    const createPluck = (freq: number, startTime: number, decayTime: number, volume: number) => {
      if (!audioCtx) return;
      // Main clear tone
      const osc1 = audioCtx.createOscillator();
      osc1.type = 'sine';
      osc1.frequency.value = freq;

      // Slightly higher pitched triangle wave for a "glassy/metallic" overtone edge
      const osc2 = audioCtx.createOscillator();
      osc2.type = 'triangle';
      osc2.frequency.value = freq * 1.015; // 1.5% detune creates a shimmering chorus effect

      const gain = audioCtx.createGain();
      
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(audioCtx.destination);

      // Fast attack, smooth exponential fade out (like hitting crystal)
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(volume, startTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + decayTime);

      osc1.start(startTime);
      osc2.start(startTime);
      osc1.stop(startTime + decayTime);
      osc2.stop(startTime + decayTime);
    };

    // --- RARE "CRYSTALLINE TWINKLE" NOTIFICATION ---
    // A rapid, magical 3-note ascending arpeggio using high frequencies
    
    createPluck(1046.50, t, 0.4, 0.15);         // C6
    createPluck(1567.98, t + 0.08, 0.6, 0.15);  // G6
    createPluck(2349.32, t + 0.16, 1.2, 0.15);  // D7 (Longer ringing tail)

  } catch (error) {
    console.warn('Audio playback failed', error);
  }
};

export const NotificationList: React.FC = () => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [interviewNotifications, setInterviewNotifications] = useState<InterviewNotification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevNotificationsRef = useRef<(AppNotification | InterviewNotification)[]>([]);
  const isInitialLoad = useRef(true);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const allNotifications = useMemo(() => {
    const combined = [
      ...notifications.map(n => ({ ...n, id: n.id, text: n.message, date: n.created_at, isRead: n.read, collection: 'jpc_notifications' })),
      ...interviewNotifications.map(n => ({ ...n, id: n.id, text: n.message, date: n.created_at, isRead: n.is_read, collection: 'jpc_interview_notifications' }))
    ];
    return combined.sort((a, b) => b.date.localeCompare(a.date));
  }, [notifications, interviewNotifications]);

  useEffect(() => {
    // Unlock audio on first global user interaction
    const unlockAudio = () => {
      initAudio();
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
    window.addEventListener('click', unlockAudio);
    window.addEventListener('keydown', unlockAudio);

    // Request notification permission on mount
    try {
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().catch(e => console.warn('Notification permission request failed:', e));
      }
    } catch (error) {
      console.warn('Push notifications are not supported in this context:', error);
    }
    
    return () => {
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    
    // Subscribe to general notifications
    const q1 = query(collection(db, 'jpc_notifications'), where('recipient_id', '==', String(user.id)), where('read', '==', false));
    const unsub1 = subscribeToQuery<AppNotification>(q1, (data) => {
      setNotifications(data);
    }, 'jpc_notifications');

    // Subscribe to interview notifications
    const q2 = query(collection(db, 'jpc_interview_notifications'), where('recipient_user_id', '==', String(user.id)), where('is_read', '==', false));
    const unsub2 = subscribeToQuery<InterviewNotification>(q2, (data) => {
      setInterviewNotifications(data);
    }, 'jpc_interview_notifications');

    return () => {
      unsub1();
      unsub2();
    };
  }, [user]);

  useEffect(() => {
    if (isInitialLoad.current && allNotifications.length > 0) {
      prevNotificationsRef.current = allNotifications;
      isInitialLoad.current = false;
      return;
    }

    if (!isInitialLoad.current) {
      const prevIds = new Set(prevNotificationsRef.current.map(n => n.id));
      const newItems = allNotifications.filter(n => !prevIds.has(n.id));

      if (newItems.length > 0) {
        playNotificationSound();
        
        try {
          if ('Notification' in window && Notification.permission === 'granted') {
            newItems.forEach(n => {
              const isRecent = (new Date().getTime() - new Date(n.date).getTime()) < 60000;
              if (isRecent) {
                new Notification('New Auriic Alert', {
                  body: n.text,
                  icon: '/favicon.ico'
                });
              }
            });
          }
        } catch (e) {
          console.warn(e);
        }
      }
      prevNotificationsRef.current = allNotifications;
    }
  }, [allNotifications]);

  const handleMarkAsRead = async (id: string, coll: string) => {
    if (coll === 'jpc_notifications') {
      await markNotificationAsRead(id);
    } else {
      try {
        await updateDoc(doc(db, 'jpc_interview_notifications', id), { is_read: true });
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleClearAll = async () => {
    if (allNotifications.length === 0 || isClearing) return;
    setIsClearing(true);
    try {
      await markAllNotificationsAsRead(
        allNotifications.map(n => ({ id: n.id, collection: n.collection }))
      );
    } catch (error) {
      console.error('Failed to clear all notifications:', error);
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <button onClick={() => setIsOpen(!isOpen)} className="p-2 rounded-full hover:bg-bg-tertiary relative">
        <Bell className="w-6 h-6 text-text-secondary" />
        {allNotifications.filter(n => !n.isRead).length > 0 && (
          <span className="absolute top-0 right-0 bg-accent-red text-white text-[10px] font-black rounded-full w-4 h-4 flex items-center justify-center animate-pulse">
            {allNotifications.filter(n => !n.isRead).length}
          </span>
        )}
      </button>
      {isOpen && (
        <div className="absolute right-0 mt-4 w-[360px] bg-bg-secondary border border-border-primary rounded-[32px] shadow-2xl z-50 overflow-hidden">
          <div className="p-6 border-b border-border-primary flex justify-between items-center bg-bg-tertiary/30">
            <div>
              <h3 className="font-black text-text-primary tracking-tight">System Alerts</h3>
              <div className="flex items-center gap-1.5 mt-1">
                <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Recent updates</p>
                {allNotifications.length > 0 && (
                  <span className="text-[9px] font-bold bg-accent-blue/15 text-accent-blue px-1.5 py-0.5 rounded-full">
                    {allNotifications.length}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {allNotifications.length > 0 && (
                <button
                  onClick={handleClearAll}
                  disabled={isClearing}
                  className="text-[9px] font-black uppercase tracking-wider px-2.5 py-1 bg-accent-red/10 text-accent-red hover:bg-accent-red/20 rounded-lg border border-accent-red/20 transition-all flex items-center gap-1 disabled:opacity-50"
                  title="Clear all alerts"
                >
                  {isClearing ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <CheckCheck className="w-3 h-3" />
                  )}
                  <span>{isClearing ? 'Clearing...' : 'Clear all'}</span>
                </button>
              )}
              <button 
                onClick={async () => {
                  try {
                    if ('Notification' in window && Notification.permission === 'default') {
                      await Notification.requestPermission();
                    }
                  } catch (error) {
                    console.warn('Push notifications are not supported in this context:', error);
                  }
                  if (user) {
                    await addNotification({
                      recipient_id: String(user.id),
                      sender_id: String(user.id),
                      type: 'system_alert',
                      message: `Test notification at ${new Date().toLocaleTimeString()}`
                    });
                  }
                }}
                className="text-[8px] font-black uppercase tracking-widest px-2 py-1 bg-accent-blue/10 text-accent-blue rounded-lg border border-accent-blue/20 hover:bg-accent-blue/20 transition-all"
              >
                Test
              </button>
              <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-bg-tertiary rounded-xl transition-colors">
                <X className="w-4 h-4 text-text-muted" />
              </button>
            </div>
          </div>
          <div className="max-h-[480px] overflow-y-auto custom-scrollbar">
            {allNotifications.length === 0 ? (
              <div className="p-12 text-center">
                <Bell className="w-12 h-12 text-text-muted mx-auto mb-4 opacity-20" />
                <p className="text-sm font-bold text-text-muted uppercase tracking-widest">All clear!</p>
              </div>
            ) : (
              allNotifications.map(n => (
                <div key={`${n.collection}-${n.id}`} className="p-5 border-b border-border-primary hover:bg-bg-tertiary/50 flex justify-between items-start group transition-colors">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-text-primary leading-relaxed">{n.text}</p>
                    <span className="text-[10px] font-bold text-text-muted flex items-center gap-2">
                       <Clock className="w-3 h-3" />
                       {new Date(n.date).toLocaleString()}
                    </span>
                  </div>
                  <button 
                    onClick={() => handleMarkAsRead(n.id, n.collection)}
                    className="opacity-0 group-hover:opacity-100 p-2 hover:bg-accent-green/10 rounded-xl transition-all"
                    title="Mark as read"
                  >
                    <Check className="w-4 h-4 text-accent-green" />
                  </button>
                </div>
              ))
            )}
          </div>
          {allNotifications.length > 0 && (
            <div className="p-3 bg-bg-tertiary/40 border-t border-border-primary flex items-center justify-between px-6">
              <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">
                {allNotifications.length} unread {allNotifications.length === 1 ? 'alert' : 'alerts'}
              </span>
              <button
                onClick={handleClearAll}
                disabled={isClearing}
                className="text-[10px] font-black uppercase tracking-wider text-text-muted hover:text-accent-red transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                {isClearing ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <CheckCheck className="w-3.5 h-3.5" />
                )}
                <span>Clear all</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
