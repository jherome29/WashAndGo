import React, { useState, useEffect, useRef } from 'react';
import {
  Calendar as CalendarIcon, Clock, ChevronLeft, ChevronRight,
} from 'lucide-react';
import {
  format, addDays, startOfToday, startOfMonth, getDaysInMonth, getDay, addMonths, subMonths,
} from 'date-fns';
import { api } from '../lib/api';

interface SlotInfo {
  time: string;
  available: boolean;
}

interface ScheduleSelectionProps {
  onSelect: (date: string, time: string, plateNumber: string) => void;
  onBack: () => void;
  serviceDuration: number;
  serviceCategory?: string;
  serviceId?: string;
}

const DAY_HEADERS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export default function ScheduleSelection({ onSelect, onBack, serviceDuration, serviceId }: ScheduleSelectionProps) {
  const today = startOfToday();
  const minDate = format(today, 'yyyy-MM-dd');

  const [selectedDate, setSelectedDate] = useState<string>(format(addDays(today, 1), 'yyyy-MM-dd'));
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [plateNumber, setPlateNumber] = useState('');
  const [slots, setSlots] = useState<SlotInfo[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [dayIsClosed, setDayIsClosed] = useState(false);
  const [dayLabel, setDayLabel] = useState<string | null>(null);

  // Shop schedule: closed weekdays + per-date closures/custom hours
  const [closedWeekdays, setClosedWeekdays] = useState<number[]>([]);
  const [overrideMap, setOverrideMap] = useState<Record<string, { isClosed: boolean; label: string | null }>>({});

  // Custom calendar state
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState<Date>(() => {
    const [y, m, d] = format(addDays(today, 1), 'yyyy-MM-dd').split('-').map(Number);
    return startOfMonth(new Date(y, m - 1, d));
  });
  const calendarRef = useRef<HTMLDivElement>(null);

  // Close calendar on outside click
  useEffect(() => {
    if (!calendarOpen) return;
    const handler = (e: MouseEvent) => {
      if (calendarRef.current && !calendarRef.current.contains(e.target as Node)) {
        setCalendarOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [calendarOpen]);

  // Fetch shop schedule info once (closed weekdays + holiday/custom-hour dates)
  useEffect(() => {
    let isMounted = true;
    api.getScheduleInfo()
      .then(info => {
        if (!isMounted) return;
        setClosedWeekdays(info.closedDays || []);
        const map: Record<string, { isClosed: boolean; label: string | null }> = {};
        for (const o of info.overrides || []) {
          map[o.date] = { isClosed: o.isClosed, label: o.label };
        }
        setOverrideMap(map);
      })
      .catch(() => { /* calendar still works via per-date availability */ });
    return () => { isMounted = false; };
  }, []);

  // Fetch availability when date changes
  useEffect(() => {
    if (!selectedDate) return;
    let isMounted = true;
    Promise.resolve().then(() => {
      setLoadingSlots(true);
      setSelectedTime('');
    });
    api.getAvailability(selectedDate, serviceId)
      .then(res => {
        if (isMounted) {
          setDayIsClosed(res.closed);
          setDayLabel(res.label ?? null);
          setSlots(res.slots || []);
          setLoadingSlots(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setDayIsClosed(false);
          setDayLabel(null);
          setSlots([]);
          setLoadingSlots(false);
        }
      });
    return () => { isMounted = false; };
  }, [selectedDate, serviceId]);

  // A date is closed if it has a full-closure override, or falls on a closed
  // weekday without an explicit override opening the shop that day
  const dateIsClosed = (dateStr: string): boolean => {
    const override = overrideMap[dateStr];
    if (override) return override.isClosed;
    const [y, m, d] = dateStr.split('-').map(Number);
    return closedWeekdays.includes(new Date(y, m - 1, d).getDay());
  };

  const closedReason = (dateStr: string): string => {
    const override = overrideMap[dateStr];
    if (override?.isClosed) return override.label || 'Closed';
    return 'Closed';
  };

  const isPastTime = (time: string): boolean => {
    const todayPH = format(new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' })), 'yyyy-MM-dd');
    if (selectedDate !== todayPH) return false;
    const [timePart, period] = time.split(' ');
    const [h, minutes] = timePart.split(':').map(Number);
    const hours = period === 'PM' && h !== 12 ? h + 12 : period === 'AM' && h === 12 ? 0 : h;
    const nowPH = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
    const slotPH = new Date(nowPH);
    slotPH.setHours(hours, minutes, 0, 0);
    return slotPH <= nowPH;
  };

  const parseDateLocal = (str: string) => {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
  };

  const shiftDate = (delta: number) => {
    const d = parseDateLocal(selectedDate);
    d.setDate(d.getDate() + delta);
    const next = format(d, 'yyyy-MM-dd');
    if (next >= minDate) setSelectedDate(next);
  };

  const selectCalendarDate = (dateStr: string) => {
    if (dateStr < minDate) return;
    setSelectedDate(dateStr);
    setCalendarOpen(false);
  };

  const openCalendar = () => {
    // Sync view month to selected date
    const [y, m, d] = selectedDate.split('-').map(Number);
    setViewMonth(startOfMonth(new Date(y, m - 1, d)));
    setCalendarOpen(true);
  };

  const prevDisabled = selectedDate <= minDate;
  const dateObj = parseDateLocal(selectedDate);
  const todayStr = format(today, 'yyyy-MM-dd');

  // Build calendar grid for current viewMonth
  const firstOfMonth = viewMonth;
  const totalDays = getDaysInMonth(firstOfMonth);
  const startOffset = getDay(firstOfMonth); // 0=Sun ... 6=Sat
  const calendarCells: (number | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];

  const handleContinue = () => {
    if (selectedDate && selectedTime && plateNumber.trim()) {
      onSelect(selectedDate, selectedTime, plateNumber.trim());
    }
  };

  return (
    <div className="animate-fade-in max-w-2xl mx-auto">
      <h2 className="font-lovelo font-black text-2xl text-gray-900 mb-4 sm:mb-8 text-center">SELECT SCHEDULE</h2>

      {/* ── Date Picker ──────────────────────────────────────────────────────── */}
      <div className="mb-5 sm:mb-8">
        <label className="font-lovelo flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3">
          <CalendarIcon size={14} /> Preferred Date
        </label>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* ← Prev day */}
          <button
            type="button"
            onClick={() => shiftDate(-1)}
            disabled={prevDisabled}
            aria-label="Previous day"
            className={`shrink-0 w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center border-2 transition-all ${
              prevDisabled
                ? 'border-gray-100 text-gray-300 cursor-not-allowed bg-gray-50'
                : 'border-gray-200 text-gray-500 hover:border-[#ee4923] hover:text-[#ee4923] active:scale-95 bg-white'
            }`}
          >
            <ChevronLeft size={20} />
          </button>

          {/* Center: date card — click opens custom calendar */}
          <div ref={calendarRef} className="relative flex-1">
            <button
              type="button"
              onClick={openCalendar}
              className="w-full text-center py-3 sm:py-4 px-3 bg-gray-50 border-2 border-gray-200 rounded-2xl transition-all hover:border-[#ee4923] group"
            >
              <p className="font-lovelo text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-0.5">
                {format(dateObj, 'EEEE')}
              </p>
              <p className="font-bold text-base sm:text-lg text-gray-800 leading-tight">
                {format(dateObj, 'MMMM d, yyyy')}
              </p>
              <p className="text-[10px] mt-1 text-gray-400 group-hover:text-[#ee4923] transition-colors flex items-center justify-center gap-1">
                <CalendarIcon size={10} /> tap to change
              </p>
            </button>

            {/* ── Custom Calendar Dropdown ────────────────────────────────── */}
            {calendarOpen && (
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-[min(320px,calc(100vw-2rem))] bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden">
                {/* Month header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                  <button
                    type="button"
                    onClick={() => setViewMonth(v => subMonths(v, 1))}
                    aria-label="Previous month"
                    className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-[#ee4923] hover:bg-orange-50 transition-all"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="font-lovelo font-black text-sm text-gray-800 tracking-wide">
                    {format(viewMonth, 'MMMM yyyy')}
                  </span>
                  <button
                    type="button"
                    onClick={() => setViewMonth(v => addMonths(v, 1))}
                    aria-label="Next month"
                    className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-[#ee4923] hover:bg-orange-50 transition-all"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>

                {/* Day headers */}
                <div className="grid grid-cols-7 px-3 pt-3 pb-1">
                  {DAY_HEADERS.map(h => (
                    <div key={h} className="text-center text-[10px] font-black font-lovelo text-gray-400 uppercase py-1">
                      {h}
                    </div>
                  ))}
                </div>

                {/* Calendar grid */}
                <div className="grid grid-cols-7 px-3 pb-3 gap-y-1">
                  {calendarCells.map((day, idx) => {
                    if (day === null) return <div key={`empty-${idx}`} />;
                    const cellStr = format(
                      new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day),
                      'yyyy-MM-dd',
                    );
                    const isPast = cellStr < minDate;
                    const isClosed = !isPast && dateIsClosed(cellStr);
                    const isSelected = cellStr === selectedDate;
                    const isToday = cellStr === todayStr;

                    return (
                      <button
                        key={cellStr}
                        type="button"
                        disabled={isPast || isClosed}
                        title={isClosed ? closedReason(cellStr) : undefined}
                        onClick={() => selectCalendarDate(cellStr)}
                        className={`w-full aspect-square rounded-full text-sm font-bold transition-all flex items-center justify-center ${
                          isPast
                            ? 'text-gray-300 cursor-not-allowed'
                            : isClosed
                              ? 'text-red-300 line-through cursor-not-allowed'
                              : isSelected
                                ? 'text-white shadow-md'
                                : isToday
                                  ? 'border-2 border-[#ee4923] text-[#ee4923] hover:bg-orange-50'
                                  : 'text-gray-700 hover:bg-orange-50 hover:text-[#ee4923]'
                        }`}
                        style={isSelected ? {
                          background: 'linear-gradient(135deg, #ee4923 0%, #F4921F 100%)',
                        } : undefined}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* → Next day */}
          <button
            type="button"
            onClick={() => shiftDate(1)}
            aria-label="Next day"
            className="shrink-0 w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center border-2 border-gray-200 text-gray-500 bg-white hover:border-[#ee4923] hover:text-[#ee4923] active:scale-95 transition-all"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {/* ── Time Slots ───────────────────────────────────────────────────────── */}
      <div className="mb-5 sm:mb-10">
        <label className="font-lovelo flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3">
          <Clock size={14} /> {loadingSlots ? 'Checking availability...' : 'Time Slots'}
        </label>

        {dayIsClosed ? (
          <div className="text-center py-8 bg-red-50 rounded-xl border border-red-100">
            <p className="font-bold text-red-600">
              {dayLabel ? `Closed — ${dayLabel}` : 'Shop closed on this date'}
            </p>
            <p className="text-sm text-gray-500 mt-1">Use the arrows or tap the date to pick another day.</p>
          </div>
        ) : slots.length === 0 && !loadingSlots ? (
          <div className="text-center py-8 bg-gray-50 rounded-xl">
            <p className="text-gray-500">No slots available. Try another date.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {slots.map(({ time, available }) => {
              const past = isPastTime(time);
              const disabled = !available || past || loadingSlots;
              const reason = past ? 'Past' : !available ? 'Fully Booked' : null;

              return (
                <button
                  key={time}
                  type="button"
                  disabled={disabled}
                  title={reason || undefined}
                  onClick={() => { if (!disabled) setSelectedTime(time); }}
                  className={`py-3 px-2 rounded-full text-sm font-lovelo font-black border transition-all ${
                    disabled
                      ? 'bg-gray-100 text-gray-300 border-gray-100 cursor-not-allowed opacity-60'
                      : selectedTime === time
                        ? 'text-white border-transparent shadow-md'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-[#ee4923] hover:text-[#ee4923]'
                  }`}
                  style={!disabled && selectedTime === time ? {
                    background: 'linear-gradient(135deg, #ee4923 0%, #F4921F 100%)',
                    borderColor: '#ee4923',
                    boxShadow: '0 0 0 3px rgba(238,73,35,0.15)',
                  } : undefined}
                >
                  {time}
                  {reason && <span className="block text-[10px] font-normal">{reason}</span>}
                </button>
              );
            })}
          </div>
        )}
        {!dayIsClosed && dayLabel && !loadingSlots && (
          <p className="text-xs text-amber-600 mt-2 font-bold">Special hours on this date — {dayLabel}</p>
        )}
        <p className="text-xs text-gray-400 mt-2">
          * Service duration approx{' '}
          {serviceDuration >= 24
            ? `${Math.round(serviceDuration / 24)} day${serviceDuration >= 48 ? 's' : ''}`
            : `${serviceDuration}h`}
          . Unavailable slots are greyed out.
        </p>
      </div>

      {/* ── Plate Number ─────────────────────────────────────────────────────── */}
      <div className="mb-5 sm:mb-10">
        <label className="font-lovelo flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3">
          Vehicle Plate Number
        </label>
        <input
          type="text"
          required
          value={plateNumber}
          onChange={e => setPlateNumber(e.target.value.toUpperCase().replace(/[^A-Z0-9 ]/g, ''))}
          placeholder="e.g. ABC 1234"
          className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl font-bold text-lg text-gray-800 focus:outline-none focus:border-[#ee4923] focus:ring-1 focus:ring-[#ee4923] uppercase"
        />
      </div>

      <div className="flex justify-between pt-4">
        <button
          type="button"
          onClick={onBack}
          className="font-lovelo px-6 py-3 font-black text-[11px] tracking-[0.15em] uppercase text-gray-400 hover:text-gray-700 transition-colors"
        >
          BACK
        </button>
        <button
          type="button"
          onClick={handleContinue}
          disabled={!selectedDate || !selectedTime || !plateNumber.trim()}
          className="font-lovelo px-8 py-3 rounded-full font-black text-[11px] tracking-[0.15em] uppercase text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          style={selectedDate && selectedTime && plateNumber.trim() ? {
            background: 'linear-gradient(135deg, #ee4923 0%, #F4921F 100%)',
          } : { backgroundColor: '#d1d5db' }}
        >
          PROCEED
        </button>
      </div>
    </div>
  );
}
