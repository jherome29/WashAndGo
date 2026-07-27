import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard, LogIn, LogOut, UserCircle2,
  Menu, X, Home, CalendarCheck, ClipboardList,
  SearchCheck, ChevronRight,
} from 'lucide-react';
import logo from '../assets/wash and go logo.png';
import type { ViewType, AppUser } from '../App';
import { useAuth } from '../context/AuthContext';

interface NavbarProps {
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
  onLogout: () => void;
}

const navLinks: { label: string; view: ViewType; icon: React.ReactNode }[] = [
  { label: 'HOME',              view: 'HOME',     icon: <Home className="w-3.5 h-3.5" /> },
  { label: 'BOOK NOW',          view: 'CLIENT',   icon: <CalendarCheck className="w-3.5 h-3.5" /> },
  { label: 'SERVICES & RATES',  view: 'SERVICES', icon: <ClipboardList className="w-3.5 h-3.5" /> },
  { label: 'MY BOOKINGS',       view: 'STATUS',   icon: <SearchCheck className="w-3.5 h-3.5" /> },
];

function displayLabelFor(view: ViewType, label: string, user: AppUser | null): string {
  return view === 'STATUS' ? (user ? 'MY BOOKINGS' : 'CHECK STATUS') : label;
}

interface NavSectionProps {
  currentView: ViewType;
  user: AppUser | null;
  onNav: (view: ViewType) => void;
}

function DesktopNavLinks({ currentView, user, onNav }: NavSectionProps) {
  return (
    <nav className="hidden md:flex items-center gap-1">
      {navLinks.map(({ label, view, icon }) => {
        const isActive = currentView === view;
        const displayLabel = displayLabelFor(view, label, user);
        /* BOOK NOW gets the gradient pill treatment */
        if (view === 'CLIENT') {
          return (
            <button type="button"
              key={view}
              onClick={() => onNav(view)}
              className="btn-book font-lovelo flex items-center gap-1.5 text-white text-[11px] font-bold tracking-wider uppercase rounded-full px-5 py-2.5 mx-1"
            >
              {icon}
              {displayLabel}
            </button>
          );
        }
        return (
          <button type="button"
            key={view}
            onClick={() => onNav(view)}
            className={`nav-link-ink font-lovelo relative flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[11px] font-semibold tracking-wider uppercase transition-colors duration-150 ${
              isActive ? 'active' : ''
            }`}
            style={{ color: isActive ? '#ee4923' : '#383838' }}
          >
            <span style={{ color: isActive ? '#ee4923' : '#9ca3af' }}>{icon}</span>
            {displayLabel}
          </button>
        );
      })}
    </nav>
  );
}

interface AuthSectionProps extends NavSectionProps {
  onLogout: () => void;
  setMobileOpen: (open: boolean) => void;
  initial: string;
}

function DesktopAuthSection({ currentView, user, onNav, onLogout, setMobileOpen, initial }: AuthSectionProps) {
  if (!user) {
    return (
      <div className="hidden md:flex items-center gap-2">
        <button type="button"
          onClick={() => onNav('AUTH')}
          className="font-lovelo flex items-center gap-1.5 text-[11px] font-semibold tracking-wider uppercase px-4 py-2.5 rounded-full border transition-all duration-150 hover:scale-[1.02] active:scale-[0.98]"
          style={{
            color: currentView === 'AUTH' ? '#ffffff' : '#383838',
            backgroundColor: currentView === 'AUTH' ? '#ee4923' : 'rgba(56,56,56,0.05)',
            borderColor: currentView === 'AUTH' ? '#ee4923' : '#9ca3af',
          }}
        >
          <LogIn className="w-3.5 h-3.5" />
          Login / Sign Up
        </button>
      </div>
    );
  }

  return (
    <div className="hidden md:flex items-center gap-2">
      <div className="flex items-center gap-2">
        {/* Admin panel button */}
        {user.isStaff && (
          <button type="button"
            onClick={() => onNav('ADMIN')}
            className="font-lovelo flex items-center gap-1.5 text-[11px] font-semibold tracking-wider uppercase px-4 py-2.5 rounded-full transition-all duration-150 hover:scale-[1.02]"
            style={{
              color: currentView === 'ADMIN' ? '#ffffff' : '#383838',
              backgroundColor: currentView === 'ADMIN' ? '#383838' : 'rgba(56,56,56,0.06)',
              border: `1px solid ${currentView === 'ADMIN' ? '#383838' : 'rgba(56,56,56,0.12)'}`,
            }}
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            Admin Panel
          </button>
        )}

        {/* Profile pill (non-staff) */}
        {!user.isStaff && (
          <button type="button"
            onClick={() => onNav('PROFILE')}
            className="user-pill font-lovelo flex items-center gap-2 pl-1.5 pr-3.5 py-1.5 rounded-full transition-all duration-150"
          >
            <span
              className="font-lovelo w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
              style={{ background: 'linear-gradient(135deg,#ee4923,#F4921F)' }}
            >
              {initial}
            </span>
            <span
              className="text-[11px] font-semibold tracking-wide max-w-[90px] truncate"
              style={{ color: '#383838' }}
            >
              {user.name}
            </span>
          </button>
        )}

        {/* Staff name display */}
        {user.isStaff && (
          <div className="flex items-center gap-1.5 px-2">
            <span
              className="font-lovelo w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
              style={{ background: 'linear-gradient(135deg,#383838,#555)' }}
            >
              {initial}
            </span>
            <span className="font-lovelo text-[11px] font-medium text-gray-500 max-w-[80px] truncate">
              {user.name}
            </span>
          </div>
        )}

        {/* Logout */}
        <button type="button"
          onClick={() => { onLogout(); setMobileOpen(false); }}
          className="font-lovelo flex items-center gap-1.5 text-[11px] font-semibold tracking-wider uppercase px-3.5 py-2.5 rounded-full border border-gray-200 text-gray-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all duration-150"
          title="Logout"
        >
          <LogOut className="w-3.5 h-3.5" />
          Logout
        </button>
      </div>
    </div>
  );
}

function MobileNavLinks({ currentView, user, onNav }: NavSectionProps) {
  return (
    <>
      {navLinks.map(({ label, view, icon }) => {
        const isActive = currentView === view;
        const displayLabel = displayLabelFor(view, label, user);
        if (view === 'CLIENT') {
          return (
            <button type="button"
              key={view}
              onClick={() => onNav(view)}
              className="btn-book font-lovelo w-full flex items-center justify-between text-white text-sm font-bold tracking-wide uppercase rounded-xl px-5 py-3.5 mt-2"
            >
              <span className="flex items-center gap-2">{icon}{displayLabel}</span>
              <ChevronRight className="w-4 h-4 opacity-70" />
            </button>
          );
        }
        return (
          <button type="button"
            key={view}
            onClick={() => onNav(view)}
            className="font-lovelo w-full flex items-center justify-between text-sm font-semibold tracking-wide uppercase rounded-xl px-4 py-3.5 transition-all duration-150"
            style={{
              color: isActive ? '#ee4923' : '#383838',
              backgroundColor: isActive ? 'rgba(238,73,35,0.07)' : 'transparent',
            }}
          >
            <span className="flex items-center gap-2.5">
              <span style={{ color: isActive ? '#ee4923' : '#9ca3af' }}>{icon}</span>
              {displayLabel}
            </span>
            <ChevronRight
              className="w-4 h-4 transition-transform"
              style={{ color: isActive ? '#ee4923' : '#d1d5db', transform: isActive ? 'translateX(2px)' : 'none' }}
            />
          </button>
        );
      })}
    </>
  );
}

function MobileAuthSection({ currentView, user, onNav, onLogout, setMobileOpen, initial }: AuthSectionProps) {
  return (
    <div className="pt-3 border-t mt-3 space-y-2" style={{ borderColor: 'rgba(0,0,0,0.07)' }}>
      {!user ? (
        <button type="button"
          onClick={() => onNav('AUTH')}
          className="font-lovelo w-full flex items-center justify-between text-sm font-bold tracking-wide uppercase rounded-xl px-4 py-3.5 border transition-colors duration-150"
          style={{
            color: '#383838',
            borderColor: '#e5e7eb',
            backgroundColor: 'white',
          }}
        >
          <span className="flex items-center gap-2.5">
            <LogIn className="w-4 h-4 text-gray-400" />
            Login / Sign Up
          </span>
          <ChevronRight className="w-4 h-4 text-gray-300" />
        </button>
      ) : (
        <>
          {/* User info row */}
          <div
            className="flex items-center gap-3 px-4 py-3 rounded-xl"
            style={{ backgroundColor: 'rgba(56,56,56,0.04)' }}
          >
            <span
              className="font-lovelo w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
              style={{ background: user.isStaff ? 'linear-gradient(135deg,#383838,#555)' : 'linear-gradient(135deg,#ee4923,#F4921F)' }}
            >
              {initial}
            </span>
            <div>
              <p className="font-lovelo text-sm font-semibold" style={{ color: '#383838' }}>
                {user.name}
              </p>
              <p className="font-lovelo text-xs text-gray-500">
                {user.isStaff ? 'Admin' : 'Customer'}
              </p>
            </div>
          </div>

          {user.isStaff && (
            <button type="button"
              onClick={() => onNav('ADMIN')}
              className="font-lovelo w-full flex items-center justify-between text-sm font-semibold tracking-wide uppercase rounded-xl px-4 py-3.5 transition-colors duration-150"
              style={{
                color: currentView === 'ADMIN' ? '#ffffff' : '#383838',
                backgroundColor: currentView === 'ADMIN' ? '#383838' : 'white',
                border: '1px solid #e5e7eb',
              }}
            >
              <span className="flex items-center gap-2.5">
                <LayoutDashboard className="w-4 h-4" />
                Admin Panel
              </span>
              <ChevronRight className="w-4 h-4 opacity-40" />
            </button>
          )}

          {!user.isStaff && (
            <button type="button"
              onClick={() => onNav('PROFILE')}
              className="font-lovelo w-full flex items-center justify-between text-sm font-semibold tracking-wide uppercase rounded-xl px-4 py-3.5 transition-colors duration-150"
              style={{
                color: currentView === 'PROFILE' ? '#ee4923' : '#383838',
                backgroundColor: currentView === 'PROFILE' ? 'rgba(238,73,35,0.07)' : 'white',
                border: '1px solid #e5e7eb',
              }}
            >
              <span className="flex items-center gap-2.5">
                <UserCircle2 className="w-4 h-4" />
                My Profile
              </span>
              <ChevronRight className="w-4 h-4 opacity-40" />
            </button>
          )}

          <button type="button"
            onClick={() => { onLogout(); setMobileOpen(false); }}
            className="font-lovelo w-full flex items-center gap-2.5 text-sm font-semibold tracking-wide uppercase rounded-xl px-4 py-3.5 bg-red-50 text-red-600 hover:bg-red-100 transition-colors duration-150"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </>
      )}
    </div>
  );
}

export default function Navbar({ currentView, onViewChange, onLogout }: NavbarProps) {
  const { user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled]     = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  /* Close mobile menu on resize to desktop */
  useEffect(() => {
    const onResize = () => { if (window.innerWidth >= 768) setMobileOpen(false); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const handleNav = (view: ViewType) => {
    onViewChange(view);
    setMobileOpen(false);
  };

  /* First letter of user name for avatar */
  const initial = user?.name?.charAt(0).toUpperCase() ?? '?';

  return (
    <>
      {/* ── Injected styles ── */}
      <style>{`
        /* Gradient accent strip */
        .nav-accent-bar {
          height: 2px;
          background: linear-gradient(90deg, #383838 0%, #ee4923 55%, #F4921F 100%);
        }

        /* Book Now gradient button */
        .btn-book {
          background: linear-gradient(135deg, #ee4923 0%, #F4921F 100%);
          box-shadow: 0 4px 14px rgba(238,73,35,0.35);
          transition: transform .18s ease, box-shadow .18s ease, filter .18s ease;
        }
        .btn-book:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(238,73,35,0.45);
          filter: brightness(1.05);
        }
        .btn-book:active { transform: translateY(0); }

        /* Nav link hover ink */
        .nav-link-ink::after {
          content: '';
          position: absolute;
          bottom: -2px; left: 50%;
          width: 0; height: 2px;
          background: #ee4923;
          border-radius: 2px;
          transition: width .22s ease, left .22s ease;
        }
        .nav-link-ink:hover::after,
        .nav-link-ink.active::after {
          width: 100%;
          left: 0;
        }

        /* Mobile drawer */
        .mobile-drawer {
          display: grid;
          grid-template-rows: 0fr;
          transition: grid-template-rows .35s cubic-bezier(0.4,0,0.2,1), opacity .25s ease;
          opacity: 0;
        }
        .mobile-drawer.open {
          grid-template-rows: 1fr;
          opacity: 1;
        }

        /* User pill */
        .user-pill {
          background: rgba(56,56,56,0.06);
          border: 1px solid rgba(56,56,56,0.12);
          transition: background .18s, border-color .18s;
        }
        .user-pill:hover {
          background: rgba(238,73,35,0.06);
          border-color: rgba(238,73,35,0.2);
        }
      `}</style>

      <header
        className="sticky top-0 z-50 w-full"
        style={{
          backgroundColor: '#ffffff',
          boxShadow: scrolled
            ? '0 2px 20px rgba(0,0,0,0.10)'
            : '0 1px 0 rgba(0,0,0,0.07)',
          transition: 'box-shadow .3s ease',
        }}
      >
        {/* Accent gradient strip */}
        <div className="nav-accent-bar" />

        {/* Main bar */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">

            {/* ── Brand ── */}
            <button type="button"
              onClick={() => handleNav('HOME')}
              className="flex items-center gap-2.5 group flex-shrink-0"
            >
              <img
                src={logo}
                alt="Wash & Go"
                className="w-10 h-10 rounded-lg object-contain border border-gray-100 shadow-sm group-hover:shadow-md transition-shadow duration-200"
              />
              <div className="text-left">
                <p
                  className="font-lovelo font-display font-bold text-sm leading-tight tracking-tight"
                  style={{ color: '#383838' }}
                >
                  Wash &amp; Go Auto Salon
                </p>
                <p
                  className="font-lovelo text-[10px] font-semibold tracking-[0.18em] uppercase"
                  style={{ color: '#ee4923' }}
                >
                  Baliuag Branch
                </p>
              </div>
            </button>

            <DesktopNavLinks currentView={currentView} user={user} onNav={handleNav} />
            <DesktopAuthSection
              currentView={currentView}
              user={user}
              onNav={handleNav}
              onLogout={onLogout}
              setMobileOpen={setMobileOpen}
              initial={initial}
            />

            {/* ── Mobile hamburger ── */}
            <button type="button"
              className="md:hidden flex items-center justify-center w-9 h-9 rounded-lg transition-colors duration-150"
              style={{ color: '#383838', backgroundColor: mobileOpen ? 'rgba(238,73,35,0.08)' : 'transparent' }}
              onClick={() => setMobileOpen(v => !v)}
              aria-label="Toggle menu"
            >
              {mobileOpen
                ? <X className="w-5 h-5" style={{ color: '#ee4923' }} />
                : <Menu className="w-5 h-5" />
              }
            </button>
          </div>
        </div>

        {/* ── Mobile drawer ── */}
        <div className={`mobile-drawer md:hidden ${mobileOpen ? 'open' : ''}`}>
          <div className="overflow-hidden">
          <div
            className="border-t px-4 pt-3 pb-5 space-y-1"
            style={{ borderColor: 'rgba(0,0,0,0.07)', backgroundColor: '#fafafa' }}
          >
            <MobileNavLinks currentView={currentView} user={user} onNav={handleNav} />
            <MobileAuthSection
              currentView={currentView}
              user={user}
              onNav={handleNav}
              onLogout={onLogout}
              setMobileOpen={setMobileOpen}
              initial={initial}
            />
          </div>
          </div>
        </div>
      </header>
    </>
  );
}
