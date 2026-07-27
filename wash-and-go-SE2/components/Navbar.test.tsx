import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  displayLabelFor,
  DesktopNavLinks,
  DesktopAuthSection,
  MobileNavLinks,
  MobileAuthSection,
} from './Navbar';
import type { AppUser } from '../App';

const guest: AppUser | null = null;
const customer: AppUser = { name: 'Juan Dela Cruz', email: 'juan@example.com', isStaff: false };
const admin: AppUser = { name: 'Admin User', email: 'admin@example.com', isStaff: true };

describe('displayLabelFor', () => {
  it('shows CHECK STATUS for STATUS view when no user is logged in', () => {
    expect(displayLabelFor('STATUS', 'MY BOOKINGS', guest)).toBe('CHECK STATUS');
  });
  it('shows MY BOOKINGS for STATUS view when a user is logged in', () => {
    expect(displayLabelFor('STATUS', 'MY BOOKINGS', customer)).toBe('MY BOOKINGS');
  });
  it('passes through the original label for non-STATUS views regardless of user', () => {
    expect(displayLabelFor('HOME', 'HOME', guest)).toBe('HOME');
    expect(displayLabelFor('CLIENT', 'BOOK NOW', customer)).toBe('BOOK NOW');
  });
});

describe('DesktopNavLinks', () => {
  it('renders all nav links with their labels', () => {
    render(<DesktopNavLinks currentView="HOME" user={guest} onNav={() => {}} />);
    expect(screen.getByText('HOME')).toBeInTheDocument();
    expect(screen.getByText('BOOK NOW')).toBeInTheDocument();
    expect(screen.getByText('SERVICES & RATES')).toBeInTheDocument();
    expect(screen.getByText('CHECK STATUS')).toBeInTheDocument();
  });

  it('shows MY BOOKINGS instead of CHECK STATUS when logged in', () => {
    render(<DesktopNavLinks currentView="HOME" user={customer} onNav={() => {}} />);
    expect(screen.getByText('MY BOOKINGS')).toBeInTheDocument();
    expect(screen.queryByText('CHECK STATUS')).not.toBeInTheDocument();
  });

  it('calls onNav with the target view when a link is clicked', () => {
    const onNav = vi.fn();
    render(<DesktopNavLinks currentView="HOME" user={guest} onNav={onNav} />);
    fireEvent.click(screen.getByText('BOOK NOW'));
    expect(onNav).toHaveBeenCalledWith('CLIENT');
  });
});

describe('MobileNavLinks', () => {
  it('renders all nav links', () => {
    render(<MobileNavLinks currentView="HOME" user={guest} onNav={() => {}} />);
    expect(screen.getByText('HOME')).toBeInTheDocument();
    expect(screen.getByText('BOOK NOW')).toBeInTheDocument();
  });

  it('calls onNav when a link is clicked', () => {
    const onNav = vi.fn();
    render(<MobileNavLinks currentView="STATUS" user={guest} onNav={onNav} />);
    fireEvent.click(screen.getByText('CHECK STATUS'));
    expect(onNav).toHaveBeenCalledWith('STATUS');
  });
});

describe('DesktopAuthSection', () => {
  it('shows a login button when logged out', () => {
    render(
      <DesktopAuthSection currentView="HOME" user={guest} onNav={() => {}} onLogout={() => {}} setMobileOpen={() => {}} initial="?" />,
    );
    expect(screen.getByText('Login / Sign Up')).toBeInTheDocument();
  });

  it('shows the Admin Panel button and name for staff', () => {
    render(
      <DesktopAuthSection currentView="HOME" user={admin} onNav={() => {}} onLogout={() => {}} setMobileOpen={() => {}} initial="A" />,
    );
    expect(screen.getByText('Admin Panel')).toBeInTheDocument();
    expect(screen.getByText('Admin User')).toBeInTheDocument();
  });

  it('shows a profile pill (no Admin Panel) for non-staff customers', () => {
    render(
      <DesktopAuthSection currentView="HOME" user={customer} onNav={() => {}} onLogout={() => {}} setMobileOpen={() => {}} initial="J" />,
    );
    expect(screen.queryByText('Admin Panel')).not.toBeInTheDocument();
    expect(screen.getByText('Juan Dela Cruz')).toBeInTheDocument();
  });

  it('calls onLogout and closes the mobile menu on logout click', () => {
    const onLogout = vi.fn();
    const setMobileOpen = vi.fn();
    render(
      <DesktopAuthSection currentView="HOME" user={customer} onNav={() => {}} onLogout={onLogout} setMobileOpen={setMobileOpen} initial="J" />,
    );
    fireEvent.click(screen.getByTitle('Logout'));
    expect(onLogout).toHaveBeenCalled();
    expect(setMobileOpen).toHaveBeenCalledWith(false);
  });
});

describe('MobileAuthSection', () => {
  it('shows a login button when logged out', () => {
    render(
      <MobileAuthSection currentView="HOME" user={guest} onNav={() => {}} onLogout={() => {}} setMobileOpen={() => {}} initial="?" />,
    );
    expect(screen.getByText('Login / Sign Up')).toBeInTheDocument();
  });

  it('shows Admin Panel entry for staff and My Profile for customers', () => {
    const { rerender } = render(
      <MobileAuthSection currentView="HOME" user={admin} onNav={() => {}} onLogout={() => {}} setMobileOpen={() => {}} initial="A" />,
    );
    expect(screen.getByText('Admin Panel')).toBeInTheDocument();
    expect(screen.queryByText('My Profile')).not.toBeInTheDocument();

    rerender(
      <MobileAuthSection currentView="HOME" user={customer} onNav={() => {}} onLogout={() => {}} setMobileOpen={() => {}} initial="J" />,
    );
    expect(screen.queryByText('Admin Panel')).not.toBeInTheDocument();
    expect(screen.getByText('My Profile')).toBeInTheDocument();
  });

  it('calls onNav("ADMIN") when the admin entry is clicked', () => {
    const onNav = vi.fn();
    render(
      <MobileAuthSection currentView="HOME" user={admin} onNav={onNav} onLogout={() => {}} setMobileOpen={() => {}} initial="A" />,
    );
    fireEvent.click(screen.getByText('Admin Panel'));
    expect(onNav).toHaveBeenCalledWith('ADMIN');
  });
});
