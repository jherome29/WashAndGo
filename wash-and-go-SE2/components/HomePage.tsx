import { motion, useInView } from "motion/react";
import { useRef } from "react";
import {
  Car,
  Droplets,
  Award,
  DollarSign,
  Zap,
  Wrench,
  Sparkles,
  Shield,
  ChevronRight,
} from "lucide-react";
import type { ViewType } from "../App";

import hpureLogo from "../assets/hpure_logo.png";
import ppfLogo    from "../assets/ppf.png";
import iglLogo    from "../assets/unnamed.png";
import wurthLogo  from "../assets/wurth-logo.png";

/* ─── Injected styles (carousel keyframe only — Lovelo loaded globally) ─── */
const FontStyle = () => (
  <style>{`
    @keyframes ticker-ltr {
      0%   { transform: translateX(-50%); }
      100% { transform: translateX(0%);   }
    }
    .animate-ticker-ltr {
      display: flex;
      width: max-content;
      animation: ticker-ltr 28s linear infinite;
    }
    .animate-ticker-ltr:hover { animation-play-state: paused; }
  `}</style>
);

/* ─── Hero ─── */
const Hero = ({ onViewChange }: { onViewChange: (v: ViewType) => void }) => (
  <section className="relative min-h-[100dvh] flex items-center justify-center overflow-hidden bg-[#383838]">
    <div className="absolute inset-0 z-0">
      <img
        src="https://images.unsplash.com/photo-1520340356584-f9917d1eea6f?auto=format&fit=crop&q=80&w=2000"
        alt="Clean Car"
        className="w-full h-full object-cover opacity-55"
        referrerPolicy="no-referrer"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-[#383838]/80 via-black/20 to-[#383838]" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-transparent to-transparent" />
    </div>

    <div className="relative z-10 text-center px-4 max-w-4xl">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="inline-flex items-center gap-2 bg-white/8 backdrop-blur-sm border border-white/12 rounded-full px-4 py-1.5 mb-8"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-[#ee4923] animate-pulse" />
        <span className="text-gray-300 text-xs font-lovelo font-medium tracking-wider uppercase">
          Premium Auto Salon · Baliwag
        </span>
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 32 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.15, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="font-lovelo font-display text-[clamp(2.8rem,8vw,5.5rem)] font-extrabold text-white mb-6 leading-[1.05] tracking-tight"
      >
        Keep Your Car Clean
        <br />
        <span className="text-[#ee4923]">Always</span>
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.3, ease: "easeOut" }}
        className="font-lovelo text-gray-300 text-base md:text-lg mb-10 max-w-xl mx-auto leading-relaxed"
      >
        Expert detailers. Premium products. Results that last long after you drive away.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.45, ease: "backOut" }}
        className="flex flex-col sm:flex-row items-center justify-center gap-4"
      >
        <button
          onClick={() => onViewChange('CLIENT')}
          className="group bg-[#ee4923] hover:bg-[#d43d1a] text-white px-10 py-4 rounded-full font-lovelo font-display font-bold text-base transition-all duration-200 hover:scale-105 active:scale-95 shadow-xl shadow-orange-900/40 flex items-center gap-2"
        >
          Book Now
          <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-200" />
        </button>
        <button
          onClick={() => onViewChange('SERVICES')}
          className="font-lovelo text-gray-300 hover:text-white text-sm font-medium flex items-center gap-2 group transition-colors duration-200"
        >
          View Services
          <span className="w-8 h-px bg-gray-500 group-hover:bg-white group-hover:w-12 transition-all duration-300" />
        </button>
      </motion.div>
    </div>

  </section>
);

/* ─── Brand Carousel (Left → Right) ─── */
const partnerLogos = [
  { src: hpureLogo, alt: "H-Pure Lubricants" },
  { src: ppfLogo,   alt: "Prime Protection Film" },
  { src: iglLogo,   alt: "IGL Coatings" },
  { src: wurthLogo, alt: "Würth" },
];

const BrandLogos = () => (
  <div className="bg-white py-12 border-y border-gray-100 overflow-hidden">
    <p className="text-center font-lovelo text-[10px] font-semibold tracking-[0.35em] text-gray-400 uppercase mb-8">
      Our Trusted Partners
    </p>
    <div className="overflow-hidden">
      <div className="animate-ticker-ltr">
        {[...partnerLogos, ...partnerLogos, ...partnerLogos, ...partnerLogos].map((logo, i) => (
          <div key={i} className="flex items-center justify-center mx-12 md:mx-16 shrink-0 select-none">
            <img
              src={logo.src}
              alt={logo.alt}
              className="h-14 md:h-16 w-auto object-contain opacity-85 hover:opacity-100 hover:scale-105 transition-all duration-300"
            />
          </div>
        ))}
      </div>
    </div>
  </div>
);

/* ─── Services ─── */
const servicesList = [
  { icon: <Droplets />, title: "Car Wash",          desc: "Full exterior wash using premium water-drop-over technology." },
  { icon: <Wrench />,   title: "Auto Detailing",    desc: "Highly trained detailers restore your car inside and out." },
  { icon: <Zap />,      title: "Oil Change",        desc: "Fast, clean oil change using top-tier lubricants and filters." },
  { icon: <Shield />,   title: "Rust Proofing",     desc: "Chassis shield treatment that guards against rust damage." },
  { icon: <Sparkles />, title: "Ceramic Coating",   desc: "Protective ceramic layer for a long-lasting showroom finish." },
  { icon: <Car />,      title: "Interior Cleaning", desc: "Deep-clean interior refresh, fresh cabin, every time." },
];

const Services = ({ onViewChange }: { onViewChange: (v: ViewType) => void }) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section id="services" className="py-24 bg-white" ref={ref}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="mb-12"
        >
          <h2 className="font-lovelo font-display text-4xl md:text-5xl font-extrabold text-gray-900 tracking-tight mb-4" style={{ textWrap: 'balance' }}>
            Our Services
          </h2>
          <p className="font-lovelo text-gray-500 text-base max-w-lg leading-relaxed">
            From a quick exterior wash to a full ceramic treatment, pick the service that fits your vehicle.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 border-t border-gray-100">
          {servicesList.map((svc, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: idx * 0.07, ease: "easeOut" }}
              onClick={() => onViewChange('SERVICES')}
              className="group flex items-start gap-5 py-8 px-4 border-b border-gray-100 hover:bg-gray-50/70 cursor-pointer transition-colors duration-200"
            >
              <div className="w-11 h-11 rounded-xl bg-gray-100 text-gray-400 flex items-center justify-center flex-shrink-0 group-hover:bg-[#ee4923] group-hover:text-white transition-all duration-300">
                {svc.icon}
              </div>
              <div>
                <h3 className="font-lovelo text-base font-bold text-gray-900 mb-1 group-hover:text-[#ee4923] transition-colors duration-200">{svc.title}</h3>
                <p className="font-lovelo text-gray-500 text-sm leading-relaxed">{svc.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="mt-10 text-center"
        >
          <button
            onClick={() => onViewChange('SERVICES')}
            className="group font-lovelo font-bold text-sm text-gray-500 hover:text-[#ee4923] flex items-center gap-2 mx-auto transition-colors duration-200"
          >
            View all services & rates
            <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-200" />
          </button>
        </motion.div>
      </div>
    </section>
  );
};

/* ─── Why Choose Us ─── */
const features = [
  { icon: <Award className="w-5 h-5" />,      title: "Professional Staff",    desc: "Highly trained and experienced detailers who take pride in every vehicle." },
  { icon: <Droplets className="w-5 h-5" />,   title: "Premium Products",      desc: "We only use top-tier cleaning chemicals safe for all paint finishes." },
  { icon: <DollarSign className="w-5 h-5" />, title: "Affordable Packages",   desc: "Quality service that fits your budget, no hidden fees." },
  { icon: <Zap className="w-5 h-5" />,        title: "Fast & Efficient",      desc: "Get back on the road looking fresh, faster than ever." },
];

const WhyChooseUs = ({ onViewChange }: { onViewChange: (v: ViewType) => void }) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section className="relative py-24 bg-gray-50 overflow-hidden" ref={ref}>
      <div className="absolute top-0 right-0 w-[480px] h-[480px] bg-orange-100/60 rounded-full blur-[120px] -translate-y-1/3 translate-x-1/3 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[360px] h-[360px] bg-orange-50/80 rounded-full blur-[100px] translate-y-1/3 -translate-x-1/3 pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row gap-16 items-center">
          <motion.div
            className="lg:w-1/2"
            initial={{ opacity: 0, x: -28 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.7, ease: "easeOut" }}
          >
            <h2 className="font-lovelo font-display text-4xl md:text-5xl font-extrabold text-gray-900 mb-6 leading-tight tracking-tight" style={{ textWrap: 'balance' }}>
              Why Choose
              <br />
              Wash &amp; Go?
            </h2>
            <p className="font-lovelo text-gray-500 text-base mb-10 leading-relaxed max-w-md">
              We don't just wash cars. We restore them. Our commitment to excellence
              guarantees you'll drive away with a vehicle that looks, feels, and smells
              brand new.
            </p>
            <button
              onClick={() => onViewChange('CLIENT')}
              className="group bg-[#ee4923] hover:bg-[#d43d1a] text-white px-8 py-4 rounded-full font-lovelo font-display font-bold text-sm transition-all duration-200 hover:scale-105 active:scale-95 shadow-lg shadow-orange-200 flex items-center gap-2"
            >
              Book Now
              <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-200" />
            </button>
          </motion.div>

          <div className="lg:w-1/2">
            <div className="rounded-2xl overflow-hidden border border-gray-100 bg-white shadow-[0_4px_24px_rgba(0,0,0,0.04)]">
              {features.map((f, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, x: 20 }}
                  animate={isInView ? { opacity: 1, x: 0 } : {}}
                  transition={{ duration: 0.5, delay: 0.18 + idx * 0.1, ease: "easeOut" }}
                  className={`group flex items-center gap-5 px-6 py-5 hover:bg-orange-50/40 transition-colors duration-200 cursor-default${idx < features.length - 1 ? ' border-b border-gray-100' : ''}`}
                >
                  <div className="w-10 h-10 bg-orange-50 text-[#ee4923] rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-[#ee4923] group-hover:text-white transition-all duration-300">
                    {f.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-lovelo font-bold text-gray-900 text-sm mb-0.5">{f.title}</h4>
                    <p className="font-lovelo text-gray-500 text-xs leading-relaxed">{f.desc}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-200 group-hover:text-[#ee4923] flex-shrink-0 transition-colors duration-200" />
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

/* ─── How It Works — Sequential 1 → 4 ─── */
const steps = [
  { number: "01", title: "Bring Your Car",  desc: "Visit our auto salon in Baliwag" },
  { number: "02", title: "Choose Service",  desc: "Select your preferred package"   },
  { number: "03", title: "We Detail",       desc: "Our experts get to work"         },
  { number: "04", title: "Drive Happy",     desc: "Leave with a showroom shine"     },
];

const HowItWorks = () => {
  const ref = useRef(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section id="how-it-works" className="py-24 bg-[#383838] text-white" ref={ref}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <motion.h2
          initial={{ opacity: 0, y: 18 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="font-lovelo font-display text-4xl md:text-5xl font-extrabold mb-20 tracking-tight"
          style={{ textWrap: 'balance' }}
        >
          How It Works
        </motion.h2>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 relative">
          {/* Track line */}
          <div className="hidden md:block absolute top-[38px] left-[14%] right-[14%] h-px bg-white/10 z-0">
            <motion.div
              className="h-full bg-[#ee4923]"
              initial={{ scaleX: 0 }}
              animate={isInView ? { scaleX: 1 } : { scaleX: 0 }}
              transition={{ duration: 1.5, delay: 0.6, ease: [0.4, 0, 0.2, 1] }}
              style={{ transformOrigin: "left" }}
              ref={lineRef}
            />
          </div>

          {steps.map((step, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 40 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.35 + idx * 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="relative z-10 group flex flex-col items-center"
            >
              <motion.div
                initial={{ scale: 0.6, opacity: 0 }}
                animate={isInView ? { scale: 1, opacity: 1 } : {}}
                transition={{ duration: 0.5, delay: 0.4 + idx * 0.22, ease: "backOut" }}
                className="w-[76px] h-[76px] bg-[#ee4923] rounded-full flex items-center justify-center mx-auto mb-7 shadow-xl shadow-orange-900/35 group-hover:scale-110 group-hover:shadow-orange-500/50 transition-all duration-300"
              >
                <span className="font-lovelo font-display text-2xl font-extrabold text-white">{step.number}</span>
              </motion.div>
              <h3 className="font-lovelo text-base font-bold mb-2 group-hover:text-[#ee4923] transition-colors duration-200">
                {step.title}
              </h3>
              <p className="font-lovelo text-gray-400 text-sm leading-relaxed max-w-[150px] mx-auto">
                {step.desc}
              </p>
              {idx < steps.length - 1 && (
                <div className="md:hidden mt-6 w-px h-8 bg-white/10 mx-auto" />
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

/* ─── CTA Banner ─── */
const CTA = ({ onViewChange }: { onViewChange: (v: ViewType) => void }) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-60px" });

  return (
    <section className="py-20 bg-white" ref={ref}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 28, scale: 0.97 }}
          animate={isInView ? { opacity: 1, y: 0, scale: 1 } : {}}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="relative rounded-[2rem] px-8 py-16 text-center text-white overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #ee4923 0%, #F4921F 100%)' }}
        >
          <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-white/8" />
          <div className="absolute -bottom-20 -left-12 w-80 h-80 rounded-full bg-black/10" />
          <div className="relative z-10">
            <h2 className="font-lovelo font-display text-3xl md:text-[2.75rem] font-extrabold mb-3 tracking-tight leading-tight">
              Give Your Car the Care It Deserves
            </h2>
            <p className="font-lovelo text-orange-100 text-base mb-10 max-w-md mx-auto">
              Book your slot today and drive away with a showroom-fresh finish.
            </p>
            <button
              onClick={() => onViewChange('CLIENT')}
              className="group bg-white text-[#ee4923] hover:bg-[#383838] hover:text-white px-12 py-4 rounded-full font-lovelo font-display font-bold text-base transition-all duration-200 hover:scale-105 active:scale-95 shadow-xl inline-flex items-center gap-2"
            >
              Book Now
              <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-200" />
            </button>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

/* ─── Page ─── */
interface HomePageProps {
  onViewChange: (view: ViewType) => void;
}

export default function Homepage({ onViewChange }: HomePageProps) {
  return (
    <>
      <FontStyle />
      <div className="bg-white selection:bg-[#ee4923] selection:text-white scroll-smooth">
        <Hero        onViewChange={onViewChange} />
        <BrandLogos />
        <Services    onViewChange={onViewChange} />
        <WhyChooseUs onViewChange={onViewChange} />
        <HowItWorks />
        <CTA         onViewChange={onViewChange} />
      </div>
    </>
  );
}
