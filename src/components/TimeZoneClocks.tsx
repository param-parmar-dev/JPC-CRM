import React, { useState, useEffect } from 'react';
import { Clock, Globe } from 'lucide-react';
import { motion } from 'motion/react';

interface ZoneInfo {
  label: string;
  zone: string;
  color: string;
}

const ZONES: ZoneInfo[] = [
  { label: 'Eastern Time', zone: 'America/New_York', color: 'text-accent-blue' },
  { label: 'Central Time', zone: 'America/Chicago', color: 'text-accent-purple' },
  { label: 'Mountain Time', zone: 'America/Denver', color: 'text-accent-amber' },
  { label: 'Pacific Time', zone: 'America/Los_Angeles', color: 'text-accent-teal' },
];

export const TimeZoneClocks: React.FC = () => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4 w-full">
      {ZONES.map((zone, idx) => (
        <motion.div
          key={zone.zone}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: idx * 0.1 }}
          className="bg-bg-secondary border border-border-primary rounded-xl sm:rounded-2xl p-3 sm:p-4 flex items-center justify-between shadow-sm hover:shadow-md transition-all group min-w-0"
        >
          <div className="space-y-0.5 sm:space-y-1 min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${zone.color.replace('text-', 'bg-')} animate-pulse`} />
              <p className="text-[9px] sm:text-[10px] font-black text-text-muted uppercase tracking-wider sm:tracking-widest leading-none truncate">
                {zone.label}
              </p>
            </div>
            <p className="text-sm sm:text-xl font-mono font-black text-text-primary tracking-tight truncate">
              {time.toLocaleTimeString('en-US', { 
                timeZone: zone.zone, 
                hour12: true, 
                hour: '2-digit', 
                minute: '2-digit',
                second: '2-digit'
              })}
            </p>
            <p className="text-[8px] sm:text-[9px] text-text-muted font-bold truncate">
              {time.toLocaleDateString('en-US', { 
                timeZone: zone.zone, 
                month: 'short', 
                day: 'numeric' 
              })}
            </p>
          </div>
          <div className={`p-1.5 sm:p-2.5 rounded-lg sm:rounded-xl bg-opacity-10 group-hover:scale-110 transition-transform shrink-0 ${zone.color.replace('text-', 'bg-')}`}>
            <Clock className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${zone.color}`} />
          </div>
        </motion.div>
      ))}
    </div>
  );

};
