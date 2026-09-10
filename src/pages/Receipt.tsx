import React, { useState, useEffect } from 'react';
import { getCandidateById, getUserById, subscribeToCollection } from '../services/storage';
import { Payment, Candidate, User } from '../types';
import { Printer, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { FreeTrialBadge } from '../components/FreeTrialBadge';
import { useAuth } from '../contexts/AuthContext';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

export const Receipt: React.FC = () => {
  const { isAuthReady } = useAuth();
  const params = new URLSearchParams(window.location.hash.split('?')[1]);
  const payId = params.get('pay_id');
  const candId = params.get('cand_id');

  const [payment, setPayment] = useState<Payment | null>(null);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [creator, setCreator] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isAuthReady || !payId || !candId) return;

    const unsubPayment = onSnapshot(doc(db, 'jpc_payments', String(payId)), async (snap) => {
      if (snap.exists()) {
        const pData = snap.data() as Payment;
        setPayment(pData);
        
        // Fetch creator
        if (pData.created_by) {
          const uSnap = await getDoc(doc(db, 'jpc_users', String(pData.created_by)));
          if (uSnap.exists()) setCreator(uSnap.data() as User);
        }
      }
    });

    const unsubCandidate = onSnapshot(doc(db, 'jpc_candidates', String(candId)), (snap) => {
      if (snap.exists()) {
        setCandidate(snap.data() as Candidate);
      }
      setIsLoading(false);
    });

    return () => {
      unsubPayment();
      unsubCandidate();
    };
  }, [isAuthReady, payId, candId]);

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-bg-primary">
        <div className="w-12 h-12 border-4 border-accent-blue/30 border-t-accent-blue rounded-full animate-spin" />
      </div>
    );
  }

  if (!payment || !candidate) {
    return (
      <div className="h-screen flex items-center justify-center bg-bg-primary">
        <div className="text-center">
          <p className="text-text-secondary">Receipt not found.</p>
          <a href="#dashboard" className="text-accent-blue hover:underline mt-4 block">Back to Dashboard</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-primary p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between no-print">
          <a 
            href={`#candidate?id=${candidate.id}`}
            className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors font-bold"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Candidate
          </a>
          <button 
            onClick={() => window.print()}
            className="flex items-center gap-2 px-6 py-2 bg-accent-blue text-white font-bold rounded-xl hover:bg-accent-blue/90 transition-all shadow-lg shadow-accent-blue/20"
          >
            <Printer className="w-5 h-5" />
            Print Receipt
          </button>
        </div>

        <div className="bg-white text-slate-900 rounded-3xl shadow-2xl overflow-hidden border border-slate-200">
          {/* Header */}
          <div className="bg-slate-900 text-white p-6 sm:p-8 md:p-12 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <img 
                  src="https://auriic.co/wp-content/uploads/2026/04/Auriic-logo-Header.webp" 
                  alt="Auriic Logo" 
                  className="h-14 sm:h-16 w-auto mb-2"
                  referrerPolicy="no-referrer"
                />
                <h1 className="text-2xl font-bold font-heading tracking-tight hidden">Auriic</h1>
              </div>
              <p className="text-slate-400 text-sm">Job Placement Customer Relationship Management</p>
            </div>
            <div className="text-left md:text-right">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-accent-green/20 text-accent-green rounded-full text-xs font-bold uppercase tracking-wider mb-2">
                <CheckCircle2 className="w-4 h-4" />
                Payment Successful
              </div>
              <p className="text-slate-400 text-xs uppercase tracking-widest font-bold">Receipt No: {payment.receipt_number}</p>
            </div>
          </div>

          {/* Amount Section */}
          <div className="p-6 sm:p-8 md:p-12 border-b border-slate-100 bg-slate-50/50">
            <div className="flex flex-col md:flex-row justify-between gap-6 sm:gap-8">
              <div>
                <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-1">Amount Paid</p>
                <h2 className="text-4xl sm:text-5xl font-bold text-slate-900">${payment.amount.toLocaleString()}</h2>
              </div>
              <div className="flex flex-wrap gap-4">
                <div className="text-left sm:text-right">
                  <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-1">Part Number</p>
                  <span className="inline-block px-4 py-1 bg-slate-900 text-white rounded-lg font-bold text-sm">Part {payment.part_number}</span>
                </div>
                <div className="text-left sm:text-right">
                  <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-1">Method</p>
                  <span className="inline-block px-4 py-1 bg-slate-200 text-slate-700 rounded-lg font-bold text-sm">{payment.payment_method}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Details Grid */}
          <div className="p-6 sm:p-8 md:p-12 grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
            <div className="space-y-6">
              <div>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-2">Candidate Details</p>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <p className="text-lg font-bold text-slate-900">{candidate.full_name}</p>
                  {candidate.is_free_trial && (
                    <FreeTrialBadge 
                      size="sm" 
                      startDate={candidate.free_trial_start_date} 
                      endDate={candidate.free_trial_end_date} 
                    />
                  )}
                </div>
                <p className="text-slate-600">{candidate.phone}</p>
                <p className="text-slate-600">{candidate.email || '—'}</p>
              </div>
              <div>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-2">Package Information</p>
                <p className="text-slate-900 font-bold">{candidate.package_name || '—'}</p>
                <p className="text-slate-600">Total Package Value: ${candidate.package_amount.toLocaleString()}</p>
              </div>
            </div>
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">Paid On</p>
                  <p className="text-slate-900 font-bold">{payment.paid_on ? new Date(payment.paid_on).toLocaleDateString() : '—'}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">Due Date</p>
                  <p className="text-slate-900 font-bold">{new Date(payment.due_date).toLocaleDateString()}</p>
                </div>
              </div>
              <div>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">Recorded By</p>
                <p className="text-slate-900 font-bold">{creator?.display_name || '—'}</p>
              </div>
              {payment.notes && (
                <div>
                  <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">Notes</p>
                  <p className="text-slate-600 italic">"{payment.notes}"</p>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="p-6 sm:p-8 md:p-12 bg-slate-50 border-t border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-slate-400 text-xs font-medium text-center md:text-left">This is a computer-generated receipt and does not require a physical signature.</p>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-accent-green rounded-full"></div>
              <p className="text-slate-900 font-bold text-sm">Auriic Official Receipt</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
