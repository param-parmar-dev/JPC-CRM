import React, { useEffect, useRef, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Trophy, Award, PartyPopper, ChevronLeft, ChevronRight, Volume2, VolumeX, Flame, X } from 'lucide-react';
import { Candidate, User, InterviewSupportRequest, InterviewOfferRequest } from '../types';
import { cn } from '../lib/utils';

interface CelebrationBannerProps {
  candidates: Candidate[];
  allUsers: User[];
  interviews?: InterviewSupportRequest[];
  offerRequests?: InterviewOfferRequest[];
}

interface ConfettiParticle {
  x: number;
  y: number;
  size: number;
  color: string;
  shape: 'circle' | 'square' | 'triangle' | 'emoji';
  emoji?: string;
  vx: number;
  vy: number;
  rotation: number;
  rotationSpeed: number;
  opacity: number;
}

const CELEBRATION_EMOJIS = ['🎉', '🥳', '🏆', '🚀', '💼', '✨', '👏', '🌟', '👑', '💰'];

export const CelebrationBanner: React.FC<CelebrationBannerProps> = ({ 
  candidates, 
  allUsers, 
  interviews = [], 
  offerRequests = [] 
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const particlesRef = useRef<ConfettiParticle[]>([]);
  const animationFrameRef = useRef<number | null>(null);

  // Filter ONLY candidates who are Placed (completed) or have Offer Received (offer)
  const celebratedCandidates = useMemo(() => {
    return candidates.filter(c => c.current_stage === 'completed' || c.current_stage === 'offer');
  }, [candidates]);

  // Track counts to reset dismissed state when a new placement/offer arrives
  const prevCountRef = useRef(celebratedCandidates.length);
  useEffect(() => {
    if (celebratedCandidates.length > prevCountRef.current) {
      setIsDismissed(false); // Re-open the celebrating widget auto-magically!
      setActiveIndex(celebratedCandidates.length - 1); // Point to the fresh one
      prevCountRef.current = celebratedCandidates.length;
    } else if (celebratedCandidates.length < prevCountRef.current) {
      prevCountRef.current = celebratedCandidates.length;
    }
  }, [celebratedCandidates.length]);

  // Sound synthesizer chord progression
  const playVictoryTune = () => {
    if (!soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      
      const playNote = (freq: number, delay: number, duration: number, type: OscillatorType = 'sine') => {
        setTimeout(() => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = type;
          osc.frequency.setValueAtTime(freq, ctx.currentTime);
          
          gain.gain.setValueAtTime(0.08, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
          
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + duration);
        }, delay);
      };

      playNote(261.63, 0, 0.3, 'triangle'); // C4
      playNote(329.63, 120, 0.3, 'triangle'); // E4
      playNote(392.00, 240, 0.3, 'triangle'); // G4
      playNote(523.25, 360, 0.6, 'sine'); // C5
    } catch (e) {
      console.warn('Synth error:', e);
    }
  };

  // Spray particles
  const addConfettiBurst = (sourceX?: number, sourceY?: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const startX = sourceX ?? canvas.width / 2;
    const startY = sourceY ?? canvas.height / 2;

    const colors = ['#00AD8C', '#C9982C', '#8B5CF6', '#EF4444', '#3B82F6', '#EC4899', '#F59E0B', '#10B981'];
    const shapes: ('circle' | 'square' | 'triangle' | 'emoji')[] = ['circle', 'square', 'triangle', 'emoji'];

    const newParticles: ConfettiParticle[] = [];
    const count = sourceX !== undefined ? 35 : 75;

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 6;
      const shape = shapes[Math.floor(Math.random() * shapes.length)];
      const emoji = shape === 'emoji' ? CELEBRATION_EMOJIS[Math.floor(Math.random() * CELEBRATION_EMOJIS.length)] : undefined;

      newParticles.push({
        x: startX,
        y: startY,
        size: shape === 'emoji' ? 14 + Math.random() * 10 : 4 + Math.random() * 6,
        color: colors[Math.floor(Math.random() * colors.length)],
        shape,
        emoji,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.2,
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 8,
        opacity: 1
      });
    }

    particlesRef.current = [...particlesRef.current, ...newParticles].slice(0, 200);
    playVictoryTune();
  };

  // Canvas context handler
  useEffect(() => {
    if (isDismissed || celebratedCandidates.length === 0) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const handleResize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      canvas.width = rect?.width || window.innerWidth;
      canvas.height = rect?.height || 100;
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const activeParticles = particlesRef.current.filter(p => p.opacity > 0 && p.y < canvas.height + 20);

      activeParticles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.14;
        p.vx *= 0.985;
        p.rotation += p.rotationSpeed;
        p.opacity -= 0.009;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.globalAlpha = Math.max(0, p.opacity);

        if (p.shape === 'emoji') {
          ctx.font = `${p.size}px Arial`;
          ctx.fillText(p.emoji || '🎉', -p.size / 2, p.size / 2);
        } else {
          ctx.fillStyle = p.color;
          ctx.beginPath();
          if (p.shape === 'circle') {
            ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          } else if (p.shape === 'triangle') {
            ctx.moveTo(0, -p.size / 2);
            ctx.lineTo(p.size / 2, p.size / 2);
            ctx.lineTo(-p.size / 2, p.size / 2);
          } else {
            ctx.rect(-p.size / 2, -p.size / 2, p.size, p.size);
          }
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      });

      particlesRef.current = activeParticles;
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isDismissed, celebratedCandidates.length]);

  // Rotator
  useEffect(() => {
    if (isDismissed || celebratedCandidates.length <= 1) return;
    const timer = setInterval(() => {
      setActiveIndex(prev => (prev + 1) % celebratedCandidates.length);
    }, 8000);
    return () => clearInterval(timer);
  }, [celebratedCandidates, isDismissed]);

  if (isDismissed || celebratedCandidates.length === 0) return null;

  const currentCandidate = celebratedCandidates[activeIndex];

  // Helper names
  const recruiter = allUsers.find(u => String(u.id) === String(currentCandidate.assigned_recruiter))?.display_name || 'Not Assigned';
  const marketingTL = allUsers.find(u => String(u.id) === String(currentCandidate.assigned_marketing_leader))?.display_name || 'Not Assigned';
  const salesPerson = allUsers.find(u => String(u.id) === String(currentCandidate.assigned_sales))?.display_name || 'Not Assigned';

  // Proxy Person resolution
  const getProxyPersonName = () => {
    // 1. Direct from latest offer request on candidate
    if (currentCandidate.latest_interview_offer_request?.proxy_person_name?.trim()) {
      return currentCandidate.latest_interview_offer_request.proxy_person_name.trim();
    }
    if (currentCandidate.latest_interview_offer_request?.proxy_user_id) {
      const matched = allUsers.find(u => String(u.id) === String(currentCandidate.latest_interview_offer_request?.proxy_user_id));
      if (matched?.display_name) return matched.display_name;
    }

    // 2. From offer requests collection
    if (offerRequests && offerRequests.length > 0) {
      const candOfferRequests = offerRequests
        .filter(o => o.candidate_id === currentCandidate.id)
        .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

      const matchedOffer = candOfferRequests[0];
      if (matchedOffer?.proxy_person_name?.trim()) {
        return matchedOffer.proxy_person_name.trim();
      }
      if (matchedOffer?.proxy_user_id) {
        const matched = allUsers.find(u => String(u.id) === String(matchedOffer.proxy_user_id));
        if (matched?.display_name) return matched.display_name;
      }
    }

    // 3. From interview support requests (matched proxy user)
    if (interviews && interviews.length > 0) {
      const candInterviews = interviews
        .filter(i => i.candidate_id === currentCandidate.id)
        .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

      const withProxy = candInterviews.find(i => i.proxy_user_id);
      if (withProxy?.proxy_user_id) {
        const matchedUser = allUsers.find(u => String(u.id) === String(withProxy.proxy_user_id));
        if (matchedUser?.display_name) return matchedUser.display_name;
      }
    }

    return 'Not Assigned';
  };

  const proxyPerson = getProxyPersonName();

  return (
    <div 
      ref={containerRef}
      className="relative bg-gradient-to-br from-[#0c1620] via-[#091018] to-[#0c1015] border border-accent-blue/30 rounded-2xl overflow-hidden p-3.5 md:p-4 shadow-xl group animate-fadeIn"
      id="offer-pipeline-celebration-widget"
    >
      {/* Background Physics Canvas */}
      <canvas 
        ref={canvasRef} 
        className="absolute inset-0 w-full h-full pointer-events-none z-10"
      />

      {/* Floating sparkles */}
      <div className="absolute top-2 left-2 text-accent-blue/20 animate-pulse pointer-events-none">
        <Sparkles className="w-4 h-4" />
      </div>

      {/* Close button */}
      <button
        onClick={() => setIsDismissed(true)}
        className="absolute top-2.5 right-2.5 p-1 bg-bg-secondary/40 hover:bg-accent-red/20 text-text-muted hover:text-accent-red rounded-lg transition-all z-30 cursor-pointer border border-border-primary/20"
        title="Dismiss celebration banner"
      >
        <X className="w-3.5 h-3.5" />
      </button>

      <div className="relative z-20 flex flex-col md:flex-row gap-4 items-center justify-between h-full">
        {/* Left Badge Indicator */}
        <div className="flex items-center gap-2 shrink-0 self-start md:self-center pr-3 border-b md:border-b-0 md:border-r border-border-primary/35 pb-2 md:pb-0">
          <span className="p-1 px-2.5 bg-accent-blue/15 text-accent-blue border border-accent-blue/20 text-[9px] font-black uppercase tracking-widest rounded-full flex items-center gap-1">
            <Flame className="w-3 h-3 text-accent-blue animate-bounce" /> Superstars Spot!
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={cn(
                "p-1 rounded-md border transition-all cursor-pointer text-[10px]",
                soundEnabled 
                  ? "bg-accent-blue/10 text-accent-blue border-accent-blue/20" 
                  : "bg-bg-secondary/40 text-text-muted border-border-primary/20"
              )}
              title={soundEnabled ? "Mute celebratory sounds" : "Enable victory chime synthesizer"}
            >
              {soundEnabled ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
            </button>
            <button
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const parentRect = containerRef.current?.getBoundingClientRect();
                if (parentRect) {
                  addConfettiBurst(rect.left - parentRect.left + 50, rect.top - parentRect.top);
                } else {
                  addConfettiBurst();
                }
              }}
              className="p-1 px-2 bg-accent-blue/10 hover:bg-accent-blue/25 text-accent-blue border border-accent-blue/20 font-black uppercase tracking-wider text-[9px] rounded-md transition-all cursor-pointer flex items-center gap-1"
            >
              <PartyPopper className="w-3 h-3" /> Burst!
            </button>
          </div>
        </div>

        {/* Middle: Active candidate name + role details */}
        <div className="flex-1 flex items-center gap-3.5 min-w-0 w-full">
          <div className="relative shrink-0">
            <div className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center font-black text-xs shadow-md relative border",
              currentCandidate.current_stage === 'completed'
                ? "bg-accent-green/10 text-accent-green border-accent-green/30"
                : "bg-accent-amber/10 text-accent-amber border-accent-amber/30"
            )}>
              {currentCandidate.full_name.split(' ').map(n => n[0]).join('')}
              <div className="absolute -top-1.5 -right-1.5 bg-[#091018] p-0.5 rounded-full border border-border-primary/45">
                {currentCandidate.current_stage === 'completed' ? (
                  <Trophy className="w-2.5 h-2.5 text-accent-green animate-pulse" />
                ) : (
                  <Award className="w-2.5 h-2.5 text-accent-amber animate-pulse" />
                )}
              </div>
            </div>
            {/* Pulsing ring background */}
            <div className={cn(
              "absolute inset-0 rounded-full scale-110 -z-10 animate-ping opacity-20",
              currentCandidate.current_stage === 'completed' ? "bg-accent-green" : "bg-accent-amber"
            )} style={{ animationDuration: '4s' }} />
          </div>

          <div className="space-y-0.5 flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-sm font-black text-text-primary tracking-tight truncate leading-tight">{currentCandidate.full_name}</h4>
              <span className={cn(
                "px-2 py-0.2 rounded-full text-[8px] font-black border uppercase tracking-wider scale-95 origin-left",
                currentCandidate.current_stage === 'completed'
                  ? "bg-accent-green/10 text-accent-green border-accent-green/20"
                  : "bg-accent-amber/10 text-accent-amber border-accent-amber/20"
              )}>
                {currentCandidate.current_stage === 'completed' ? '🏆 PLACEMENT' : '💼 OFFER RECEIVED'}
              </span>
            </div>

            <p className="text-[10px] text-text-secondary font-bold uppercase tracking-wider truncate">{currentCandidate.job_interest || currentCandidate.domain_interested}</p>
            
            {/* Metadata Badges: Recruiter, Marketing TL, Sales Person, Proxy */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] text-text-muted font-bold tracking-wider uppercase pt-0.5">
              <span className="flex items-center gap-1 bg-bg-tertiary/60 p-0.5 px-2 rounded-md border border-border-primary/30">
                Recruiter: <b className="text-text-primary font-black">{recruiter}</b>
              </span>
              <span className="flex items-center gap-1 bg-bg-tertiary/60 p-0.5 px-2 rounded-md border border-border-primary/30">
                Marketing TL: <b className="text-text-primary font-black">{marketingTL}</b>
              </span>
              <span className="flex items-center gap-1 bg-bg-tertiary/60 p-0.5 px-2 rounded-md border border-border-primary/30">
                Sales: <b className="text-text-primary font-black">{salesPerson}</b>
              </span>
              <span className="flex items-center gap-1 bg-bg-tertiary/60 p-0.5 px-2 rounded-md border border-border-primary/30">
                Proxy: <b className="text-text-primary font-black">{proxyPerson}</b>
              </span>
            </div>
          </div>
        </div>

        {/* Right side: Navigation for multipage / multi placements */}
        {celebratedCandidates.length > 1 && (
          <div className="flex items-center gap-2 shrink-0 bg-bg-tertiary/35 p-1 rounded-xl border border-border-primary/30 self-end md:self-center">
            <span className="text-[9px] text-text-muted font-bold tracking-wider uppercase px-2">
              {activeIndex + 1}/{celebratedCandidates.length} 🌟
            </span>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => setActiveIndex(prev => (prev - 1 + celebratedCandidates.length) % celebratedCandidates.length)}
                className="p-1.5 bg-bg-secondary/60 hover:bg-bg-secondary border border-border-primary/60 rounded-md text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => setActiveIndex(prev => (prev + 1) % celebratedCandidates.length)}
                className="p-1.5 bg-bg-secondary/60 hover:bg-[#101924] border border-border-primary/60 rounded-md text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
              >
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
