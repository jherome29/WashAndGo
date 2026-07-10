import React, { useState, useEffect, useRef } from 'react';
import { ChevronRight, CheckCircle } from 'lucide-react';
import Navbar from './components/Navbar';
import HomePage from './components/HomePage';
import BookingWizard from './components/BookingWizard';
import AdminDashboard from './components/AdminDashboard';
import ServicesAndRates from './components/ServicesAndRates';
import CheckStatus from './components/CheckStatus';
import AuthPage from './components/AuthPage';
import UserProfile from './components/UserProfile';
import { AuthProvider } from './context/AuthContext';
import { Booking, BookingStatus, ServicePackage } from './types';
import { SERVICES } from './constants';
import { supabase } from './lib/supabase';
import { api } from './lib/api';

export type AppUser = {
  name: string;
  email: string;
  phone?: string;
  isStaff: boolean;
};

export type ViewType = 'HOME' | 'CLIENT' | 'ADMIN' | 'SERVICES' | 'STATUS' | 'AUTH' | 'PROFILE';

export default function App() {
  const [view, setView] = useState<ViewType>('HOME');
  const [forceRecoveryMode, setForceRecoveryMode] = useState(false);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [user, setUser] = useState<AppUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [services, setServices] = useState<ServicePackage[]>(SERVICES);
  const [userBookings, setUserBookings] = useState<Booking[]>([]);
  const [loadingUserBookings, setLoadingUserBookings] = useState(false);
  const [userBookingsError, setUserBookingsError] = useState<string | null>(null);
  const [submittedBookingId, setSubmittedBookingId] = useState<string | null>(null);

  // Track whether user is already authenticated so token refreshes (which also
  // fire SIGNED_IN) don't redirect away from whatever page the user is on.
  const isAuthenticatedRef = useRef(false);

  // Fetch live service prices on mount
  useEffect(() => {
    api.getServices()
      .then((data: any[]) => { if (data?.length > 0) setServices(data as ServicePackage[]); })
      .catch(() => { /* fall back to constants */ });
  }, []);

  // Listen to Supabase auth state (handles Google OAuth redirect)
  useEffect(() => {
    if (window.location.hash.includes('type=recovery')) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setForceRecoveryMode(true);
      setView('AUTH');
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      // eslint-disable-next-line react-hooks/immutability
      if (session) handleSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setForceRecoveryMode(true);
        setView('AUTH');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }

      if (session) {
        handleSession(session, event);
      } else {
        setUser(null);
        setToken(null);
        setBookings([]);
        setUserBookings([]);
        setUserBookingsError(null);
        setForceRecoveryMode(false);
        isAuthenticatedRef.current = false;
      }
    });

    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSession = async (session: any, event?: string) => {
    const supabaseUser = session.user;
    const accessToken = session.access_token;
    setToken(accessToken);

    // Fetch profile to get role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, full_name, phone')
      .eq('id', supabaseUser.id)
      .single();

    const isStaff = profile?.role === 'admin';
    const appUser: AppUser = {
      name: profile?.full_name || supabaseUser.user_metadata?.full_name || supabaseUser.email,
      email: supabaseUser.email,
      phone: profile?.phone || undefined,
      isStaff,
    };

    setUser(appUser);

    // Only navigate on a genuine new sign-in (user was logged out before).
    // Supabase v2 also fires SIGNED_IN on token refresh (tab refocus) — ignore those.
    const inRecoveryContext = window.location.hash.includes('type=recovery');
    if (event === 'SIGNED_IN' && !isAuthenticatedRef.current && !inRecoveryContext) {
      setView(isStaff ? 'ADMIN' : 'PROFILE');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    isAuthenticatedRef.current = true;

    // If admin, fetch all bookings; if customer, fetch their own
    if (isStaff) {
      try {
        const data = await api.getAllBookings(accessToken);
        setBookings(data);
      } catch { /* ignore — will show empty */ }
    } else {
      loadUserBookings(accessToken);
    }
  };

  const loadUserBookings = async (accessToken?: string, options?: { silent?: boolean }) => {
    const t = accessToken ?? token;
    if (!t) return;
    if (!options?.silent) setLoadingUserBookings(true);
    try {
      const data = await api.getMyBookings(t);
      setUserBookings(data);
      setUserBookingsError(null);
    } catch (err) {
      console.error('Failed to load customer bookings', err);
      setUserBookings([]);
      setUserBookingsError('We could not load your bookings right now. Please refresh and try again.');
    } finally {
      if (!options?.silent) setLoadingUserBookings(false);
    }
  };

  useEffect(() => {
    if (!token || !user || user.isStaff) return;

    if (view === 'STATUS' || view === 'PROFILE') {
      loadUserBookings(token, { silent: true });
    }

    const intervalId = window.setInterval(() => {
      loadUserBookings(token, { silent: true });
    }, 10000);

    const handleFocus = () => {
      loadUserBookings(token, { silent: true });
    };

    window.addEventListener('focus', handleFocus);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user, view]);

  const handleNewBooking = (booking: Booking) => {
    setBookings(prev => [booking, ...prev]);
    setUserBookings(prev => [booking, ...prev.filter(b => b.id !== booking.id)]);
    setSubmittedBookingId(booking.id);
  };

  const handleUpdateStatus = async (id: string, status: BookingStatus) => {
    if (!token) return;
    try {
      const updated = await api.updateStatus(id, status, token);
      setBookings(prev => prev.map(b => b.id === id ? { ...b, ...updated, updates: b.updates ?? [] } : b));
    } catch (err: any) {
      alert(`Failed to update status: ${err.message}`);
      throw err;
    }
  };

  const handleAddUpdate = async (id: string, message: string, imageUrls: string[]) => {
    if (!token) return;
    try {
      const saved = await api.addBookingUpdate(id, message, imageUrls, token);
      setBookings(prev => prev.map(b =>
        b.id === id ? { ...b, updates: [...(b.updates || []), saved] } : b
      ));
    } catch (err: any) {
      alert(`Failed to post update: ${err.message}`);
    }
  };

  const handleBookingResubmitted = (booking: Booking) => {
    setUserBookings(prev => prev.map(b => b.id === booking.id ? { ...b, ...booking } : b));
    setBookings(prev => prev.map(b => b.id === booking.id ? { ...b, ...booking } : b));
  };

  const handleUpdateService = async (id: string, dto: object) => {
    if (!token) return;
    try {
      const updated = await api.updateService(id, dto, token);
      setServices(prev => prev.map(s => s.id === id ? { ...s, ...updated } : s));
    } catch (err: any) {
      alert(`Failed to update service: ${err.message}`);
    }
  };

  const handleAuthSuccess = async (loggedInUser: AppUser) => {
    setUser(loggedInUser);
    setView(loggedInUser.isStaff ? 'ADMIN' : 'PROFILE');
    window.scrollTo({ top: 0, behavior: 'smooth' });

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;

    setToken(session.access_token);
    if (loggedInUser.isStaff) {
      try {
        const data = await api.getAllBookings(session.access_token);
        setBookings(data);
      } catch { /* ignore — will show empty */ }
    } else {
      loadUserBookings(session.access_token);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setToken(null);
    setBookings([]);
    setUserBookings([]);
    setUserBookingsError(null);
    setView('HOME');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleViewChange = (newView: ViewType) => {
    setView(newView);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <AuthProvider user={user} token={token} forceRecoveryMode={forceRecoveryMode}>
      <div className="min-h-screen flex flex-col bg-gray-50">
        <Navbar currentView={view} onViewChange={handleViewChange} onLogout={handleLogout} />

      {/* Booking submitted success modal */}
      {submittedBookingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="rounded-2xl max-w-md w-full shadow-2xl overflow-hidden max-h-[85vh] overflow-y-auto">
            <div className="px-5 py-4 sm:px-8 sm:py-6 flex items-center gap-3" style={{ background: 'linear-gradient(135deg, #383838 0%, #1a1a1a 100%)' }}>
              <CheckCircle style={{ color: '#ee4923' }} size={24} />
              <h3 className="font-lovelo font-black text-lg text-white">Booking Submitted!</h3>
            </div>
            <div className="bg-white px-5 py-4 sm:px-8 sm:py-6">
              <p className="font-lovelo text-gray-600 text-sm mb-1">
                Your Booking ID: <strong style={{ color: '#ee4923' }}>{submittedBookingId}</strong>
              </p>
              <p className="font-lovelo text-gray-400 text-sm mb-6" style={{ fontWeight: 300 }}>
                Your payment proof is under review. Please wait for confirmation — we'll notify you via email.
              </p>
              <button
                onClick={() => { setSubmittedBookingId(null); setView('HOME'); }}
                className="font-lovelo w-full flex items-center justify-center py-3 rounded-full font-black text-[11px] tracking-[0.15em] uppercase text-white transition-opacity hover:opacity-90"
                style={{ background: 'linear-gradient(135deg, #ee4923 0%, #F4921F 100%)' }}>
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="flex-grow">
        {view === 'HOME' && <HomePage onViewChange={handleViewChange} />}
        {view === 'AUTH' && (
          <AuthPage
            onAuthSuccess={handleAuthSuccess}
            onRecoveryModeHandled={() => setForceRecoveryMode(false)}
          />
        )}
        {view === 'CLIENT' && <BookingWizard onSubmit={handleNewBooking} services={services} />}
        {view === 'SERVICES' && <ServicesAndRates onBookNow={() => handleViewChange('CLIENT')} services={services} />}
        {view === 'STATUS' && (
          <CheckStatus
            userBookings={userBookings}
            loading={loadingUserBookings}
            loadError={userBookingsError}
            onRefresh={user ? () => loadUserBookings() : undefined}
            onBookingResubmitted={handleBookingResubmitted}
          />
        )}
        {view === 'PROFILE' && user && (
          <UserProfile
            onUserUpdate={(updates) => setUser(prev => prev ? { ...prev, ...updates } : null)}
            onGoBookings={() => handleViewChange('STATUS')}
          />
        )}
        {view === 'ADMIN' && (
          <AdminDashboard
            bookings={bookings}
            services={services}
            onUpdateStatus={handleUpdateStatus}
            onAddUpdate={handleAddUpdate}
            onUpdateService={handleUpdateService}
          />
        )}
      </main>

      {view !== 'AUTH' && <footer style={{ backgroundColor: '#1a1a1a' }}>
        {/* Main Footer Content */}
        <div className="max-w-6xl mx-auto px-6 py-14 grid grid-cols-1 md:grid-cols-3 gap-12">
          
          {/* Column 1 — Brand */}
          <div>
            <h3 className="font-display text-white text-xl font-black tracking-tight mb-2">Wash & Go Auto Salon</h3>
            <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: '#ee4923' }}>Baliwag Branch</p>
            <p className="text-gray-400 text-sm leading-relaxed">
              Professional car care services designed to keep your vehicle looking brand new.
            </p>
            {/* Social Links */}
            <div className="flex items-center gap-4 mt-6">
              <a
                href="https://www.facebook.com/WashandGoBaliwag"
                target="_blank"
                rel="noopener noreferrer"
                className="w-10 h-10 rounded-full flex items-center justify-center transition-colors duration-200 hover:opacity-80"
                style={{ backgroundColor: '#1877F2' }}
                title="Facebook"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" className="w-5 h-5">
                  <path d="M22 12c0-5.522-4.477-10-10-10S2 6.478 2 12c0 4.991 3.657 9.128 8.438 9.878V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z"/>
                </svg>
              </a>
              <a
                href="https://www.instagram.com/washandgoautosalonbaliwag/"
                target="_blank"
                rel="noopener noreferrer"
                className="w-10 h-10 rounded-full flex items-center justify-center transition-colors duration-200 hover:opacity-80"
                style={{ background: 'radial-gradient(circle at 30% 107%, #fdf497 0%, #fdf497 5%, #fd5949 45%, #d6249f 60%, #285AEB 90%)' }}
                title="Instagram"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" className="w-5 h-5">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
                </svg>
              </a>
            </div>
          </div>

          {/* Column 2 — Quick Links */}
          <div>
            <h4 className="text-white font-bold uppercase tracking-widest text-xs mb-5">Quick Links</h4>
            <ul className="space-y-3">
              {[
                { label: 'Home', view: 'HOME' as const },
                { label: 'Book a Service', view: 'CLIENT' as const },
                { label: 'Services & Rates', view: 'SERVICES' as const },
                { label: 'My Bookings', view: 'STATUS' as const },
              ].map(link => (
                <li key={link.view}>
                  <button
                    onClick={() => handleViewChange(link.view)}
                    className="flex items-center gap-1 text-gray-400 text-sm hover:text-white transition-all duration-200 group"
                  >
                    <ChevronRight size={14} className="transition-transform duration-200 group-hover:translate-x-0.5" />
                    {link.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 3 — Contact */}
          <div>
            <h4 className="text-white font-bold uppercase tracking-widest text-xs mb-5">Contact & Location</h4>
            <ul className="space-y-4">
              {/* Phone */}
              <li className="flex items-start gap-3">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: '#ee4923' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                </svg>
                <a href="tel:09920176099" className="text-gray-400 text-sm hover:text-white transition-colors">0992 017 6099</a>
              </li>
              {/* Address */}
              <li className="flex items-start gap-3">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: '#ee4923' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                </svg>
                <span className="text-gray-400 text-sm leading-snug">Unitop Baliwag - Parking Area,<br/>Baliuag, Philippines</span>
              </li>
              {/* Waze */}
              <li className="flex items-start gap-3">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: '#ee4923' }}>
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/>
                </svg>
                <a
                  href="https://waze.com/ul/hwdtvp53n1"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-400 text-sm hover:text-white transition-colors flex items-center gap-1"
                >
                  Get Directions via Waze
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                    <path fillRule="evenodd" d="M5.22 14.78a.75.75 0 001.06 0l7.22-7.22v5.69a.75.75 0 001.5 0v-7.5a.75.75 0 00-.75-.75h-7.5a.75.75 0 000 1.5h5.69l-7.22 7.22a.75.75 0 000 1.06z" clipRule="evenodd" />
                  </svg>
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-white/10">
          <div className="max-w-6xl mx-auto px-6 py-5 flex flex-col md:flex-row items-center justify-between gap-2">
            <p className="text-gray-500 text-xs">&copy; {new Date().getFullYear()} Wash &amp; Go Auto Salon Baliwag Branch. All rights reserved.</p>
          </div>
        </div>
      </footer>}
      </div>
    </AuthProvider>
  );
}
