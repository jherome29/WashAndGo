import React, { useState, useMemo, useRef, useEffect } from 'react';
import { format, parseISO, addDays, subDays } from 'date-fns';
import { Booking, BookingStatus, ServicePackage, VehicleSize } from '../types';
import {
  Filter, Calendar, Car, Bike, Wrench, Plus, X,
  DollarSign, Save, ChevronLeft,
  ChevronRight, Clock, CheckCircle2, XCircle, Loader2, BarChart3,
  AlertCircle, TrendingUp, Layers, RotateCcw, Upload,
  Settings, QrCode, ImagePlus, AlertTriangle, RefreshCw,
  Search, ArrowUpDown, IdCard,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import ScheduleSettings from './ScheduleSettings';
import MembershipsPanel from './MembershipsPanel';

interface AdminDashboardProps {
  bookings: Booking[];
  services: ServicePackage[];
  onUpdateStatus: (id: string, status: BookingStatus) => Promise<void>;
  onAddUpdate: (id: string, message: string, imageUrls: string[]) => Promise<void>;
  onUpdateService: (id: string, dto: object) => Promise<void>;
}

interface ServiceDraft {
  name: string;
  description: string;
  prices: Record<string, string>;
  lubePrices: Record<string, string>;
}

type DateRangeFilter = 'all' | 'today' | 'upcoming' | 'past' | 'custom';

function matchesDateRange(
  bookingDate: string,
  range: DateRangeFilter,
  customDate: string,
  today: string,
): boolean {
  switch (range) {
    case 'today':    return bookingDate === today;
    case 'upcoming': return bookingDate > today;
    case 'past':     return bookingDate < today;
    case 'custom':   return !customDate || bookingDate === customDate;
    default:         return true;
  }
}

interface BookingFilterCriteria {
  filterStatus: Booking['status'] | 'All';
  filterVehicle: 'All' | 'Car' | 'Motorcycle';
  dateRange: DateRangeFilter;
  filterDate: string;
  today: string;
  query: string;
}

function matchesBookingFilters(b: Booking, f: BookingFilterCriteria): boolean {
  if (f.filterStatus !== 'All') {
    const bS = (b.status as string).toUpperCase().replace(/[\s-]/g, '_');
    const fS = (f.filterStatus as string).toUpperCase().replace(/[\s-]/g, '_');
    if (bS !== fS) return false;
  }
  if (f.filterVehicle !== 'All' && b.vehicleCategory !== f.filterVehicle) return false;
  if (!matchesDateRange(b.date, f.dateRange, f.filterDate, f.today)) return false;
  if (f.query) {
    const haystack = [b.id, b.customerName, b.customerPhone, b.customerEmail ?? ''].join(' ').toLowerCase();
    if (!haystack.includes(f.query)) return false;
  }
  return true;
}

function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function gridColsClass(count: number): string {
  if (count === 1) return 'grid-cols-1';
  if (count === 2) return 'grid-cols-2';
  return 'grid-cols-3';
}

function parseSlotToMins(time?: string): number {
  const m = time?.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return 0;
  let h = Number(m[1]);
  const min = Number(m[2]);
  const period = m[3].toUpperCase();
  if (period === 'PM' && h !== 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  return h * 60 + min;
}

const priceToDraftValue = (value: unknown) =>
  value === null || value === undefined || !Number.isFinite(Number(value)) ? '' : String(value);

const pricesToDraftValues = (prices?: Record<string, number>) =>
  Object.fromEntries(Object.entries(prices ?? {}).map(([key, value]) => [key, priceToDraftValue(value)]));

const sanitizePriceInput = (value: string) => {
  const digitsOnly = value.replace(/\D/g, '');
  return digitsOnly.replace(/^0+(?=\d)/, '');
};

const draftPriceToNumber = (value: string | number | undefined) => {
  if (value === undefined || value === '') return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const pricesAreEqual = (draftPrices: Record<string, string>, prices?: Record<string, number>) => {
  const keys = new Set([...Object.keys(draftPrices), ...Object.keys(prices ?? {})]);
  for (const key of keys) {
    if (draftPriceToNumber(draftPrices[key]) !== (prices?.[key] ?? 0)) return false;
  }
  return true;
};

const draftPricesToNumbers = (draftPrices: Record<string, string>) =>
  Object.fromEntries(Object.entries(draftPrices).map(([key, value]) => [key, draftPriceToNumber(value)]));

// ─── Status Helpers ────────────────────────────────────────────────────────────
const statusMeta: Record<string, { label: string; color: string; bg: string; border: string; icon: React.ReactNode }> = {
  PENDING:              { label: 'Pending Payment',    color: '#92400e', bg: '#fef3c7', border: '#fde68a', icon: <Clock        className="w-3 h-3" /> },
  PENDING_VERIFICATION: { label: 'Payment Review',     color: '#1d4ed8', bg: '#dbeafe', border: '#bfdbfe', icon: <AlertCircle  className="w-3 h-3" /> },
  REUPLOAD_REQUIRED:    { label: 'Re-upload Required', color: '#7f1d1d', bg: '#fee2e2', border: '#fecaca', icon: <XCircle      className="w-3 h-3" /> },
  REUPLOAD_SUBMITTED:   { label: 'Proof Resubmitted',  color: '#5b21b6', bg: '#ede9fe', border: '#ddd6fe', icon: <CheckCircle2 className="w-3 h-3" /> },
  CONFIRMED:            { label: 'Confirmed',          color: '#1e40af', bg: '#dbeafe', border: '#bfdbfe', icon: <CheckCircle2 className="w-3 h-3" /> },
  IN_PROGRESS:          { label: 'In Progress',        color: '#9a3412', bg: '#ffedd5', border: '#fed7aa', icon: <Loader2      className="w-3 h-3" /> },
  COMPLETED:            { label: 'Completed',          color: '#14532d', bg: '#dcfce7', border: '#bbf7d0', icon: <CheckCircle2 className="w-3 h-3" /> },
  CANCELLED:            { label: 'Cancelled',          color: '#7f1d1d', bg: '#fee2e2', border: '#fecaca', icon: <XCircle      className="w-3 h-3" /> },
};
const statusOptions: Array<{ value: BookingStatus | 'All'; label: string }> = [
  { value: 'All', label: 'All Statuses' },
  { value: BookingStatus.PENDING, label: 'Pending Payment' },
  { value: BookingStatus.PENDING_VERIFICATION, label: 'Payment Review' },
  { value: BookingStatus.REUPLOAD_REQUIRED, label: 'Re-upload Required' },
  { value: BookingStatus.REUPLOAD_SUBMITTED, label: 'Proof Resubmitted' },
  { value: BookingStatus.CONFIRMED, label: 'Confirmed' },
  { value: BookingStatus.IN_PROGRESS, label: 'In Progress' },
  { value: BookingStatus.COMPLETED, label: 'Completed' },
  { value: BookingStatus.CANCELLED, label: 'Cancelled' },
];
const DATE_RANGE_LABELS: Record<DateRangeFilter, string> = {
  all: 'All',
  today: 'Today',
  upcoming: 'Upcoming',
  past: 'Past',
  custom: 'Custom Date',
};

const adminStatusActions = [
  BookingStatus.CONFIRMED,
  BookingStatus.IN_PROGRESS,
  BookingStatus.COMPLETED,
  BookingStatus.CANCELLED,
];
function getStatusMeta(status: string) {
  const key = status.toUpperCase().replace(/[\s-]/g, '_');
  return statusMeta[key] ?? { label: status, color: '#374151', bg: '#f3f4f6', border: '#e5e7eb', icon: <Clock className="w-3 h-3" /> };
}
function statusButtonStyle(
  isPending: boolean,
  isCurrent: boolean,
  hasPendingStatus: boolean,
  meta: { color: string; bg: string; border: string },
): React.CSSProperties {
  if (isPending) return { color: meta.color, backgroundColor: meta.bg, borderColor: meta.border };
  if (isCurrent && !hasPendingStatus) return { color: meta.color, backgroundColor: meta.bg, borderColor: meta.border, opacity: 0.5 };
  return { color: '#9ca3af', backgroundColor: '#ffffff', borderColor: '#e5e7eb' };
}

function readFileIntoPreview(file: File, index: number, setPreviews: React.Dispatch<React.SetStateAction<string[]>>) {
  const reader = new FileReader();
  reader.onloadend = () => {
    setPreviews(prev => {
      const next = [...prev];
      next[index] = reader.result as string;
      return next;
    });
  };
  reader.readAsDataURL(file);
}
function StatusBadge({ status }: { status: string }) {
  const m = getStatusMeta(status);
  return (
    <span className="font-lovelo inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black border"
      style={{ color: m.color, backgroundColor: m.bg, borderColor: m.border }}>
      {m.icon}{m.label}
    </span>
  );
}

// ─── Draft Helpers ────────────────────────────────────────────────────────────
function initDraft(service: ServicePackage): ServiceDraft {
  return {
    name: service.name,
    description: service.description,
    prices: pricesToDraftValues(service.prices as unknown as Record<string, number>),
    lubePrices: service.lubePrices ? pricesToDraftValues(service.lubePrices as unknown as Record<string, number>) : {},
  };
}

function draftIsDirty(draft: ServiceDraft, service: ServicePackage): boolean {
  return (
    draft.name !== service.name ||
    draft.description !== service.description ||
    !pricesAreEqual(draft.prices, service.prices as unknown as Record<string, number>) ||
    !pricesAreEqual(draft.lubePrices, service.lubePrices as unknown as Record<string, number> | undefined)
  );
}

function buildDto(draft: ServiceDraft, service: ServicePackage): Record<string, any> {
  const dto: Record<string, any> = {
    name: draft.name,
    description: draft.description,
    price_small: draftPriceToNumber(draft.prices[VehicleSize.SMALL]),
    price_medium: draftPriceToNumber(draft.prices[VehicleSize.MEDIUM]),
    price_large: draftPriceToNumber(draft.prices[VehicleSize.LARGE]),
    price_extra_large: draftPriceToNumber(draft.prices[VehicleSize.EXTRA_LARGE]),
  };
  if (service.isLubeFlat && Object.keys(draft.lubePrices).length > 0) {
    dto.lube_prices = draftPricesToNumbers(draft.lubePrices);
  }
  return dto;
}

// ─── Price Grid ───────────────────────────────────────────────────────────────
const SIZE_COLS = [VehicleSize.SMALL, VehicleSize.MEDIUM, VehicleSize.LARGE, VehicleSize.EXTRA_LARGE];
const SIZE_LABELS: Record<string, string> = {
  SMALL: 'Small', MEDIUM: 'Medium', LARGE: 'Large', EXTRA_LARGE: 'XL',
};

interface PriceGridProps {
  service: ServicePackage;
  draft: ServiceDraft;
  onPricesChange: (prices: Record<string, string>) => void;
  onLubePricesChange: (lubePrices: Record<string, string>) => void;
}

const PriceGrid: React.FC<PriceGridProps> = ({ service, draft, onPricesChange, onLubePricesChange }) => {
  const cellRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, idx: number, total: number) => {
    if (e.key === 'ArrowRight' && idx < total - 1) { e.preventDefault(); cellRefs.current[idx + 1]?.focus(); }
    if (e.key === 'ArrowLeft'  && idx > 0)          { e.preventDefault(); cellRefs.current[idx - 1]?.focus(); }
  };

  const priceCardClass = "group relative rounded-2xl border-2 border-gray-100 bg-gray-50/80 hover:bg-white hover:border-orange-200 focus-within:border-orange-400 focus-within:bg-white focus-within:shadow-[0_4px_20px_rgba(238,73,35,0.08)] p-4 transition-all duration-200 cursor-text";

  if (service.isLubeFlat) {
    const entries = Object.entries(draft.lubePrices);
    return (
      <div>
        <div className={`grid gap-3`} style={{ gridTemplateColumns: `repeat(${Math.min(entries.length, 4)}, 1fr)` }}>
          {entries.map(([fuel, val], idx) => (
            <label key={fuel} className={priceCardClass}>
              <p className="font-lovelo text-[9px] font-black tracking-[0.2em] uppercase text-gray-400 mb-4">{fuel}</p>
              <div className="flex items-baseline gap-1.5">
                <span className="font-lovelo text-lg font-black text-gray-300 leading-none select-none">₱</span>
                <input
                  ref={el => { cellRefs.current[idx] = el; }}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={val}
                  onChange={e => onLubePricesChange({ ...draft.lubePrices, [fuel]: sanitizePriceInput(e.target.value) })}
                  onKeyDown={e => handleKeyDown(e, idx, entries.length)}
                  className="font-lovelo w-full min-w-0 text-2xl font-black text-gray-800 bg-transparent outline-none leading-none"
                  placeholder="0"
                />
              </div>
            </label>
          ))}
        </div>
        <p className="font-lovelo text-[9px] text-gray-300 mt-2.5 tracking-wide" style={{ fontWeight: 300 }}>
          ← → arrow keys navigate cells
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {SIZE_COLS.map((size, idx) => (
          <label key={size} className={priceCardClass}>
            <p className="font-lovelo text-[9px] font-black tracking-[0.2em] uppercase text-gray-400 mb-4">{SIZE_LABELS[size]}</p>
            <div className="flex items-baseline gap-1.5">
              <span className="font-lovelo text-lg font-black text-gray-300 leading-none select-none">₱</span>
              <input
                ref={el => { cellRefs.current[idx] = el; }}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={draft.prices[size] ?? ''}
                onChange={e => onPricesChange({ ...draft.prices, [size]: sanitizePriceInput(e.target.value) })}
                onKeyDown={e => handleKeyDown(e, idx, SIZE_COLS.length)}
                className="font-lovelo w-full min-w-0 text-2xl font-black text-gray-800 bg-transparent outline-none leading-none"
                placeholder="0"
              />
            </div>
          </label>
        ))}
      </div>
      <p className="font-lovelo text-[9px] text-gray-300 mt-2.5 tracking-wide" style={{ fontWeight: 300 }}>
        ← → arrow keys navigate · Tab moves forward
      </p>
    </div>
  );
};

// ─── GCash QR Settings ────────────────────────────────────────────────────────
interface QrDisplayCardProps {
  qrUrl: string | null;
  updatedAt: string | null;
  onEdit: () => void;
}

function QrDisplayCard({ qrUrl, updatedAt, onEdit }: Readonly<QrDisplayCardProps>) {
  if (qrUrl) {
    return (
      <div className="flex items-start gap-6">
        <div className="w-40 h-40 flex-shrink-0 rounded-2xl border-2 border-gray-100 overflow-hidden bg-white flex items-center justify-center shadow-sm">
          <img src={qrUrl} alt="GCash QR Code" className="w-full h-full object-contain p-2" />
        </div>
        <div className="flex-1 min-w-0 pt-1">
          <div className="flex items-center gap-2 mb-3">
            <span className="font-lovelo flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black bg-green-50 border border-green-200 text-green-700">
              <CheckCircle2 className="w-3 h-3" /> Active
            </span>
          </div>
          <p className="font-lovelo text-xs text-gray-600 leading-relaxed mb-3" style={{ fontWeight: 300 }}>
            Customers see this QR when they select GCash at checkout. Make sure it matches your current GCash account.
          </p>
          {updatedAt && (
            <p className="font-lovelo text-[10px] text-gray-400 flex items-center gap-1.5">
              <RefreshCw className="w-3 h-3" />
              Last updated: {format(new Date(updatedAt), 'MMM d, yyyy · h:mm a')}
            </p>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="text-center py-12">
      <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center bg-gray-50">
        <QrCode className="w-7 h-7 text-gray-300" />
      </div>
      <p className="font-lovelo font-black text-sm mb-1" style={{ color: '#383838' }}>No QR Code Uploaded</p>
      <p className="font-lovelo text-xs text-gray-400 max-w-xs mx-auto mb-5" style={{ fontWeight: 300 }}>
        Upload your GCash QR code so customers can scan it during payment.
      </p>
      <button type="button"
        onClick={onEdit}
        className="font-lovelo inline-flex items-center gap-2 text-xs font-black tracking-wider text-white rounded-xl px-5 py-2.5"
        style={{ background: 'linear-gradient(135deg, #ee4923, #F4921F)' }}
      >
        <ImagePlus className="w-3.5 h-3.5" /> Upload QR Code
      </button>
    </div>
  );
}

interface QrUploadFormProps {
  dragging: boolean;
  setDragging: (v: boolean) => void;
  newFile: File | null;
  newPreview: string | null;
  error: string | null;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileChosen: (file: File) => void;
  onSaveClick: () => void;
  onCancel: () => void;
}

function dropZoneClass(dragging: boolean, hasFile: boolean): string {
  if (dragging) return 'border-orange-400 bg-orange-50';
  if (hasFile) return 'border-green-300 bg-green-50';
  return 'border-gray-200 hover:border-orange-300 hover:bg-orange-50/40';
}

function QrUploadForm(props: Readonly<QrUploadFormProps>) {
  const { dragging, setDragging, newFile, newPreview, error, fileInputRef, onFileChosen, onSaveClick, onCancel } = props;

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) onFileChosen(file);
  };

  return (
    <div className="space-y-5">
      <p className="font-lovelo text-[9px] font-black tracking-[0.2em] uppercase text-gray-400">New QR Code</p>

      <div
        className={cn(
          'border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-200',
          dropZoneClass(dragging, !!newFile),
        )}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/*"
          onChange={e => { const f = e.target.files?.[0]; if (f) onFileChosen(f); }}
        />
        {newPreview ? (
          <div className="flex flex-col items-center gap-3">
            <img src={newPreview} alt="Preview" className="w-32 h-32 object-contain rounded-xl border border-gray-200 bg-white p-1" />
            <p className="font-lovelo text-xs text-green-600 font-black flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />{newFile!.name}
            </p>
            <p className="font-lovelo text-[10px] text-gray-400">Click to change</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-1" style={{ backgroundColor: '#f3f4f6' }}>
              <Upload className="w-5 h-5 text-gray-400" />
            </div>
            <p className="font-lovelo text-sm font-black" style={{ color: '#383838' }}>
              {dragging ? 'Drop it here' : 'Drag & drop QR image'}
            </p>
            <p className="font-lovelo text-[10px] text-gray-400">or click to browse · PNG, JPG (max 5MB)</p>
          </div>
        )}
      </div>

      {error && (
        <p className="font-lovelo text-[10px] text-red-500 flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />{error}
        </p>
      )}

      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={onSaveClick}
          disabled={!newFile}
          className="font-lovelo flex items-center gap-2 text-xs font-black tracking-wider text-white rounded-xl px-5 py-2.5 transition-opacity disabled:opacity-40"
          style={{ background: 'linear-gradient(135deg, #ee4923, #F4921F)' }}
        >
          <Save className="w-3.5 h-3.5" /> Save Changes
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="font-lovelo text-xs font-black tracking-wider text-gray-400 hover:text-gray-600 transition-colors px-3 py-2.5"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

interface QrConfirmModalProps {
  qrUrl: string | null;
  newPreview: string | null;
  saving: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function QrConfirmModal({ qrUrl, newPreview, saving, onConfirm, onCancel }: Readonly<QrConfirmModalProps>) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 space-y-5">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 bg-amber-50 border border-amber-200">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
          </div>
          <div>
            <h3 className="font-lovelo font-black text-base mb-1" style={{ color: '#383838' }}>Update GCash QR Code?</h3>
            <p className="font-lovelo text-xs text-gray-500" style={{ fontWeight: 300 }}>
              Customers will see the new QR immediately after saving.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="text-center">
            <p className="font-lovelo text-[9px] font-black tracking-[0.2em] uppercase text-gray-400 mb-2">Current</p>
            <div className="w-full aspect-square rounded-2xl border border-gray-100 bg-gray-50 flex items-center justify-center overflow-hidden p-2">
              {qrUrl
                ? <img src={qrUrl} alt="Current QR" className="w-full h-full object-contain" />
                : <QrCode className="w-10 h-10 text-gray-200" />
              }
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
          <button type="button"
            onClick={onConfirm}
            disabled={saving}
            className="flex-1 font-lovelo flex items-center justify-center gap-2 text-xs font-black tracking-wider text-white rounded-xl px-5 py-3 transition-opacity disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #ee4923, #F4921F)' }}
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            {saving ? 'Saving…' : 'Confirm Update'}
          </button>
          <button type="button"
            onClick={onCancel}
            disabled={saving}
            className="font-lovelo text-xs font-black tracking-wider text-gray-400 hover:text-gray-600 transition-colors px-4 py-3 disabled:opacity-40"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

const GcashQRSettings: React.FC = () => {
  const [qrUrl, setQrUrl]               = useState<string | null>(null);
  const [updatedAt, setUpdatedAt]       = useState<string | null>(null);
  const [loadingQr, setLoadingQr]       = useState(true);
  const [editing, setEditing]           = useState(false);
  const [newFile, setNewFile]           = useState<File | null>(null);
  const [newPreview, setNewPreview]     = useState<string | null>(null);
  const [confirming, setConfirming]     = useState(false);
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [toast, setToast]               = useState<{ msg: string; ok: boolean } | null>(null);
  const [dragging, setDragging]         = useState(false);
  const fileInputRef                    = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loadQrData = async () => {
      setLoadingQr(true);
      try {
        const { data } = await supabase
          .from('shop_settings')
          .select('value, updated_at')
          .eq('key', 'gcash_qr_url')
          .maybeSingle();
        if (data) { setQrUrl(data.value); setUpdatedAt(data.updated_at); }
      } finally {
        setLoadingQr(false);
      }
    };
    loadQrData();
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const acceptFile = (file: File) => {
    if (!file.type.startsWith('image/')) { setError('Only image files allowed.'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('File too large - max 5MB.'); return; }
    setNewFile(file);
    setNewPreview(URL.createObjectURL(file));
    setError(null);
  };

  const cancelEdit = () => {
    setEditing(false);
    setNewFile(null);
    if (newPreview) URL.revokeObjectURL(newPreview);
    setNewPreview(null);
    setError(null);
    setConfirming(false);
  };

  const handleConfirmSave = async () => {
    if (!newFile) return;
    setSaving(true);
    setError(null);
    try {
      const ts = Date.now();
      const ext = newFile.name.split('.').pop() || 'png';
      const path = `gcash-qr.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from('shop-assets')
        .upload(path, newFile, { upsert: true, contentType: newFile.type });
      if (uploadErr) throw uploadErr;

      const { data: { publicUrl } } = supabase.storage.from('shop-assets').getPublicUrl(path);
      const bustedUrl = `${publicUrl}?t=${ts}`;
      const now = new Date().toISOString();

      const { error: settingsErr } = await supabase
        .from('shop_settings')
        .upsert({ id: 'gcash_qr_url', key: 'gcash_qr_url', value: bustedUrl, updated_at: now }, { onConflict: 'key', ignoreDuplicates: false });
      if (settingsErr) throw settingsErr;

      setQrUrl(bustedUrl);
      setUpdatedAt(now);
      setToast({ msg: 'GCash QR updated. Customers will see it immediately.', ok: true });
      cancelEdit();
    } catch (err: any) {
      setError(err.message || 'Failed to save QR code.');
      setConfirming(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="font-lovelo text-[9px] font-black tracking-[0.25em] uppercase text-gray-400 mb-0.5">Payment Settings</p>
        <h2 className="font-lovelo font-display font-black text-base" style={{ color: '#383838' }}>Shop Configuration</h2>
      </div>

      {/* QR Card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between" style={{ backgroundColor: '#fafafa' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #ee4923, #F4921F)' }}>
              <QrCode className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="font-lovelo font-black text-sm" style={{ color: '#383838' }}>GCash QR Code</p>
              <p className="font-lovelo text-[10px] text-gray-400" style={{ fontWeight: 300 }}>
                Shown to customers when they select GCash payment
              </p>
            </div>
          </div>
          {!editing && (
            <button type="button"
              onClick={() => setEditing(true)}
              className="font-lovelo flex items-center gap-2 text-xs font-black tracking-wider text-white rounded-xl px-4 py-2 transition-opacity"
              style={{ background: 'linear-gradient(135deg, #383838, #1a1a1a)' }}
            >
              <ImagePlus className="w-3.5 h-3.5" />
              {qrUrl ? 'Change QR' : 'Upload QR'}
            </button>
          )}
        </div>

        <div className="p-6">
          {loadingQr ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
            </div>
          ) : !editing ? (
            <QrDisplayCard qrUrl={qrUrl} updatedAt={updatedAt} onEdit={() => setEditing(true)} />
          ) : (
            <QrUploadForm
              dragging={dragging}
              setDragging={setDragging}
              newFile={newFile}
              newPreview={newPreview}
              error={error}
              fileInputRef={fileInputRef}
              onFileChosen={acceptFile}
              onSaveClick={() => { if (newFile) setConfirming(true); }}
              onCancel={cancelEdit}
            />
          )}
        </div>
      </div>

      {confirming && (
        <QrConfirmModal
          qrUrl={qrUrl}
          newPreview={newPreview}
          saving={saving}
          onConfirm={handleConfirmSave}
          onCancel={() => setConfirming(false)}
        />
      )}

      {/* Toast */}
      <div
        className={cn(
          'fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl shadow-xl font-lovelo text-xs font-black tracking-wide transition-all duration-300',
          toast ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-3 pointer-events-none',
          toast?.ok ? 'bg-green-600 text-white' : 'bg-red-600 text-white',
        )}
      >
        {toast?.ok ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
        {toast?.msg}
      </div>
    </div>
  );
};

interface BookingDetailModalProps {
  booking: Booking;
  onClose: () => void;
  loadingProofUrl: boolean;
  proofViewUrl: string | null;
  pendingStatus: BookingStatus | null;
  setPendingStatus: React.Dispatch<React.SetStateAction<BookingStatus | null>>;
  showCancelConfirm: boolean;
  setShowCancelConfirm: (show: boolean) => void;
  onConfirmCancel: () => void;
  declineReason: string;
  setDeclineReason: (v: string) => void;
  declineError: string;
  setDeclineError: (v: string) => void;
  decliningPayment: boolean;
  onDeclinePayment: () => void;
  updateMessage: string;
  setUpdateMessage: (v: string) => void;
  updateImages: File[];
  updatePreviews: string[];
  postingUpdate: boolean;
  onPostUpdate: (e: React.FormEvent) => void;
  onImageSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveImage: (idx: number) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}

function BookingDetailModal(props: Readonly<BookingDetailModalProps>) {
  const {
    booking, onClose, loadingProofUrl, proofViewUrl, pendingStatus, setPendingStatus,
    showCancelConfirm, setShowCancelConfirm, onConfirmCancel, declineReason, setDeclineReason,
    declineError, setDeclineError, decliningPayment, onDeclinePayment, updateMessage, setUpdateMessage,
    updateImages, updatePreviews, postingUpdate, onPostUpdate, onImageSelect, onRemoveImage, fileInputRef,
  } = props;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">

        <div className="sticky top-0 bg-white rounded-t-3xl border-b border-gray-100 px-6 py-4 flex justify-between items-center z-10">
          <div>
            <p className="font-lovelo text-[9px] font-black tracking-[0.2em] uppercase text-gray-400 mb-0.5">Managing Booking</p>
            <h2 className="font-lovelo font-display font-black text-base flex items-center gap-2 flex-wrap" style={{ color: '#383838' }}>
              <Wrench className="w-4 h-4" style={{ color: '#ee4923' }} />
              #{booking.id}
              {!booking.userId && (
                <span className="font-lovelo text-[9px] font-black tracking-widest uppercase px-2 py-0.5 rounded-lg bg-amber-100 text-amber-700 border border-amber-200">
                  Guest
                </span>
              )}
              {booking.plateNumber && (
                <span className="font-lovelo text-[10px] font-black tracking-widest px-2 py-0.5 rounded-lg text-white" style={{ backgroundColor: '#383838' }}>
                  {booking.plateNumber}
                </span>
              )}
            </h2>
          </div>
          <button type="button" onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-xl border-2 border-gray-100 hover:border-red-200 hover:bg-red-50 transition-colors text-gray-400 hover:text-red-500">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-6">

          {booking.paymentProofPath
            && (booking.status as string).toUpperCase().replace(/[\s-]/g, '_') !== 'COMPLETED' && (
            <div className="rounded-2xl overflow-hidden border border-gray-100">
              <div className="px-4 py-3 border-b border-gray-100" style={{ backgroundColor: '#fafafa' }}>
                <p className="font-lovelo text-[9px] font-black tracking-[0.2em] uppercase text-gray-400">Proof of Payment</p>
              </div>
              {loadingProofUrl ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
                </div>
              ) : proofViewUrl ? (
                <img src={proofViewUrl} alt="Payment Proof"
                  className="w-full max-h-56 object-contain bg-white p-4" />
              ) : (
                <p className="font-lovelo text-xs text-gray-400 text-center py-8" style={{ fontWeight: 300 }}>
                  Failed to load payment proof image.
                </p>
              )}
            </div>
          )}

          {/* Update Status */}
          <div>
            <p className="font-lovelo text-[9px] font-black tracking-[0.2em] uppercase text-gray-400 mb-3">Update Status</p>
            <div className="flex flex-wrap gap-2">
              {adminStatusActions.map(status => {
                const m = getStatusMeta(status);
                const isCurrent = (booking.status as string).toUpperCase().replace(/[\s-]/g, '_') === status.toUpperCase().replace(/[\s-]/g, '_');
                const isPending = pendingStatus === status;
                if (status === BookingStatus.CANCELLED) {
                  return (
                    <button type="button" key={status}
                      onClick={() => { setPendingStatus(null); setShowCancelConfirm(true); }}
                      className="font-lovelo font-black text-[10px] flex items-center gap-1.5 px-3 py-1.5 rounded-xl border-2 transition-all"
                      style={isCurrent && !pendingStatus
                        ? { color: m.color, backgroundColor: m.bg, borderColor: m.border }
                        : { color: '#9ca3af', backgroundColor: '#ffffff', borderColor: '#e5e7eb' }}>
                      {m.icon}{m.label}
                    </button>
                  );
                }
                return (
                  <button type="button" key={status}
                    onClick={() => setPendingStatus(prev => prev === status ? null : status as BookingStatus)}
                    className="font-lovelo font-black text-[10px] flex items-center gap-1.5 px-3 py-1.5 rounded-xl border-2 transition-all"
                    style={statusButtonStyle(isPending, isCurrent, !!pendingStatus, m)}>
                    {m.icon}{m.label}
                  </button>
                );
              })}
            </div>

            {/* Pending status indicator */}
            {pendingStatus && (
              <div className="mt-2 flex items-center gap-2 rounded-xl px-3 py-2 border" style={{ backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }}>
                <span className="font-lovelo text-[10px] font-black text-gray-500">Will change to:</span>
                <span className="font-lovelo text-[10px] font-black" style={{ color: getStatusMeta(pendingStatus).color }}>
                  {getStatusMeta(pendingStatus).label}
                </span>
                <span className="font-lovelo text-[10px] text-gray-400 ml-1" style={{ fontWeight: 300 }}>— click Post Update to apply</span>
                <button type="button" onClick={() => setPendingStatus(null)} className="ml-auto text-gray-300 hover:text-gray-500">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Cancel confirmation */}
            {showCancelConfirm && (
              <div className="mt-3 bg-red-50 border border-red-200 rounded-2xl p-4">
                <p className="font-lovelo text-xs font-black text-red-700 mb-1">Cancel this booking?</p>
                <p className="font-lovelo text-xs text-red-500 mb-3" style={{ fontWeight: 300 }}>This cannot be undone. The customer will not be automatically notified.</p>
                <div className="flex gap-2">
                  <button type="button"
                    onClick={onConfirmCancel}
                    className="font-lovelo font-black text-[10px] tracking-wider uppercase px-4 py-2 rounded-xl text-white bg-red-600 hover:bg-red-700 transition-colors">
                    Yes, Cancel Booking
                  </button>
                  <button type="button" onClick={() => setShowCancelConfirm(false)}
                    className="font-lovelo font-black text-[10px] tracking-wider uppercase px-4 py-2 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors">
                    Go Back
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Decline Payment — only when payment is under review */}
          {['PENDING_VERIFICATION', 'REUPLOAD_SUBMITTED'].includes((booking.status as string).toUpperCase()) && (
            <div className="rounded-2xl border-2 border-red-100 overflow-hidden">
              <div className="px-4 py-3 border-b border-red-100" style={{ backgroundColor: '#fff5f5' }}>
                <p className="font-lovelo text-[9px] font-black tracking-[0.2em] uppercase text-red-400">Decline Payment &amp; Request Reupload</p>
              </div>
              <div className="p-4 space-y-3">
                <textarea
                  value={declineReason}
                  onChange={e => { setDeclineReason(e.target.value); setDeclineError(''); }}
                  placeholder="Tell the customer why their proof was declined and what to fix (e.g. screenshot is blurry, wrong amount shown)…"
                  rows={3}
                  className="font-lovelo w-full p-3 border-2 border-gray-100 rounded-xl focus:border-red-300 outline-none resize-none text-sm"
                  style={{ fontWeight: 300 }}
                />
                {declineError && (
                  <p className="font-lovelo text-xs text-red-500">{declineError}</p>
                )}
                <button type="button"
                  disabled={decliningPayment || !declineReason.trim()}
                  onClick={onDeclinePayment}
                  className="font-lovelo w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-black text-[11px] tracking-[0.12em] uppercase text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: 'linear-gradient(135deg, #dc2626, #b91c1c)' }}>
                  {decliningPayment ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                  {decliningPayment ? 'Declining…' : 'Decline & Request Reupload'}
                </button>
              </div>
            </div>
          )}

          <div className="rounded-2xl overflow-hidden border border-gray-100">
            <div className="px-4 py-3 border-b border-gray-100" style={{ backgroundColor: '#fafafa' }}>
              <p className="font-lovelo text-[9px] font-black tracking-[0.2em] uppercase text-gray-400">Add Progress Update</p>
            </div>
            <div className="p-4">
              <form onSubmit={onPostUpdate} className="space-y-3">
                <textarea value={updateMessage} onChange={e => setUpdateMessage(e.target.value)}
                  placeholder={pendingStatus ? `Add a note for "${getStatusMeta(pendingStatus).label}" (optional)…` : 'Enter update message…'}
                  className="font-lovelo w-full p-3 border-2 border-gray-100 rounded-xl focus:border-orange-400 outline-none resize-none h-20 text-sm"
                  style={{ fontWeight: 300 }} />

                {/* Multi-image upload */}
                <div>
                  <label className="font-lovelo flex items-center gap-2 cursor-pointer text-xs font-black text-gray-500 hover:text-orange-500 transition-colors w-max">
                    <Upload className="w-4 h-4" />
                    Add Photos {updateImages.length > 0 ? `(${updateImages.length}/6)` : '(optional, up to 6)'}
                    <input type="file" accept="image/*" multiple className="hidden" onChange={onImageSelect} ref={fileInputRef} />
                  </label>
                  {updatePreviews.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {updatePreviews.map((src, i) => (
                        <div key={updateImages[i] ? `${updateImages[i].name}-${updateImages[i].size}-${updateImages[i].lastModified}` : i} className="relative">
                          <img src={src} alt={`Preview ${i + 1}`}
                            className="h-20 w-20 rounded-xl border border-gray-100 object-cover" />
                          <button type="button" onClick={() => onRemoveImage(i)}
                            className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 shadow text-[10px]">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                      {updateImages.length < 6 && (
                        <label className="h-20 w-20 rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center cursor-pointer hover:border-orange-400 transition-colors text-gray-300 hover:text-orange-400">
                          <Plus className="w-5 h-5" />
                          <span className="font-lovelo text-[9px] font-black mt-0.5">Add</span>
                          <input type="file" accept="image/*" multiple className="hidden" onChange={onImageSelect} />
                        </label>
                      )}
                    </div>
                  )}
                </div>

                <button type="submit"
                  disabled={postingUpdate || (!pendingStatus && !updateMessage.trim() && updateImages.length === 0)}
                  className="font-lovelo flex items-center justify-center gap-2 w-full font-black text-xs tracking-widest uppercase text-white py-3 rounded-xl transition-all disabled:opacity-40"
                  style={{ background: 'linear-gradient(135deg, #ee4923 0%, #F4921F 100%)' }}>
                  {postingUpdate
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</>
                    : pendingStatus
                      ? <><CheckCircle2 className="w-4 h-4" /> Apply {getStatusMeta(pendingStatus).label} &amp; Post</>
                      : <><Plus className="w-4 h-4" /> Post Update</>}
                </button>
              </form>
            </div>
          </div>

          <div>
            <p className="font-lovelo text-[9px] font-black tracking-[0.2em] uppercase text-gray-400 mb-3">Update History</p>
            {booking.updates && booking.updates.length > 0 ? (
              <div className="space-y-3">
                {booking.updates.slice().reverse().map(update => {
                  const fallbackImg = update.imageUrl ? [update.imageUrl] : [];
                  const imgs = update.imageUrls?.length ? update.imageUrls : fallbackImg;
                  return (
                  <div key={update.id} className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                    <div className="flex justify-between items-start mb-2 gap-4">
                      <p className="font-lovelo text-sm" style={{ color: '#383838', fontWeight: 300 }}>{update.message}</p>
                      <span className="font-lovelo text-[9px] text-gray-400 whitespace-nowrap" style={{ fontWeight: 300 }}>
                        {format(new Date(update.timestamp), 'MMM d, h:mm a')}
                      </span>
                    </div>
                    {imgs.length > 0 && (
                      <div className={cn('mt-2 grid gap-1.5', gridColsClass(imgs.length))}>
                        {imgs.map((url, i) => (
                          <img key={url} src={url} alt={`Update ${i + 1}`}
                            className="rounded-xl border border-gray-100 w-full object-cover"
                            style={{ maxHeight: imgs.length === 1 ? '180px' : '120px' }} />
                        ))}
                      </div>
                    )}
                  </div>
                )})}
              </div>
            ) : (
              <div className="text-center py-8 rounded-2xl border-2 border-dashed border-gray-100">
                <p className="font-lovelo text-xs text-gray-300">No updates posted yet.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function AdminDashboard({ bookings, services, onUpdateStatus, onAddUpdate, onUpdateService }: AdminDashboardProps) {
  const { token } = useAuth();
  // Bookings state
  const [activeTab, setActiveTab]           = useState<'bookings' | 'services' | 'memberships' | 'settings'>('bookings');
  const [filterStatus, setFilterStatus]     = useState<Booking['status'] | 'All'>('All');
  const [filterDate, setFilterDate]         = useState('');
  const [filterVehicle, setFilterVehicle]   = useState<'All' | 'Car' | 'Motorcycle'>('All');
  const [dateRange, setDateRange]           = useState<DateRangeFilter>('all');
  const [sortDir, setSortDir]               = useState<'desc' | 'asc'>('desc');
  const [searchQuery, setSearchQuery]       = useState('');
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [pendingStatus, setPendingStatus]   = useState<BookingStatus | null>(null);
  const [declineReason, setDeclineReason]   = useState('');
  const [decliningPayment, setDecliningPayment] = useState(false);
  const [declineError, setDeclineError]     = useState('');
  const [updateMessage, setUpdateMessage]   = useState('');
  const [updateImages, setUpdateImages]     = useState<File[]>([]);
  const [updatePreviews, setUpdatePreviews] = useState<string[]>([]);
  const [postingUpdate, setPostingUpdate]   = useState(false);
  const [proofViewUrl, setProofViewUrl]     = useState<string | null>(null);
  const [loadingProofUrl, setLoadingProofUrl] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPendingStatus(null);
  }, [selectedBooking?.id]);

  useEffect(() => {
    const path = selectedBooking?.paymentProofPath;
    const status = (selectedBooking?.status as string | undefined)?.toUpperCase().replace(/[\s-]/g, '_');
    // Not shown once a booking is COMPLETED — skip fetching a signed URL we'd never display.
    if (!path || !token || status === 'COMPLETED') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProofViewUrl(null);
      return;
    }
    setLoadingProofUrl(true);
    api.getSignedViewUrl(path, undefined, undefined, token)
      .then(({ signedUrl }) => setProofViewUrl(signedUrl))
      .catch(() => setProofViewUrl(null))
      .finally(() => setLoadingProofUrl(false));
  }, [selectedBooking?.id, selectedBooking?.paymentProofPath, selectedBooking?.status, token]);
  const today = format(new Date(), 'yyyy-MM-dd');
  const [selectedDate, setSelectedDate]     = useState(today);

  // Services state — lifted up for global save bar
  const [drafts, setDrafts]                     = useState<Record<string, ServiceDraft>>({});
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [savingAll, setSavingAll]               = useState(false);
  const [showDiff, setShowDiff]                 = useState(false);
  const [filterCategory, setFilterCategory]     = useState<string>('All');

  // ── Booking Stats ──────────────────────────────────────────────────────────
  const totalBookings   = bookings.length;
  const pendingCount    = bookings.filter(b =>
    ['PENDING', 'PENDING_VERIFICATION', 'REUPLOAD_REQUIRED', 'REUPLOAD_SUBMITTED'].includes((b.status as string).toUpperCase())
  ).length;
  const confirmedCount  = bookings.filter(b => (b.status as string).toUpperCase() === 'CONFIRMED').length;
  const todayCount      = bookings.filter(b => b.date === today).length;

  const filteredBookings = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return bookings.filter(b =>
      matchesBookingFilters(b, { filterStatus, filterVehicle, dateRange, filterDate, today, query: q }),
    ).sort((a, b) => {
      const dateCmp = compareStrings(a.date, b.date);
      const timeCmp = parseSlotToMins(a.time ?? a.timeSlot) - parseSlotToMins(b.time ?? b.timeSlot);
      const raw = dateCmp !== 0 ? dateCmp : timeCmp;
      return sortDir === 'desc' ? -raw : raw;
    });
  }, [bookings, filterStatus, filterDate, filterVehicle, dateRange, sortDir, searchQuery, today]);

  const activeOnSelectedDate = bookings.filter(b => {
    const s = (b.status as string).toUpperCase();
    return b.date === selectedDate && s !== 'CANCELLED' && s !== 'COMPLETED';
  });

  const activeSlots = useMemo(() => {
    const slots: Record<string, { lube: number; grooming: number; coating: number }> = {};
    activeOnSelectedDate.forEach(b => {
      const time = b.time ?? b.timeSlot;
      if (!slots[time]) slots[time] = { lube: 0, grooming: 0, coating: 0 };
      const svc = services.find(s => s.id === b.serviceId);
      if (svc?.category === 'LUBE')          slots[time].lube++;
      else if (svc?.category === 'GROOMING') slots[time].grooming++;
      else if (svc?.category === 'COATING')  slots[time].coating++;
    });
    return Object.entries(slots).sort((a, b) =>
      parseSlotToMins(a[0]) - parseSlotToMins(b[0])
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOnSelectedDate, services, selectedDate]);

  // ── Services Helpers ───────────────────────────────────────────────────────
  const bookingCountByService = useMemo(() => {
    const counts: Record<string, number> = {};
    bookings.forEach(b => { counts[b.serviceId] = (counts[b.serviceId] ?? 0) + 1; });
    return counts;
  }, [bookings]);

  const servicesByCategory = useMemo(() => {
    const groups: Record<string, ServicePackage[]> = {};
    for (const s of services) {
      if (!groups[s.category]) groups[s.category] = [];
      groups[s.category].push(s);
    }
    return groups;
  }, [services]);

  const getDraft = (service: ServicePackage): ServiceDraft =>
    drafts[service.id] ?? initDraft(service);

  const setDraft = (serviceId: string, draft: ServiceDraft) =>
    setDrafts(prev => ({ ...prev, [serviceId]: draft }));

  const resetDraft = (serviceId: string) =>
    setDrafts(prev => { const next = { ...prev }; delete next[serviceId]; return next; });

  const dirtyServices = useMemo(() =>
    services.filter(s => { const d = drafts[s.id]; return d && draftIsDirty(d, s); }),
    [services, drafts]);

  const handleSaveAll = async () => {
    if (dirtyServices.length === 0 || savingAll) return;
    setSavingAll(true);
    await Promise.all(dirtyServices.map(s => onUpdateService(s.id, buildDto(drafts[s.id], s))));
    setDrafts({});
    setSavingAll(false);
  };

  // Ctrl+S keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (activeTab !== 'services') return;
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSaveAll();
      }
      if (e.key === 'Escape') setShowDiff(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, dirtyServices]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const combined = [...updateImages, ...files].slice(0, 6);
    setUpdateImages(combined);
    combined.forEach((file, i) => {
      if (!updatePreviews[i]) readFileIntoPreview(file, i, setUpdatePreviews);
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeImage = (idx: number) => {
    setUpdateImages(prev => prev.filter((_, i) => i !== idx));
    setUpdatePreviews(prev => prev.filter((_, i) => i !== idx));
  };

  const handlePostUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBooking || postingUpdate) return;
    if (!pendingStatus && !updateMessage.trim() && updateImages.length === 0) return;
    setPostingUpdate(true);
    try {
      const imageUrls: string[] = [];
      for (const file of updateImages) {
        const path = `updates/${Date.now()}-${file.name.replace(/\s+/g, '_')}`;
        const { error: uploadErr } = await supabase.storage
          .from('payment-proofs')
          .upload(path, file);
        if (uploadErr) throw uploadErr;
        const { data: { publicUrl } } = supabase.storage
          .from('payment-proofs')
          .getPublicUrl(path);
        imageUrls.push(publicUrl);
      }

      const statusLabel = pendingStatus ? getStatusMeta(pendingStatus).label : null;
      const rawMsg = updateMessage.trim();
      const message = statusLabel
        ? (rawMsg ? `${statusLabel}: ${rawMsg}` : `${statusLabel}:`)
        : rawMsg;

      if (pendingStatus) {
        await onUpdateStatus(selectedBooking.id, pendingStatus);
      }
      await onAddUpdate(selectedBooking.id, message, imageUrls);

      const newUpdate = {
        id: Math.random().toString(36).slice(2),
        timestamp: new Date().toISOString(),
        message,
        imageUrls,
        imageUrl: imageUrls[0],
      };
      setSelectedBooking({
        ...selectedBooking,
        ...(pendingStatus ? { status: pendingStatus } : {}),
        updates: [...(selectedBooking.updates || []), newUpdate],
      });
      setPendingStatus(null);
      setUpdateMessage('');
      setUpdateImages([]);
      setUpdatePreviews([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: any) {
      alert(`Failed to post update: ${err.message}`);
    } finally {
      setPostingUpdate(false);
    }
  };

  const handleConfirmCancel = async () => {
    if (!selectedBooking) return;
    try {
      await onUpdateStatus(selectedBooking.id, BookingStatus.CANCELLED);
      await onAddUpdate(selectedBooking.id, 'Cancelled: Booking has been cancelled.', []);
      const newUpdate = { id: Math.random().toString(36).slice(2), timestamp: new Date().toISOString(), message: 'Cancelled: Booking has been cancelled.', imageUrls: [], imageUrl: undefined };
      setSelectedBooking({ ...selectedBooking, status: BookingStatus.CANCELLED, updates: [...(selectedBooking.updates || []), newUpdate] });
      setShowCancelConfirm(false);
    } catch (err: any) {
      alert(`Failed to cancel: ${err.message}`);
    }
  };

  const handleDeclinePayment = async () => {
    if (!selectedBooking) return;
    if (!declineReason.trim()) { setDeclineError('Please enter a reason before declining.'); return; }
    setDecliningPayment(true);
    setDeclineError('');
    try {
      await api.declinePayment(selectedBooking.id, declineReason.trim(), token!);
      const updated = { ...selectedBooking, status: BookingStatus.REUPLOAD_REQUIRED };
      setSelectedBooking(updated as Booking);
      await onUpdateStatus(selectedBooking.id, BookingStatus.REUPLOAD_REQUIRED);
      setDeclineReason('');
    } catch (err: any) {
      setDeclineError(err.message || 'Failed to decline payment. Please try again.');
    } finally {
      setDecliningPayment(false);
    }
  };

  const catAccents: Record<string, string> = { LUBE: '#F4921F', GROOMING: '#383838', COATING: '#ee4923' };
  const categoryLabels: Record<string, string> = { LUBE: 'Lube & Go', GROOMING: 'Auto Grooming', COATING: 'Ceramic Coating' };
  const selectedService = services.find(s => s.id === selectedServiceId) ?? null;

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#f5f5f5' }}>

      {/* ── Dashboard Banner ── */}
      <div className="relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #383838 0%, #1a1a1a 100%)' }}>
        <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'repeating-linear-gradient(45deg, #ee4923 0, #ee4923 1px, transparent 0, transparent 50%)', backgroundSize: '20px 20px' }} />
        <div className="relative max-w-7xl mx-auto px-6 py-10">
          <p className="font-lovelo text-[10px] font-black tracking-[0.3em] uppercase mb-2" style={{ color: '#ee4923' }}>
            Wash &amp; Go Auto Salon
          </p>
          <h1 className="font-lovelo font-display font-black text-3xl text-white mb-1">Admin Dashboard</h1>
          <p className="font-lovelo text-gray-400 text-xs" style={{ fontWeight: 300 }}>
            Manage bookings, update statuses, and configure service pricing.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-8">
            {[
              { label: 'Total Bookings', value: totalBookings,  icon: <BarChart3 className="w-4 h-4" />,     accent: true  },
              { label: 'Pending',        value: pendingCount,   icon: <Clock className="w-4 h-4" />,         accent: false },
              { label: 'Confirmed',      value: confirmedCount, icon: <CheckCircle2 className="w-4 h-4" />,  accent: false },
              { label: "Today's Apts",   value: todayCount,     icon: <Calendar className="w-4 h-4" />,      accent: false },
            ].map(({ label, value, icon, accent }) => (
              <div key={label} className="rounded-2xl p-4" style={{ backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="flex items-center gap-2 mb-2" style={{ color: accent ? '#ee4923' : 'rgba(255,255,255,0.4)' }}>
                  {icon}
                  <span className="font-lovelo text-[9px] font-black tracking-[0.2em] uppercase">{label}</span>
                </div>
                <p className="font-lovelo font-black text-2xl" style={{ color: accent ? '#ee4923' : '#ffffff' }}>{value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">

        {/* ── Tab Navigation ── */}
        <div className="flex gap-2 bg-white rounded-2xl p-1.5 border border-gray-100 shadow-sm w-max">
          <button type="button" onClick={() => setActiveTab('bookings')}
            className={cn(
              'font-lovelo flex items-center gap-2 px-6 py-2.5 rounded-xl font-black text-xs tracking-wider uppercase transition-all duration-200',
              activeTab === 'bookings' ? 'text-white shadow-md' : 'text-gray-400 hover:text-gray-600'
            )}
            style={activeTab === 'bookings' ? { background: 'linear-gradient(135deg, #383838, #1a1a1a)' } : {}}>
            <Calendar className="w-3.5 h-3.5" /> Bookings
          </button>
          <button type="button" onClick={() => setActiveTab('services')}
            className={cn(
              'font-lovelo flex items-center gap-2 px-6 py-2.5 rounded-xl font-black text-xs tracking-wider uppercase transition-all duration-200',
              activeTab === 'services' ? 'text-white shadow-md' : 'text-gray-400 hover:text-gray-600'
            )}
            style={activeTab === 'services' ? { background: 'linear-gradient(135deg, #ee4923, #F4921F)' } : {}}>
            <DollarSign className="w-3.5 h-3.5" /> Services &amp; Rates
            {dirtyServices.length > 0 && (
              <span className="w-4 h-4 rounded-full text-[9px] flex items-center justify-center font-black"
                style={{ backgroundColor: activeTab === 'services' ? 'rgba(255,255,255,0.3)' : '#ee4923', color: '#fff' }}>
                {dirtyServices.length}
              </span>
            )}
          </button>
          <button type="button" onClick={() => setActiveTab('memberships')}
            className={cn(
              'font-lovelo flex items-center gap-2 px-6 py-2.5 rounded-xl font-black text-xs tracking-wider uppercase transition-all duration-200',
              activeTab === 'memberships' ? 'text-white shadow-md' : 'text-gray-400 hover:text-gray-600'
            )}
            style={activeTab === 'memberships' ? { background: 'linear-gradient(135deg, #ee4923, #F4921F)' } : {}}>
            <IdCard className="w-3.5 h-3.5" /> Memberships
          </button>
          <button type="button" onClick={() => setActiveTab('settings')}
            className={cn(
              'font-lovelo flex items-center gap-2 px-6 py-2.5 rounded-xl font-black text-xs tracking-wider uppercase transition-all duration-200',
              activeTab === 'settings' ? 'text-white shadow-md' : 'text-gray-400 hover:text-gray-600'
            )}
            style={activeTab === 'settings' ? { background: 'linear-gradient(135deg, #383838, #1a1a1a)' } : {}}>
            <Settings className="w-3.5 h-3.5" /> Settings
          </button>
        </div>

        {/* ─────────────── BOOKINGS TAB ─────────────── */}
        {activeTab === 'bookings' && (
          <>
            {/* Capacity / Date Slots */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                style={{ backgroundColor: '#fafafa' }}>
                <div>
                  <p className="font-lovelo text-[9px] font-black tracking-[0.2em] uppercase text-gray-400 mb-0.5">Capacity Overview</p>
                  <h2 className="font-lovelo font-display font-black text-base" style={{ color: '#383838' }}>Active Slots</h2>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setSelectedDate(prev => format(subDays(parseISO(prev), 1), 'yyyy-MM-dd'))}
                    className="w-9 h-9 flex items-center justify-center rounded-xl border-2 border-gray-100 hover:border-orange-300 transition-colors bg-white">
                    <ChevronLeft className="w-4 h-4 text-gray-500" />
                  </button>
                  <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
                    className="font-lovelo px-4 py-2 border-2 border-gray-100 rounded-xl text-xs font-black text-gray-800 outline-none focus:border-orange-400 bg-white" />
                  <button type="button" onClick={() => setSelectedDate(prev => format(addDays(parseISO(prev), 1), 'yyyy-MM-dd'))}
                    className="w-9 h-9 flex items-center justify-center rounded-xl border-2 border-gray-100 hover:border-orange-300 transition-colors bg-white">
                    <ChevronRight className="w-4 h-4 text-gray-500" />
                  </button>
                </div>
              </div>
              <div className="p-6">
                {activeSlots.length === 0 ? (
                  <div className="text-center py-8">
                    <Calendar className="w-8 h-8 mx-auto mb-2 text-gray-200" />
                    <p className="font-lovelo text-sm text-gray-400" style={{ fontWeight: 300 }}>
                      No active bookings for {format(parseISO(selectedDate), 'MMM d, yyyy')}.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                    {activeSlots.map(([time, counts]) => (
                      <div key={time} className="rounded-2xl p-4 border-2 border-gray-100">
                        <p className="font-lovelo font-black text-sm mb-3 pb-2 border-b border-gray-100" style={{ color: '#383838' }}>{time}</p>
                        {[
                          { label: 'Lube & Go',        count: counts.lube,     max: 1 },
                          { label: 'Detailing Studio',  count: counts.grooming, max: 2 },
                          { label: 'Ceramic Coating',   count: counts.coating,  max: 2 },
                        ].map(({ label, count, max }) => (
                          <div key={label} className="flex items-center justify-between mb-2">
                            <span className="font-lovelo text-xs text-gray-500" style={{ fontWeight: 300 }}>{label}</span>
                            <span className="font-lovelo text-[10px] font-black px-2 py-0.5 rounded-full"
                              style={count >= max
                                ? { backgroundColor: '#fee2e2', color: '#991b1b' }
                                : { backgroundColor: '#dcfce7', color: '#166534' }}>
                              {count} / {max}
                            </span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Filter + Table */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {/* Header row */}
              <div className="px-6 py-4 border-b border-gray-100 flex flex-col gap-4"
                style={{ background: 'linear-gradient(135deg, #383838 0%, #1a1a1a 100%)' }}>

                {/* Title + search */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex items-center gap-2 shrink-0">
                    <Filter className="w-4 h-4" style={{ color: '#ee4923' }} />
                    <h2 className="font-lovelo font-display font-black text-sm text-white tracking-wider uppercase">All Bookings</h2>
                    <span className="font-lovelo text-[10px] font-black px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(238,73,35,0.2)', color: '#F4921F' }}>
                      {filteredBookings.length}
                    </span>
                  </div>
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Search by ID, name, phone or email…"
                      className="font-lovelo w-full pl-9 pr-4 py-2 text-xs bg-white/10 text-white placeholder-gray-400 border border-white/20 rounded-xl outline-none focus:bg-white/20 transition-colors"
                    />
                    {searchQuery && (
                      <button type="button" onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Date range tabs + filters */}
                <div className="flex flex-wrap items-center gap-2">
                  {/* Date range pills */}
                  {(['all', 'today', 'upcoming', 'past', 'custom'] as const).map(range => (
                    <button type="button" key={range} onClick={() => setDateRange(range)}
                      className={cn(
                        'font-lovelo text-[10px] font-black tracking-[0.12em] uppercase px-3 py-1.5 rounded-xl border transition-all',
                        dateRange === range
                          ? 'text-white border-transparent'
                          : 'text-gray-300 border-white/20 hover:bg-white/10',
                      )}
                      style={dateRange === range ? { background: 'linear-gradient(135deg, #ee4923, #F4921F)', borderColor: 'transparent' } : {}}>
                      {DATE_RANGE_LABELS[range]}
                    </button>
                  ))}

                  {/* Custom date picker */}
                  {dateRange === 'custom' && (
                    <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
                      className="font-lovelo text-xs font-black bg-white/10 text-white border border-white/20 rounded-xl px-3 py-1.5 outline-none hover:bg-white/20 transition-colors" />
                  )}

                  <div className="ml-auto flex items-center gap-2">
                    {/* Sort direction */}
                    <button type="button" onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
                      className="font-lovelo flex items-center gap-1.5 text-[10px] font-black tracking-[0.12em] uppercase text-gray-300 border border-white/20 rounded-xl px-3 py-1.5 hover:bg-white/10 transition-colors">
                      <ArrowUpDown className="w-3 h-3" />
                      {sortDir === 'desc' ? 'Newest First' : 'Oldest First'}
                    </button>

                    {/* Status filter */}
                    <select value={filterStatus as string} onChange={e => setFilterStatus(e.target.value as any)}
                      className="font-lovelo text-xs font-black bg-white/10 text-white border border-white/20 rounded-xl px-3 py-1.5 outline-none hover:bg-white/20 transition-colors">
                      {statusOptions.map(option => (
                        <option key={option.value} value={option.value} className="text-gray-800 bg-white">{option.label}</option>
                      ))}
                    </select>

                    {/* Vehicle filter */}
                    <select value={filterVehicle} onChange={e => setFilterVehicle(e.target.value as any)}
                      className="font-lovelo text-xs font-black bg-white/10 text-white border border-white/20 rounded-xl px-3 py-1.5 outline-none hover:bg-white/20 transition-colors">
                      <option value="All"        className="text-gray-800 bg-white">All Vehicles</option>
                      <option value="Car"        className="text-gray-800 bg-white">Cars</option>
                      <option value="Motorcycle" className="text-gray-800 bg-white">Motorcycles</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr style={{ backgroundColor: '#fafafa' }} className="border-b border-gray-100">
                      {['ID / Schedule', 'Customer', 'Vehicle & Service', 'Payment', 'Status', ''].map(h => (
                        <th key={h} className="font-lovelo px-5 py-3 text-[9px] font-black tracking-[0.2em] uppercase text-gray-400">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filteredBookings.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-5 py-16 text-center">
                          <AlertCircle className="w-8 h-8 mx-auto mb-2 text-gray-200" />
                          <p className="font-lovelo text-sm text-gray-400" style={{ fontWeight: 300 }}>No bookings match the current filters.</p>
                        </td>
                      </tr>
                    ) : filteredBookings.map(booking => (
                      <tr key={booking.id} className="hover:bg-gray-50/80 transition-colors">
                        <td className="px-5 py-4">
                          <p className="font-lovelo text-[9px] font-black tracking-wider text-gray-400 mb-1">#{booking.id}</p>
                          <p className="font-lovelo font-black text-sm" style={{ color: '#383838' }}>
                            {format(parseISO(booking.date), 'MMM d, yyyy')}
                          </p>
                          <p className="font-lovelo text-xs mt-0.5" style={{ color: '#ee4923', fontWeight: 300 }}>
                            {booking.time ?? booking.timeSlot}
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-lovelo font-black text-sm" style={{ color: '#383838' }}>{booking.customerName}</p>
                            {!booking.userId && (
                              <span className="font-lovelo text-[9px] font-black tracking-widest uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">
                                Guest
                              </span>
                            )}
                          </div>
                          <p className="font-lovelo text-xs text-gray-400 mt-0.5" style={{ fontWeight: 300 }}>
                            {booking.contact ?? booking.customerPhone}
                          </p>
                          {booking.email && (
                            <p className="font-lovelo text-[10px] text-gray-300 mt-0.5" style={{ fontWeight: 300 }}>{booking.email}</p>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-1.5 mb-1">
                            {booking.vehicleCategory === 'Car'
                              ? <Car  className="w-3.5 h-3.5 text-gray-300" />
                              : <Bike className="w-3.5 h-3.5 text-gray-300" />}
                            <span className="font-lovelo text-xs font-black" style={{ color: '#383838' }}>
                              {booking.vehicleCategory ?? booking.vehicleType} · Size {booking.vehicleSize}
                            </span>
                          </div>
                          {booking.plateNumber && (
                            <span className="font-lovelo text-[9px] font-black tracking-widest px-2 py-0.5 rounded-lg text-white inline-block mb-1" style={{ backgroundColor: '#383838' }}>
                              {booking.plateNumber}
                            </span>
                          )}
                          <p className="font-lovelo text-xs text-gray-400" style={{ fontWeight: 300 }}>{booking.serviceName}</p>
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-lovelo font-black text-sm" style={{ color: '#ee4923' }}>
                            ₱{(booking.downPayment ?? booking.downPaymentAmount).toLocaleString()}
                          </p>
                          <p className="font-lovelo text-[9px] text-gray-400 mb-1" style={{ fontWeight: 300 }}>Down Payment</p>
                          {booking.paymentMethod && (
                            <span className="font-lovelo text-[9px] font-black px-2 py-0.5 rounded-lg text-gray-500 inline-block" style={{ backgroundColor: '#f3f4f6' }}>
                              {booking.paymentMethod}
                            </span>
                          )}
                          {booking.referenceNumber && (
                            <p className="font-lovelo text-[9px] font-black text-blue-500 mt-1">Ref: {booking.referenceNumber}</p>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <StatusBadge status={booking.status as string} />
                        </td>
                        <td className="px-5 py-4 text-right">
                          <button type="button" onClick={() => { setSelectedBooking(booking); setShowCancelConfirm(false); setDeclineReason(''); setDeclineError(''); }}
                            className="font-lovelo font-black text-[10px] tracking-widest uppercase px-4 py-2 rounded-xl text-white transition-all hover:opacity-90"
                            style={{ background: 'linear-gradient(135deg, #383838, #1a1a1a)' }}>
                            Manage
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ─────────────── SERVICES TAB ─────────────── */}
        {activeTab === 'services' && (
          <div className="space-y-4">

            {/* Info banner */}
            <div className="flex items-center gap-3 rounded-2xl px-5 py-3.5 border border-amber-200/70"
              style={{ background: 'linear-gradient(135deg, #fffbeb 0%, #fefce8 100%)' }}>
              <div className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#fef3c7' }}>
                <TrendingUp className="w-3.5 h-3.5" style={{ color: '#d97706' }} />
              </div>
              <p className="font-lovelo text-xs" style={{ color: '#92400e', fontWeight: 300 }}>
                Price updates are <strong style={{ fontWeight: 900 }}>live</strong>. Changes appear immediately on the booking wizard and services page.{' '}
                Use <kbd className="px-1.5 py-0.5 rounded-md text-[9px] font-black bg-amber-100 border border-amber-300" style={{ color: '#92400e' }}>Ctrl+S</kbd> to save all at once.
              </p>
            </div>

            {/* Sidebar + Detail layout */}
            <div className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] gap-4 items-start">

              {/* ── Service Sidebar ── */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-4 py-4 border-b border-gray-100 space-y-3" style={{ backgroundColor: '#fafafa' }}>
                  <div className="flex items-center justify-between">
                    <p className="font-lovelo text-[9px] font-black tracking-[0.25em] uppercase text-gray-400">Services</p>
                    <span className="font-lovelo text-[9px] font-black px-2 py-0.5 rounded-full" style={{ backgroundColor: '#f3f4f6', color: '#9ca3af' }}>
                      {services.length}
                    </span>
                  </div>
                  <select
                    value={filterCategory}
                    onChange={e => { setFilterCategory(e.target.value); setSelectedServiceId(null); }}
                    className="font-lovelo w-full text-[10px] font-black px-3 py-2.5 border-2 border-gray-100 rounded-xl outline-none focus:border-orange-400 bg-white transition-all cursor-pointer"
                    style={{ color: filterCategory === 'All' ? '#9ca3af' : (catAccents[filterCategory] ?? '#383838') }}>
                    <option value="All">All Categories</option>
                    {Object.keys(servicesByCategory).map(cat => (
                      <option key={cat} value={cat}>{categoryLabels[cat] ?? cat}</option>
                    ))}
                  </select>
                </div>

                {services.length === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <Layers className="w-8 h-8 mx-auto mb-2 text-gray-200" />
                    <p className="font-lovelo text-xs text-gray-400" style={{ fontWeight: 300 }}>No services loaded.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {(Object.entries(servicesByCategory) as [string, ServicePackage[]][]).filter(([cat]) => filterCategory === 'All' || cat === filterCategory).map(([cat, catServices]) => (
                      <div key={cat}>
                        {/* Category header */}
                        <div className="px-4 py-2.5 flex items-center gap-2.5 border-l-[3px]"
                          style={{
                            background: `linear-gradient(to right, ${catAccents[cat] ?? '#6b7280'}18, transparent)`,
                            borderLeftColor: catAccents[cat] ?? '#6b7280',
                          }}>
                          <span className="font-lovelo text-[9px] font-black tracking-[0.2em] uppercase" style={{ color: catAccents[cat] ?? '#6b7280' }}>
                            {categoryLabels[cat] ?? cat}
                          </span>
                          <span className="font-lovelo text-[9px] font-black px-1.5 py-0.5 rounded-full ml-auto"
                            style={{ backgroundColor: `${catAccents[cat] ?? '#6b7280'}18`, color: catAccents[cat] ?? '#6b7280' }}>
                            {catServices.length}
                          </span>
                        </div>

                        {/* Service items */}
                        {catServices.map(s => {
                          const isSelected = s.id === selectedServiceId;
                          const draft = drafts[s.id];
                          const isDirty = !!(draft && draftIsDirty(draft, s));
                          const bookingCount = bookingCountByService[s.id] ?? 0;
                          const accent = catAccents[cat] ?? '#ee4923';
                          return (
                            <button type="button" key={s.id}
                              onClick={() => setSelectedServiceId(s.id)}
                              className={cn(
                                'w-full px-4 py-3 flex items-center justify-between text-left transition-all duration-150 relative border-l-2',
                                isSelected ? 'bg-orange-50/50' : 'hover:bg-gray-50/80 border-l-transparent'
                              )}
                              style={isSelected ? { borderLeftColor: accent } : {}}>
                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                <div className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0 transition-all', isDirty ? 'animate-pulse' : 'opacity-0')}
                                  style={{ backgroundColor: '#ee4923' }} />
                                <div className="min-w-0">
                                  <span className="font-lovelo text-xs block truncate"
                                    style={{ color: isSelected ? accent : '#383838', fontWeight: isSelected ? 900 : 400 }}>
                                    {s.name}
                                  </span>
                                  {isDirty && (
                                    <span className="font-lovelo text-[9px]" style={{ color: '#f97316', fontWeight: 300 }}>unsaved</span>
                                  )}
                                </div>
                              </div>
                              {bookingCount > 0 && (
                                <span className="font-lovelo text-[9px] font-black px-1.5 py-0.5 rounded-full flex-shrink-0 ml-2"
                                  style={{
                                    backgroundColor: isSelected ? `${accent}18` : 'rgba(238,73,35,0.07)',
                                    color: isSelected ? accent : '#ee4923',
                                  }}>
                                  {bookingCount}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Detail Panel ── */}
              {!selectedService ? (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex items-center justify-center py-24">
                  <div className="text-center">
                    <div className="w-16 h-16 rounded-3xl mx-auto mb-5 flex items-center justify-center"
                      style={{ background: 'linear-gradient(135deg, #f3f4f6, #e9eaec)' }}>
                      <DollarSign className="w-7 h-7 text-gray-300" />
                    </div>
                    <p className="font-lovelo font-black text-sm mb-1.5" style={{ color: '#383838' }}>No service selected</p>
                    <p className="font-lovelo text-xs text-gray-400 max-w-[200px] mx-auto leading-relaxed" style={{ fontWeight: 300 }}>
                      Pick a service from the sidebar to edit its name, description, and pricing.
                    </p>
                    <p className="font-lovelo text-[10px] text-gray-300 mt-2" style={{ fontWeight: 300 }}>
                      Booking count badge shows usage frequency
                    </p>
                  </div>
                </div>
              ) : (() => {
                const draft = getDraft(selectedService);
                const dirty = draftIsDirty(draft, selectedService);
                const accent = catAccents[selectedService.category] ?? '#6b7280';
                const bookingCount = bookingCountByService[selectedService.id] ?? 0;

                return (
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    {/* Detail header */}
                    <div className="px-6 py-5 flex items-center justify-between gap-4 border-b border-gray-100"
                      style={{ background: `linear-gradient(135deg, ${accent}0e 0%, transparent 55%)` }}>
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
                          style={{ background: `linear-gradient(135deg, ${accent}22, ${accent}0a)`, border: `1.5px solid ${accent}28` }}>
                          <DollarSign className="w-5 h-5" style={{ color: accent }} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-lovelo font-black text-lg truncate" style={{ color: '#383838' }}>{draft.name}</p>
                            {dirty && (
                              <span className="font-lovelo text-[9px] font-black px-2 py-0.5 rounded-full flex-shrink-0 border"
                                style={{ backgroundColor: '#fff7ed', color: '#ea580c', borderColor: '#fed7aa' }}>
                                ● Unsaved
                              </span>
                            )}
                          </div>
                          <p className="font-lovelo text-[9px] uppercase tracking-[0.2em] mt-0.5 font-black" style={{ color: accent }}>
                            {categoryLabels[selectedService.category] ?? selectedService.category}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2.5 flex-shrink-0">
                        {bookingCount > 0 && (
                          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border"
                            style={{ backgroundColor: 'rgba(238,73,35,0.04)', borderColor: 'rgba(238,73,35,0.14)' }}>
                            <BarChart3 className="w-3 h-3" style={{ color: '#ee4923' }} />
                            <span className="font-lovelo text-[10px] font-black" style={{ color: '#ee4923' }}>
                              {bookingCount} booking{bookingCount !== 1 ? 's' : ''}
                            </span>
                          </div>
                        )}
                        {dirty && (
                          <button type="button" onClick={() => resetDraft(selectedService.id)}
                            className="font-lovelo flex items-center gap-1.5 text-[10px] font-black text-gray-400 hover:text-red-400 transition-colors px-3 py-1.5 rounded-xl hover:bg-red-50 border border-transparent hover:border-red-100">
                            <RotateCcw className="w-3 h-3" /> Reset
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Detail body */}
                    <div className="p-6 space-y-7">
                      {/* Service Details section */}
                      <div>
                        <div className="flex items-center gap-2 mb-4">
                          <div className="w-0.5 h-4 rounded-full" style={{ backgroundColor: accent }} />
                          <p className="font-lovelo text-[9px] font-black tracking-[0.22em] uppercase text-gray-400">Service Details</p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label htmlFor={`service-name-${selectedService.id}`} className="font-lovelo text-[9px] font-black tracking-[0.18em] text-gray-400 uppercase mb-1.5 block">
                              Service Name
                            </label>
                            <input id={`service-name-${selectedService.id}`} value={draft.name}
                              onChange={e => setDraft(selectedService.id, { ...draft, name: e.target.value })}
                              className="font-lovelo w-full px-4 py-3 border-2 border-gray-100 rounded-xl text-sm font-black text-gray-800 focus:border-orange-400 outline-none bg-gray-50/80 hover:bg-white transition-all" />
                          </div>
                          <div>
                            <label htmlFor={`service-description-${selectedService.id}`} className="font-lovelo text-[9px] font-black tracking-[0.18em] text-gray-400 uppercase mb-1.5 block">
                              Description
                            </label>
                            <input id={`service-description-${selectedService.id}`} value={draft.description}
                              onChange={e => setDraft(selectedService.id, { ...draft, description: e.target.value })}
                              className="font-lovelo w-full px-4 py-3 border-2 border-gray-100 rounded-xl text-sm text-gray-600 focus:border-orange-400 outline-none bg-gray-50/80 hover:bg-white transition-all" />
                          </div>
                        </div>
                      </div>

                      <div className="h-px bg-gradient-to-r from-gray-100 via-gray-50 to-transparent" />

                      {/* Pricing section */}
                      <div>
                        <div className="flex items-center gap-2 mb-4">
                          <div className="w-0.5 h-4 rounded-full" style={{ backgroundColor: accent }} />
                          <p className="font-lovelo text-[9px] font-black tracking-[0.22em] uppercase text-gray-400">
                            {selectedService.isLubeFlat ? 'Fuel-based Pricing' : 'Pricing by Vehicle Size'}
                          </p>
                        </div>
                        <PriceGrid
                          service={selectedService}
                          draft={draft}
                          onPricesChange={prices => setDraft(selectedService.id, { ...draft, prices })}
                          onLubePricesChange={lubePrices => setDraft(selectedService.id, { ...draft, lubePrices })}
                        />
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* ─────────────── SETTINGS TAB ─────────────── */}
        {activeTab === 'memberships' && <MembershipsPanel />}

        {activeTab === 'settings' && (
          <div className="max-w-2xl space-y-10">
            <GcashQRSettings />
            <ScheduleSettings />
          </div>
        )}
      </div>

      {/* ── Floating Save Bar ── */}
      {dirtyServices.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
          <div className="relative">
            {/* Diff popover */}
            {showDiff && (
              <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 bg-white rounded-2xl shadow-2xl border border-gray-100 p-4 w-[420px] max-w-[calc(100vw-2rem)]">
                <div className="flex items-center justify-between mb-3">
                  <p className="font-lovelo text-[9px] font-black tracking-[0.2em] uppercase text-gray-400">Pending Changes</p>
                  <button type="button" onClick={() => setShowDiff(false)} className="text-gray-300 hover:text-gray-500 transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="space-y-2 max-h-52 overflow-y-auto">
                  {dirtyServices.map(s => {
                    const d = drafts[s.id];
                    const changes: string[] = [];
                    if (d.name !== s.name) changes.push(`Name: "${s.name}" → "${d.name}"`);
                    if (d.description !== s.description) changes.push(`Description changed`);
                    SIZE_COLS.forEach(size => {
                      const orig = (s.prices as unknown as Record<string, number>)[size] ?? 0;
                      const next = draftPriceToNumber(d.prices[size]);
                      if (orig !== next) changes.push(`${SIZE_LABELS[size]}: ₱${orig.toLocaleString()} → ₱${next.toLocaleString()}`);
                    });
                    Object.entries(d.lubePrices).forEach(([fuel, draftValue]) => {
                      const val = draftPriceToNumber(draftValue as string);
                      const orig = (s.lubePrices as unknown as Record<string, number> | undefined)?.[fuel] ?? 0;
                      if (orig !== val) changes.push(`${fuel}: ₱${orig.toLocaleString()} → ₱${val.toLocaleString()}`);
                    });
                    return (
                      <div key={s.id} className="rounded-xl p-3 border border-gray-100">
                        <p className="font-lovelo text-xs font-black mb-1.5" style={{ color: '#383838' }}>{s.name}</p>
                        {changes.map(c => (
                          <p key={c} className="font-lovelo text-[10px] text-gray-500 leading-5" style={{ fontWeight: 300 }}>• {c}</p>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Bar */}
            <div className="flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl border"
              style={{ backgroundColor: '#1a1a1a', borderColor: 'rgba(238,73,35,0.3)', backdropFilter: 'blur(12px)' }}>
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: '#ee4923', boxShadow: '0 0 6px #ee4923' }} />
              <span className="font-lovelo text-xs font-black text-white whitespace-nowrap">
                {dirtyServices.length} unsaved change{dirtyServices.length !== 1 ? 's' : ''}
              </span>
              <button type="button" onClick={() => setShowDiff(v => !v)}
                className="font-lovelo text-[10px] font-black transition-colors underline underline-offset-2 whitespace-nowrap"
                style={{ color: showDiff ? '#F4921F' : '#6b7280' }}>
                {showDiff ? 'Hide' : 'View'} diff
              </button>
              <div className="w-px h-4 bg-white/20 flex-shrink-0" />
              <button type="button" onClick={() => { setDrafts({}); setShowDiff(false); }}
                className="font-lovelo flex items-center gap-1 text-[10px] font-black text-gray-500 hover:text-red-400 transition-colors whitespace-nowrap">
                <RotateCcw className="w-3 h-3" /> Discard
              </button>
              <button type="button" onClick={handleSaveAll} disabled={savingAll}
                className="font-lovelo flex items-center gap-2 px-4 py-2 rounded-xl font-black text-xs text-white transition-all disabled:opacity-50 whitespace-nowrap"
                style={{ background: 'linear-gradient(135deg, #ee4923, #F4921F)' }}>
                {savingAll ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                {savingAll ? 'Saving…' : 'Save All'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Manage Booking Modal ── */}
      {selectedBooking && (
        <BookingDetailModal
          booking={selectedBooking}
          onClose={() => { setSelectedBooking(null); setShowCancelConfirm(false); setDeclineReason(''); setDeclineError(''); }}
          loadingProofUrl={loadingProofUrl}
          proofViewUrl={proofViewUrl}
          pendingStatus={pendingStatus}
          setPendingStatus={setPendingStatus}
          showCancelConfirm={showCancelConfirm}
          setShowCancelConfirm={setShowCancelConfirm}
          onConfirmCancel={handleConfirmCancel}
          declineReason={declineReason}
          setDeclineReason={setDeclineReason}
          declineError={declineError}
          setDeclineError={setDeclineError}
          decliningPayment={decliningPayment}
          onDeclinePayment={handleDeclinePayment}
          updateMessage={updateMessage}
          setUpdateMessage={setUpdateMessage}
          updateImages={updateImages}
          updatePreviews={updatePreviews}
          postingUpdate={postingUpdate}
          onPostUpdate={handlePostUpdate}
          onImageSelect={handleImageSelect}
          onRemoveImage={removeImage}
          fileInputRef={fileInputRef}
        />
      )}
    </div>
  );
}
