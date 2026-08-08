import { ServiceCategory, ServicePackage, VehicleSize, VehicleType, FuelType, OilType, LubePackageType } from './types';
import { Droplets, Car, ShieldCheck } from 'lucide-react';

export const DOWN_PAYMENT_PERCENTAGE = 0.30; // 30%

// ============================================================
// LUBE & GO SERVICES
// ============================================================

const LUBE_EXPRESS_GAS: ServicePackage = {
  id: 'lube-express-gas',
  category: ServiceCategory.LUBE,
  name: 'Express (Gas)',
  description: 'Engine Oil, Oil Filter, Labor, FREE Standard Car Wash. For gasoline vehicles (4 Liters).',
  durationHours: 1,
  lubePackageType: LubePackageType.EXPRESS,
  isLubeFlat: true,
  lubePrices: {
    [FuelType.GAS]: 1400,
    [FuelType.DIESEL]: 1400, // N/A but required by type
  },
  prices: {
    [VehicleSize.SMALL]: 1400,
    [VehicleSize.MEDIUM]: 1400,
    [VehicleSize.LARGE]: 1400,
    [VehicleSize.EXTRA_LARGE]: 1400,
  },
};

const LUBE_EXPRESS_DIESEL: ServicePackage = {
  id: 'lube-express-diesel',
  category: ServiceCategory.LUBE,
  name: 'Express (Diesel)',
  description: 'Engine Oil, Oil Filter, Labor, FREE Standard Car Wash. For diesel vehicles (7 Liters).',
  durationHours: 1,
  lubePackageType: LubePackageType.EXPRESS,
  isLubeFlat: true,
  lubePrices: {
    [FuelType.GAS]: 1900,
    [FuelType.DIESEL]: 1900,
  },
  prices: {
    [VehicleSize.SMALL]: 1900,
    [VehicleSize.MEDIUM]: 1900,
    [VehicleSize.LARGE]: 1900,
    [VehicleSize.EXTRA_LARGE]: 1900,
  },
};

const LUBE_PREMIUM_REGULAR: ServicePackage = {
  id: 'lube-premium-regular',
  category: ServiceCategory.LUBE,
  name: 'Premium Regular',
  description: 'Engine Oil, Oil Filter, Labor, Engine Flushing, FREE Standard Car Wash. Regular oil type.',
  durationHours: 1,
  lubePackageType: LubePackageType.PREMIUM,
  oilType: OilType.REGULAR,
  isLubeFlat: true,
  lubePrices: {
    [FuelType.GAS]: 1650,
    [FuelType.DIESEL]: 2250,
  },
  prices: {
    [VehicleSize.SMALL]: 1650,
    [VehicleSize.MEDIUM]: 1650,
    [VehicleSize.LARGE]: 1650,
    [VehicleSize.EXTRA_LARGE]: 1650,
  },
};

const LUBE_PREMIUM_SEMI_SYNTHETIC: ServicePackage = {
  id: 'lube-premium-semi-synthetic',
  category: ServiceCategory.LUBE,
  name: 'Premium Semi-Synthetic',
  description: 'Engine Oil, Oil Filter, Labor, Engine Flushing, FREE Standard Car Wash. Semi-synthetic oil.',
  durationHours: 1,
  lubePackageType: LubePackageType.PREMIUM,
  oilType: OilType.SEMI_SYNTHETIC,
  isLubeFlat: true,
  lubePrices: {
    [FuelType.GAS]: 2250,
    [FuelType.DIESEL]: 3300,
  },
  prices: {
    [VehicleSize.SMALL]: 2250,
    [VehicleSize.MEDIUM]: 2250,
    [VehicleSize.LARGE]: 2250,
    [VehicleSize.EXTRA_LARGE]: 2250,
  },
};

const LUBE_PREMIUM_FULLY_SYNTHETIC: ServicePackage = {
  id: 'lube-premium-fully-synthetic',
  category: ServiceCategory.LUBE,
  name: 'Premium Fully-Synthetic',
  description: 'Engine Oil, Oil Filter, Labor, Engine Flushing, FREE Standard Car Wash. Fully-synthetic oil.',
  durationHours: 1,
  lubePackageType: LubePackageType.PREMIUM,
  oilType: OilType.FULLY_SYNTHETIC,
  isLubeFlat: true,
  lubePrices: {
    [FuelType.GAS]: 2650,
    [FuelType.DIESEL]: 4250,
  },
  prices: {
    [VehicleSize.SMALL]: 2650,
    [VehicleSize.MEDIUM]: 2650,
    [VehicleSize.LARGE]: 2650,
    [VehicleSize.EXTRA_LARGE]: 2650,
  },
};

// ============================================================
// AUTO GROOMING SERVICES
// ============================================================

const GROOMING_INTERIOR: ServicePackage = {
  id: 'grooming-interior',
  category: ServiceCategory.GROOMING,
  name: 'Interior Detailing',
  description: 'Deep cleaning of seats, carpets, dashboard, and sanitation.',
  durationHours: 48, // 2-3 days (weather dependent, sun-dry seats)
  vehicleType: VehicleType.VEHICLE,
  prices: {
    [VehicleSize.SMALL]: 2700,
    [VehicleSize.MEDIUM]: 3700,
    [VehicleSize.LARGE]: 4500,
    [VehicleSize.EXTRA_LARGE]: 5200,
  },
};

const GROOMING_EXTERIOR: ServicePackage = {
  id: 'grooming-exterior',
  category: ServiceCategory.GROOMING,
  name: 'Exterior Detailing',
  description: 'Multi-step wash, clay bar, polish, and wax application.',
  durationHours: 48, // 2-3 days
  vehicleType: VehicleType.VEHICLE,
  prices: {
    [VehicleSize.SMALL]: 3800,
    [VehicleSize.MEDIUM]: 4800,
    [VehicleSize.LARGE]: 5800,
    [VehicleSize.EXTRA_LARGE]: 6800,
  },
};

const GROOMING_FULL: ServicePackage = {
  id: 'grooming-full',
  category: ServiceCategory.GROOMING,
  name: 'Full Detailing',
  description: 'Complete interior and exterior restoration package.',
  durationHours: 72, // 3-5 days
  vehicleType: VehicleType.VEHICLE,
  prices: {
    [VehicleSize.SMALL]: 5500,
    [VehicleSize.MEDIUM]: 7300,
    [VehicleSize.LARGE]: 8800,
    [VehicleSize.EXTRA_LARGE]: 9500,
  },
};

const GROOMING_ENGINE: ServicePackage = {
  id: 'grooming-engine',
  category: ServiceCategory.GROOMING,
  name: 'Engine Detailing',
  description: 'Thorough engine bay cleaning, degreasing, and finishing.',
  durationHours: 2,
  vehicleType: VehicleType.VEHICLE,
  prices: {
    [VehicleSize.SMALL]: 1000,
    [VehicleSize.MEDIUM]: 1250,
    [VehicleSize.LARGE]: 1500,
    [VehicleSize.EXTRA_LARGE]: 1700,
  },
};

const GROOMING_GLASS: ServicePackage = {
  id: 'grooming-glass',
  category: ServiceCategory.GROOMING,
  name: 'Glass Detailing',
  description: 'Complete glass cleaning, water spot removal, and protective coating.',
  durationHours: 1, // 30 minutes, rounded up to 1 slot
  vehicleType: VehicleType.VEHICLE,
  prices: {
    [VehicleSize.SMALL]: 2000,
    [VehicleSize.MEDIUM]: 2100,
    [VehicleSize.LARGE]: 2300,
    [VehicleSize.EXTRA_LARGE]: 2500,
  },
};

// ============================================================
// CERAMIC COATING SERVICES
// ============================================================

// --- 1 YEAR ---
const CERAMIC_1YR_VEHICLE: ServicePackage = {
  id: 'ceramic-1yr-vehicle',
  category: ServiceCategory.COATING,
  name: 'Ceramic Coating (1 Year) — Vehicle',
  description: 'Standard car wash, asphalt removal, exterior detailing, watermarks/acid rain removal, paint correction (double step buffing). 1 year protection.',
  durationHours: 72, // 3-5 days depending on vehicle size
  vehicleType: VehicleType.VEHICLE,
  prices: {
    [VehicleSize.SMALL]: 9500,
    [VehicleSize.MEDIUM]: 10500,
    [VehicleSize.LARGE]: 11500,
    [VehicleSize.EXTRA_LARGE]: 12500,
  },
};

const CERAMIC_1YR_MOTORCYCLE: ServicePackage = {
  id: 'ceramic-1yr-motorcycle',
  category: ServiceCategory.COATING,
  name: 'Ceramic Coating (1 Year) — Motorcycle',
  description: 'Standard wash, asphalt removal, detailing, watermarks/acid rain removal, paint correction. 1 year protection for motorcycles.',
  durationHours: 24, // 1-3 days
  vehicleType: VehicleType.MOTORCYCLE,
  prices: {
    [VehicleSize.SMALL]: 2750,
    [VehicleSize.MEDIUM]: 2850,
    [VehicleSize.LARGE]: 3000,
    [VehicleSize.EXTRA_LARGE]: 3250,
  },
};

// --- 3 YEARS ---
const CERAMIC_3YR_VEHICLE: ServicePackage = {
  id: 'ceramic-3yr-vehicle',
  category: ServiceCategory.COATING,
  name: 'Ceramic Coating (3 Years) — Vehicle',
  description: 'Standard car wash, asphalt removal, exterior detailing, watermarks/acid rain removal, paint correction (double step buffing). 3 years protection.',
  durationHours: 72, // 3-5 days depending on vehicle size
  vehicleType: VehicleType.VEHICLE,
  prices: {
    [VehicleSize.SMALL]: 11000,
    [VehicleSize.MEDIUM]: 12000,
    [VehicleSize.LARGE]: 13000,
    [VehicleSize.EXTRA_LARGE]: 15000,
  },
};

const CERAMIC_3YR_MOTORCYCLE: ServicePackage = {
  id: 'ceramic-3yr-motorcycle',
  category: ServiceCategory.COATING,
  name: 'Ceramic Coating (3 Years) — Motorcycle',
  description: 'Standard wash, asphalt removal, detailing, watermarks/acid rain removal, paint correction. 3 years protection for motorcycles.',
  durationHours: 24, // 1-3 days
  vehicleType: VehicleType.MOTORCYCLE,
  prices: {
    [VehicleSize.SMALL]: 3000,
    [VehicleSize.MEDIUM]: 3200,
    [VehicleSize.LARGE]: 3350,
    [VehicleSize.EXTRA_LARGE]: 3600,
  },
};

// --- 5 YEARS ---
const CERAMIC_5YR_VEHICLE: ServicePackage = {
  id: 'ceramic-5yr-vehicle',
  category: ServiceCategory.COATING,
  name: 'Ceramic Coating (5 Years) — Vehicle',
  description: 'Premium 9H ceramic protection. Standard car wash, asphalt removal, exterior detailing, watermarks/acid rain removal, paint correction (double step buffing). 5 years protection.',
  durationHours: 72, // 3-5 days depending on vehicle size
  vehicleType: VehicleType.VEHICLE,
  prices: {
    [VehicleSize.SMALL]: 14000,
    [VehicleSize.MEDIUM]: 15000,
    [VehicleSize.LARGE]: 16000,
    [VehicleSize.EXTRA_LARGE]: 18000,
  },
};

const CERAMIC_5YR_MOTORCYCLE: ServicePackage = {
  id: 'ceramic-5yr-motorcycle',
  category: ServiceCategory.COATING,
  name: 'Ceramic Coating (5 Years) — Motorcycle',
  description: 'Premium 9H ceramic protection. Standard wash, asphalt removal, detailing, watermarks/acid rain removal, paint correction. 5 years protection for motorcycles.',
  durationHours: 24, // 1-3 days
  vehicleType: VehicleType.MOTORCYCLE,
  prices: {
    [VehicleSize.SMALL]: 3300,
    [VehicleSize.MEDIUM]: 3500,
    [VehicleSize.LARGE]: 3700,
    [VehicleSize.EXTRA_LARGE]: 3900,
  },
};

// ============================================================
// EXPORTS
// ============================================================

export const SERVICES: ServicePackage[] = [
  // Lube Express
  LUBE_EXPRESS_GAS,
  LUBE_EXPRESS_DIESEL,
  // Lube Premium
  LUBE_PREMIUM_REGULAR,
  LUBE_PREMIUM_SEMI_SYNTHETIC,
  LUBE_PREMIUM_FULLY_SYNTHETIC,
  // Grooming
  GROOMING_INTERIOR,
  GROOMING_EXTERIOR,
  GROOMING_FULL,
  GROOMING_ENGINE,
  GROOMING_GLASS,
  // Ceramic Coating
  CERAMIC_1YR_VEHICLE,
  CERAMIC_1YR_MOTORCYCLE,
  CERAMIC_3YR_VEHICLE,
  CERAMIC_3YR_MOTORCYCLE,
  CERAMIC_5YR_VEHICLE,
  CERAMIC_5YR_MOTORCYCLE,
];

export const TIME_SLOTS = [
  "08:00 AM", "09:00 AM", "10:00 AM", "11:00 AM",
  "01:00 PM", "02:00 PM", "03:00 PM", "04:00 PM", "05:00 PM"
];

export const SERVICE_ICONS: Record<ServiceCategory, any> = {
  [ServiceCategory.LUBE]: Droplets,
  [ServiceCategory.GROOMING]: Car,
  [ServiceCategory.COATING]: ShieldCheck,
};

export const PAYMENT_METHODS = [
  {
    id: 'gcash',
    name: 'GCash',
    number: '0917-123-4567',
    accountName: 'Wash & Go Baliwag'
  },
  {
    id: 'bank-transfer',
    name: 'Bank Transfer',
    number: '0012-3456-7890',
    accountName: 'Wash & Go Services Inc.'
  }
];