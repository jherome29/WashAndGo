import { describe, it, expect } from 'vitest';
import {
  getHeading,
  getSubtitle,
  getEmailStepMessage,
  getEmailStepInstructions,
  getSubmitLabel,
} from './AuthPage';

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
