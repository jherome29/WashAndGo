import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Booking, ServicePackage, VehicleSize, FuelType, ServiceCategory } from '../types';
import ServiceSelection from './ServiceSelection';
import VehicleSelection from './VehicleSelection';
import ScheduleSelection from './ScheduleSelection';
import PaymentForm from './PaymentForm';
import { api } from '../lib/api';
import { SERVICES } from '../constants';
import { AppUser } from '../App';
import { Check, Fuel, Copy, CheckCircle } from 'lucide-react';

interface BookingWizardProps {
  onSubmit: (booking: Booking) => void;
  token: string | null;
  services?: ServicePackage[];
  user?: AppUser | null;
}

// 5 steps when LUBE selected (adds fuel type step), 4 otherwise
type Step = 1 | 2 | 3 | 4 | 5;

export default function BookingWizard({ onSubmit, token, services = SERVICES, user }: BookingWizardProps) {
  const [step, setStep] = useState<Step>(1);
  const [direction, setDirection] = useState(1);

  const [vehicleType, setVehicleType] = useState<'Car' | 'Motorcycle' | null>(null);
  const [vehicleSize, setVehicleSize] = useState<VehicleSize | null>(null);
  const [fuelType, setFuelType] = useState<FuelType | null>(null);
  const [selectedService, setSelectedService] = useState<ServicePackage | null>(null);
  const [date, setDate] = useState('');
  const [timeSlot, setTimeSlot] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Token modal state
  const [successToken, setSuccessToken] = useState<string | null>(null);
  const [successBookingId, setSuccessBookingId] = useState<string | null>(null);
  const [tokenCopied, setTokenCopied] = useState(false);

  const isLube = selectedService?.category === ServiceCategory.LUBE;
  const totalSteps = isLube ? 5 : 4;

  const goTo = (s: Step) => {
    setDirection(s > step ? 1 : -1);
    setStep(s);
  };

  const handleVehicleSelect = (type: 'Car' | 'Motorcycle', size: VehicleSize) => {
    setVehicleType(type);
    setVehicleSize(size);
    // Motorcycles always GAS, reset for cars (chosen in fuel step if LUBE)
    if (type === 'Motorcycle') setFuelType(FuelType.GAS);
    else setFuelType(null);
    goTo(2);
  };

  const handleServiceSelect = (service: ServicePackage) => {
    setSelectedService(service);
    if (service.category === ServiceCategory.LUBE && vehicleType === 'Car' && !fuelType) {
      goTo(3); // Fuel type step — only if not already selected in ServiceSelection
    } else {
      if (service.category !== ServiceCategory.LUBE) setFuelType(null);
      goTo(4); // Skip to schedule
    }
  };

  const handleFuelSelect = (fuel: FuelType) => {
    setFuelType(fuel);
    goTo(4);
  };

  const handleScheduleSelect = (dateStr: string, timeStr: string, plate: string) => {
    setDate(dateStr);
    setTimeSlot(timeStr);
    setPlateNumber(plate);
    goTo(isLube ? 5 : 4 as Step);
  };

  const handleBack = () => {
    if (step === 1) return;
    if (step === 4 && isLube && vehicleType === 'Car') goTo(3);
    else if (step === 4 && (!isLube || vehicleType === 'Motorcycle')) goTo(2);
    else if (step === (isLube ? 5 : 4) as Step) goTo(4);
    else goTo((step - 1) as Step);
  };

  const calculatePrice = (): number => {
    if (!selectedService || !vehicleSize) return 0;
    if (selectedService.isLubeFlat && selectedService.lubePrices && fuelType) return selectedService.lubePrices[fuelType];
    if (selectedService.isLubeFlat) return Object.values(selectedService.prices)[0] as number;
    return selectedService.prices[vehicleSize];
  };

  const handleFinalSubmit = async (customerDetails: { name: string; phone: string; email: string; proofPath: string; paymentMethod: string }) => {
    if (!selectedService || !vehicleSize || !date || !timeSlot) return;
    setSubmitting(true);
    try {
      const booking = await api.createBooking({
        customerName: customerDetails.name,
        customerPhone: customerDetails.phone,
        customerEmail: customerDetails.email || undefined,
        serviceId: selectedService.id,
        vehicleSize,
        vehicleType: vehicleType === 'Car' ? 'VEHICLE' : 'MOTORCYCLE',
        fuelType: isLube ? fuelType || undefined : undefined,
        oilType: (selectedService as any).oilType || undefined,
        date,
        timeSlot,
        plateNumber,
        paymentProofPath: customerDetails.proofPath,
        paymentMethod: customerDetails.paymentMethod,
      }, token || undefined);

      if (booking.statusToken && !user) {
        setSuccessToken(booking.statusToken);
        setSuccessBookingId(booking.id);
      }

      onSubmit(booking);
      resetForm();
    } catch (err: any) {
      alert(`Booking failed: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setStep(1);
    setVehicleType(null);
    setVehicleSize(null);
    setFuelType(null);
    setSelectedService(null);
    setDate('');
    setTimeSlot('');
    setPlateNumber('');
  };

  const copyToken = () => {
    if (successToken) {
      navigator.clipboard.writeText(successToken);
      setTokenCopied(true);
      setTimeout(() => setTokenCopied(false), 2000);
    }
  };

  // Build step labels dynamically
  const STEPS = isLube && vehicleType === 'Car'
    ? [
        { num: 1 as Step, label: 'Vehicle', sub: 'Type & size' },
        { num: 2 as Step, label: 'Service', sub: 'Choose package' },
        { num: 3 as Step, label: 'Fuel', sub: 'Gas or Diesel' },
        { num: 4 as Step, label: 'Schedule', sub: 'Date & time' },
        { num: 5 as Step, label: 'Payment', sub: 'Confirm & pay' },
      ]
    : [
        { num: 1 as Step, label: 'Vehicle', sub: 'Type & size' },
        { num: 2 as Step, label: 'Service', sub: 'Choose package' },
        { num: 4 as Step, label: 'Schedule', sub: 'Date & time' },
        { num: (isLube ? 5 : 4) as Step, label: 'Payment', sub: 'Confirm & pay' },
      ];

  const currentStepMeta = STEPS.find(s => s.num === step) || STEPS[0];
  const displayStep = STEPS.findIndex(s => s.num === step) + 1;

  const variants = {
    enter: (dir: number) => ({ x: dir > 0 ? 60 : -60, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir > 0 ? -60 : 60, opacity: 0 }),
  };

  return (
    <>
      {/* Token success modal for guests */}
      {successToken && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="rounded-2xl max-w-md w-full shadow-2xl overflow-hidden">
            {/* Dark branded header */}
            <div className="px-8 py-6 flex items-center gap-3" style={{ background: 'linear-gradient(135deg, #383838 0%, #1a1a1a 100%)' }}>
              <CheckCircle style={{ color: '#ee4923' }} size={24} />
              <h3 className="font-lovelo font-black text-lg text-white">Booking Submitted!</h3>
            </div>
            {/* Body */}
            <div className="bg-white px-8 py-6">
              <p className="text-gray-600 mb-1 text-sm">Your Booking ID: <strong style={{ color: '#ee4923' }}>{successBookingId}</strong></p>
              <p className="text-gray-500 mb-4 text-sm">Save this status token — you'll need it to check your booking:</p>
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-5">
                <p className="font-mono text-xs break-all text-gray-700">{successToken}</p>
              </div>
              <button onClick={copyToken}
                className="font-lovelo w-full flex items-center justify-center gap-2 py-3 rounded-full font-black text-[11px] tracking-[0.15em] uppercase text-white transition-opacity hover:opacity-90 mb-3"
                style={{ background: 'linear-gradient(135deg, #ee4923 0%, #F4921F 100%)' }}>
                <Copy size={14} />
                {tokenCopied ? 'Copied!' : 'Copy Token'}
              </button>
              <button onClick={() => { setSuccessToken(null); setSuccessBookingId(null); }}
                className="w-full py-2 text-xs text-gray-400 hover:text-gray-600 transition-colors">
                I've saved it, close this
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="min-h-screen" style={{ backgroundColor: '#f5f5f5' }}>
        {/* Branded stepper header */}
        <div className="relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #383838 0%, #1a1a1a 100%)' }}>
          <div className="absolute inset-0 opacity-5"
            style={{ backgroundImage: 'repeating-linear-gradient(45deg, #ee4923 0, #ee4923 1px, transparent 0, transparent 50%)', backgroundSize: '20px 20px' }} />
          <div className="relative max-w-2xl mx-auto px-6 py-8">
            <div className="text-center mb-6">
              <p className="font-lovelo text-[10px] font-black tracking-[0.3em] uppercase mb-1" style={{ color: '#ee4923' }}>
                Step {displayStep} of {totalSteps}
              </p>
              <h2 className="font-lovelo font-display font-black text-lg text-white">{currentStepMeta.label}</h2>
              <p className="font-lovelo text-gray-400 text-xs mt-0.5" style={{ fontWeight: 300 }}>{currentStepMeta.sub}</p>
            </div>

            {/* Progress track */}
            <div className="relative">
              <div className="absolute top-5 left-0 right-0 h-px" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }} />
              <div className="absolute top-5 left-0 h-px transition-all duration-500 ease-out"
                style={{ width: `${((displayStep - 1) / (totalSteps - 1)) * 100}%`, background: 'linear-gradient(90deg, #ee4923, #F4921F)' }} />

              <div className="flex justify-between relative">
                {STEPS.map((s, i) => {
                  const done = displayStep > i + 1;
                  const current = step === s.num;
                  return (
                    <div key={`${s.num}-${i}`} className="flex flex-col items-center">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center font-lovelo font-black text-sm transition-all duration-300"
                        style={done
                          ? { background: 'linear-gradient(135deg, #ee4923, #F4921F)', color: '#fff' }
                          : current
                          ? { background: '#fff', color: '#ee4923', boxShadow: '0 0 0 4px rgba(238,73,35,0.25)' }
                          : { backgroundColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.3)', border: '1px solid rgba(255,255,255,0.12)' }
                        }>
                        {done ? <Check className="w-4 h-4" /> : i + 1}
                      </div>
                      <p className="font-lovelo font-black text-[9px] tracking-[0.15em] uppercase mt-2 transition-colors duration-300"
                        style={{ color: done || current ? '#ee4923' : 'rgba(255,255,255,0.25)' }}>
                        {s.label}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Content card */}
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 md:p-8 overflow-hidden">
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={step}
                custom={direction}
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.22, ease: 'easeInOut' }}>
                {step === 1 && (
                  <VehicleSelection onSelect={handleVehicleSelect} />
                )}

                {step === 2 && vehicleType && vehicleSize && (
                  <ServiceSelection
                    vehicleType={vehicleType}
                    vehicleSize={vehicleSize}
                    fuelType={fuelType}
                    onFuelTypeSelect={setFuelType}
                    onSelect={handleServiceSelect}
                    onBack={handleBack}
                    services={services}
                  />
                )}

                {step === 3 && isLube && vehicleType === 'Car' && (
                  <FuelTypeStep
                    fuelType={fuelType}
                    onSelect={handleFuelSelect}
                    onBack={handleBack}
                  />
                )}

                {step === 4 && (
                  <ScheduleSelection
                    onSelect={handleScheduleSelect}
                    onBack={handleBack}
                    serviceDuration={selectedService?.durationHours || 1}
                    serviceCategory={selectedService?.category}
                    serviceId={selectedService?.id}
                  />
                )}

                {(step === 5 || (!isLube && step === 4)) && selectedService && vehicleSize && (
                  <PaymentForm
                    service={selectedService}
                    vehicleSize={vehicleSize}
                    fuelType={fuelType}
                    date={date}
                    timeSlot={timeSlot}
                    onBack={handleBack}
                    onSubmit={handleFinalSubmit}
                    submitting={submitting}
                    user={user}
                    token={token}
                    isWalkIn={user?.isStaff === true}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </>
  );
}

function FuelTypeStep({
  fuelType,
  onSelect,
  onBack,
}: {
  fuelType: FuelType | null;
  onSelect: (f: FuelType) => void;
  onBack: () => void;
}) {
  const [selected, setSelected] = useState<FuelType | null>(fuelType);

  return (
    <div className="animate-fade-in max-w-2xl mx-auto space-y-8">
      <div className="text-center">
        <h2 className="font-lovelo font-black text-2xl text-gray-900 mb-2">FUEL TYPE</h2>
        <p className="text-gray-500">Required for accurate lube service pricing.</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {[FuelType.GAS, FuelType.DIESEL].map(f => (
          <button key={f} onClick={() => setSelected(f)}
            className="flex items-center gap-3 p-6 rounded-2xl border-2 transition-all justify-center"
            style={selected === f ? {
              borderColor: '#ee4923',
              backgroundColor: 'rgba(238,73,35,0.05)',
              boxShadow: '0 0 0 3px rgba(238,73,35,0.12)',
            } : { borderColor: '#e5e7eb', backgroundColor: '#fff' }}>
            <Fuel size={24} style={{ color: selected === f ? '#ee4923' : '#9ca3af' }} />
            <span className={`font-lovelo font-black text-xl`} style={{ color: selected === f ? '#ee4923' : '#111827' }}>{f}</span>
          </button>
        ))}
      </div>

      <div className="flex justify-between pt-4">
        <button onClick={onBack} className="font-lovelo px-6 py-3 font-black text-[11px] tracking-[0.15em] uppercase text-gray-400 hover:text-gray-700 transition-colors">BACK</button>
        <button onClick={() => selected && onSelect(selected)} disabled={!selected}
          className="font-lovelo px-8 py-3 rounded-full font-black text-[11px] tracking-[0.15em] uppercase text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          style={selected ? { background: 'linear-gradient(135deg, #ee4923 0%, #F4921F 100%)' } : { backgroundColor: '#d1d5db' }}>
          NEXT: SCHEDULE
        </button>
      </div>
    </div>
  );
}
