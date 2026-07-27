import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  ProfileHeader,
  AccountActionsGrid,
  MembershipSection,
  EditProfileForm,
  type EditFormState,
} from './UserProfile';
import type { AppUser } from '../App';
import type { PublicMembership } from '../lib/api';

const user: AppUser = { name: 'Juan Dela Cruz', email: 'juan@example.com', phone: '09171234567', isStaff: false };

describe('ProfileHeader', () => {
  it('shows the user name, email, and phone', () => {
    render(<ProfileHeader user={user} isEditing={false} onToggleEdit={() => {}} />);
    expect(screen.getByText('Juan Dela Cruz')).toBeInTheDocument();
    expect(screen.getByText('juan@example.com')).toBeInTheDocument();
    expect(screen.getByText('09171234567')).toBeInTheDocument();
    expect(screen.getByText('Edit Profile')).toBeInTheDocument();
  });

  it('shows Cancel instead of Edit Profile while editing', () => {
    render(<ProfileHeader user={user} isEditing onToggleEdit={() => {}} />);
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('calls onToggleEdit when the button is clicked', () => {
    const onToggleEdit = vi.fn();
    render(<ProfileHeader user={user} isEditing={false} onToggleEdit={onToggleEdit} />);
    fireEvent.click(screen.getByText('Edit Profile'));
    expect(onToggleEdit).toHaveBeenCalled();
  });
});

describe('AccountActionsGrid', () => {
  it('shows account overview details', () => {
    render(
      <AccountActionsGrid
        user={user}
        isEditing={false}
        onToggleEdit={() => {}}
        onGoBookings={() => {}}
        onResetPassword={() => {}}
        resetSending={false}
      />,
    );
    expect(screen.getAllByText('Juan Dela Cruz').length).toBeGreaterThan(0);
    expect(screen.getByText('juan@example.com')).toBeInTheDocument();
  });

  it('shows "Not set" when the user has no phone', () => {
    render(
      <AccountActionsGrid
        user={{ ...user, phone: undefined }}
        isEditing={false}
        onToggleEdit={() => {}}
        onGoBookings={() => {}}
        onResetPassword={() => {}}
        resetSending={false}
      />,
    );
    expect(screen.getByText('Not set')).toBeInTheDocument();
  });

  it('calls onGoBookings when "Go to My Bookings" is clicked', () => {
    const onGoBookings = vi.fn();
    render(
      <AccountActionsGrid
        user={user}
        isEditing={false}
        onToggleEdit={() => {}}
        onGoBookings={onGoBookings}
        onResetPassword={() => {}}
        resetSending={false}
      />,
    );
    fireEvent.click(screen.getByText('Go to My Bookings'));
    expect(onGoBookings).toHaveBeenCalled();
  });

  it('shows "Sending Reset Link..." while resetSending is true', () => {
    render(
      <AccountActionsGrid
        user={user}
        isEditing={false}
        onToggleEdit={() => {}}
        onGoBookings={() => {}}
        onResetPassword={() => {}}
        resetSending
      />,
    );
    expect(screen.getByText('Sending Reset Link...')).toBeInTheDocument();
  });
});

describe('MembershipSection', () => {
  it('shows a loading spinner while membershipLoading is true', () => {
    const { container } = render(<MembershipSection membershipLoading membership={null} />);
    expect(container.querySelector('.animate-spin')).not.toBeNull();
  });

  it('shows a join prompt when the user is not a member', () => {
    render(<MembershipSection membershipLoading={false} membership={null} />);
    expect(screen.getByText('Not a Club Wash & Go member yet?')).toBeInTheDocument();
  });

  it('renders the membership status card when the user is a member', () => {
    const membership: PublicMembership = {
      membershipNo: 'WNG-000123',
      memberName: 'Juan Dela Cruz',
      status: 'ACTIVE',
      expiresAt: '2027-01-01',
      visitCount: 3,
      freeWashCredits: 0,
      firstWashUsed: true,
      visitsUntilNextFreeWash: 7,
      vehicles: [{ plateNumber: 'ABC1234', vehicleLabel: null }],
    };
    render(<MembershipSection membershipLoading={false} membership={membership} />);
    expect(screen.getByText('WNG-000123')).toBeInTheDocument();
  });
});

describe('EditProfileForm', () => {
  const baseForm: EditFormState = { fullName: 'Juan Dela Cruz', phone: '09171234567', email: 'juan@example.com' };

  it('shows current form values', () => {
    render(
      <EditProfileForm
        user={user}
        editForm={baseForm}
        setEditForm={() => {}}
        editError={null}
        emailVerifSent={false}
        saveSuccess={false}
        saving={false}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByDisplayValue('Juan Dela Cruz')).toBeInTheDocument();
    expect(screen.getByDisplayValue('09171234567')).toBeInTheDocument();
  });

  it('shows a phone validation error for an incomplete phone number', () => {
    render(
      <EditProfileForm
        user={user}
        editForm={{ ...baseForm, phone: '0917' }}
        setEditForm={() => {}}
        editError={null}
        emailVerifSent={false}
        saveSuccess={false}
        saving={false}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByText(/Must be 11 digits starting with 09/)).toBeInTheDocument();
  });

  it('shows a verification-required notice when the email differs from the account email', () => {
    render(
      <EditProfileForm
        user={user}
        editForm={{ ...baseForm, email: 'new@example.com' }}
        setEditForm={() => {}}
        editError={null}
        emailVerifSent={false}
        saveSuccess={false}
        saving={false}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByText('Verification required.')).toBeInTheDocument();
  });

  it('shows the passed-in edit error', () => {
    render(
      <EditProfileForm
        user={user}
        editForm={baseForm}
        setEditForm={() => {}}
        editError="Something went wrong."
        emailVerifSent={false}
        saveSuccess={false}
        saving={false}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByText('Something went wrong.')).toBeInTheDocument();
  });

  it('disables Save Changes while saving', () => {
    render(
      <EditProfileForm
        user={user}
        editForm={baseForm}
        setEditForm={() => {}}
        editError={null}
        emailVerifSent={false}
        saveSuccess={false}
        saving
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByText('Saving...').closest('button')).toBeDisabled();
  });

  it('calls onSave and onCancel when their buttons are clicked', () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    render(
      <EditProfileForm
        user={user}
        editForm={baseForm}
        setEditForm={() => {}}
        editError={null}
        emailVerifSent={false}
        saveSuccess={false}
        saving={false}
        onSave={onSave}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByText('Save Changes'));
    expect(onSave).toHaveBeenCalled();
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
  });
});
