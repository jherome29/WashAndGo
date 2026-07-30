import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import UserProfile, {
  ProfileHeader,
  AccountActionsGrid,
  MembershipSection,
  EditProfileForm,
  type EditFormState,
} from './UserProfile';
import { AuthProvider } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import type { AppUser } from '../App';
import type { PublicMembership } from '../lib/api';

vi.mock('../lib/api', () => ({
  api: {
    getMyMembership: vi.fn().mockResolvedValue(null),
    requestEmailChange: vi.fn().mockResolvedValue({}),
    requestPasswordReset: vi.fn().mockResolvedValue({}),
  },
}));

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

// ─── Container: UserProfile (default export) ─────────────────────────────────

function renderProfile(overrides: { onUserUpdate?: any; onGoBookings?: any } = {}) {
  return render(
    <AuthProvider user={user} token="test-token" forceRecoveryMode={false}>
      <UserProfile onUserUpdate={overrides.onUserUpdate} onGoBookings={overrides.onGoBookings} />
    </AuthProvider>,
  );
}

describe('UserProfile (container)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(supabase.auth.getUser).mockResolvedValue({ data: { user: { id: 'u1' } as any }, error: null } as any);
  });

  it('renders the profile header, actions, and a join-membership prompt', async () => {
    renderProfile();
    expect(screen.getAllByText('Juan Dela Cruz').length).toBeGreaterThan(0);
    expect(await screen.findByText('Not a Club Wash & Go member yet?')).toBeInTheDocument();
  });

  it('shows the membership card once getMyMembership resolves', async () => {
    const membership: PublicMembership = {
      membershipNo: 'WNG-000123', memberName: 'Juan Dela Cruz', status: 'ACTIVE', expiresAt: '2027-01-01',
      visitCount: 3, freeWashCredits: 0, firstWashUsed: true, visitsUntilNextFreeWash: 7,
      vehicles: [{ plateNumber: 'ABC1234', vehicleLabel: null }],
    };
    vi.mocked(api.getMyMembership).mockResolvedValueOnce(membership);
    renderProfile();
    expect(await screen.findByText('WNG-000123')).toBeInTheDocument();
  });

  it('opens the edit form pre-filled with the current profile values', () => {
    renderProfile();
    fireEvent.click(screen.getAllByText('Edit Profile')[0]);
    expect(screen.getByDisplayValue('Juan Dela Cruz')).toBeInTheDocument();
    expect(screen.getByDisplayValue('09171234567')).toBeInTheDocument();
  });

  it('saves profile changes and shows a success toast', async () => {
    const onUserUpdate = vi.fn();
    renderProfile({ onUserUpdate });
    fireEvent.click(screen.getAllByText('Edit Profile')[0]);

    fireEvent.change(screen.getByDisplayValue('Juan Dela Cruz'), { target: { value: 'Juan D. Cruz' } });
    fireEvent.click(screen.getByText('Save Changes'));

    await waitFor(() => expect(onUserUpdate).toHaveBeenCalledWith(expect.objectContaining({ name: 'Juan D. Cruz' })));
    expect(await screen.findByText('Profile updated successfully')).toBeInTheDocument();
  });

  it('sends an email verification link when the email is changed', async () => {
    renderProfile();
    fireEvent.click(screen.getAllByText('Edit Profile')[0]);

    fireEvent.change(screen.getByDisplayValue('juan@example.com'), { target: { value: 'new@example.com' } });
    fireEvent.click(screen.getByText('Save Changes'));

    await waitFor(() => expect(api.requestEmailChange).toHaveBeenCalledWith('new@example.com', 'test-token'));
    expect(await screen.findByText(/Verification email sent to new@example.com/)).toBeInTheDocument();
  });

  it('rejects an invalid phone number without saving', () => {
    renderProfile();
    fireEvent.click(screen.getAllByText('Edit Profile')[0]);

    fireEvent.change(screen.getByDisplayValue('09171234567'), { target: { value: '0917' } });
    fireEvent.click(screen.getByText('Save Changes'));

    expect(screen.getByText(/Must be 11 digits starting with 09/)).toBeInTheDocument();
    expect(api.requestEmailChange).not.toHaveBeenCalled();
  });

  it('sends a password reset link', async () => {
    renderProfile();
    fireEvent.click(screen.getByText('Reset Password'));
    await waitFor(() =>
      expect(api.requestPasswordReset).toHaveBeenCalledWith(expect.objectContaining({ email: 'juan@example.com' })),
    );
  });

  it('calls onGoBookings when "Go to My Bookings" is clicked', () => {
    const onGoBookings = vi.fn();
    renderProfile({ onGoBookings });
    fireEvent.click(screen.getByText('Go to My Bookings'));
    expect(onGoBookings).toHaveBeenCalled();
  });

  it('renders nothing when there is no logged-in user', () => {
    const { container } = render(
      <AuthProvider user={null} token={null} forceRecoveryMode={false}>
        <UserProfile />
      </AuthProvider>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
