import React, { useState, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import {
  QrCode, ImagePlus, AlertTriangle, RefreshCw, Loader2, Save, Upload,
  AlertCircle, CheckCircle2,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';

export interface PaymentSettingRow {
  payment_method: string;
  account_name: string;
  account_number: string;
  qr_image_path: string | null;
  updated_at?: string | null;
}

export function isGCashMethod(paymentMethod: string): boolean {
  return paymentMethod.trim().toLowerCase() === 'gcash';
}

export function accountNumberHint(paymentMethod: string): string {
  return isGCashMethod(paymentMethod)
    ? 'PH mobile number, e.g. 09171234567'
    : 'Bank account number, 10–19 digits';
}

export function isValidAccountNumber(paymentMethod: string, accountNumber: string): boolean {
  const digitsOnly = accountNumber.replace(/[\s-]/g, '');
  return isGCashMethod(paymentMethod) ? /^09\d{9}$/.test(digitsOnly) : /^\d{10,19}$/.test(digitsOnly);
}

export function sortPaymentMethods(rows: PaymentSettingRow[]): PaymentSettingRow[] {
  return [...rows].sort((a, b) => {
    if (isGCashMethod(a.payment_method)) return -1;
    if (isGCashMethod(b.payment_method)) return 1;
    return a.payment_method.localeCompare(b.payment_method);
  });
}

export function dropZoneClass(dragging: boolean, hasFile: boolean): string {
  if (dragging) return 'border-orange-400 bg-orange-50';
  if (hasFile) return 'border-green-300 bg-green-50';
  return 'border-gray-200 hover:border-orange-300 hover:bg-orange-50/40';
}

interface PaymentMethodCardProps {
  row: PaymentSettingRow;
  qrUrl: string | null;
  token: string;
  onSaved: (updated: PaymentSettingRow, qrUrl?: string | null) => void;
}

export const PaymentMethodCard: React.FC<PaymentMethodCardProps> = ({ row, qrUrl, token, onSaved }) => {
  const [editing, setEditing] = useState(false);
  const [accountName, setAccountName] = useState(row.account_name);
  const [accountNumber, setAccountNumber] = useState(row.account_number);
  const [newFile, setNewFile] = useState<File | null>(null);
  const [newPreview, setNewPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const valid = accountName.trim().length > 0 && isValidAccountNumber(row.payment_method, accountNumber);

  const acceptFile = (file: File) => {
    if (!file.type.startsWith('image/')) { setError('Only image files allowed.'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('File too large - max 5MB.'); return; }
    setNewFile(file);
    setNewPreview(URL.createObjectURL(file));
    setError(null);
  };

  const cancelEdit = () => {
    setEditing(false);
    setAccountName(row.account_name);
    setAccountNumber(row.account_number);
    setNewFile(null);
    if (newPreview) URL.revokeObjectURL(newPreview);
    setNewPreview(null);
    setError(null);
    setConfirming(false);
  };

  const doSave = async (qrImagePath?: string): Promise<boolean> => {
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateAdminPaymentSettings({
        paymentMethod: row.payment_method,
        accountName,
        accountNumber,
        qrImagePath: qrImagePath ?? row.qr_image_path ?? undefined,
      }, token);

      let freshQrUrl: string | null | undefined;
      if (qrImagePath) {
        const { signedUrl } = await api.getSignedViewUrl(qrImagePath, undefined, undefined, token);
        freshQrUrl = signedUrl;
      }
      onSaved(
        {
          ...row,
          account_name: accountName,
          account_number: accountNumber,
          qr_image_path: qrImagePath ?? row.qr_image_path,
          updated_at: updated.updated_at,
        },
        freshQrUrl,
      );
      cancelEdit();
      return true;
    } catch (err: any) {
      setError(err.message || 'Failed to save.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleSaveClick = () => {
    if (!valid) return;
    if (newFile) { setConfirming(true); return; }
    void doSave();
  };

  const handleConfirmQrSave = async () => {
    if (!newFile) return;
    setSaving(true);
    setError(null);
    try {
      const { signedUrl, path } = await api.getAssetUploadUrl(newFile.name.replace(/\s+/g, '_'), token);
      await fetch(signedUrl, { method: 'PUT', body: newFile, headers: { 'Content-Type': newFile.type } });
      const saved = await doSave(path);
      if (!saved) setConfirming(false);
    } catch (err: any) {
      setError(err.message || 'Failed to upload QR.');
      setSaving(false);
      setConfirming(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between" style={{ backgroundColor: '#fafafa' }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #ee4923, #F4921F)' }}>
            <QrCode className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="font-lovelo font-black text-sm" style={{ color: '#383838' }}>{row.payment_method}</p>
            <p className="font-lovelo text-[10px] text-gray-400" style={{ fontWeight: 300 }}>
              Shown to customers when they select {row.payment_method} payment
            </p>
          </div>
        </div>
        {!editing && (
          <button type="button" onClick={() => setEditing(true)}
            className="font-lovelo flex items-center gap-2 text-xs font-black tracking-wider text-white rounded-xl px-4 py-2"
            style={{ background: 'linear-gradient(135deg, #383838, #1a1a1a)' }}>
            <ImagePlus className="w-3.5 h-3.5" /> Edit
          </button>
        )}
      </div>

      <div className="p-6">
        {!editing ? (
          <div className="flex items-start gap-6">
            <div className="w-32 h-32 flex-shrink-0 rounded-2xl border-2 border-gray-100 overflow-hidden bg-white flex items-center justify-center shadow-sm">
              {qrUrl
                ? <img src={qrUrl} alt={`${row.payment_method} QR Code`} className="w-full h-full object-contain p-2" />
                : <QrCode className="w-8 h-8 text-gray-300" />}
            </div>
            <div className="flex-1 min-w-0 pt-1 space-y-2">
              <div>
                <p className="font-lovelo text-[9px] font-black tracking-[0.2em] uppercase text-gray-400">Account Name</p>
                <p className="font-lovelo text-sm text-gray-800">{row.account_name}</p>
              </div>
              <div>
                <p className="font-lovelo text-[9px] font-black tracking-[0.2em] uppercase text-gray-400">Account Number</p>
                <p className="font-mono text-sm text-gray-800">{row.account_number}</p>
              </div>
              {row.updated_at && (
                <p className="font-lovelo text-[10px] text-gray-400 flex items-center gap-1.5 pt-1">
                  <RefreshCw className="w-3 h-3" /> Last updated: {format(new Date(row.updated_at), 'MMM d, yyyy · h:mm a')}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div>
              <label className="font-lovelo text-[9px] font-black tracking-[0.2em] uppercase text-gray-400 block mb-1">Account Name</label>
              <input type="text" value={accountName} onChange={e => setAccountName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-orange-400" />
            </div>
            <div>
              <label className="font-lovelo text-[9px] font-black tracking-[0.2em] uppercase text-gray-400 block mb-1">Account Number</label>
              <input type="text" value={accountNumber} onChange={e => setAccountNumber(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:border-orange-400" />
              <p className={cn('text-[10px] mt-1 font-lovelo', isValidAccountNumber(row.payment_method, accountNumber) ? 'text-gray-400' : 'text-red-500')}>
                {accountNumberHint(row.payment_method)}
              </p>
            </div>

            <div
              className={cn('border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all duration-200', dropZoneClass(dragging, !!newFile))}
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) acceptFile(f); }}
              onClick={() => fileInputRef.current?.click()}
            >
              <input ref={fileInputRef} type="file" className="hidden" accept="image/*"
                onChange={e => { const f = e.target.files?.[0]; if (f) acceptFile(f); }} />
              {newPreview ? (
                <div className="flex flex-col items-center gap-2">
                  <img src={newPreview} alt="New QR preview" className="w-24 h-24 object-contain rounded-xl border border-gray-200 bg-white p-1" />
                  <p className="font-lovelo text-xs text-green-600 font-black">{newFile!.name}</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload className="w-5 h-5 text-gray-400" />
                  <p className="font-lovelo text-xs text-gray-400">
                    {dragging ? 'Drop it here' : 'Drag & drop a new QR image, or click to browse (optional)'}
                  </p>
                </div>
              )}
            </div>

            {error && (
              <p className="font-lovelo text-[10px] text-red-500 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {error}
              </p>
            )}

            <div className="flex items-center gap-3">
              <button type="button" onClick={handleSaveClick} disabled={!valid || saving}
                className="font-lovelo flex items-center gap-2 text-xs font-black tracking-wider text-white rounded-xl px-5 py-2.5 disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg, #ee4923, #F4921F)' }}>
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save Changes
              </button>
              <button type="button" onClick={cancelEdit} disabled={saving}
                className="font-lovelo text-xs font-black tracking-wider text-gray-400 hover:text-gray-600 px-3 py-2.5">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {confirming && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 space-y-5">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 bg-amber-50 border border-amber-200">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <h3 className="font-lovelo font-black text-base mb-1" style={{ color: '#383838' }}>Update {row.payment_method} QR Code?</h3>
                <p className="font-lovelo text-xs text-gray-500">Customers will see the new QR immediately after saving.</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center">
                <p className="font-lovelo text-[9px] font-black tracking-[0.2em] uppercase text-gray-400 mb-2">Current</p>
                <div className="w-full aspect-square rounded-2xl border border-gray-100 bg-gray-50 flex items-center justify-center overflow-hidden p-2">
                  {qrUrl ? <img src={qrUrl} alt="Current QR" className="w-full h-full object-contain" /> : <QrCode className="w-10 h-10 text-gray-200" />}
                </div>
              </div>
              <div className="text-center">
                <p className="font-lovelo text-[9px] font-black tracking-[0.2em] uppercase mb-2" style={{ color: '#ee4923' }}>New</p>
                <div className="w-full aspect-square rounded-2xl border-2 border-orange-200 bg-orange-50 flex items-center justify-center overflow-hidden p-2">
                  {newPreview && <img src={newPreview} alt="New QR" className="w-full h-full object-contain" />}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <button type="button" onClick={handleConfirmQrSave} disabled={saving}
                className="flex-1 font-lovelo flex items-center justify-center gap-2 text-xs font-black tracking-wider text-white rounded-xl px-5 py-3 disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #ee4923, #F4921F)' }}>
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} {saving ? 'Saving…' : 'Confirm Update'}
              </button>
              <button type="button" onClick={() => setConfirming(false)} disabled={saving}
                className="font-lovelo text-xs font-black tracking-wider text-gray-400 hover:text-gray-600 px-4 py-3 disabled:opacity-40">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default function PaymentMethodSettings() {
  const { token } = useAuth();
  const [rows, setRows] = useState<PaymentSettingRow[]>([]);
  const [qrUrls, setQrUrls] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const data = await api.getAdminPaymentSettings(token);
        const sorted = sortPaymentMethods(data);
        if (cancelled) return;
        setRows(sorted);
        const entries = await Promise.all(sorted.map(async (r): Promise<[string, string | null]> => {
          if (!r.qr_image_path) return [r.payment_method, null];
          try {
            const { signedUrl } = await api.getSignedViewUrl(r.qr_image_path, undefined, undefined, token);
            return [r.payment_method, signedUrl];
          } catch {
            return [r.payment_method, null];
          }
        }));
        if (!cancelled) setQrUrls(Object.fromEntries(entries));
      } catch (err: any) {
        if (!cancelled) setLoadError(err.message || 'Failed to load payment settings.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const handleSaved = (updated: PaymentSettingRow, qrUrl?: string | null) => {
    setRows(prev => sortPaymentMethods(prev.map(r => (r.payment_method === updated.payment_method ? updated : r))));
    if (qrUrl !== undefined) setQrUrls(prev => ({ ...prev, [updated.payment_method]: qrUrl }));
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="font-lovelo text-[9px] font-black tracking-[0.25em] uppercase text-gray-400 mb-0.5">Payment Settings</p>
        <h2 className="font-lovelo font-display font-black text-base" style={{ color: '#383838' }}>Shop Configuration</h2>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
        </div>
      )}

      {!loading && loadError && (
        <p className="font-lovelo text-xs text-red-500 flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5" /> {loadError}
        </p>
      )}

      {!loading && !loadError && token && rows.map(row => (
        <PaymentMethodCard
          key={row.payment_method}
          row={row}
          qrUrl={qrUrls[row.payment_method] ?? null}
          token={token}
          onSaved={handleSaved}
        />
      ))}
    </div>
  );
}
