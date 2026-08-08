import { describe, it, expect } from 'vitest';
import { parseStatusDeepLink } from './App';

describe('parseStatusDeepLink', () => {
  it('redirects and extracts the booking id from a reupload-email deep link', () => {
    expect(parseStatusDeepLink('?view=status&bookingId=BK-000001')).toEqual({
      shouldRedirect: true,
      bookingId: 'BK-000001',
    });
  });

  it('redirects with no booking id when the link omits it', () => {
    expect(parseStatusDeepLink('?view=status')).toEqual({
      shouldRedirect: true,
      bookingId: null,
    });
  });

  it('does not redirect for a normal page load with no query string', () => {
    expect(parseStatusDeepLink('')).toEqual({
      shouldRedirect: false,
      bookingId: null,
    });
  });

  it('does not redirect for an unrelated view value', () => {
    expect(parseStatusDeepLink('?view=services')).toEqual({
      shouldRedirect: false,
      bookingId: null,
    });
  });
});
