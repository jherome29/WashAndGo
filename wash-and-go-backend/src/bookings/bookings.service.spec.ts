import { stripHtml } from './bookings.service';
import { BookingsService } from './bookings.service';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { EmailService } from '../email/email.service';
import { AuditLogService } from '../audit/audit-log.service';

describe('stripHtml', () => {
  it('removes script tags, keeps text content', () => {
    expect(stripHtml('<script>alert(1)</script>John')).toBe('John');
  });

  it('removes nested HTML tags', () => {
    expect(stripHtml('<b><i>bold</i></b>')).toBe('bold');
  });

  it('passes plain text unchanged', () => {
    expect(stripHtml('Maria Santos')).toBe('Maria Santos');
  });

  it('trims leading and trailing whitespace', () => {
    expect(stripHtml('  hello  ')).toBe('hello');
  });

  it('strips img tags', () => {
    expect(stripHtml('<img src="x" onerror="alert(1)">caption')).toBe('caption');
  });
});

describe('BookingsService.slotFitsBeforeClose', () => {
  let service: BookingsService;

  beforeEach(() => {
    // Constructor only assigns injected values — null is safe for pure-function testing
    service = new BookingsService(null as any, null as any, null as any);
  });

  it('allows slot with enough time before close', () => {
    // 09:00 AM + 1h = 10:00 AM, close is 17:00 → fits
    expect((service as any).slotFitsBeforeClose('09:00 AM', 1, '17:00')).toBe(true);
  });

  it('allows slot ending exactly at close time', () => {
    // 16:00 PM + 1h = 17:00 = close → fits (<=)
    expect((service as any).slotFitsBeforeClose('04:00 PM', 1, '17:00')).toBe(true);
  });

  it('rejects slot that would run past close time', () => {
    // 04:00 PM + 2h = 18:00 > close 17:00 → does not fit
    expect((service as any).slotFitsBeforeClose('04:00 PM', 2, '17:00')).toBe(false);
  });

  it('handles PM conversion correctly for 12:00 PM', () => {
    // 12:00 PM = noon (720 mins) + 1h = 780 mins, close = 17:00 = 1020 mins → fits
    expect((service as any).slotFitsBeforeClose('12:00 PM', 1, '17:00')).toBe(true);
  });

  it('handles AM edge case: 12:00 AM = midnight', () => {
    // 12:00 AM = 0 mins + 1h = 60 mins, close = 17:00 = 1020 mins → fits
    expect((service as any).slotFitsBeforeClose('12:00 AM', 1, '17:00')).toBe(true);
  });
});

describe('BookingsService — guest email requirement', () => {
  let service: BookingsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingsService,
        { provide: SupabaseService, useValue: { getAdminClient: jest.fn(), getClient: jest.fn() } },
        { provide: EmailService, useValue: {} },
        { provide: AuditLogService, useValue: { log: jest.fn() } },
      ],
    }).compile();
    service = module.get<BookingsService>(BookingsService);
  });

  it('throws BadRequestException when guest provides no email', async () => {
    const dto: any = {
      customerName: 'Test Guest',
      customerPhone: '09123456789',
      serviceId: 'svc-1',
      vehicleSize: 'SMALL',
      vehicleType: 'VEHICLE',
      date: '2026-07-15',
      timeSlot: '09:00 AM',
      // customerEmail intentionally absent
    };
    await expect(service.create(dto, undefined)).rejects.toThrow(BadRequestException);
    await expect(service.create(dto, undefined)).rejects.toThrow('Email is required for guest bookings');
  });

  it('does NOT throw for logged-in user with no email in DTO', async () => {
    // userId provided — email will be fetched from auth. The check should be skipped.
    // The call will eventually throw NotFoundException for the fake serviceId,
    // but it must NOT throw "Email is required for guest bookings".
    const dto: any = {
      customerName: 'Registered User',
      customerPhone: '09123456789',
      serviceId: 'svc-fake',
      vehicleSize: 'SMALL',
      vehicleType: 'VEHICLE',
      date: '2026-07-15',
      timeSlot: '09:00 AM',
      // no customerEmail, but userId provided below
    };
    // Mock supabase to return null service (NotFoundException), not the email error
    (service as any).supabase = {
      getAdminClient: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    };
    await expect(service.create(dto, 'user-uuid-123')).rejects.not.toThrow('Email is required for guest bookings');
  });
});
