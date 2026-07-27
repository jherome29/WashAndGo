import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AuthPage, {
  getHeading,
  getSubtitle,
  getEmailStepMessage,
  getEmailStepInstructions,
  getSubmitLabel,
} from './AuthPage';
import { AuthProvider } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({
  api: {
    requestPasswordReset: vi.fn().mockResolvedValue({}),
    signup: vi.fn().mockResolvedValue({}),
  },
}));

describe('getHeading', () => {
  it('prioritizes confirmed over everything else', () => {
    expect(getHeading(true, true, true, 'login')).toBe('CHECK YOUR EMAIL');
  });
  it('shows CHECK YOUR EMAIL when reset link was sent', () => {
    expect(getHeading(false, true, false, 'forgot')).toBe('CHECK YOUR EMAIL');
  });
  it('shows PASSWORD UPDATED after recovery is done', () => {
    expect(getHeading(false, false, true, 'recovery')).toBe('PASSWORD UPDATED');
  });
  it('shows WELCOME BACK for login mode', () => {
    expect(getHeading(false, false, false, 'login')).toBe('WELCOME BACK');
  });
  it('shows CREATE / RESET PASSWORD for forgot mode', () => {
    expect(getHeading(false, false, false, 'forgot')).toBe('CREATE / RESET PASSWORD');
  });
  it('shows SET APP PASSWORD for recovery mode', () => {
    expect(getHeading(false, false, false, 'recovery')).toBe('SET APP PASSWORD');
  });
  it('defaults to CREATE ACCOUNT for signup mode', () => {
    expect(getHeading(false, false, false, 'signup')).toBe('CREATE ACCOUNT');
  });
});

describe('getSubtitle', () => {
  it('prioritizes confirmed', () => {
    expect(getSubtitle(true, true, true, 'login')).toBe('Confirm your email to activate your account.');
  });
  it('shows reset-sent message', () => {
    expect(getSubtitle(false, true, false, 'forgot')).toBe('If an account exists, a reset link has been sent.');
  });
  it('shows recovery-done message', () => {
    expect(getSubtitle(false, false, true, 'recovery')).toBe('Your app password is ready. Sign in using email/password or Google.');
  });
  it('shows login subtitle', () => {
    expect(getSubtitle(false, false, false, 'login')).toBe('Sign in to manage your appointments.');
  });
  it('shows forgot subtitle', () => {
    expect(getSubtitle(false, false, false, 'forgot')).toBe("Enter your email and we'll send a create/reset app password link.");
  });
  it('shows recovery subtitle', () => {
    expect(getSubtitle(false, false, false, 'recovery')).toBe('Set a password so this account can use email/password login too.');
  });
  it('defaults to signup subtitle', () => {
    expect(getSubtitle(false, false, false, 'signup')).toBe('Register to start booking auto services.');
  });
});

describe('getEmailStepMessage', () => {
  it('shows confirmation message when confirmed', () => {
    expect(getEmailStepMessage(true, false)).toBe('We sent a confirmation link to:');
  });
  it('shows reset message when reset was sent', () => {
    expect(getEmailStepMessage(false, true)).toBe('If an account exists, a password link was sent to:');
  });
  it('prioritizes confirmed over resetSent', () => {
    expect(getEmailStepMessage(true, true)).toBe('We sent a confirmation link to:');
  });
  it('falls back to the recovery-success message', () => {
    expect(getEmailStepMessage(false, false)).toBe('Your app password was updated successfully.');
  });
});

describe('getEmailStepInstructions', () => {
  it('shows confirm instructions', () => {
    expect(getEmailStepInstructions(true, false)).toBe('Click the link in the email to activate your account.');
  });
  it('shows reset instructions', () => {
    expect(getEmailStepInstructions(false, true)).toBe('Use that link to create or reset your app password.');
  });
  it('falls back to recovery instructions', () => {
    expect(getEmailStepInstructions(false, false)).toBe('Use your new app password in manual sign-in when needed.');
  });
});

describe('getSubmitLabel', () => {
  it('shows PLEASE WAIT while loading regardless of mode', () => {
    expect(getSubmitLabel(true, 'login')).toBe('PLEASE WAIT...');
    expect(getSubmitLabel(true, 'signup')).toBe('PLEASE WAIT...');
  });
  it('shows SIGN IN for login mode when not loading', () => {
    expect(getSubmitLabel(false, 'login')).toBe('SIGN IN');
  });
  it('shows CREATE ACCOUNT for any non-login mode when not loading', () => {
    expect(getSubmitLabel(false, 'signup')).toBe('CREATE ACCOUNT');
    expect(getSubmitLabel(false, 'forgot')).toBe('CREATE ACCOUNT');
  });
});

// ─── Container: AuthPage (default export) ────────────────────────────────────

function renderAuth(forceRecoveryMode = false, onRecoveryModeHandled = vi.fn()) {
  const onAuthSuccess = vi.fn();
  const utils = render(
    <AuthProvider user={null} token={null} forceRecoveryMode={forceRecoveryMode}>
      <AuthPage onAuthSuccess={onAuthSuccess} onRecoveryModeHandled={onRecoveryModeHandled} />
    </AuthProvider>,
  );
  return { ...utils, onAuthSuccess };
}

describe('AuthPage (container)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
      data: { user: { id: 'u1', email: 'juan@example.com' } as any }, error: null,
    } as any);
  });

  it('renders the login form by default', () => {
    renderAuth();
    expect(screen.getByText('WELCOME BACK')).toBeInTheDocument();
    expect(screen.getByLabelText('Email Address')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });

  it('logs in successfully and calls onAuthSuccess', async () => {
    const { onAuthSuccess } = renderAuth();
    fireEvent.change(screen.getByPlaceholderText('juan@email.com'), { target: { value: 'juan@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('********'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'SIGN IN' }));

    await waitFor(() =>
      expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'juan@example.com', password: 'password123' }),
    );
    await waitFor(() => expect(onAuthSuccess).toHaveBeenCalled());
  });

  it('shows a friendly error and Google/reset hints on invalid credentials', async () => {
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValueOnce({
      data: { user: null }, error: { message: 'Invalid login credentials' } as any,
    } as any);
    renderAuth();
    fireEvent.change(screen.getByPlaceholderText('juan@email.com'), { target: { value: 'juan@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('********'), { target: { value: 'wrongpass' } });
    fireEvent.click(screen.getByRole('button', { name: 'SIGN IN' }));

    expect(await screen.findByText(/If this account was created with Google/)).toBeInTheDocument();
    // "Continue with Google" appears both as this hint link and as the main
    // OAuth button below the form -- both are real, visible affordances.
    expect(screen.getAllByText('Continue with Google').length).toBeGreaterThan(0);
    expect(screen.getByText('Create/Reset Password')).toBeInTheDocument();
  });

  it('toggles to signup mode and shows the extra fields', () => {
    renderAuth();
    fireEvent.click(screen.getByText('Sign Up'));
    // "CREATE ACCOUNT" is both the heading and the submit button's label.
    expect(screen.getByRole('heading', { name: 'CREATE ACCOUNT' })).toBeInTheDocument();
    expect(screen.getByLabelText('Full Name')).toBeInTheDocument();
    expect(screen.getByLabelText(/Confirm Password/)).toBeInTheDocument();
  });

  it('rejects mismatched signup passwords without calling the API', async () => {
    renderAuth();
    fireEvent.click(screen.getByText('Sign Up'));

    fireEvent.change(screen.getByLabelText('Full Name'), { target: { value: 'Juan Dela Cruz' } });
    fireEvent.change(screen.getByPlaceholderText('juan@email.com'), { target: { value: 'juan@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('********'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByPlaceholderText('Re-enter password'), { target: { value: 'different' } });
    fireEvent.click(screen.getByRole('button', { name: 'CREATE ACCOUNT' }));

    expect(await screen.findByText('Passwords do not match.')).toBeInTheDocument();
    expect(api.signup).not.toHaveBeenCalled();
  });

  it('signs up successfully and shows the check-your-email step', async () => {
    renderAuth();
    fireEvent.click(screen.getByText('Sign Up'));

    fireEvent.change(screen.getByLabelText('Full Name'), { target: { value: 'Juan Dela Cruz' } });
    fireEvent.change(screen.getByPlaceholderText('juan@email.com'), { target: { value: 'juan@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('********'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByPlaceholderText('Re-enter password'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'CREATE ACCOUNT' }));

    await waitFor(() =>
      expect(api.signup).toHaveBeenCalledWith(expect.objectContaining({ fullName: 'Juan Dela Cruz', email: 'juan@example.com' })),
    );
    expect(await screen.findByText('CHECK YOUR EMAIL')).toBeInTheDocument();
    expect(screen.getByText('juan@example.com')).toBeInTheDocument();
  });

  it('requests a password reset link from forgot-password mode', async () => {
    renderAuth();
    fireEvent.click(screen.getByText('Create/Reset password'));
    expect(screen.getByText('CREATE / RESET PASSWORD')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('juan@email.com'), { target: { value: 'juan@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'SEND PASSWORD LINK' }));

    await waitFor(() => expect(api.requestPasswordReset).toHaveBeenCalledWith(expect.objectContaining({ email: 'juan@example.com' })));
    expect(await screen.findByText('CHECK YOUR EMAIL')).toBeInTheDocument();
  });

  it('completes the recovery flow: sets a new password, signs out, and hands control back', async () => {
    const onRecoveryModeHandled = vi.fn();
    renderAuth(true, onRecoveryModeHandled);
    expect(await screen.findByText('SET APP PASSWORD')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('New App Password'), { target: { value: 'newpassword123' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'newpassword123' } });
    fireEvent.click(screen.getByRole('button', { name: 'SET PASSWORD' }));

    await waitFor(() => expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: 'newpassword123' }));
    await waitFor(() => expect(supabase.auth.signOut).toHaveBeenCalled());
    expect(onRecoveryModeHandled).toHaveBeenCalled();
    expect(await screen.findByText('PASSWORD UPDATED')).toBeInTheDocument();
  });

  it('rejects mismatched recovery passwords', async () => {
    renderAuth(true);
    await screen.findByText('SET APP PASSWORD');

    fireEvent.change(screen.getByLabelText('New App Password'), { target: { value: 'newpassword123' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'different123' } });
    fireEvent.click(screen.getByRole('button', { name: 'SET PASSWORD' }));

    expect(await screen.findByText('Passwords do not match.')).toBeInTheDocument();
    expect(supabase.auth.updateUser).not.toHaveBeenCalled();
  });

  it('signs in with Google', async () => {
    renderAuth();
    fireEvent.click(screen.getByText('Continue with Google'));
    await waitFor(() => expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith(expect.objectContaining({ provider: 'google' })));
  });
});
