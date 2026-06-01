import React, { useState } from 'react';
import { VehicleSize } from '../types';
import { Car, Bike, ChevronRight } from 'lucide-react';

interface VehicleSelectionProps {
  onSelect: (type: 'Car' | 'Motorcycle', size: VehicleSize) => void;
}

const carSizes = [
  { id: VehicleSize.SMALL,       label: 'Small',       desc: 'Sedan · Hatchback' },
  { id: VehicleSize.MEDIUM,      label: 'Medium',      desc: 'Compact SUV · Crossover' },
  { id: VehicleSize.LARGE,       label: 'Large',       desc: 'SUV · Pick-up · Van' },
  { id: VehicleSize.EXTRA_LARGE, label: 'Extra Large', desc: 'Full-size Van · L300' },
];

const motoSizes = [
  { id: VehicleSize.SMALL,       label: 'Small',       desc: 'Scooter · Underbone' },
  { id: VehicleSize.MEDIUM,      label: 'Medium',      desc: 'Standard · Sport 250cc' },
  { id: VehicleSize.LARGE,       label: 'Large',       desc: 'Touring · Adventure' },
  { id: VehicleSize.EXTRA_LARGE, label: 'Extra Large', desc: 'Big Bike · Heavy Touring' },
];

export default function VehicleSelection({ onSelect }: VehicleSelectionProps) {
  const [vehicleType, setVehicleType] = useState<'Car' | 'Motorcycle' | null>(null);
  const [vehicleSize, setVehicleSize] = useState<VehicleSize | null>(null);

  const sizeOptions = vehicleType === 'Motorcycle' ? motoSizes : carSizes;

  const handleTypeSelect = (type: 'Car' | 'Motorcycle') => {
    setVehicleType(type);
    setVehicleSize(null);
  };

  const handleContinue = () => {
    if (vehicleType && vehicleSize) onSelect(vehicleType, vehicleSize);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="text-center">
        <h2 className="font-lovelo font-black text-2xl tracking-tight mb-1.5" style={{ color: '#383838' }}>
          Select Your Vehicle
        </h2>
        <p className="font-lovelo text-gray-500 text-sm">Tell us what you drive so we can price accurately.</p>
      </div>

      {/* Vehicle type */}
      <div>
        <p className="font-lovelo text-[10px] font-black tracking-[0.2em] uppercase text-gray-400 mb-3">
          Vehicle Type
        </p>
        <div className="grid grid-cols-2 gap-4">
          {([
            { type: 'Car' as const,        icon: Car,  label: 'Car / SUV / Van' },
            { type: 'Motorcycle' as const, icon: Bike, label: 'Motorcycle' },
          ]).map(({ type, icon: Icon, label }) => {
            const active = vehicleType === type;
            return (
              <button
                key={type}
                onClick={() => handleTypeSelect(type)}
                className="flex flex-col items-center justify-center gap-3 p-6 rounded-2xl border-2 transition-all duration-200"
                style={{
                  borderColor: active ? '#ee4923' : '#e5e7eb',
                  backgroundColor: active ? 'rgba(238,73,35,0.05)' : '#ffffff',
                  boxShadow: active ? '0 0 0 3px rgba(238,73,35,0.12)' : 'none',
                }}
              >
                <Icon
                  size={32}
                  style={{ color: active ? '#ee4923' : '#9ca3af' }}
                />
                <span
                  className="font-lovelo font-black text-sm tracking-wide"
                  style={{ color: active ? '#ee4923' : '#383838' }}
                >
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Vehicle size */}
      {vehicleType && (
        <div>
          <p className="font-lovelo text-[10px] font-black tracking-[0.2em] uppercase text-gray-400 mb-3">
            Vehicle Size
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {sizeOptions.map((s) => {
              const active = vehicleSize === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setVehicleSize(s.id)}
                  className="flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all duration-200"
                  style={{
                    borderColor: active ? '#ee4923' : '#e5e7eb',
                    backgroundColor: active ? 'rgba(238,73,35,0.05)' : '#ffffff',
                    boxShadow: active ? '0 0 0 3px rgba(238,73,35,0.12)' : 'none',
                  }}
                >
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0 transition-all duration-200"
                    style={{
                      backgroundColor: active ? '#ee4923' : '#e5e7eb',
                      boxShadow: active ? '0 0 0 3px rgba(238,73,35,0.2)' : 'none',
                    }}
                  />
                  <div className="min-w-0">
                    <span
                      className="font-lovelo font-black text-sm block"
                      style={{ color: active ? '#ee4923' : '#383838' }}
                    >
                      {s.label}
                    </span>
                    <span className="font-lovelo text-gray-500 text-xs">{s.desc}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex justify-end pt-2">
        <button
          onClick={handleContinue}
          disabled={!vehicleType || !vehicleSize}
          className="group font-lovelo font-black text-sm tracking-wider uppercase flex items-center gap-2 px-8 py-3.5 rounded-full text-white transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed hover:scale-105 active:scale-95"
          style={{
            background: vehicleType && vehicleSize
              ? 'linear-gradient(135deg, #ee4923 0%, #F4921F 100%)'
              : '#d1d5db',
            boxShadow: vehicleType && vehicleSize ? '0 4px 14px rgba(238,73,35,0.35)' : 'none',
          }}
        >
          Next: Select Service
          <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-200" />
        </button>
      </div>
    </div>
  );
}
