import React, { useState, useEffect, useRef } from 'react';
import { ServicePackage, VehicleSize, FuelType } from '../types';
import { DOWN_PAYMENT_PERCENTAGE } from '../constants';
import { CreditCard, Upload, User, Phone, Mail, UserCheck, CheckCircle, ClipboardCheck } from 'lucide-react';
import { api } from '../lib/api';
import { AppUser } from '../App';

interface PaymentMethod {
  payment_method: string;
  account_name: string;
  account_number: string;
  qr_image_path?: string;
  qr_signed_url?: string | null;
}

interface PaymentFormProps {
  service: ServicePackage;
  vehicleSize: VehicleSize;
  fuelType: FuelType | null;
  date: string;
  timeSlot: string;
  onBack: () => void;
  onSubmit: (details: { name: string; phone: string; email: string; proofPath: string; paymentMethod: string }) => void;
  submitting?: boolean;
  user?: AppUser | null;
  token?: string | null;
  isWalkIn?: boolean;
}

export default function PaymentForm({
  service, vehicleSize, fuelType, date, timeSlot,
  onBack, onSubmit, submitting, user, token, isWalkIn = false,
}: PaymentFormProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [method, setMethod] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loadingMethods, setLoadingMethods] = useState(true);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  useEffect(() => {
    api.getPaymentMethods()
      .then(methods => {
        setPaymentMethods(methods);
        if (methods.length > 0) setMethod(methods[0].payment_method);
      })
      .catch(() => {})
      .finally(() => setLoadingMethods(false));
  }, []);

  let totalPrice: number;
  if (service.isLubeFlat && service.lubePrices && fuelType) {
    totalPrice = service.lubePrices[fuelType];
  } else if (service.isLubeFlat) {
    totalPrice = Object.values(service.prices)[0];
  } else {
    totalPrice = service.prices[vehicleSize];
  }
  const downPayment = totalPrice * DOWN_PAYMENT_PERCENTAGE;

  const selectedMethod = paymentMethods.find(m => m.payment_method === method);

  const vehicleLabel = service.isLubeFlat
    ? (fuelType ?? 'N/A')
    : `${vehicleSize}${fuelType ? ` · ${fuelType}` : ''}`;

  const handleImportFromProfile = () => {
    if (!user) return;
    setName(user.name.replace(/[^a-zA-Z0-9 ]/g, ''));
    if (user.phone) setPhone(user.phone.replace(/\D/g, '').slice(0, 11));
    if (user.email) setEmail(user.email);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone) return;
    if (!isWalkIn && !proofFile) return;
    if (!user && !email) return;

    if (isWalkIn) {
      onSubmit({ name, phone, email: email || user?.email || '', proofPath: '', paymentMethod: 'walk-in' });
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      const { signedUrl, path } = await api.getSignedUploadUrl(
        proofFile!.name.replace(/\s+/g, '_'),
        undefined,
        undefined,
        token || undefined,
      );

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhrRef.current = xhr;
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
        });
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Upload failed: ${xhr.statusText}`));
        });
        xhr.addEventListener('error', () => reject(new Error('Upload error')));
        xhr.open('PUT', signedUrl);
        xhr.setRequestHeader('Content-Type', proofFile!.type || 'application/octet-stream');
        xhr.send(proofFile);
      });

      onSubmit({
        name,
        phone,
        email: email || user?.email || '',
        proofPath: path,
        paymentMethod: method,
      });
    } catch (err: any) {
      alert(`Upload failed: ${err.message}`);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  return (
    <div className="animate-fade-in grid grid-cols-1 lg:grid-cols-5 gap-8">
      {/* Booking Summary */}
      <div className="lg:col-span-2 bg-gray-50 p-6 rounded-xl h-fit border border-gray-100">
        <h3 className="text-sm font-black text-gray-400 uppercase tracking-wider mb-4">BOOKING SUMMARY</h3>
        <div className="space-y-4">
          <div>
            <span className="block text-xs text-gray-500">Service</span>
            <span className="block font-bold text-gray-900 text-lg leading-tight">{service.name}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="block text-xs text-gray-500">{service.isLubeFlat ? 'Fuel Type' : 'Vehicle'}</span>
              <span className="block font-bold text-gray-900">{vehicleLabel}</span>
            </div>
            <div>
              <span className="block text-xs text-gray-500">Schedule</span>
              <span className="block font-bold text-gray-900">{date}<br />{timeSlot}</span>
            </div>
          </div>
          <div className="border-t border-dashed border-gray-300 pt-4">
            <div className="flex justify-between mb-2">
              <span className="text-gray-600">Total Price</span>
              <span className="font-bold text-gray-900">₱{totalPrice.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center text-orange-600 bg-orange-50 p-3 rounded-lg border border-orange-100">
              <span className="font-bold text-sm">Down Payment ({(DOWN_PAYMENT_PERCENTAGE * 100).toFixed(0)}%)</span>
              <span className="font-black text-xl">₱{downPayment.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Payment Form */}
      <div className="lg:col-span-3">
        <h2 className="font-lovelo font-black text-2xl text-gray-900 mb-6">
          {isWalkIn ? 'WALK-IN BOOKING' : 'CUSTOMER & PAYMENT'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-6">

          {user && (
            <button type="button" onClick={handleImportFromProfile}
              className="font-lovelo flex items-center gap-2 text-[10px] font-black tracking-[0.15em] uppercase px-4 py-2 rounded-full border transition-colors"
              style={{ color: '#ee4923', borderColor: 'rgba(238,73,35,0.3)', backgroundColor: 'rgba(238,73,35,0.05)' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(238,73,35,0.1)')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'rgba(238,73,35,0.05)')}>
              <UserCheck size={13} /> Import from Profile
            </button>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Full Name</label>
              <div className="relative">
                <User size={16} className="absolute left-3 top-3.5 text-gray-400" />
                <input type="text" required value={name}
                  onChange={e => setName(e.target.value.replace(/[^a-zA-Z0-9 ]/g, ''))}
                  placeholder="Juan Dela Cruz"
                  className="w-full pl-10 pr-4 py-3 bg-white border border-gray-300 rounded-lg focus:outline-none focus:border-orange-500" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Phone Number</label>
              <div className="relative">
                <Phone size={16} className="absolute left-3 top-3.5 text-gray-400" />
                <input type="tel" required value={phone}
                  onChange={e => { const v = e.target.value.replace(/\D/g, ''); if (v.length <= 11) setPhone(v); }}
                  pattern="^09\d{9}$" title="Must start with 09, 11 digits"
                  placeholder="09XXXXXXXXX"
                  className="w-full pl-10 pr-4 py-3 bg-white border border-gray-300 rounded-lg focus:outline-none focus:border-orange-500" />
              </div>
            </div>
          </div>

          {/* Guest email field */}
          {!user && (
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                Email <span className="text-orange-500">*</span>
              </label>
              <p className="text-xs text-gray-400 mb-2">We'll send status updates here. Save your booking ID to check status.</p>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-3.5 text-gray-400" />
                <input type="email" required={!user} value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@email.com"
                  className="w-full pl-10 pr-4 py-3 bg-white border border-gray-300 rounded-lg focus:outline-none focus:border-orange-500" />
              </div>
            </div>
          )}

          {isWalkIn ? (
            /* Walk-in: no payment required — admin confirms on site */
            <div className="p-4 rounded-xl border border-green-200 bg-green-50 flex items-start gap-3">
              <ClipboardCheck size={20} className="text-green-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-bold text-green-800 text-sm">Walk-in Booking</p>
                <p className="text-green-700 text-xs mt-0.5">Payment collected on-site. Booking will be auto-confirmed.</p>
              </div>
            </div>
          ) : (
            <>
              {/* Payment method */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-3">Select Payment Method</label>
                {loadingMethods ? (
                  <div className="h-16 bg-gray-100 rounded-xl animate-pulse" />
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    {paymentMethods.map(m => (
                      <button type="button" key={m.payment_method}
                        onClick={() => setMethod(m.payment_method)}
                        className={`flex flex-col items-start p-4 border rounded-xl transition-all ${
                          method === m.payment_method ? 'border-orange-500 bg-orange-50' : 'border-gray-200 hover:border-gray-300'
                        }`}>
                        <div className="flex items-center gap-2">
                          <CreditCard size={18} className={method === m.payment_method ? 'text-orange-600' : 'text-gray-400'} />
                          <span className={`font-bold capitalize ${method === m.payment_method ? 'text-orange-800' : 'text-gray-700'}`}>
                            {m.payment_method}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {selectedMethod && (
                  <div className="mt-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
                    <div className="flex gap-4 items-start">
                      {selectedMethod.qr_signed_url && (
                        <img src={selectedMethod.qr_signed_url}
                          alt="QR Code" className="w-24 h-24 object-contain rounded-lg border bg-white" />
                      )}
                      <div>
                        <p className="text-sm text-gray-600">Send <strong>₱{downPayment.toLocaleString()}</strong> to:</p>
                        <p className="font-mono font-bold text-lg mt-1">{selectedMethod.account_number}</p>
                        <p className="text-gray-500 text-xs">{selectedMethod.account_name}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Proof upload */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Upload Proof of Payment</label>
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <Upload className="w-8 h-8 mb-3 text-gray-400" />
                    <p className="text-sm text-gray-500"><span className="font-semibold">Click to upload</span> screenshot</p>
                    <p className="text-xs text-gray-500">PNG, JPG (MAX. 5MB)</p>
                  </div>
                  <input type="file" className="hidden" accept="image/*"
                    onChange={(e) => setProofFile(e.target.files?.[0] || null)} />
                </label>
                {proofFile && (
                  <p className="mt-2 text-sm text-green-600 font-medium flex items-center gap-1">
                    <CheckCircle size={14} /> {proofFile.name}
                  </p>
                )}
                {uploading && (
                  <div className="mt-2">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>Uploading...</span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div className="bg-orange-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }} />
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          <div className="flex justify-between pt-6 border-t">
            <button type="button" onClick={onBack} disabled={uploading || submitting}
              className="font-lovelo px-6 py-3 font-black text-[11px] tracking-[0.15em] uppercase text-gray-400 hover:text-gray-700 transition-colors disabled:opacity-50">
              BACK
            </button>
            <button type="submit"
              disabled={!name || !phone || (!isWalkIn && !proofFile) || (!user && !email) || uploading || submitting}
              className="font-lovelo px-8 py-3 rounded-full font-black text-[11px] tracking-[0.15em] uppercase text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={name && phone && (isWalkIn || proofFile) && (user || email) && !uploading && !submitting
                ? { background: 'linear-gradient(135deg, #ee4923 0%, #F4921F 100%)' }
                : { backgroundColor: '#d1d5db' }}>
              {uploading ? `Uploading ${uploadProgress}%...` : submitting ? 'Submitting...' : isWalkIn ? 'CONFIRM WALK-IN' : 'COMPLETE BOOKING'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
