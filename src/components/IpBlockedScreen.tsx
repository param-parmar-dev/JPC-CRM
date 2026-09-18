import React, { useState } from 'react';
import { ShieldAlert, Copy, Check, RefreshCw, LogIn, Lock } from 'lucide-react';
import { motion } from 'motion/react';

interface IpBlockedScreenProps {
  ip: string;
  reason?: string;
  message?: string;
  onRetry: () => void;
}

export const IpBlockedScreen: React.FC<IpBlockedScreenProps> = ({
  ip,
  reason,
  message,
  onRetry
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopyIp = () => {
    navigator.clipboard.writeText(ip);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-bg-primary p-6 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-accent-red/5 rounded-full blur-3xl pointer-events-none" />

      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="max-w-md w-full bg-bg-secondary border border-border-primary/80 rounded-3xl p-8 shadow-2xl relative z-10 flex flex-col items-center text-center"
      >
        {/* Shield Icon Badge */}
        <div className="w-16 h-16 rounded-2xl bg-accent-red/10 border border-accent-red/20 flex items-center justify-center mb-6 text-accent-red shadow-lg shadow-accent-red/10">
          <ShieldAlert className="w-8 h-8" />
        </div>

        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-accent-red/10 border border-accent-red/20 rounded-full mb-3 text-accent-red text-xs font-bold uppercase tracking-wider">
          <Lock className="w-3 h-3" />
          <span>Security Barrier</span>
        </div>

        <h1 className="text-2xl font-bold text-text-primary font-heading tracking-tight mb-2">
          Network Access Restricted
        </h1>

        <p className="text-sm text-text-secondary mb-6 leading-relaxed">
          {message || 'Your device is connecting from outside the approved office network, and external access is not enabled for your account.'}
        </p>

        {/* IP Badge Card */}
        <div className="w-full bg-bg-tertiary/70 border border-border-secondary rounded-2xl p-4 mb-6 text-left">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Detected Client IP</span>
            <button
              onClick={handleCopyIp}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent-blue hover:underline"
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3 text-accent-green" />
                  <span className="text-accent-green">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span>Copy IP</span>
                </>
              )}
            </button>
          </div>
          <div className="font-mono text-base font-bold text-text-primary">
            {ip || '127.0.0.1'}
          </div>
          {reason && (
            <div className="mt-2 pt-2 border-t border-border-secondary/50 text-[11px] text-text-muted flex items-center gap-1">
              <span>Policy code:</span>
              <code className="font-mono text-text-secondary bg-bg-secondary px-1.5 py-0.5 rounded text-[10px]">{reason}</code>
            </div>
          )}
        </div>

        {/* Instructions */}
        <div className="text-xs text-text-muted mb-8 leading-normal text-left bg-bg-primary/50 border border-border-secondary/40 p-3.5 rounded-xl w-full">
          <p className="font-semibold text-text-secondary mb-1">How to gain access:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Connect to an <strong>approved office network</strong>.</li>
            <li>Or contact your <strong>System Administrator</strong> to whitelist your external IP.</li>
          </ul>
        </div>

        {/* Actions */}
        <div className="w-full flex flex-col gap-3">
          <button
            onClick={onRetry}
            className="w-full py-3.5 px-4 bg-accent-blue hover:brightness-110 text-white font-bold rounded-xl transition-all shadow-lg shadow-accent-blue/20 flex items-center justify-center gap-2 text-sm"
          >
            <LogIn className="w-4 h-4" />
            <span>Return to Login / Retry</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
};
