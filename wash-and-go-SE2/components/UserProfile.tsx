import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { api, PublicMembership } from '../lib/api';
import {
  Edit2,
  X,
  Check,
  User,
  Phone,
  Mail,
  AlertCircle,
  Loader2,
  CheckCircle2,
  IdCard,
} from 'lucide-react';
import { cn } from '../lib/utils';
import MembershipStatusCard from './MembershipStatusCard';
import type { AppUser } from '../App';

interface UserProfileProps {
  onUserUpdate?: (updates: { name?: string; phone?: string }) => void;
  onGoBookings?: () => void;
}

interface EditFormState {
  fullName: string;
  phone: string;
  email: string;
}

interface ProfileHeaderProps {
  user: AppUser;
  isEditing: boolean;
  onToggleEdit: () => void;
}

function ProfileHeader({ user, isEditing, onToggleEdit }: ProfileHeaderProps) {
  const initial = user.name?.charAt(0)?.toUpperCase() ?? '?';
  return (
    <div className="relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #383838 0%, #1a1a1a 100%)' }}>
      <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'repeating-linear-gradient(45deg, #ee4923 0, #ee4923 1px, transparent 0, transparent 50%)', backgroundSize: '20px 20px' }} />
      <div className="relative max-w-3xl mx-auto px-4 py-10">
        <div className="flex items-start gap-5">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-white font-lovelo font-black text-2xl shrink-0 shadow-lg" style={{ background: 'linear-gradient(135deg, #ee4923, #F4921F)' }}>
            {initial}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-lovelo text-[10px] font-black tracking-[0.25em] uppercase mb-1" style={{ color: '#ee4923' }}>My Profile</p>
            <h1 className="font-lovelo font-display font-black text-xl text-white truncate">{user.name}</h1>
            <p className="font-lovelo text-gray-400 text-xs truncate mt-0.5" style={{ fontWeight: 300 }}>{user.email}</p>
            {user.phone && <p className="font-lovelo text-gray-500 text-xs mt-0.5" style={{ fontWeight: 300 }}>{user.phone}</p>}
            <p className="font-lovelo text-gray-500 text-[10px] mt-2" style={{ fontWeight: 300 }}>
              Manage your account details here. Use My Bookings to track appointments.
            </p>
          </div>
          <button type="button"
            onClick={onToggleEdit}
            className="flex items-center gap-2 font-lovelo text-xs font-black tracking-wider transition-all border rounded-xl px-3 py-2"
            style={
              isEditing
                ? { color: '#fff', backgroundColor: 'rgba(255,255,255,0.12)', borderColor: 'rgba(255,255,255,0.25)' }
                : { color: '#9ca3af', backgroundColor: 'transparent', borderColor: 'rgba(255,255,255,0.1)' }
            }
          >
            {isEditing ? <X className="w-3.5 h-3.5" /> : <Edit2 className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{isEditing ? 'Cancel' : 'Edit Profile'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

interface AccountActionsGridProps {
  user: AppUser;
  isEditing: boolean;
  onToggleEdit: () => void;
  onGoBookings?: () => void;
  onResetPassword: () => void;
  resetSending: boolean;
}

function AccountActionsGrid({ user, isEditing, onToggleEdit, onGoBookings, onResetPassword, resetSending }: AccountActionsGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <p className="font-lovelo text-[10px] font-black tracking-[0.2em] uppercase text-gray-400 mb-4">
          Account Overview
        </p>
        <div className="space-y-3">
          <div>
            <p className="font-lovelo text-[9px] font-black tracking-[0.14em] uppercase text-gray-400 mb-1">Full Name</p>
            <p className="font-lovelo text-sm" style={{ color: '#383838', fontWeight: 700 }}>{user.name}</p>
          </div>
          <div>
            <p className="font-lovelo text-[9px] font-black tracking-[0.14em] uppercase text-gray-400 mb-1">Email</p>
            <p className="font-lovelo text-sm break-all" style={{ color: '#383838', fontWeight: 300 }}>{user.email}</p>
          </div>
          <div>
            <p className="font-lovelo text-[9px] font-black tracking-[0.14em] uppercase text-gray-400 mb-1">Phone</p>
            <p className="font-lovelo text-sm" style={{ color: '#383838', fontWeight: 300 }}>{user.phone || 'Not set'}</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <p className="font-lovelo text-[10px] font-black tracking-[0.2em] uppercase text-gray-400 mb-4">
          Quick Actions
        </p>
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={onToggleEdit}
            className="w-full flex items-center justify-center gap-2 font-lovelo text-xs font-black tracking-wider text-white rounded-xl px-4 py-2.5 transition-opacity"
            style={{ background: 'linear-gradient(135deg, #ee4923, #F4921F)' }}
          >
            {isEditing ? <X className="w-3.5 h-3.5" /> : <Edit2 className="w-3.5 h-3.5" />}
            {isEditing ? 'Close Editor' : 'Edit Profile'}
          </button>

          <button
            type="button"
            onClick={onGoBookings}
            className="w-full flex items-center justify-center gap-2 font-lovelo text-xs font-black tracking-wider rounded-xl px-4 py-2.5 border transition-colors"
            style={{ color: '#383838', borderColor: '#d1d5db', backgroundColor: '#fff' }}
          >
            <Mail className="w-3.5 h-3.5 text-gray-500" />
            Go to My Bookings
          </button>

          <button
            type="button"
            onClick={onResetPassword}
            disabled={resetSending}
            className="w-full flex items-center justify-center gap-2 font-lovelo text-xs font-black tracking-wider rounded-xl px-4 py-2.5 border transition-colors disabled:opacity-60"
            style={{ color: '#383838', borderColor: '#d1d5db', backgroundColor: '#fff' }}
          >
            {resetSending ? <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-500" /> : <Mail className="w-3.5 h-3.5 text-gray-500" />}
            {resetSending ? 'Sending Reset Link...' : 'Reset Password'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface MembershipSectionProps {
  membershipLoading: boolean;
  membership: PublicMembership | null;
}

function MembershipSection({ membershipLoading, membership }: MembershipSectionProps) {
  if (membershipLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
      </div>
    );
  }
  if (membership) {
    return <MembershipStatusCard membership={membership} />;
  }
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex items-start gap-4">
      <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, #ee4923, #F4921F)' }}>
        <IdCard className="w-5 h-5 text-white" />
      </div>
      <div>
        <p className="font-lovelo font-black text-sm mb-1" style={{ color: '#383838' }}>Not a Club Wash &amp; Go member yet?</p>
        <p className="font-lovelo text-xs text-gray-500" style={{ fontWeight: 300 }}>
          Ask our staff at the counter to join for ₱300/year — covers up to 3 vehicles, 50% off your first wash,
          a free wash every 10th visit, and discounts on Antibac, Oil Change, Rust Proof, Ceramic Tint, and Ceramic Coating.
        </p>
      </div>
    </div>
  );
}

interface EditProfileFormProps {
  user: AppUser;
  editForm: EditFormState;
  setEditForm: React.Dispatch<React.SetStateAction<EditFormState>>;
  editError: string | null;
  emailVerifSent: boolean;
  saveSuccess: boolean;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}

function EditProfileForm(props: EditProfileFormProps) {
  const { user, editForm, setEditForm, editError, emailVerifSent, saveSuccess, saving, onSave, onCancel } = props;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-lovelo font-black text-sm" style={{ color: '#383838' }}>Edit Profile</h2>
        <button type="button" onClick={onCancel} className="text-gray-400 hover:text-gray-600 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="font-lovelo text-[9px] font-black tracking-widest uppercase text-gray-400 block mb-2">Full Name</label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={editForm.fullName}
              onChange={e => setEditForm(f => ({ ...f, fullName: e.target.value }))}
              className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm font-lovelo bg-gray-50 border border-gray-200 text-gray-800 placeholder-gray-400 outline-none focus:ring-2 focus:ring-[#ee4923]/30 focus:border-[#ee4923]/50 transition-all"
              placeholder="Your full name"
            />
          </div>
        </div>

        <div>
          <label className="font-lovelo text-[9px] font-black tracking-widest uppercase text-gray-400 block mb-2">Phone</label>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <input
              type="tel"
              value={editForm.phone}
              onChange={e => {
                const v = e.target.value.replace(/\D/g, '');
                if (v.length <= 11) setEditForm(f => ({ ...f, phone: v }));
              }}
              pattern="^09\d{9}$"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm font-lovelo bg-gray-50 border border-gray-200 text-gray-800 placeholder-gray-400 outline-none focus:ring-2 focus:ring-[#ee4923]/30 focus:border-[#ee4923]/50 transition-all"
              placeholder="09XXXXXXXXX"
            />
          </div>
          {editForm.phone.length > 0 && !/^09\d{9}$/.test(editForm.phone) && (
            <p className="font-lovelo text-[10px] text-red-500 mt-1.5">
              Must be 11 digits starting with 09 (e.g. 09171234567)
            </p>
          )}
        </div>
      </div>

      <div>
        <label className="font-lovelo text-[9px] font-black tracking-widest uppercase text-gray-400 block mb-2">Email</label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          <input
            type="email"
            value={editForm.email}
            onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
            className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm font-lovelo bg-gray-50 border border-gray-200 text-gray-800 placeholder-gray-400 outline-none focus:ring-2 focus:ring-[#ee4923]/30 focus:border-[#ee4923]/50 transition-all"
            placeholder="your@email.com"
          />
        </div>
        {editForm.email.trim() !== user.email && (
          <div className="mt-2 flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200">
            <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
            <p className="font-lovelo text-[10px] text-amber-700 leading-snug">
              <span className="font-black">Verification required.</span> Save will send a confirmation link to{' '}
              <span className="font-black">{editForm.email.trim()}</span>. Email only changes after you click that link.
            </p>
          </div>
        )}
      </div>

      {editError && (
        <p className="font-lovelo text-[10px] text-red-500 flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {editError}
        </p>
      )}
      {emailVerifSent && (
        <p className="font-lovelo text-[10px] text-green-600 flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          Verification email sent to {editForm.email}. Confirm to complete change.
        </p>
      )}
      {saveSuccess && !emailVerifSent && (
        <p className="font-lovelo text-[10px] text-green-600 flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          Profile updated.
        </p>
      )}

      <div className="flex items-center gap-3 pt-1">
        <button type="button"
          onClick={onSave}
          disabled={saving || !editForm.fullName.trim()}
          className="flex items-center gap-2 font-lovelo text-xs font-black tracking-wider text-white rounded-xl px-5 py-2.5 transition-opacity disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #ee4923, #F4921F)' }}
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
        <button type="button"
          onClick={onCancel}
          className="font-lovelo text-xs font-black tracking-wider text-gray-400 hover:text-gray-600 transition-colors px-3 py-2.5"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function UserProfile({ onUserUpdate, onGoBookings }: UserProfileProps) {
  const { user, token } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<EditFormState>({
    fullName: user?.name ?? '',
    phone: user?.phone ?? '',
    email: user?.email ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [emailVerifSent, setEmailVerifSent] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [resetSending, setResetSending] = useState(false);
  const [membership, setMembership] = useState<PublicMembership | null>(null);
  const [membershipLoading, setMembershipLoading] = useState(true);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!token) return;
    api.getMyMembership(token)
      .then(setMembership)
      .catch(() => setMembership(null))
      .finally(() => setMembershipLoading(false));
  }, [token]);

  if (!user) return null;

  const openEdit = () => {
    setEditForm({ fullName: user.name, phone: user.phone ?? '', email: user.email });
    setEditError(null);
    setSaveSuccess(false);
    setEmailVerifSent(false);
    setIsEditing(true);
  };

  const toggleEdit = () => (isEditing ? setIsEditing(false) : openEdit());

  const handleSave = async () => {
    if (!editForm.fullName.trim()) return;
    if (editForm.phone.trim() && !/^09\d{9}$/.test(editForm.phone.trim())) {
      setEditError('Phone must be 11 digits starting with 09 (e.g. 09171234567)');
      return;
    }
    setSaving(true);
    setEditError(null);
    setSaveSuccess(false);
    setEmailVerifSent(false);

    try {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (!authUser) throw new Error('Not authenticated');

      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          full_name: editForm.fullName.trim(),
          phone: editForm.phone.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', authUser.id);
      if (profileError) throw profileError;

      let verificationSent = false;
      if (editForm.email.trim() !== user.email) {
        if (!token) throw new Error('Session expired. Please log out and log back in.');
        await api.requestEmailChange(editForm.email.trim(), token);
        verificationSent = true;
        setEmailVerifSent(true);
      }

      onUserUpdate?.({
        name: editForm.fullName.trim(),
        phone: editForm.phone.trim() || undefined,
      });

      setSaveSuccess(true);
      if (verificationSent) {
        setToast({ msg: `Verification sent to ${editForm.email.trim()} - confirm to apply`, type: 'info' });
      } else {
        setToast({ msg: 'Profile updated successfully', type: 'success' });
        setIsEditing(false);
      }
    } catch (err: any) {
      setEditError(err.message || 'Failed to update profile.');
      setToast({ msg: err.message || 'Failed to update profile', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleResetPassword = async () => {
    setResetSending(true);
    try {
      await api.requestPasswordReset({
        email: user.email,
        redirectTo: window.location.origin,
      });
      setToast({
        msg: `If an account exists, a password reset link has been sent to ${user.email}.`,
        type: 'info',
      });
    } catch (err: any) {
      setToast({ msg: err.message || 'Failed to send password reset link.', type: 'error' });
    } finally {
      setResetSending(false);
    }
  };

  return (
    <div className="pb-12" style={{ backgroundColor: '#f5f5f5' }}>
      <ProfileHeader user={user} isEditing={isEditing} onToggleEdit={toggleEdit} />

      <div className="max-w-3xl mx-auto px-4 pt-6">
        <AccountActionsGrid
          user={user}
          isEditing={isEditing}
          onToggleEdit={toggleEdit}
          onGoBookings={onGoBookings}
          onResetPassword={handleResetPassword}
          resetSending={resetSending}
        />
      </div>

      <div className="max-w-3xl mx-auto px-4 pt-6">
        <MembershipSection membershipLoading={membershipLoading} membership={membership} />
      </div>

      {isEditing && (
        <div className="max-w-3xl mx-auto px-4 pt-6">
          <EditProfileForm
            user={user}
            editForm={editForm}
            setEditForm={setEditForm}
            editError={editError}
            emailVerifSent={emailVerifSent}
            saveSuccess={saveSuccess}
            saving={saving}
            onSave={handleSave}
            onCancel={() => setIsEditing(false)}
          />
        </div>
      )}

      <div
        className={cn(
          'fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl shadow-xl font-lovelo text-xs font-black tracking-wide transition-all duration-300',
          toast ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-3 pointer-events-none',
          toast?.type === 'success' && 'bg-green-600 text-white',
          toast?.type === 'info' && 'text-white',
          toast?.type === 'error' && 'bg-red-600 text-white',
        )}
        style={toast?.type === 'info' ? { background: 'linear-gradient(135deg, #ee4923, #F4921F)' } : undefined}
      >
        {toast?.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
        {toast?.type === 'info' && <Mail className="w-4 h-4 shrink-0" />}
        {toast?.type === 'error' && <AlertCircle className="w-4 h-4 shrink-0" />}
        {toast?.msg}
      </div>
    </div>
  );
}
