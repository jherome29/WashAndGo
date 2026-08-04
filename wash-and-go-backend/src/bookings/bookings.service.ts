import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
// striptags uses `export =`; this tsconfig has no esModuleInterop, so a default import resolves to `.default` (undefined) at runtime.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import striptags = require('striptags');
import { SupabaseService } from '../supabase/supabase.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { EmailService } from '../email/email.service';
import { AuditLogService } from '../audit/audit-log.service';
import { MembershipsService } from '../memberships/memberships.service';
import { normalizePlate } from '../memberships/plate.util';

const CAPACITY: Record<string, number> = { LUBE: 1, GROOMING: 2, COATING: 2 };
const SLOT_CHECK_STATUSES = ['PENDING_VERIFICATION', 'REUPLOAD_SUBMITTED', 'CONFIRMED', 'IN_PROGRESS'];

export function stripHtml(str: string): string {
  // Hand-rolled tag-matching regex is what CodeQL's js/bad-tag-filter and
  // js/incomplete-multi-character-sanitization queries exist to catch --
  // "parsing general HTML using regular expressions is impossible" (their
  // own wording). striptags is a purpose-built, dependency-free tag
  // stripper; delegating removes the flawed pattern from this repo entirely
  // rather than trying to out-regex a class of bug regex can't fully solve.
  return striptags(str).trim();
}

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    private supabase: SupabaseService,
    private readonly emailService: EmailService,
    private readonly auditLog: AuditLogService,
    private readonly membershipsService: MembershipsService,
  ) {}

  async create(dto: CreateBookingDto, userId?: string) {
    if (dto.honeypot) throw new BadRequestException('Invalid booking request');
    if (!userId && !dto.customerEmail) {
      throw new BadRequestException('Email is required for guest bookings');
    }

    const { data: service, error: svcError } = await this.supabase
      .getAdminClient()
      .from('services')
      .select('*')
      .eq('id', dto.serviceId)
      .eq('is_active', true)
      .single();

    if (svcError || !service) {
      throw new NotFoundException(`Service '${dto.serviceId}' not found`);
    }

    // Validate fuelType: required for LUBE, forbidden for others
    if (service.category === 'LUBE' && !dto.fuelType) {
      throw new BadRequestException('fuelType is required for LUBE services');
    }
    if (service.category !== 'LUBE' && dto.fuelType) {
      throw new BadRequestException('fuelType is not allowed for non-LUBE services');
    }

    const isAvailable = await this.isSlotAvailable(dto.date, dto.timeSlot, service.category);
    if (!isAvailable) {
      throw new ConflictException(`Time slot ${dto.timeSlot} on ${dto.date} is already full for this service type.`);
    }

    // Validate that the service duration fits within operating hours for this date
    const { data: schedule } = await this.supabase.getAdminClient()
      .from('branch_schedules').select('close_time, closed_days').limit(1).single();
    const { data: scheduleOverride } = await this.supabase.getAdminClient()
      .from('schedule_overrides').select('is_closed, custom_close').eq('override_date', dto.date).maybeSingle();
    if (scheduleOverride?.is_closed) {
      throw new BadRequestException('The shop is closed on this date.');
    }
    // Closed weekdays apply unless an explicit per-date override opens the shop
    const closedDays: number[] = Array.isArray(schedule?.closed_days) ? schedule.closed_days : [];
    if (!scheduleOverride && closedDays.includes(this.weekdayOf(dto.date))) {
      throw new BadRequestException('The shop is closed on this date.');
    }
    const closeTime = scheduleOverride?.custom_close || schedule?.close_time || '17:00';
    if (!this.slotPermitted(dto.timeSlot, service.duration_hours || 1, closeTime)) {
      throw new BadRequestException(`Time slot ${dto.timeSlot} does not allow enough time to complete this service before closing.`);
    }

    let totalPrice: number;
    if (service.is_lube_flat && service.lube_prices && dto.fuelType) {
      totalPrice = service.lube_prices[dto.fuelType];
    } else if (service.is_lube_flat) {
      totalPrice = service.price_small;
    } else {
      const sizeKey = `price_${dto.vehicleSize.toLowerCase()}`;
      totalPrice = service[sizeKey];
    }

    // Club Wash & Go membership discount (if the plate matches an active membership)
    const discount = await this.membershipsService.computeDiscount(dto.plateNumber, service, totalPrice);
    totalPrice = discount.totalPrice;

    const downPaymentAmount = Math.round(totalPrice * 0.3);

    const id = `BK-${Math.floor(100000 + Math.random() * 900000)}`;
    const plainToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(plainToken).digest('hex');
    // 48h base expiry, extended +24h per holiday/closed weekday in the window
    // so tokens don't lapse while staff can't process the booking
    const nowMs = Date.now();
    const tokenExpiry = await this.adjustTokenExpiryForClosures(
      nowMs, nowMs + 48 * 60 * 60 * 1000, closedDays,
    );

    // Resolve customer email: explicit > auth user email
    let customerEmail = dto.customerEmail;
    if (!customerEmail && userId) {
      customerEmail = await this.getUserEmail(userId);
    }

    // Admin walk-in bookings are auto-confirmed — no payment proof needed
    const isAdminBooking = userId ? await this.isAdmin(userId) : false;
    if (!isAdminBooking && !dto.paymentProofPath) {
      throw new BadRequestException('Payment proof is required');
    }
    const status = isAdminBooking ? 'CONFIRMED' : 'PENDING_VERIFICATION';

    const { data, error } = await this.supabase
      .getAdminClient()
      .from('bookings')
      .insert({
        id,
        user_id: userId || null,
        customer_name: stripHtml(dto.customerName),
        customer_phone: dto.customerPhone,
        customer_email: customerEmail || null,
        service_id: dto.serviceId,
        service_name: service.name,
        vehicle_size: dto.vehicleSize,
        vehicle_type: dto.vehicleType || null,
        fuel_type: dto.fuelType || null,
        oil_type: dto.oilType || null,
        date: dto.date,
        time_slot: dto.timeSlot,
        plate_number: dto.plateNumber || null,
        total_price: totalPrice,
        down_payment_amount: downPaymentAmount,
        status,
        payment_proof_path: dto.paymentProofPath || null,
        payment_method: dto.paymentMethod || null,
        status_token_hash: tokenHash,
        status_token_expires_at: tokenExpiry,
        membership_id: discount.membershipId,
        membership_discount_type: discount.discountType,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    const booking = this.toBooking(data);

    void this.insertStatusUpdate(id, isAdminBooking ? 'Walk-in booking created and confirmed.' : 'Booking created — payment proof submitted for review.');
    void this.notifyBookingCreated(booking, dto.customerName, customerEmail, status === 'PENDING_VERIFICATION');
    return { ...booking, statusToken: plainToken };
  }

  async findByIdForGuest(id: string) {
    const { data, error } = await this.supabase
      .getAdminClient()
      .from('bookings')
      .select('*, booking_updates(*)')
      .eq('id', id.toUpperCase())
      .single();

    if (error || !data) throw new NotFoundException(`Booking ${id} not found`);

    return this.toBooking(data);
  }

  async findById(id: string, requestingUserId?: string) {
    if (!requestingUserId) throw new ForbiddenException('Authentication required');

    const { data, error } = await this.supabase
      .getAdminClient()
      .from('bookings')
      .select('*, booking_updates(*)')
      .eq('id', id.toUpperCase())
      .single();

    if (error || !data) throw new NotFoundException(`Booking ${id} not found`);

    const adminCheck = await this.isAdmin(requestingUserId);
    if (!adminCheck && data.user_id !== requestingUserId) {
      throw new ForbiddenException('Access denied');
    }

    return this.toBooking(data);
  }

  async findAll(filters?: { status?: string; date?: string }, requestingUserId?: string) {
    await this.requireAdmin(requestingUserId);

    let query = this.supabase
      .getAdminClient()
      .from('bookings')
      .select('*, booking_updates(*)')
      .order('created_at', { ascending: false });

    if (filters?.status && filters.status !== 'ALL') {
      query = query.eq('status', filters.status);
    }
    if (filters?.date) {
      query = query.eq('date', filters.date);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data.map(row => this.toBooking(row));
  }

  async getBookedSlots(date: string, category?: string): Promise<string[]> {
    const maxCapacity = category ? (CAPACITY[category] ?? 1) : 1;

    let query = this.supabase
      .getAdminClient()
      .from('bookings')
      .select('time_slot, services!inner(category)')
      .eq('date', date)
      .in('status', SLOT_CHECK_STATUSES);

    if (category) {
      query = query.eq('services.category', category);
    }

    const { data } = await query;
    const slotCounts: Record<string, number> = {};
    if (data) {
      for (const b of data) {
        slotCounts[b.time_slot] = (slotCounts[b.time_slot] || 0) + 1;
      }
    }

    return Object.keys(slotCounts).filter(slot => slotCounts[slot] >= maxCapacity);
  }

  async getAvailability(date: string, serviceId?: string, category?: string) {
    let resolvedCategory = category;
    let durationHours = 1;

    if (serviceId) {
      const { data: svc } = await this.supabase
        .getAdminClient()
        .from('services')
        .select('category, duration_hours')
        .eq('id', serviceId)
        .single();
      if (svc) {
        resolvedCategory = svc.category;
        durationHours = svc.duration_hours || 1;
      }
    }

    // Fetch schedule for the day
    const { data: schedule } = await this.supabase
      .getAdminClient()
      .from('branch_schedules')
      .select('*')
      .limit(1)
      .single();

    const { data: override } = await this.supabase
      .getAdminClient()
      .from('schedule_overrides')
      .select('*')
      .eq('override_date', date)
      .maybeSingle();

    if (override?.is_closed) return { date, slots: [], closed: true, label: override.label ?? null };

    // Closed weekdays apply unless an explicit per-date override opens the shop
    const closedDays: number[] = Array.isArray(schedule?.closed_days) ? schedule.closed_days : [];
    if (!override && closedDays.includes(this.weekdayOf(date))) {
      return { date, slots: [], closed: true, label: null };
    }

    const openTime = override?.custom_open || schedule?.open_time || '08:00';
    const closeTime = override?.custom_close || schedule?.close_time || '17:00';
    const intervalH = schedule?.slot_interval_h || 1;

    const slots = this.generateSlots(openTime, closeTime, intervalH);

    const bookedSlots = await this.getBookedSlots(date, resolvedCategory);
    const bookedSet = new Set(bookedSlots);

    return {
      date,
      closed: false,
      label: override?.label ?? null,
      slots: slots
        .filter(slot => this.slotPermitted(slot, durationHours, closeTime))
        .map(slot => ({
          time: slot,
          available: !bookedSet.has(slot),
        })),
    };
  }

  /** Public schedule info for the customer booking calendar. */
  async getScheduleInfo() {
    const [{ data: schedule }, { data: overrides }] = await Promise.all([
      this.supabase.getAdminClient()
        .from('branch_schedules')
        .select('open_time, close_time, closed_days')
        .limit(1)
        .maybeSingle(),
      this.supabase.getAdminClient()
        .from('schedule_overrides')
        .select('override_date, is_closed, custom_open, custom_close, label')
        .gte('override_date', this.manilaDateString(Date.now()))
        .order('override_date'),
    ]);

    return {
      openTime: schedule?.open_time || '08:00',
      closeTime: schedule?.close_time || '17:00',
      closedDays: Array.isArray(schedule?.closed_days) ? schedule.closed_days : [],
      overrides: (overrides || []).map(o => ({
        date: o.override_date,
        isClosed: o.is_closed,
        customOpen: o.custom_open,
        customClose: o.custom_close,
        label: o.label,
      })),
    };
  }

  async findMyBookings(userId: string) {
    const { data, error } = await this.supabase
      .getAdminClient()
      .from('bookings')
      .select('*, booking_updates(*)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return (data || []).map(row => this.toBooking(row));
  }

  async updateStatus(id: string, status: string, requestingUserId: string) {
    await this.requireAdmin(requestingUserId);

    const { data: existing } = await this.supabase
      .getAdminClient()
      .from('bookings')
      .select('status')
      .eq('id', id.toUpperCase())
      .maybeSingle();

    const { data, error } = await this.supabase
      .getAdminClient()
      .from('bookings')
      .update({ status })
      .eq('id', id.toUpperCase())
      .select()
      .maybeSingle();

    if (error) throw new BadRequestException(`Failed to update status: ${error.message}`);
    if (!data) throw new NotFoundException(`Booking ${id.toUpperCase()} not found`);

    void this.auditLog.log(requestingUserId, 'UPDATE_STATUS', id.toUpperCase(), { bookingId: id.toUpperCase(), newStatus: status });

    // Only fires on the transition INTO COMPLETED, not on a no-op re-save of an already-completed booking
    if (status === 'COMPLETED' && existing?.status !== 'COMPLETED') {
      await this.membershipsService.onBookingCompleted(data, requestingUserId);
    }

    const booking = this.toBooking(data);
    void this.notifyBookingStatusUpdated(booking, data.customer_email, data.user_id);
    return booking;
  }

  async confirmPayment(id: string, requestingUserId: string) {
    await this.requireAdmin(requestingUserId);

    const { data: existing } = await this.supabase
      .getAdminClient()
      .from('bookings')
      .select('status, customer_email, user_id')
      .eq('id', id.toUpperCase())
      .single();

    if (!existing) throw new NotFoundException(`Booking ${id} not found`);
    if (!['PENDING_VERIFICATION', 'REUPLOAD_SUBMITTED'].includes(existing.status)) {
      throw new BadRequestException('Booking must be in PENDING_VERIFICATION or REUPLOAD_SUBMITTED status to confirm');
    }

    const { data, error } = await this.supabase
      .getAdminClient()
      .from('bookings')
      .update({
        status: 'CONFIRMED',
        payment_reviewed_at: new Date().toISOString(),
        payment_reviewed_by: requestingUserId,
      })
      .eq('id', id.toUpperCase())
      .select()
      .single();

    if (error) throw new Error(error.message);
    void this.auditLog.log(requestingUserId, 'CONFIRM_PAYMENT', id.toUpperCase(), { bookingId: id.toUpperCase() });
    void this.insertStatusUpdate(id.toUpperCase(), 'Payment confirmed — booking approved.');
    const booking = this.toBooking(data);
    void this.notifyBookingStatusUpdated(booking, existing.customer_email, existing.user_id);
    return booking;
  }

  async declinePayment(id: string, declineReason: string, requestingUserId: string) {
    await this.requireAdmin(requestingUserId);

    const { data: existing } = await this.supabase
      .getAdminClient()
      .from('bookings')
      .select('status, customer_email, user_id, customer_name, service_name, date, time_slot')
      .eq('id', id.toUpperCase())
      .single();

    if (!existing) throw new NotFoundException(`Booking ${id} not found`);
    if (!['PENDING_VERIFICATION', 'REUPLOAD_SUBMITTED'].includes(existing.status)) {
      throw new BadRequestException('Booking must be in PENDING_VERIFICATION or REUPLOAD_SUBMITTED status to decline');
    }

    const sanitizedReason = stripHtml(declineReason);

    const { data, error } = await this.supabase
      .getAdminClient()
      .from('bookings')
      .update({
        status: 'REUPLOAD_REQUIRED',
        payment_decline_reason: sanitizedReason,
        payment_reviewed_at: new Date().toISOString(),
        payment_reviewed_by: requestingUserId,
      })
      .eq('id', id.toUpperCase())
      .select()
      .single();

    if (error) throw new Error(error.message);
    void this.auditLog.log(requestingUserId, 'DECLINE_PAYMENT', id.toUpperCase(), { bookingId: id.toUpperCase(), declineReason: sanitizedReason });
    void this.insertStatusUpdate(id.toUpperCase(), `Payment proof was declined. Reason: ${sanitizedReason}`);
    const booking = this.toBooking(data);

    void this.notifyPaymentDeclined(booking, existing.customer_email, existing.user_id, sanitizedReason);
    return booking;
  }

  async reuploadProof(id: string, paymentProofPath: string) {
    // Validate path before any DB query — reject paths outside proofs/ or with traversal
    if (!paymentProofPath.startsWith('proofs/') || paymentProofPath.includes('..')) {
      throw new BadRequestException('Invalid payment proof path');
    }

    const { data: existing } = await this.supabase
      .getAdminClient()
      .from('bookings')
      .select('status, user_id')
      .eq('id', id.toUpperCase())
      .single();

    if (!existing) throw new NotFoundException(`Booking ${id} not found`);
    if (existing.status !== 'REUPLOAD_REQUIRED') {
      throw new BadRequestException('Can only reupload proof for REUPLOAD_REQUIRED bookings');
    }

    const { data, error } = await this.supabase
      .getAdminClient()
      .from('bookings')
      .update({
        status: 'REUPLOAD_SUBMITTED',
        payment_proof_path: paymentProofPath,
        payment_decline_reason: null,
      })
      .eq('id', id.toUpperCase())
      .select()
      .single();

    if (error) throw new Error(error.message);

    void this.insertStatusUpdate(id.toUpperCase(), 'Customer submitted new payment proof for review.');
    void this.notifyAdminsPaymentReview(this.toBooking(data));
    return this.toBooking(data);
  }

  async adminUpdate(id: string, updates: Record<string, any>, requestingUserId: string) {
    await this.requireAdmin(requestingUserId);

    // Whitelist updatable fields
    const allowed = ['date', 'time_slot', 'plate_number', 'customer_name', 'customer_phone', 'customer_email', 'notes'];
    const safeUpdates: Record<string, any> = {};
    for (const key of allowed) {
      if (updates[key] !== undefined) {
        if (key === 'plate_number' && typeof updates[key] === 'string') {
          safeUpdates[key] = normalizePlate(updates[key]);
        } else {
          safeUpdates[key] = typeof updates[key] === 'string' ? stripHtml(updates[key]) : updates[key];
        }
      }
    }

    const { data, error } = await this.supabase
      .getAdminClient()
      .from('bookings')
      .update(safeUpdates)
      .eq('id', id.toUpperCase())
      .select()
      .single();

    if (error) throw new BadRequestException(`Update failed: ${error.message}`);
    if (!data) throw new NotFoundException(`Booking ${id} not found`);
    void this.auditLog.log(requestingUserId, 'EDIT_BOOKING', id.toUpperCase(), { bookingId: id.toUpperCase(), updatedFields: Object.keys(safeUpdates) });
    return this.toBooking(data);
  }

  async addUpdate(id: string, message: string, imageUrls: string[], requestingUserId: string) {
    await this.requireAdmin(requestingUserId);

    const { data: booking, error: bookingError } = await this.supabase
      .getAdminClient()
      .from('bookings')
      .select('*')
      .eq('id', id.toUpperCase())
      .single();

    if (bookingError || !booking) throw new NotFoundException(`Booking ${id} not found`);

    const { data: update, error } = await this.supabase
      .getAdminClient()
      .from('booking_updates')
      .insert({
        booking_id: id.toUpperCase(),
        message: stripHtml(message),
        image_urls: imageUrls,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    void this.auditLog.log(requestingUserId, 'ADD_PROGRESS_UPDATE', id.toUpperCase(), { bookingId: id.toUpperCase(), message: stripHtml(message) });
    void this.notifyProgressUpdate(booking, update);

    return {
      id: update.id,
      timestamp: update.created_at,
      message: update.message,
      imageUrls: update.image_urls || [],
      imageUrl: (update.image_urls || [])[0],
    };
  }

  async checkAvailability(date: string, timeSlot: string, category?: string) {
    const available = await this.isSlotAvailable(date, timeSlot, category);
    return { date, timeSlot, available, category };
  }

  private async insertStatusUpdate(bookingId: string, message: string): Promise<void> {
    try {
      await this.supabase
        .getAdminClient()
        .from('booking_updates')
        .insert({ booking_id: bookingId.toUpperCase(), message, image_urls: [] });
    } catch (err: any) {
      this.logger.warn(`Failed to insert status history for ${bookingId}: ${err?.message}`);
    }
  }

  private statusChangeMessage(status: string, extra?: string): string {
    const map: Record<string, string> = {
      CONFIRMED:            'Payment confirmed — booking approved.',
      IN_PROGRESS:          'Service is now in progress.',
      COMPLETED:            'Service completed. Thank you for your visit!',
      CANCELLED:            'Booking has been cancelled.',
      REUPLOAD_REQUIRED:    `Payment proof was declined.${extra ? ` Reason: ${extra}` : ''}`,
      REUPLOAD_SUBMITTED:   'Customer submitted new payment proof for review.',
      PENDING_VERIFICATION: 'Payment proof submitted — awaiting review.',
    };
    return map[status] ?? `Status updated to ${status}.`;
  }

  private async requireAdmin(userId?: string) {
    if (!userId) throw new ForbiddenException('Authentication required');
    const { data: profile } = await this.supabase
      .getAdminClient()
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();
    if (profile?.role !== 'admin') throw new ForbiddenException('Admin access required');
  }

  private async isAdmin(userId: string): Promise<boolean> {
    const { data } = await this.supabase
      .getAdminClient()
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();
    return data?.role === 'admin';
  }

  private async isSlotAvailable(date: string, timeSlot: string, serviceCategory?: string): Promise<boolean> {
    const maxCapacity = serviceCategory ? (CAPACITY[serviceCategory] ?? 1) : 1;

    let query = this.supabase
      .getAdminClient()
      .from('bookings')
      .select('id, services!inner(category)')
      .eq('date', date)
      .eq('time_slot', timeSlot)
      .in('status', SLOT_CHECK_STATUSES);

    if (serviceCategory) {
      query = query.eq('services.category', serviceCategory);
    }

    const { data } = await query;
    return !data || data.length < maxCapacity;
  }

  private generateSlots(open: string, close: string, intervalH: number): string[] {
    const slots: string[] = [];
    const [openH, openM] = open.split(':').map(Number);
    const [closeH, closeM] = close.split(':').map(Number);
    const openMins = openH * 60 + (openM || 0);
    const closeMins = closeH * 60 + (closeM || 0);

    for (let mins = openMins; mins < closeMins; mins += intervalH * 60) {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      const suffix = h >= 12 ? 'PM' : 'AM';
      const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
      slots.push(`${String(displayH).padStart(2, '0')}:${String(m).padStart(2, '0')} ${suffix}`);
    }
    return slots;
  }

  /** Day of week (0=Sun ... 6=Sat) for a 'YYYY-MM-DD' string, independent of server timezone. */
  private weekdayOf(dateStr: string): number {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  }

  /** 'YYYY-MM-DD' in Asia/Manila for a Unix timestamp. */
  private manilaDateString(ms: number): string {
    return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  }

  /**
   * Multi-day services (>= 24h) can never finish before closing on the same day —
   * they only need the first slot inside the operating day. Short services must
   * still fit before close.
   */
  private slotPermitted(slot: string, durationH: number, closeTime: string): boolean {
    return durationH >= 24 || this.slotFitsBeforeClose(slot, durationH, closeTime);
  }

  /**
   * Extends the status-token expiry by 24h for each holiday (schedule_overrides
   * with is_closed) or closed weekday inside the expiry window, so tokens don't
   * lapse while the shop is closed. Capped at 14 extensions.
   */
  private async adjustTokenExpiryForClosures(
    startMs: number,
    baseExpiryMs: number,
    closedDays: number[],
  ): Promise<string> {
    const DAY_MS = 24 * 60 * 60 * 1000;
    const MAX_EXTENSION_DAYS = 14;

    if (closedDays.length >= 7) {
      // Degenerate config: every weekday closed — extend by the cap and stop
      return new Date(baseExpiryMs + MAX_EXTENSION_DAYS * DAY_MS).toISOString();
    }

    const { data: holidayRows } = await this.supabase.getAdminClient()
      .from('schedule_overrides')
      .select('override_date')
      .eq('is_closed', true)
      .gte('override_date', this.manilaDateString(startMs))
      .lte('override_date', this.manilaDateString(baseExpiryMs + MAX_EXTENSION_DAYS * DAY_MS));
    const holidays = new Set((holidayRows || []).map(r => r.override_date));

    let expiryMs = baseExpiryMs;
    let extensions = 0;
    for (let dayMs = startMs; dayMs <= expiryMs && extensions < MAX_EXTENSION_DAYS; dayMs += DAY_MS) {
      const dateStr = this.manilaDateString(dayMs);
      if (holidays.has(dateStr) || closedDays.includes(this.weekdayOf(dateStr))) {
        expiryMs += DAY_MS;
        extensions++;
      }
    }
    return new Date(expiryMs).toISOString();
  }

  private slotFitsBeforeClose(slot: string, durationH: number, closeTime: string): boolean {
    const [timePart, period] = slot.split(' ');
    const [h, m] = timePart.split(':').map(Number);
    let hour24 = h;
    if (period === 'PM' && h !== 12) hour24 = h + 12;
    if (period === 'AM' && h === 12) hour24 = 0;
    const slotMins = hour24 * 60 + m;

    const [closeH, closeM] = closeTime.split(':').map(Number);
    const closeMins = closeH * 60 + (closeM || 0);

    return slotMins + durationH * 60 <= closeMins;
  }

  private async notifyBookingCreated(booking: any, customerName: string, customerEmail?: string | null, _isPaymentReview = false) {
    try {
      if (customerEmail) {
        await this.emailService.sendBookingCreatedCustomerEmail({
          to: customerEmail,
          customerName,
          bookingId: booking.id,
          serviceName: booking.serviceName,
          date: booking.date,
          timeSlot: booking.timeSlot,
          status: booking.status,
        });
      }
      await this.emailService.sendBookingCreatedAdminEmail({
        customerName,
        bookingId: booking.id,
        serviceName: booking.serviceName,
        date: booking.date,
        timeSlot: booking.timeSlot,
        status: booking.status,
      });
    } catch (error: any) {
      this.logger.warn(`Booking created email failed: ${error?.message}`);
    }
  }

  private async notifyBookingStatusUpdated(booking: any, customerEmail?: string | null, userId?: string | null) {
    try {
      const email = customerEmail || (userId ? await this.getUserEmail(userId) : null);
      if (!email) return;
      await this.emailService.sendBookingStatusEmail({
        to: email,
        customerName: booking.customerName,
        bookingId: booking.id,
        serviceName: booking.serviceName,
        date: booking.date,
        timeSlot: booking.timeSlot,
        status: booking.status,
      });
    } catch (error: any) {
      this.logger.warn(`Status email failed: ${error?.message}`);
    }
  }

  private async notifyPaymentDeclined(booking: any, customerEmail?: string | null, userId?: string | null, reason?: string) {
    try {
      const email = customerEmail || (userId ? await this.getUserEmail(userId) : null);
      if (!email) return;
      await this.emailService.sendPaymentDeclinedEmail({
        to: email,
        customerName: booking.customerName,
        bookingId: booking.id,
        serviceName: booking.serviceName,
        date: booking.date,
        timeSlot: booking.timeSlot,
        declineReason: reason,
      });
    } catch (error: any) {
      this.logger.warn(`Payment declined email failed: ${error?.message}`);
    }
  }

  private async notifyAdminsPaymentReview(booking: any) {
    try {
      await this.emailService.sendPaymentResubmittedAdminEmail({
        customerName: booking.customerName,
        bookingId: booking.id,
        serviceName: booking.serviceName,
        date: booking.date,
        timeSlot: booking.timeSlot,
      });
    } catch (error: any) {
      this.logger.warn(`Admin payment review email failed: ${error?.message}`);
    }
  }

  private async notifyProgressUpdate(booking: any, update: any) {
    try {
      const email = booking.customer_email || (booking.user_id ? await this.getUserEmail(booking.user_id) : null);
      if (!email) return;
      await this.emailService.sendProgressUpdateEmail({
        to: email,
        customerName: booking.customer_name,
        bookingId: booking.id,
        serviceName: booking.service_name,
        date: booking.date,
        timeSlot: booking.time_slot,
        status: booking.status,
        message: update.message,
        imageUrls: update.image_urls || [],
      });
    } catch (error: any) {
      this.logger.warn(`Progress update email failed: ${error?.message}`);
    }
  }

  private async getUserEmail(userId?: string): Promise<string | undefined> {
    if (!userId) return undefined;
    const { data } = await this.supabase.getAdminClient().auth.admin.getUserById(userId);
    return data?.user?.email || undefined;
  }

  private toBooking(row: any) {
    const updates = (row.booking_updates || [])
      .slice()
      .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .map((u: any) => ({
        id: u.id,
        timestamp: u.created_at,
        message: u.message,
        imageUrls: u.image_urls || [],
        imageUrl: (u.image_urls || [])[0],
      }));

    return {
      id: row.id,
      userId: row.user_id ?? null,
      customerName: row.customer_name,
      customerPhone: row.customer_phone,
      customerEmail: row.customer_email,
      serviceId: row.service_id,
      serviceName: row.service_name,
      vehicleSize: row.vehicle_size,
      vehicleType: row.vehicle_type,
      vehicleCategory: row.vehicle_type === 'MOTORCYCLE' ? 'Motorcycle' : 'Car',
      fuelType: row.fuel_type,
      oilType: row.oil_type,
      date: row.date,
      timeSlot: row.time_slot,
      plateNumber: row.plate_number,
      totalPrice: row.total_price,
      downPaymentAmount: row.down_payment_amount,
      status: row.status,
      paymentProofPath: row.payment_proof_path,
      paymentMethod: row.payment_method,
      paymentDeclineReason: row.payment_decline_reason,
      paymentReviewedAt: row.payment_reviewed_at,
      membershipId: row.membership_id ?? null,
      membershipDiscountType: row.membership_discount_type ?? null,
      createdAt: new Date(row.created_at).getTime(),
      updates,
    };
  }
}
