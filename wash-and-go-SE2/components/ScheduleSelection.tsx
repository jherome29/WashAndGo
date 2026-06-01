import React, { useState, useEffect } from 'react';
import { Calendar as CalendarIcon, Clock } from 'lucide-react';
import { format, addDays, startOfToday } from 'date-fns';
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

export default function ScheduleSelection({ onSelect, onBack, serviceDuration, serviceCategory, serviceId }: ScheduleSelectionProps) {
  const today = startOfToday();
  const [selectedDate, setSelectedDate] = useState<string>(format(addDays(today, 1), 'yyyy-MM-dd'));
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [plateNumber, setPlateNumber] = useState('');
  const [slots, setSlots] = useState<SlotInfo[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [dayIsClosed, setDayIsClosed] = useState(false);

  useEffect(() => {
    if (!selectedDate) return;
    setLoadingSlots(true);
    setSelectedTime('');
    api.getAvailability(selectedDate, serviceId)
      .then(res => {
        setDayIsClosed(res.closed);
        setSlots(res.slots || []);
      })
      .catch(() => {
        setDayIsClosed(false);
        setSlots([]);
      })
      .finally(() => setLoadingSlots(false));
  }, [selectedDate, serviceId]);

  const isPastTime = (time: string): boolean => {
    const todayPH = format(new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' })), 'yyyy-MM-dd');
    if (selectedDate !== todayPH) return false;
    const [timePart, period] = time.split(' ');
    let [hours, minutes] = timePart.split(':').map(Number);
    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
    const nowPH = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
    const slotPH = new Date(nowPH);
    slotPH.setHours(hours, minutes, 0, 0);
    return slotPH <= nowPH;
  };

  const handleContinue = () => {
    if (selectedDate && selectedTime && plateNumber.trim()) {
      onSelect(selectedDate, selectedTime, plateNumber.trim());
    }
  };

  return (
    <div className="animate-fade-in max-w-2xl mx-auto">
      <h2 className="font-lovelo font-black text-2xl text-gray-900 mb-8 text-center">SELECT SCHEDULE</h2>

      <div className="mb-8">
        <label className="font-lovelo flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3">
          <CalendarIcon size={14} /> Preferred Date
        </label>
        <input
          type="date"
          min={format(today, 'yyyy-MM-dd')}
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl font-bold text-lg text-gray-800 focus:outline-none focus:border-[#ee4923] focus:ring-1 focus:ring-[#ee4923] appearance-none"
        />
      </div>

      <div className="mb-10">
        <label className="font-lovelo flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3">
          <Clock size={14} /> {loadingSlots ? 'Checking availability...' : 'Time Slots'}
        </label>

        {dayIsClosed ? (
          <div className="text-center py-8 bg-red-50 rounded-xl border border-red-100">
            <p className="font-bold text-red-600">Shop closed on this date</p>
            <p className="text-sm text-gray-500 mt-1">Please select another date.</p>
          </div>
        ) : slots.length === 0 && !loadingSlots ? (
          <div className="text-center py-8 bg-gray-50 rounded-xl">
            <p className="text-gray-500">No slots available. Select another date.</p>
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
                  } : undefined}>
                  {time}
                  {reason && <span className="block text-[10px] font-normal">{reason}</span>}
                </button>
              );
            })}
          </div>
        )}
        <p className="text-xs text-gray-400 mt-2">* Service duration approx {serviceDuration}h. Unavailable slots are greyed out.</p>
      </div>

      <div className="mb-10">
        <label className="font-lovelo flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3">
          Vehicle Plate Number
        </label>
        <input
          type="text"
          required
          value={plateNumber}
          onChange={e => setPlateNumber(e.target.value.replace(/[^a-zA-Z0-9 ]/g, ''))}
          placeholder="e.g. ABC 1234"
          className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl font-bold text-lg text-gray-800 focus:outline-none focus:border-[#ee4923] focus:ring-1 focus:ring-[#ee4923] uppercase"
        />
      </div>

      <div className="flex justify-between pt-4">
        <button onClick={onBack} className="font-lovelo px-6 py-3 font-black text-[11px] tracking-[0.15em] uppercase text-gray-400 hover:text-gray-700 transition-colors">BACK</button>
        <button
          onClick={handleContinue}
          disabled={!selectedDate || !selectedTime || !plateNumber.trim()}
          className="font-lovelo px-8 py-3 rounded-full font-black text-[11px] tracking-[0.15em] uppercase text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          style={selectedDate && selectedTime && plateNumber.trim() ? {
            background: 'linear-gradient(135deg, #ee4923 0%, #F4921F 100%)',
          } : { backgroundColor: '#d1d5db' }}>
          PROCEED
        </button>
      </div>
    </div>
  );
}
