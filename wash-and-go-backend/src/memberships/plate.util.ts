/**
 * Canonicalizes a plate number so the same physical plate always matches
 * regardless of how a human typed it — case, stray spaces, dashes.
 * Single source of truth: called at every write and the one shared read
 * chokepoint (see MembershipsService.findActiveMembershipForPlate).
 */
export function normalizePlate(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}
