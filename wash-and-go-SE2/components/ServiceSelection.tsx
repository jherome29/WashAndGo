import React, { useMemo } from 'react';
import { SERVICES, SERVICE_ICONS } from '../constants';
import { ServicePackage, ServiceCategory, FuelType, VehicleType, VehicleSize } from '../types';
import { Bike, Fuel } from 'lucide-react';

interface ServiceSelectionProps {
  vehicleType: 'Car' | 'Motorcycle';
  vehicleSize: VehicleSize;
  fuelType: FuelType | null;
  onFuelTypeSelect: (fuelType: FuelType | null) => void;
  onSelect: (service: ServicePackage) => void;
  onBack: () => void;
  services?: ServicePackage[];
}

export default function ServiceSelection({ vehicleType, vehicleSize, fuelType, onFuelTypeSelect, onSelect, onBack, services = SERVICES }: ServiceSelectionProps) {
  const categories = vehicleType === 'Motorcycle'
    ? [ServiceCategory.COATING]
    : [ServiceCategory.LUBE, ServiceCategory.GROOMING, ServiceCategory.COATING];
  const [activeCategory, setActiveCategory] = React.useState<ServiceCategory | null>(null);

  // Filter services by category and vehicle applicability
  const subServices = useMemo(() => {
    if (!activeCategory) return [];
    let filtered = services.filter(s => s.category === activeCategory);

    // For Lube, filter out mismatched specific fuels if it's express
    if (activeCategory === ServiceCategory.LUBE && fuelType) {
      filtered = filtered.filter(s => {
        if (s.id === 'lube-express-gas' && fuelType !== FuelType.GAS) return false;
        if (s.id === 'lube-express-diesel' && fuelType !== FuelType.DIESEL) return false;
        return true;
      });
    }

    // For Ceramic and Grooming, filter by vehicle type
    if (activeCategory === ServiceCategory.COATING || activeCategory === ServiceCategory.GROOMING) {
      filtered = filtered.filter(s =>
        (vehicleType === 'Car' && s.vehicleType === VehicleType.VEHICLE) ||
        (vehicleType === 'Motorcycle' && s.vehicleType === VehicleType.MOTORCYCLE)
      );
    }

    return filtered;
  }, [activeCategory, vehicleType, fuelType, services]);

  const handleCategorySelect = (category: ServiceCategory) => {
    if (category !== ServiceCategory.LUBE) {
      onFuelTypeSelect(null);
    }
    setActiveCategory(category);
  };

  const handleBackCategory = () => {
    setActiveCategory(null);
  };

  const getExactPrice = (service: ServicePackage): number => {
    if (service.isLubeFlat && service.lubePrices && fuelType) {
      return service.lubePrices[fuelType];
    }
    if (service.isLubeFlat) {
      return Object.values(service.prices)[0];
    }
    return service.prices[vehicleSize];
  };

  // ============================================================
  // STEP 1: Category Selection
  // ============================================================
  if (!activeCategory) {
    return (
      <div className="text-center animate-fade-in max-w-4xl mx-auto">
        <h2 className="font-lovelo font-black text-2xl text-gray-900 mb-2">SELECT SERVICE</h2>
        <p className="text-gray-500 mb-4 md:mb-8">Choose a professional treatment for your machine.</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-6">
          {categories.map((cat) => {
            const Icon = SERVICE_ICONS[cat];

            return (
              <button
                key={cat}
                onClick={() => handleCategorySelect(cat)}
                className="group flex flex-col items-center justify-center p-5 md:p-10 bg-gray-50 border-2 border-transparent rounded-2xl transition-all duration-300"
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#ee4923'; e.currentTarget.style.backgroundColor = 'rgba(238,73,35,0.05)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.backgroundColor = '#f9fafb'; }}
              >
                <div className="w-12 h-12 md:w-16 md:h-16 bg-white rounded-full shadow-sm flex items-center justify-center mb-3 md:mb-6 group-hover:scale-110 transition-transform" style={{ color: '#ee4923' }}>
                  <Icon size={24} />
                </div>
                <h3 className="font-lovelo font-black text-sm md:text-base text-gray-800">
                  {cat === 'LUBE'
                    ? 'LUBE & GO'
                    : cat === 'GROOMING'
                      ? (vehicleType === 'Motorcycle' ? 'MOTORCYCLE GROOMING' : 'AUTO GROOMING')
                      : 'CERAMIC COATING'}
                </h3>
              </button>
            );
          })}
        </div>
        <div className="flex justify-start mt-8">
          <button onClick={onBack} className="font-lovelo px-6 py-3 font-black text-[11px] tracking-[0.15em] uppercase text-gray-400 hover:text-gray-700 transition-colors">
            ← BACK TO VEHICLE
          </button>
        </div>
      </div>
    );
  }

  // ============================================================
  // STEP 2: Specific Service Selection
  // ============================================================
  const Icon = activeCategory === ServiceCategory.GROOMING && vehicleType === 'Motorcycle'
    ? Bike // Use Bike icon for motorcycle grooming
    : SERVICE_ICONS[activeCategory];

  const categoryTitle = activeCategory === 'LUBE'
    ? 'LUBE & GO'
    : activeCategory === 'GROOMING'
      ? (vehicleType === 'Motorcycle' ? 'MOTORCYCLE GROOMING' : 'AUTO GROOMING')
      : 'CERAMIC COATING';

  if (activeCategory === ServiceCategory.LUBE && !fuelType) {
    return (
      <div className="animate-fade-in max-w-2xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <button onClick={handleBackCategory} className="font-lovelo text-[10px] font-black tracking-[0.15em] uppercase text-gray-400 hover:text-gray-700 transition-colors">
            ← BACK
          </button>
          <div className="flex items-center gap-2">
            <div className="text-white p-2 rounded-lg" style={{ background: 'linear-gradient(135deg, #383838 0%, #1a1a1a 100%)' }}><Fuel size={20} /></div>
            <h2 className="font-lovelo font-black text-2xl text-gray-900">LUBE & GO</h2>
          </div>
        </div>

        <p className="text-gray-500 mb-8">Select your fuel type for accurate Lube & Go pricing.</p>

        <div className="grid grid-cols-2 gap-4">
          {[FuelType.GAS, FuelType.DIESEL].map(f => (
            <button
              key={f}
              onClick={() => onFuelTypeSelect(f)}
              className="flex items-center gap-3 p-4 rounded-xl border-2 border-gray-200 bg-white hover:border-orange-500 hover:bg-orange-50 transition-all justify-center"
            >
              <Fuel size={20} className="text-gray-400" />
              <span className="font-bold text-lg text-gray-900">{f}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in max-w-4xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={handleBackCategory} className="font-lovelo text-[10px] font-black tracking-[0.15em] uppercase text-gray-400 hover:text-gray-700 transition-colors">
          ← BACK
        </button>
        <div className="flex items-center gap-2">
          <div className="text-white p-2 rounded-lg" style={{ background: 'linear-gradient(135deg, #383838 0%, #1a1a1a 100%)' }}><Icon size={20} /></div>
          <h2 className="font-lovelo font-black text-2xl text-gray-900">{categoryTitle}</h2>
        </div>
      </div>

      <p className="text-gray-500 mb-3 md:mb-8">Select a specific package.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
        {subServices.map((service) => {
          const exactPrice = getExactPrice(service);

          return (
            <div key={service.id} className="border border-gray-200 rounded-xl p-3 md:p-6 hover:shadow-lg transition-shadow bg-white flex flex-col justify-between">
              <div>
                <h3 className="text-lg md:text-xl font-bold text-gray-900 mb-1.5 md:mb-2 border-b-2 border-orange-500 pb-1.5 md:pb-2 inline-block">
                  {service.name.toUpperCase()}
                </h3>
                <p className="text-gray-600 text-xs md:text-sm mt-1.5 md:mt-2 mb-2 md:mb-4 leading-relaxed">
                  {service.description}
                </p>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  Est. Duration: {service.durationHours} hrs
                </div>
              </div>

              <div className="mt-2 md:mt-4">
                <div className="flex justify-between items-center mb-2 md:mb-4">
                  <span className="text-xs md:text-sm text-gray-500">Price for your vehicle</span>
                  <span className="text-xl md:text-2xl font-bold text-gray-900">₱{exactPrice.toLocaleString()}</span>
                </div>
                <button
                  onClick={() => onSelect(service)}
                  className="font-lovelo w-full py-2 md:py-3 rounded-full font-black text-[10px] tracking-[0.15em] uppercase text-white transition-opacity hover:opacity-90"
                  style={{ background: 'linear-gradient(135deg, #ee4923 0%, #F4921F 100%)' }}
                >
                  SELECT PACKAGE
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
