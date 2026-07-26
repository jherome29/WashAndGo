import { normalizePlate } from './plate.util';

describe('normalizePlate', () => {
  it('uppercases lowercase input', () => {
    expect(normalizePlate('asd1234')).toBe('ASD1234');
  });

  it('strips internal spaces', () => {
    expect(normalizePlate('ASD 1234')).toBe('ASD1234');
  });

  it('strips dashes', () => {
    expect(normalizePlate('ASD-1234')).toBe('ASD1234');
  });

  it('strips leading and trailing whitespace', () => {
    expect(normalizePlate('  asd1234  ')).toBe('ASD1234');
  });

  it('produces the same canonical value regardless of how it was typed', () => {
    const variants = ['asd1234', 'ASD 1234', 'asd-1234', ' Asd1234 '];
    const normalized = variants.map(normalizePlate);
    expect(new Set(normalized).size).toBe(1);
    expect(normalized[0]).toBe('ASD1234');
  });

  it('returns an empty string for input that is only whitespace/punctuation', () => {
    expect(normalizePlate('   - ')).toBe('');
  });
});
