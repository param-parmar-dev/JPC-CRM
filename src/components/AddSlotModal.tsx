import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X, Clock, Calendar, Check, AlertTriangle, RefreshCw } from 'lucide-react';
import { db } from '../firebase';
import { collection, query, where, getDocs, doc, setDoc } from 'firebase/firestore';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { getLocalYYYYMMDD, cn } from '../lib/utils';
import { ProxyAvailability } from '../types';
import { addProxyAvailability } from '../services/storage';

interface AddSlotModalProps {
  onClose: () => void;
  date: Date;
  proxyUserId: string;
  onSuccess: () => void;
}

const TIME_SLOTS = [
  { value: '09:30', label: '09:30 AM EST' },
  { value: '10:00', label: '10:00 AM EST' },
  { value: '10:30', label: '10:30 AM EST' },
  { value: '11:00', label: '11:00 AM EST' },
  { value: '11:30', label: '11:30 AM EST' },
  { value: '12:00', label: '12:00 PM EST' },
  { value: '12:30', label: '12:30 PM EST' },
  { value: '13:00', label: '01:00 PM EST' },
  { value: '13:30', label: '01:30 PM EST' },
  { value: '14:00', label: '02:00 PM EST' },
  { value: '14:30', label: '02:30 PM EST' },
  { value: '15:00', label: '03:00 PM EST' },
  { value: '15:30', label: '03:30 PM EST' },
  { value: '16:00', label: '04:00 PM EST' },
  { value: '16:30', label: '04:30 PM EST' },
  { value: '17:00', label: '05:00 PM EST' },
  { value: '17:30', label: '05:30 PM EST' },
  { value: '18:00', label: '06:00 PM EST' },
];

export const AddSlotModal: React.FC<AddSlotModalProps> = ({
  onClose,
  date,
  proxyUserId,
  onSuccess,
}) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [selectedTime, setSelectedTime] = useState('09:30');
  const [slotStatus, setSlotStatus] = useState<ProxyAvailability['slot_status']>('available');
  const [recurrence, setRecurrence] = useState<'none' | 'daily_weekdays' | 'weekly_four_weeks'>('none');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const formattedDate = date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const getTargetDates = (baseDate: Date, recType: string): Date[] => {
    const datesList: Date[] = [new Date(baseDate)];
    
    if (recType === 'daily_weekdays') {
      // Add next 4 consecutive weekdays (total 5 days)
      let current = new Date(baseDate);
      while (datesList.length < 5) {
        current.setDate(current.getDate() + 1);
        const day = current.getDay();
        if (day !== 0 && day !== 6) { // skip weekends
          datesList.push(new Date(current));
        }
      }
    } else if (recType === 'weekly_four_weeks') {
      // Add same day for next 3 weeks (total 4 weeks)
      let current = new Date(baseDate);
      for (let i = 1; i <= 3; i++) {
        current.setDate(current.getDate() + 7);
        datesList.push(new Date(current));
      }
    }
    
    return datesList;
  };

  const handleSave = async () => {
    setIsSubmitting(true);
    try {
      const datesToSchedule = getTargetDates(date, recurrence);
      
      // Let's fetch all existing slots for this proxy to prevent duplicate overlapping schedules
      const q = query(
        collection(db, 'jpc_proxy_availability'),
        where('proxy_user_id', '==', proxyUserId)
      );
      const snap = await getDocs(q);
      const existingStarts = new Map<string, { id: string; created_by?: string }>(); // slot_start -> { id, created_by }
      snap.docs.forEach(doc => {
        const d = doc.data();
        if (d && d.slot_start) {
          existingStarts.set(d.slot_start, { id: doc.id, created_by: d.created_by });
        }
      });

      let addedCount = 0;
      let updatedCount = 0;

      // Map the selection mode to database enum structure
      const dbRecurrenceType: ProxyAvailability['recurrence_type'] = 
        recurrence === 'daily_weekdays' ? 'daily' : 
        recurrence === 'weekly_four_weeks' ? 'weekly' : 'none';

      for (const d of datesToSchedule) {
        const day = d.getDay();
        if (day === 0 || day === 6) continue; // Skip weekend entries
        
        const dateStr = d.toISOString().split('T')[0];
        const startTime = `${dateStr}T${selectedTime}:00`;
        
        // Calculate slot end (add 30 minutes)
        const [h, m] = selectedTime.split(':').map(Number);
        let endH = h;
        let endM = m + 30;
        if (endM >= 60) {
          endH += 1;
          endM = 0;
        }
        const endTime = `${dateStr}T${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}:00`;

        if (existingStarts.has(startTime)) {
          // Update the existing slot status instead of creating duplicate!
          const existingSlot = existingStarts.get(startTime)!;
          if (existingSlot.created_by === 'system') {
            const isHigherAuthority = user && ['administrator', 'jpc_sysadmin', 'jpc_manager', 'jpc_cs'].includes(user.role);
            if (!isHigherAuthority) {
              showToast('Cannot overwrite a fixed auto-generated slot. Slot changes are only allowed by Admin, Manager, System Admin, or CS.', 'error');
              setIsSubmitting(false);
              return;
            }
          }
          const slotId = existingSlot.id;
          await setDoc(doc(db, 'jpc_proxy_availability', slotId), {
            proxy_user_id: proxyUserId,
            slot_start: startTime,
            slot_end: endTime,
            slot_status: slotStatus,
            recurrence_type: dbRecurrenceType,
            timezone: 'America/New_York',
            updated_at: new Date().toISOString()
          }, { merge: true });
          updatedCount++;
        } else {
          // Write a fresh slot
          await addProxyAvailability({
            proxy_user_id: proxyUserId,
            slot_start: startTime,
            slot_end: endTime,
            slot_status: slotStatus,
            recurrence_type: dbRecurrenceType,
            timezone: 'America/New_York',
            created_by: 'manual'
          });
          addedCount++;
        }
      }

      showToast(
        recurrence === 'none' 
          ? 'Availability slot updated successfully.' 
          : `Series scheduled: Added ${addedCount} and updated ${updatedCount} slots.`,
        'success'
      );
      onSuccess();
    } catch (err) {
      console.error(err);
      showToast('Error setting availability. Please try again.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-2 sm:p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-bg-secondary w-full max-w-lg rounded-2xl sm:rounded-[32px] border border-border-primary overflow-hidden shadow-2xl flex flex-col max-h-[94vh]"
      >
        {/* Header */}
        <div className="px-5 sm:px-8 py-4 sm:py-6 border-b border-border-primary flex items-center justify-between bg-bg-tertiary shrink-0">
          <div>
            <span className="text-[10px] font-black text-accent-blue uppercase tracking-widest">Calendar Management</span>
            <h3 className="text-lg sm:text-xl font-black text-text-primary mt-1">Configure Availability</h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 sm:p-2.5 hover:bg-bg-primary rounded-full transition-all border border-border-primary text-text-secondary"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 sm:p-8 space-y-6 flex-1 overflow-y-auto touch-scroll">
          <div className="bg-bg-tertiary/50 border border-border-primary rounded-2xl p-4 flex items-start gap-3">
            <Calendar className="w-5 h-5 text-accent-blue shrink-0 mt-0.5" />
            <div>
              <p className="text-[9px] font-black text-text-muted uppercase tracking-wider">Assigned Date</p>
              <p className="text-sm font-black text-text-primary mt-0.5">{formattedDate}</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-black text-text-muted uppercase tracking-widest block mb-2">Select Start Time (EST)</label>
              <div className="relative">
                <Clock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <select
                  value={selectedTime}
                  onChange={(e) => setSelectedTime(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-bg-tertiary border border-border-primary rounded-xl text-sm outline-none focus:ring-2 focus:ring-accent-blue/20 appearance-none font-bold text-text-primary"
                >
                  {TIME_SLOTS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-black text-text-muted uppercase tracking-widest block mb-2">Choose Status / Block Type</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { value: 'available', label: 'Available', desc: 'Candidates can book', color: 'border-accent-green text-accent-green hover:bg-accent-green/5' },
                  { value: 'unavailable', label: 'Blocked / Out', desc: 'Mark as unavailable', color: 'border-accent-gray text-text-primary hover:bg-accent-gray/5' },
                  { value: 'break', label: 'On Break', desc: 'Short buffer break', color: 'border-accent-blue text-accent-blue hover:bg-accent-blue/5' },
                  { value: 'leave', label: 'On Leave', desc: 'Full-day/shift block', color: 'border-accent-amber text-accent-amber hover:bg-accent-amber/5' }
                ].map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setSlotStatus(item.value as any)}
                    className={cn(
                      "p-3.5 sm:p-4 border rounded-2xl text-left transition-all flex flex-col justify-between text-xs font-bold",
                      slotStatus === item.value 
                        ? `${item.color} bg-bg-tertiary ring-2 ring-offset-2 ring-offset-bg-secondary ring-accent-blue`
                        : "border-border-primary hover:border-text-secondary/20 text-text-muted"
                    )}
                  >
                    <span className="font-black text-xs uppercase">{item.label}</span>
                    <span className="text-[9px] opacity-70 mt-1 font-normal">{item.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[10px] font-black text-text-muted uppercase tracking-widest block mb-2">Set Recurrence Series</label>
              <select
                value={recurrence}
                onChange={(e) => setRecurrence(e.target.value as any)}
                className="w-full px-4 py-3 bg-bg-tertiary border border-border-primary rounded-xl text-sm outline-none focus:ring-2 focus:ring-accent-blue/20 font-bold text-text-primary"
              >
                <option value="none">One-time slot (No Recurrence)</option>
                <option value="daily_weekdays">Daily series (Next 5 Weekdays)</option>
                <option value="weekly_four_weeks">Weekly series (Next 4 Weeks on this Day)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 sm:px-8 py-4 sm:py-5 border-t border-border-primary flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 sm:gap-3 bg-bg-tertiary shrink-0">
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2.5 border border-border-primary hover:bg-bg-secondary text-xs font-bold text-text-secondary rounded-xl transition-all text-center"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSubmitting}
            className="w-full sm:w-auto px-6 py-2.5 bg-accent-blue hover:bg-accent-blue/90 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-accent-blue/20"
          >
            {isSubmitting ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Check className="w-3.5 h-3.5" />
            )}
            Save Preference
          </button>
        </div>
      </motion.div>
    </div>
  );
};
