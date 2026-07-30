import React, { useState, useEffect, useCallback } from 'react';
import { format, parseISO } from 'date-fns';
import {
  Clock, CalendarX, CalendarClock, CalendarDays, Trash2, Plus, Save,
  Loader2, CheckCircle2, AlertCircle, AlertTriangle,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';

interface ScheduleRow {
  id?: string;
  open_time?: string;
  close_time?: string;
  slot_interval_h?: number;
  closed_days?: number[];
}

interface OverrideRow {
  override_date: string;
  is_closed: boolean;
  custom_open: string | null;
  custom_close: string | null;
  label: string | null;
}

const WEEKDAYS = [
  { day: 0, label: 'Sun' },
  { day: 1, label: 'Mon' },
  { day: 2, label: 'Tue' },
  { day: 3, label: 'Wed' },
  { day: 4, label: 'Thu' },
  { day: 5, label: 'Fri' },
  { day: 6, label: 'Sat' },
];

const to12h = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${displayH}:${String(m).padStart(2, '0')} ${suffix}`;
};

const toMins = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m || 0);
};

interface CardShellProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}

const CardShell: React.FC<CardShellProps> = ({ icon, title, subtitle, children }) => (
  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
    <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3" style={{ backgroundColor: '#fafafa' }}>
      <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #ee4923, #F4921F)' }}>
        {icon}
      </div>
      <div>
        <p className="font-lovelo font-black text-sm" style={{ color: '#383838' }}>{title}</p>
        <p className="font-lovelo text-[10px] text-gray-400" style={{ fontWeight: 300 }}>{subtitle}</p>
      </div>
    </div>
    <div className="p-6">{children}</div>
  </div>
);

const ConflictWarning: React.FC<{ show: boolean }> = ({ show }) => show ? (
  <p className="font-lovelo text-[10px] text-amber-600 flex items-center gap-1.5">
    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
    An entry for this date already exists — saving will replace it.
  </p>
) : null;

export default function ScheduleSettings() {
  const { token } = useAuth();

  const [loading, setLoading]           = useState(true);
  const [schedule, setSchedule]         = useState<ScheduleRow | null>(null);
  const [overrides, setOverrides]       = useState<OverrideRow[]>([]);
  const [toast, setToast]               = useState<{ msg: string; ok: boolean } | null>(null);

  // Operating hours draft
  const [openTime, setOpenTime]         = useState('08:00');
  const [closeTime, setCloseTime]       = useState('17:00');
  const [savingHours, setSavingHours]   = useState(false);

  // Closed weekdays draft
  const [closedDays, setClosedDays]     = useState<number[]>([]);
  const [savingDays, setSavingDays]     = useState(false);

  // Holiday form
  const [holidayDate, setHolidayDate]   = useState('');
  const [holidayLabel, setHolidayLabel] = useState('');
  const [savingHoliday, setSavingHoliday] = useState(false);

  // Custom hours form
  const [customDate, setCustomDate]     = useState('');
  const [customOpen, setCustomOpen]     = useState('08:00');
  const [customClose, setCustomClose]   = useState('12:00');
  const [customLabel, setCustomLabel]   = useState('');
  const [savingCustom, setSavingCustom] = useState(false);

  const [deletingDate, setDeletingDate] = useState<string | null>(null);

  const today = format(new Date(), 'yyyy-MM-dd');

  const loadSettings = useCallback(async () => {
    if (!token) return;
    try {
      const { schedule: sched, overrides: ovr } = await api.getScheduleSettings(token);
      setSchedule(sched);
      setOverrides(ovr || []);
      if (sched) {
        setOpenTime(sched.open_time || '08:00');
        setCloseTime(sched.close_time || '17:00');
        setClosedDays(Array.isArray(sched.closed_days) ? sched.closed_days : []);
      }
    } catch {
      setToast({ msg: 'Failed to load schedule settings.', ok: false });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // ── Derived state ──────────────────────────────────────────────────────────
  const hoursInvalid  = toMins(closeTime) <= toMins(openTime);
  const hoursDirty    = openTime !== (schedule?.open_time || '08:00') || closeTime !== (schedule?.close_time || '17:00');
  const savedDays     = Array.isArray(schedule?.closed_days) ? schedule!.closed_days! : [];
  const daysDirty     = closedDays.length !== savedDays.length || closedDays.some(d => !savedDays.includes(d));
  const allDaysClosed = closedDays.length === 7;
  const customInvalid = toMins(customClose) <= toMins(customOpen);

  const holidays    = overrides.filter(o => o.is_closed);
  const customHours = overrides.filter(o => !o.is_closed);

  const holidayConflict = holidayDate !== '' && overrides.some(o => o.override_date === holidayDate);
  const customConflict  = customDate !== '' && overrides.some(o => o.override_date === customDate);

  // ── Actions ────────────────────────────────────────────────────────────────
  const saveHours = async () => {
    if (!token || hoursInvalid) return;
    setSavingHours(true);
    try {
      await api.updateScheduleSettings({ openTime, closeTime }, token);
      setToast({ msg: 'Operating hours updated.', ok: true });
      await loadSettings();
    } catch (err: any) {
      setToast({ msg: err?.message || 'Failed to update operating hours.', ok: false });
    } finally {
      setSavingHours(false);
    }
  };

  const toggleDay = (day: number) => {
    setClosedDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort((a, b) => a - b));
  };

  const saveClosedDays = async () => {
    if (!token || allDaysClosed) return;
    setSavingDays(true);
    try {
      await api.updateScheduleSettings({ closedDays }, token);
      setToast({ msg: 'Closed weekdays updated.', ok: true });
      await loadSettings();
    } catch (err: any) {
      setToast({ msg: err?.message || 'Failed to update closed weekdays.', ok: false });
    } finally {
      setSavingDays(false);
    }
  };

  const addHoliday = async () => {
    if (!token || !holidayDate) return;
    setSavingHoliday(true);
    try {
      await api.upsertScheduleOverride({ overrideDate: holidayDate, isClosed: true, label: holidayLabel.trim() || undefined }, token);
      setToast({ msg: 'Holiday closure saved.', ok: true });
      setHolidayDate('');
      setHolidayLabel('');
      await loadSettings();
    } catch (err: any) {
      setToast({ msg: err?.message || 'Failed to save holiday.', ok: false });
    } finally {
      setSavingHoliday(false);
    }
  };

  const addCustomHours = async () => {
    if (!token || !customDate || customInvalid) return;
    setSavingCustom(true);
    try {
      await api.upsertScheduleOverride({
        overrideDate: customDate,
        isClosed: false,
        customOpen,
        customClose,
        label: customLabel.trim() || undefined,
      }, token);
      setToast({ msg: 'Custom hours saved.', ok: true });
      setCustomDate('');
      setCustomLabel('');
      await loadSettings();
    } catch (err: any) {
      setToast({ msg: err?.message || 'Failed to save custom hours.', ok: false });
    } finally {
      setSavingCustom(false);
    }
  };

  const removeOverride = async (date: string) => {
    if (!token) return;
    setDeletingDate(date);
    try {
      await api.deleteScheduleOverride(date, token);
      setToast({ msg: 'Entry removed.', ok: true });
      await loadSettings();
    } catch (err: any) {
      setToast({ msg: err?.message || 'Failed to remove entry.', ok: false });
    } finally {
      setDeletingDate(null);
    }
  };

  // ── Shared bits ────────────────────────────────────────────────────────────
  const inputClass = 'font-lovelo px-4 py-2 border-2 border-gray-100 rounded-xl text-xs font-black text-gray-800 outline-none focus:border-orange-400 bg-white';
  const primaryBtn = 'font-lovelo flex items-center gap-2 text-xs font-black tracking-wider text-white rounded-xl px-5 py-2.5 transition-opacity disabled:opacity-40';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="font-lovelo text-[9px] font-black tracking-[0.25em] uppercase text-gray-400 mb-0.5">Schedule Settings</p>
        <h2 className="font-lovelo font-display font-black text-base" style={{ color: '#383838' }}>Availability Management</h2>
      </div>

      {/* ── A. Operating Hours ── */}
      <CardShell
        icon={<Clock className="w-4 h-4 text-white" />}
        title="Operating Hours"
        subtitle="Default opening and closing time for every business day"
      >
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <p className="font-lovelo text-[9px] font-black tracking-[0.2em] uppercase text-gray-400 mb-2">Opens</p>
            <input type="time" value={openTime} onChange={e => setOpenTime(e.target.value)} className={inputClass} />
          </div>
          <div>
            <p className="font-lovelo text-[9px] font-black tracking-[0.2em] uppercase text-gray-400 mb-2">Closes</p>
            <input type="time" value={closeTime} onChange={e => setCloseTime(e.target.value)} className={inputClass} />
          </div>
          <button
            type="button"
            onClick={saveHours}
            disabled={savingHours || hoursInvalid || !hoursDirty}
            className={primaryBtn}
            style={{ background: 'linear-gradient(135deg, #ee4923, #F4921F)' }}
          >
            {savingHours ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save Hours
          </button>
        </div>
        {hoursInvalid && (
          <p className="font-lovelo text-[10px] text-red-500 flex items-center gap-1.5 mt-3">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> Closing time must be later than opening time.
          </p>
        )}
        <p className="font-lovelo text-[10px] text-gray-400 mt-3" style={{ fontWeight: 300 }}>
          Currently {to12h(schedule?.open_time || '08:00')} – {to12h(schedule?.close_time || '17:00')}. Booking slots are generated within these hours.
        </p>
      </CardShell>

      {/* ── B. Closed Weekdays ── */}
      <CardShell
        icon={<CalendarX className="w-4 h-4 text-white" />}
        title="Closed Weekdays"
        subtitle="Days of the week the shop is always closed"
      >
        <div className="flex flex-wrap gap-2 mb-4">
          {WEEKDAYS.map(({ day, label }) => {
            const isClosed = closedDays.includes(day);
            return (
              <button
                key={day}
                type="button"
                onClick={() => toggleDay(day)}
                className={cn(
                  'font-lovelo px-4 py-2.5 rounded-xl text-xs font-black border-2 transition-all',
                  isClosed
                    ? 'text-white border-transparent shadow-md'
                    : 'bg-white text-gray-600 border-gray-100 hover:border-orange-300',
                )}
                style={isClosed ? { background: 'linear-gradient(135deg, #383838, #1a1a1a)' } : undefined}
              >
                {label}
              </button>
            );
          })}
        </div>
        {allDaysClosed && (
          <p className="font-lovelo text-[10px] text-red-500 flex items-center gap-1.5 mb-3">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> You cannot close every day of the week.
          </p>
        )}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={saveClosedDays}
            disabled={savingDays || allDaysClosed || !daysDirty}
            className={primaryBtn}
            style={{ background: 'linear-gradient(135deg, #ee4923, #F4921F)' }}
          >
            {savingDays ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save Closed Days
          </button>
          <p className="font-lovelo text-[10px] text-gray-400" style={{ fontWeight: 300 }}>
            {closedDays.length === 0
              ? 'Open every day of the week.'
              : `Closed every ${closedDays.map(d => WEEKDAYS[d].label).join(', ')}.`}
          </p>
        </div>
      </CardShell>

      {/* ── C. Holidays & Closures ── */}
      <CardShell
        icon={<CalendarDays className="w-4 h-4 text-white" />}
        title="Holidays & Closures"
        subtitle="Specific dates the shop is fully closed"
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <p className="font-lovelo text-[9px] font-black tracking-[0.2em] uppercase text-gray-400 mb-2">Date</p>
              <input type="date" min={today} value={holidayDate} onChange={e => setHolidayDate(e.target.value)} className={inputClass} />
            </div>
            <div className="flex-1 min-w-[160px]">
              <p className="font-lovelo text-[9px] font-black tracking-[0.2em] uppercase text-gray-400 mb-2">Label / Reason</p>
              <input
                type="text"
                value={holidayLabel}
                onChange={e => setHolidayLabel(e.target.value)}
                placeholder="e.g. Christmas"
                maxLength={80}
                className={cn(inputClass, 'w-full')}
              />
            </div>
            <button
              type="button"
              onClick={addHoliday}
              disabled={savingHoliday || !holidayDate}
              className={primaryBtn}
              style={{ background: 'linear-gradient(135deg, #383838, #1a1a1a)' }}
            >
              {savingHoliday ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Add Holiday
            </button>
          </div>
          <ConflictWarning show={holidayConflict} />

          {holidays.length === 0 ? (
            <p className="font-lovelo text-[10px] text-gray-400 py-2" style={{ fontWeight: 300 }}>No holiday closures scheduled.</p>
          ) : (
            <div className="space-y-2">
              {holidays.map(h => (
                <div key={h.override_date} className="flex items-center justify-between rounded-xl border border-gray-100 px-4 py-2.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-lovelo inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black border bg-red-50 border-red-100 text-red-600 flex-shrink-0">
                      Closed
                    </span>
                    <p className="font-lovelo text-xs font-black text-gray-700 flex-shrink-0">
                      {format(parseISO(h.override_date), 'MMM d, yyyy (EEE)')}
                    </p>
                    {h.label && <p className="font-lovelo text-[10px] text-gray-400 truncate" style={{ fontWeight: 300 }}>{h.label}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeOverride(h.override_date)}
                    disabled={deletingDate === h.override_date}
                    aria-label={`Remove closure on ${h.override_date}`}
                    className="text-gray-300 hover:text-red-500 transition-colors disabled:opacity-40 p-1.5"
                  >
                    {deletingDate === h.override_date
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Trash2 className="w-4 h-4" />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardShell>

      {/* ── D. Custom Hours / Blocked Times ── */}
      <CardShell
        icon={<CalendarClock className="w-4 h-4 text-white" />}
        title="Custom Hours"
        subtitle="Dates with modified opening hours (e.g. half days)"
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <p className="font-lovelo text-[9px] font-black tracking-[0.2em] uppercase text-gray-400 mb-2">Date</p>
              <input type="date" min={today} value={customDate} onChange={e => setCustomDate(e.target.value)} className={inputClass} />
            </div>
            <div>
              <p className="font-lovelo text-[9px] font-black tracking-[0.2em] uppercase text-gray-400 mb-2">Opens</p>
              <input type="time" value={customOpen} onChange={e => setCustomOpen(e.target.value)} className={inputClass} />
            </div>
            <div>
              <p className="font-lovelo text-[9px] font-black tracking-[0.2em] uppercase text-gray-400 mb-2">Closes</p>
              <input type="time" value={customClose} onChange={e => setCustomClose(e.target.value)} className={inputClass} />
            </div>
            <div className="flex-1 min-w-[140px]">
              <p className="font-lovelo text-[9px] font-black tracking-[0.2em] uppercase text-gray-400 mb-2">Label / Reason</p>
              <input
                type="text"
                value={customLabel}
                onChange={e => setCustomLabel(e.target.value)}
                placeholder="e.g. Christmas Eve — half day"
                maxLength={80}
                className={cn(inputClass, 'w-full')}
              />
            </div>
            <button
              type="button"
              onClick={addCustomHours}
              disabled={savingCustom || !customDate || customInvalid}
              className={primaryBtn}
              style={{ background: 'linear-gradient(135deg, #383838, #1a1a1a)' }}
            >
              {savingCustom ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Add
            </button>
          </div>
          {customInvalid && (
            <p className="font-lovelo text-[10px] text-red-500 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> End time must be later than start time.
            </p>
          )}
          <ConflictWarning show={customConflict} />

          {customHours.length === 0 ? (
            <p className="font-lovelo text-[10px] text-gray-400 py-2" style={{ fontWeight: 300 }}>No custom hours scheduled.</p>
          ) : (
            <div className="space-y-2">
              {customHours.map(c => (
                <div key={c.override_date} className="flex items-center justify-between rounded-xl border border-gray-100 px-4 py-2.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-lovelo inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black border bg-amber-50 border-amber-100 text-amber-700 flex-shrink-0">
                      {c.custom_open && c.custom_close ? `${to12h(c.custom_open)} – ${to12h(c.custom_close)}` : 'Modified'}
                    </span>
                    <p className="font-lovelo text-xs font-black text-gray-700 flex-shrink-0">
                      {format(parseISO(c.override_date), 'MMM d, yyyy (EEE)')}
                    </p>
                    {c.label && <p className="font-lovelo text-[10px] text-gray-400 truncate" style={{ fontWeight: 300 }}>{c.label}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeOverride(c.override_date)}
                    disabled={deletingDate === c.override_date}
                    aria-label={`Remove custom hours on ${c.override_date}`}
                    className="text-gray-300 hover:text-red-500 transition-colors disabled:opacity-40 p-1.5"
                  >
                    {deletingDate === c.override_date
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Trash2 className="w-4 h-4" />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardShell>

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
}
