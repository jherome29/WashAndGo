import React from 'react';
import { format, parseISO } from 'date-fns';
import { IdCard, Gift, Sparkles, Car } from 'lucide-react';
import { PublicMembership } from '../lib/api';

const STATUS_STYLE: Record<PublicMembership['status'], { bg: string; text: string; label: string }> = {
  ACTIVE:    { bg: '#dcfce7', text: '#166534', label: 'Active' },
  EXPIRED:   { bg: '#fee2e2', text: '#991b1b', label: 'Expired' },
  CANCELLED: { bg: '#f3f4f6', text: '#6b7280', label: 'Cancelled' },
};

export default function MembershipStatusCard({ membership }: { membership: PublicMembership }) {
  const style = STATUS_STYLE[membership.status];
  const visitsIntoCycle = membership.visitCount % 10;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-3" style={{ backgroundColor: '#fafafa' }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #ee4923, #F4921F)' }}>
            <IdCard className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="font-lovelo text-[9px] font-black tracking-[0.2em] uppercase text-gray-400">Club Wash &amp; Go</p>
            <p className="font-lovelo font-black text-sm" style={{ color: '#383838' }}>{membership.membershipNo}</p>
          </div>
        </div>
        <span className="font-lovelo text-[10px] font-black px-2.5 py-1 rounded-full whitespace-nowrap" style={{ backgroundColor: style.bg, color: style.text }}>
          {style.label}
        </span>
      </div>

      <div className="p-6 space-y-5">
        {membership.freeWashCredits > 0 ? (
          <div className="flex items-center gap-3 rounded-2xl p-4" style={{ backgroundColor: '#fef3c7' }}>
            <Gift className="w-5 h-5 shrink-0" style={{ color: '#92400e' }} />
            <p className="font-lovelo text-xs font-black" style={{ color: '#92400e' }}>
              {membership.freeWashCredits} free wash{membership.freeWashCredits !== 1 ? 'es' : ''} ready to redeem on your next visit!
            </p>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="font-lovelo text-[9px] font-black tracking-[0.15em] uppercase text-gray-400">Progress to Next Free Wash</p>
              <p className="font-lovelo text-[10px] font-black" style={{ color: '#ee4923' }}>{visitsIntoCycle}/10 visits</p>
            </div>
            <div className="w-full h-2 rounded-full bg-gray-100 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${(visitsIntoCycle / 10) * 100}%`, background: 'linear-gradient(135deg, #ee4923, #F4921F)' }} />
            </div>
          </div>
        )}

        {!membership.firstWashUsed && (
          <div className="flex items-center gap-2.5 rounded-xl px-4 py-3" style={{ backgroundColor: 'rgba(238,73,35,0.06)' }}>
            <Sparkles className="w-4 h-4 shrink-0" style={{ color: '#ee4923' }} />
            <p className="font-lovelo text-xs" style={{ color: '#383838', fontWeight: 300 }}>
              Your <span className="font-black">50% off first wash</span> discount is still available.
            </p>
          </div>
        )}

        {membership.vehicles.length > 0 && (
          <div>
            <p className="font-lovelo text-[9px] font-black tracking-[0.15em] uppercase text-gray-400 mb-2">Vehicles on this Membership</p>
            <div className="flex flex-wrap gap-2">
              {membership.vehicles.map(v => (
                <span key={v.plateNumber} className="font-lovelo flex items-center gap-1.5 text-[10px] font-black px-3 py-1.5 rounded-lg text-white" style={{ backgroundColor: '#383838' }}>
                  <Car className="w-3 h-3" /> {v.plateNumber}{v.vehicleLabel ? ` · ${v.vehicleLabel}` : ''}
                </span>
              ))}
            </div>
          </div>
        )}

        <p className="font-lovelo text-[10px] text-gray-400" style={{ fontWeight: 300 }}>
          {membership.status === 'ACTIVE' ? 'Valid through' : 'Expired on'} {format(parseISO(membership.expiresAt), 'MMMM d, yyyy')}
        </p>
      </div>
    </div>
  );
}
