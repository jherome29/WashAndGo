export enum ServiceCategory {
  LUBE = 'LUBE',
  GROOMING = 'GROOMING',
  COATING = 'COATING'
}

export enum VehicleSize {
  SMALL = 'SMALL',
  MEDIUM = 'MEDIUM',
  LARGE = 'LARGE',
  EXTRA_LARGE = 'EXTRA_LARGE'
}

export enum VehicleType {
  VEHICLE = 'VEHICLE',
  MOTORCYCLE = 'MOTORCYCLE'
}

export enum FuelType {
  GAS = 'GAS',
  DIESEL = 'DIESEL'
}

export enum OilType {
  REGULAR = 'REGULAR',
  SEMI_SYNTHETIC = 'SEMI_SYNTHETIC',
  FULLY_SYNTHETIC = 'FULLY_SYNTHETIC'
}

export enum LubePackageType {
  EXPRESS = 'EXPRESS',
  PREMIUM = 'PREMIUM'
}

export enum BookingStatus {
  PENDING = 'PENDING',
  PENDING_VERIFICATION = 'PENDING_VERIFICATION',
  REUPLOAD_REQUIRED = 'REUPLOAD_REQUIRED',
  REUPLOAD_SUBMITTED = 'REUPLOAD_SUBMITTED',
  CONFIRMED = 'CONFIRMED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export interface ServicePackage {
  id: string;
  category: ServiceCategory;
  name: string;
  description: string;
  durationHours: number;

  // For Grooming & Ceramic services — price varies by vehicle size
  prices: Record<VehicleSize, number>;

  // For Lube services — flat price by fuel type (no vehicle size variation)
  lubePrices?: Record<FuelType, number>;

  // Lube-specific fields
  lubePackageType?: LubePackageType;
  oilType?: OilType;

  // Ceramic-specific: Vehicle vs Motorcycle
  vehicleType?: VehicleType;

  // Whether this service uses flat pricing (lubePrices) instead of size-based pricing
  isLubeFlat?: boolean;

  // Club Wash & Go membership discount percentage tagged on this service, if any (e.g. Antibac = 50)
  membershipDiscountPct?: number;
}

export interface BookingUpdate {
  id: string;
  timestamp: string;
  message: string;
  imageUrl?: string;
  imageUrls?: string[];
}

export interface Booking {
  id: string;
  userId?: string | null;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  serviceId: string;
  serviceName: string;
  vehicleSize: VehicleSize;
  vehicleType?: VehicleType;
  fuelType?: FuelType;
  oilType?: OilType;
  date: string;
  timeSlot: string;
  totalPrice: number;
  downPaymentAmount: number;
  status: BookingStatus;
  paymentProofPath?: string;
  paymentDeclineReason?: string;
  paymentReviewedAt?: string;
  statusToken?: string;
  createdAt: number;

  // Extended admin fields
  contact?: string;
  email?: string;
  vehicleCategory?: 'Car' | 'Motorcycle';
  plateNumber?: string;
  time?: string;
  downPayment?: number;
  paymentMethod?: string;
  referenceNumber?: string;
  updates?: BookingUpdate[];
}

export interface TimeSlot {
  time: string; // "08:00 AM"
  available: boolean;
}
