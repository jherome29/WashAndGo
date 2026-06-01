import React, { useState } from 'react';
import { Droplets, Car, ShieldCheck, ArrowRight, CheckCircle2, Clock, Bike } from 'lucide-react';
import { SERVICES } from '../constants';
import { ServicePackage } from '../types';

interface ServicesAndRatesProps {
  onBookNow?: () => void;
  services?: ServicePackage[];
}

const SIZES = ['SMALL', 'MEDIUM', 'LARGE', 'EXTRA_LARGE'] as const;
type Size = typeof SIZES[number];

const SIZE_LABEL: Record<Size, string> = {
  SMALL: 'S',
  MEDIUM: 'M',
  LARGE: 'L',
  EXTRA_LARGE: 'XL',
};

const SIZE_FULL: Record<Size, string> = {
  SMALL: 'Hatchback',
  MEDIUM: 'Sedan / Crossover',
  LARGE: 'SUV / Van',
  EXTRA_LARGE: 'Large SUV / Truck',
};

const fmt = (n: number | undefined) =>
  n !== undefined ? `₱${n.toLocaleString()}` : '·';

function SizeLegend() {
  return (
    <div className="flex flex-wrap gap-2.5 mb-5">
      {SIZES.map(size => (
        <div key={size} className="flex items-center gap-1.5">
          <span
            className="font-lovelo font-black text-[10px] px-2 py-0.5 rounded-md text-white"
            style={{ backgroundColor: '#383838' }}
          >
            {SIZE_LABEL[size]}
          </span>
          <span className="font-lovelo text-[11px] text-gray-500">{SIZE_FULL[size]}</span>
        </div>
      ))}
    </div>
  );
}

function InclusionChips({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-2 mb-6">
      {items.map(item => (
        <span
          key={item}
          className={`font-lovelo text-[10px] font-black px-2.5 py-1 rounded-full ${
            item.startsWith('Free') || item.startsWith('★')
              ? 'text-white'
              : 'text-gray-600 bg-gray-100'
          }`}
          style={item.startsWith('Free') || item.startsWith('★') ? { backgroundColor: '#ee4923' } : {}}
        >
          {item}
        </span>
      ))}
    </div>
  );
}

export default function ServicesAndRates({ onBookNow, services = SERVICES }: ServicesAndRatesProps) {
  const [ceramicTab, setCeramicTab] = useState<'vehicle' | 'motorcycle'>('vehicle');

  const svc = (id: string): ServicePackage =>
    services.find(s => s.id === id) ?? (SERVICES.find(s => s.id === id) as ServicePackage);

  const lubeExpressGas    = svc('lube-express-gas');
  const lubeExpressDiesel = svc('lube-express-diesel');
  const lubePremRegular   = svc('lube-premium-regular');
  const lubePremSemi      = svc('lube-premium-semi-synthetic');
  const lubePremFull      = svc('lube-premium-fully-synthetic');

  const groomInterior = svc('grooming-interior');
  const groomExterior = svc('grooming-exterior');
  const groomFull     = svc('grooming-full');
  const groomEngine   = svc('grooming-engine');
  const groomGlass    = svc('grooming-glass');
  const motoRegular   = svc('moto-regular-wash');
  const motoWashWax   = svc('moto-wash-wax');

  const c1V = svc('ceramic-1yr-vehicle');
  const c3V = svc('ceramic-3yr-vehicle');
  const c5V = svc('ceramic-5yr-vehicle');
  const c1M = svc('ceramic-1yr-motorcycle');
  const c3M = svc('ceramic-3yr-motorcycle');
  const c5M = svc('ceramic-5yr-motorcycle');

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#f5f5f5' }}>

      {/* ── Hero ── */}
      <div
        className="relative overflow-hidden py-14 px-4"
        style={{ background: 'linear-gradient(135deg, #383838 0%, #1a1a1a 100%)' }}
      >
        <div
          className="absolute inset-0 opacity-5"
          style={{
            backgroundImage: 'repeating-linear-gradient(45deg, #ee4923 0, #ee4923 1px, transparent 0, transparent 50%)',
            backgroundSize: '20px 20px',
          }}
        />
        <div className="relative max-w-5xl mx-auto text-center">
          <p className="text-xs font-lovelo font-black tracking-[0.35em] uppercase mb-3" style={{ color: '#ee4923' }}>
            Wash &amp; Go Auto Salon
          </p>
          <h1 className="font-lovelo font-display text-4xl md:text-5xl font-black text-white mb-4 tracking-tight">
            Services &amp; Rates
          </h1>
          <p className="font-lovelo text-gray-300 max-w-xl mx-auto text-sm leading-relaxed">
            Premium auto care packages designed to protect, restore, and enhance your vehicle.
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-12 space-y-10">

        {/* ══ LUBE & GO ══ */}
        <section className="rounded-3xl overflow-hidden shadow-lg border border-gray-200 bg-white">
          {/* Header */}
          <div
            className="flex items-center gap-3 px-8 py-5"
            style={{ background: 'linear-gradient(135deg, #ee4923 0%, #F4921F 100%)' }}
          >
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <Droplets className="text-white w-5 h-5" />
            </div>
            <div>
              <h2 className="font-lovelo font-display text-2xl font-black text-white tracking-wide">
                LUBE &amp; GO
              </h2>
              <p className="font-lovelo text-orange-100 text-xs">Oil change &amp; maintenance services</p>
            </div>
            <div className="ml-auto flex items-center gap-1.5 bg-white/15 rounded-full px-3 py-1">
              <Clock className="w-3.5 h-3.5 text-white" />
              <span className="font-lovelo text-white text-xs font-black">~1 hr</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-gray-100">
            {/* Express */}
            <div className="p-8">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-1.5 h-5 rounded-full" style={{ backgroundColor: '#383838' }} />
                <h3 className="font-lovelo font-black text-base tracking-widest uppercase" style={{ color: '#383838' }}>
                  Express
                </h3>
              </div>
              <InclusionChips items={['Engine Oil', 'Oil Filter', 'Labor', 'Free Car Wash']} />
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: 'GAS',    sub: '4 Liters', price: fmt(lubeExpressGas?.lubePrices?.GAS    ?? lubeExpressGas?.prices?.SMALL) },
                  { label: 'DIESEL', sub: '7 Liters', price: fmt(lubeExpressDiesel?.lubePrices?.DIESEL ?? lubeExpressDiesel?.prices?.SMALL) },
                ].map(({ label, sub, price }) => (
                  <div
                    key={label}
                    className="rounded-2xl border-2 border-gray-100 hover:border-orange-200 p-5 text-center transition-all duration-200"
                  >
                    <p className="font-lovelo font-black text-sm tracking-widest mb-0.5" style={{ color: '#383838' }}>
                      {label}
                    </p>
                    <p className="font-lovelo text-gray-500 text-[10px] mb-3 uppercase tracking-wider">{sub}</p>
                    <p className="font-lovelo font-black text-3xl" style={{ color: '#ee4923' }}>{price}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Premium */}
            <div className="p-8">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-1.5 h-5 rounded-full" style={{ backgroundColor: '#ee4923' }} />
                <h3 className="font-lovelo font-black text-base tracking-widest uppercase" style={{ color: '#383838' }}>
                  Premium
                </h3>
              </div>
              <InclusionChips items={['Engine Oil', 'Oil Filter', 'Labor', 'Engine Flushing', 'Free Car Wash']} />
              <div className="overflow-hidden rounded-2xl border border-gray-100">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ backgroundColor: '#383838' }}>
                      <th className="font-lovelo p-3 text-left text-white text-xs tracking-wider font-black">Oil Type</th>
                      <th className="font-lovelo p-3 text-center text-white text-xs font-black">
                        GAS<div className="text-[9px] font-normal opacity-60">4L</div>
                      </th>
                      <th className="font-lovelo p-3 text-center text-white text-xs font-black">
                        DIESEL<div className="text-[9px] font-normal opacity-60">7L</div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {[
                      { label: 'Regular',        gas: lubePremRegular?.lubePrices?.GAS, diesel: lubePremRegular?.lubePrices?.DIESEL },
                      { label: 'Semi-Synthetic',  gas: lubePremSemi?.lubePrices?.GAS,    diesel: lubePremSemi?.lubePrices?.DIESEL },
                      { label: 'Fully-Synthetic', gas: lubePremFull?.lubePrices?.GAS,    diesel: lubePremFull?.lubePrices?.DIESEL },
                    ].map(({ label, gas, diesel }, i) => (
                      <tr key={label} className={i % 2 === 1 ? 'bg-gray-50' : 'bg-white'}>
                        <td className="font-lovelo p-3 font-bold text-xs" style={{ color: '#383838' }}>{label}</td>
                        <td className="font-lovelo p-3 text-center font-black text-sm" style={{ color: '#ee4923' }}>{fmt(gas)}</td>
                        <td className="font-lovelo p-3 text-center font-black text-sm" style={{ color: '#ee4923' }}>{fmt(diesel)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="font-lovelo text-gray-500 text-[10px] mt-3 text-center">
                ✦ Less 10% for Club Wash &amp; Go Members · Additional fee for OEM Filters
              </p>
            </div>
          </div>
        </section>

        {/* ══ AUTO GROOMING ══ */}
        <section className="rounded-3xl overflow-hidden shadow-lg border border-gray-200 bg-white">
          {/* Header */}
          <div className="flex items-center gap-3 px-8 py-5" style={{ backgroundColor: '#383838' }}>
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: 'rgba(238,73,35,0.2)' }}
            >
              <Car className="w-5 h-5" style={{ color: '#ee4923' }} />
            </div>
            <div>
              <h2 className="font-lovelo font-display text-2xl font-black text-white tracking-wide">
                AUTO GROOMING
              </h2>
              <p className="font-lovelo text-gray-400 text-xs">
                Interior · Exterior · Full · Engine · Glass · Motorcycle
              </p>
            </div>
          </div>

          {/* ─ Cars & SUVs ─ */}
          <div className="px-8 pt-7 pb-1">
            <div className="flex items-center gap-2 mb-4">
              <Car className="w-4 h-4 flex-shrink-0" style={{ color: '#383838' }} />
              <span className="font-lovelo font-black text-xs tracking-widest uppercase" style={{ color: '#383838' }}>
                Cars &amp; SUVs
              </span>
            </div>
            <SizeLegend />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: '#ee4923' }}>
                  <th className="font-lovelo p-4 text-left text-white font-black text-xs tracking-widest uppercase">
                    Service
                  </th>
                  {SIZES.map(s => (
                    <th key={s} className="font-lovelo p-4 text-center text-white font-black text-sm w-24">
                      {SIZE_LABEL[s]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[
                  { label: 'Interior Detailing', pkg: groomInterior, note: 'price starts at', duration: '3h' },
                  { label: 'Exterior Detailing', pkg: groomExterior, duration: '3h' },
                  { label: 'Full Detailing',      pkg: groomFull,    best: true, duration: '6h' },
                  { label: 'Engine Detailing',    pkg: groomEngine,  duration: '2h' },
                  { label: 'Glass Detailing',     pkg: groomGlass,   duration: '2h' },
                ].map(({ label, pkg, note, best, duration }, i) => (
                  <tr
                    key={label}
                    className={`transition-colors hover:bg-orange-50 ${i % 2 === 1 ? 'bg-gray-50/60' : 'bg-white'}`}
                  >
                    <td className="p-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-lovelo font-bold text-xs" style={{ color: '#383838' }}>{label}</span>
                        {note && (
                          <span className="font-lovelo text-gray-500 text-[10px]">{note}</span>
                        )}
                        {best && (
                          <span
                            className="font-lovelo text-[9px] font-black text-white px-2 py-0.5 rounded-full"
                            style={{ backgroundColor: '#ee4923' }}
                          >
                            BEST VALUE
                          </span>
                        )}
                        <span className="font-lovelo text-[10px] text-gray-400 flex items-center gap-0.5 ml-auto">
                          <Clock className="w-3 h-3" />{duration}
                        </span>
                      </div>
                    </td>
                    {SIZES.map(size => (
                      <td
                        key={size}
                        className={`p-4 text-center font-lovelo font-black text-sm ${best ? '' : 'text-gray-700'}`}
                        style={best ? { color: '#ee4923' } : {}}
                      >
                        {fmt(pkg?.prices?.[size as keyof typeof pkg.prices])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ─ Motorcycles ─ */}
          <div className="px-8 pt-6 pb-2 border-t border-gray-100 mt-4">
            <div className="flex items-center gap-2 mb-4">
              <Bike className="w-4 h-4 flex-shrink-0" style={{ color: '#383838' }} />
              <span className="font-lovelo font-black text-xs tracking-widest uppercase" style={{ color: '#383838' }}>
                Motorcycles
              </span>
            </div>
            <div className="flex flex-wrap gap-2.5 mb-5">
              {(['SMALL', 'MEDIUM', 'LARGE', 'EXTRA_LARGE'] as const).map((size, i) => (
                <div key={size} className="flex items-center gap-1.5">
                  <span
                    className="font-lovelo font-black text-[10px] px-2 py-0.5 rounded-md text-white"
                    style={{ backgroundColor: '#383838' }}
                  >
                    {SIZE_LABEL[size]}
                  </span>
                  <span className="font-lovelo text-[11px] text-gray-500">
                    {['Scooter / 150cc', 'Standard 250cc', 'Sport 400cc', 'Big Bike 600cc+'][i]}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto pb-6">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: '#383838' }}>
                  <th className="font-lovelo p-4 text-left text-white font-black text-xs tracking-widest uppercase">
                    Service
                  </th>
                  {SIZES.map(s => (
                    <th key={s} className="font-lovelo p-4 text-center text-white font-black text-sm w-24">
                      {SIZE_LABEL[s]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[
                  { label: 'Regular Carwash',   pkg: motoRegular, desc: 'Wash · Degrease · Tire Black' },
                  { label: 'Carwash with Wax',  pkg: motoWashWax, desc: 'Wash · Degrease · Tire Black · Wax', best: true },
                ].map(({ label, pkg, desc, best }, i) => (
                  <tr
                    key={label}
                    className={`transition-colors hover:bg-orange-50 ${i % 2 === 1 ? 'bg-gray-50/60' : 'bg-white'}`}
                  >
                    <td className="p-4">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-lovelo font-bold text-xs" style={{ color: '#383838' }}>{label}</span>
                        {best && (
                          <span
                            className="font-lovelo text-[9px] font-black text-white px-2 py-0.5 rounded-full"
                            style={{ backgroundColor: '#ee4923' }}
                          >
                            POPULAR
                          </span>
                        )}
                      </div>
                      <p className="font-lovelo text-[10px] text-gray-500">{desc}</p>
                    </td>
                    {SIZES.map(size => (
                      <td
                        key={size}
                        className={`p-4 text-center font-lovelo font-black text-sm ${best ? '' : 'text-gray-700'}`}
                        style={best ? { color: '#ee4923' } : {}}
                      >
                        {fmt(pkg?.prices?.[size as keyof typeof pkg.prices])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ══ CERAMIC COATING ══ */}
        <section className="rounded-3xl overflow-hidden shadow-lg border border-gray-200 bg-white">
          {/* Header */}
          <div
            className="flex items-center gap-3 px-8 py-5"
            style={{ background: 'linear-gradient(135deg, #ee4923 0%, #F4921F 100%)' }}
          >
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <ShieldCheck className="text-white w-5 h-5" />
            </div>
            <div>
              <h2 className="font-lovelo font-display text-2xl font-black text-white tracking-wide">
                CERAMIC COATING
              </h2>
              <p className="font-lovelo text-orange-100 text-xs">Long-term paint protection</p>
            </div>
          </div>

          {/* Inclusions */}
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
            <p className="font-lovelo text-[10px] font-black tracking-widest uppercase text-gray-500 mb-2.5">
              Every Package Includes
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                'Standard Car Wash',
                'Asphalt Removal',
                'Exterior Detailing',
                'Watermarks / Acid Rain Removal',
                'Paint Correction',
              ].map(item => (
                <span
                  key={item}
                  className="font-lovelo text-[10px] font-black text-gray-600 bg-white border border-gray-200 px-2.5 py-1 rounded-full"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>

          {/* Vehicle / Motorcycle tab */}
          <div className="flex border-b border-gray-100">
            {(['vehicle', 'motorcycle'] as const).map(tab => {
              const active = ceramicTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => setCeramicTab(tab)}
                  className="flex-1 flex items-center justify-center gap-2 py-4 font-lovelo font-black text-xs tracking-widest uppercase transition-all duration-200"
                  style={{
                    color: active ? '#ee4923' : '#9ca3af',
                    borderBottom: active ? '2px solid #ee4923' : '2px solid transparent',
                    backgroundColor: active ? 'rgba(238,73,35,0.04)' : 'transparent',
                  }}
                >
                  {tab === 'vehicle'
                    ? <Car className="w-3.5 h-3.5" />
                    : <Bike className="w-3.5 h-3.5" />}
                  {tab === 'vehicle' ? 'Car / SUV' : 'Motorcycle'}
                </button>
              );
            })}
          </div>

          {/* Size legend */}
          <div className="px-8 pt-5 pb-0">
            {ceramicTab === 'vehicle' ? (
              <SizeLegend />
            ) : (
              <div className="flex flex-wrap gap-2.5 mb-5">
                {(['SMALL', 'MEDIUM', 'LARGE', 'EXTRA_LARGE'] as const).map((size, i) => (
                  <div key={size} className="flex items-center gap-1.5">
                    <span
                      className="font-lovelo font-black text-[10px] px-2 py-0.5 rounded-md text-white"
                      style={{ backgroundColor: '#383838' }}
                    >
                      {SIZE_LABEL[size]}
                    </span>
                    <span className="font-lovelo text-[11px] text-gray-500">
                      {['Scooter / 150cc', 'Standard 250cc', 'Sport 400cc', 'Big Bike 600cc+'][i]}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pricing table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs md:text-sm">
              <thead>
                <tr style={{ backgroundColor: '#383838' }}>
                  <th className="font-lovelo p-3 text-left text-white font-black tracking-wider">Protection</th>
                  {SIZES.map(s => (
                    <th key={s} className="font-lovelo p-3 text-center text-white font-black">
                      {SIZE_LABEL[s]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(ceramicTab === 'vehicle'
                  ? [
                      { label: '1 Year',  pkg: c1V },
                      { label: '3 Years', pkg: c3V },
                      { label: '5 Years', pkg: c5V, best: true },
                    ]
                  : [
                      { label: '1 Year',  pkg: c1M },
                      { label: '3 Years', pkg: c3M },
                      { label: '5 Years', pkg: c5M, best: true },
                    ]
                ).map(({ label, pkg, best }) => (
                  <tr
                    key={label}
                    className={`hover:bg-orange-50 transition-colors ${best ? 'bg-orange-50/40' : ''}`}
                  >
                    <td className="p-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        {best && (
                          <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#ee4923' }} />
                        )}
                        <span
                          className="font-lovelo font-black text-sm"
                          style={{ color: best ? '#ee4923' : '#383838' }}
                        >
                          {label}
                        </span>
                        {best && (
                          <span
                            className="font-lovelo text-[9px] font-black text-white px-2 py-0.5 rounded-full"
                            style={{ backgroundColor: '#ee4923' }}
                          >
                            BEST VALUE
                          </span>
                        )}
                      </div>
                    </td>
                    {SIZES.map(size => (
                      <td
                        key={size}
                        className="font-lovelo p-4 text-center font-black text-sm"
                        style={{ color: best ? '#ee4923' : '#383838' }}
                      >
                        {fmt(pkg?.prices?.[size as keyof typeof pkg.prices])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-6 py-3 text-center" style={{ backgroundColor: '#383838' }}>
            <p className="font-lovelo text-gray-400 text-[10px]">
              ✦ Less 10% discount for Club Wash &amp; Go Members only
            </p>
          </div>
        </section>

        {/* ══ CTA ══ */}
        {onBookNow && (
          <section
            className="relative overflow-hidden rounded-3xl p-12 text-center shadow-xl"
            style={{ background: 'linear-gradient(135deg, #ee4923 0%, #F4921F 100%)' }}
          >
            <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-white/8" />
            <div className="absolute -bottom-16 -left-10 w-64 h-64 rounded-full bg-black/10" />
            <div className="relative z-10">
              <h3 className="font-lovelo text-3xl font-black text-white mb-2">Ready to Book?</h3>
              <p className="font-lovelo text-orange-100 text-sm mb-8 max-w-md mx-auto">
                Give your car the premium care it deserves. Book your service now.
              </p>
              <button
                onClick={onBookNow}
                className="group inline-flex items-center gap-2.5 bg-white font-lovelo font-black text-base py-4 px-10 rounded-2xl hover:bg-gray-900 hover:text-white transition-all duration-200 shadow-lg hover:shadow-xl hover:-translate-y-0.5"
                style={{ color: '#ee4923' }}
              >
                Book a Service Now
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-200" />
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
