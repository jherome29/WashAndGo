import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { EmailService } from '../email/email.service';

const CAPACITY: Record<string, number> = { LUBE: 1, GROOMING: 2, COATING: 2 };
const SLOT_CHECK_STATUSES = ['PENDING_VERIFICATION', 'CONFIRMED', 'IN_PROGRESS'];

function stripHtml(str: string): string {
  return str.replace(/<[^>]*>/g, '').trim();
}

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    private supabase: SupabaseService,
    private readonly emailService: EmailService,
  ) {}

  async create(dto: CreateBookingDto, userId?: string) {
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
      .from('branch_schedules').select('close_time').limit(1).single();
    const { data: scheduleOverride } = await this.supabase.getAdminClient()
      .from('schedule_overrides').select('is_closed, custom_close').eq('override_date', dto.date).maybeSingle();
    if (scheduleOverride?.is_closed) {
      throw new BadRequestException('The shop is closed on this date.');
    }
    const closeTime = scheduleOverride?.custom_close || schedule?.close_time || '17:00';
    if (!this.slotFitsBeforeClose(dto.timeSlot, service.duration_hours || 1, closeTime)) {
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
    const downPaymentAmount = Math.round(totalPrice * 0.3);

    const id = `BK-${Math.floor(100000 + Math.random() * 900000)}`;
    const plainToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(plainToken).digest('hex');
    const tokenExpiry = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

    // Resolve customer email: explicit > auth user email
    let customerEmail = dto.customerEmail;
    if (!customerEmail && userId) {
      customerEmail = await this.getUserEmail(userId);
    }

    // Admin walk-in bookings are auto-confirmed — no payment proof needed
    const isAdminBooking = userId ? await this.isAdmin(userId) : false;
    const status = isAdminBooking
      ? 'CONFIRMED'
      : dto.paymentProofPath
        ? 'PENDING_VERIFICATION'
        : 'PENDING';

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
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    const booking = this.toBooking(data);

    void this.notifyBookingCreated(booking, dto.customerName, customerEmail, status === 'PENDING_VERIFICATION');
    return { ...booking, statusToken: plainToken };
  }

  async findByToken(id: string, plainToken: string) {
    const { data, error } = await this.supabase
      .getAdminClient()
      .from('bookings')
      .select('*, booking_updates(*)')
      .eq('id', id.toUpperCase())
      .single();

    if (error || !data) throw new NotFoundException(`Booking ${id} not found`);

    const tokenHash = createHash('sha256').update(plainToken).digest('hex');
    const tokenExpiry = new Date(data.status_token_expires_at);
    if (data.status_token_hash !== tokenHash || tokenExpiry < new Date()) {
      throw new ForbiddenException('Invalid or expired status token');
    }

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

    if (override?.is_closed) return { date, slots: [], closed: true };

    const openTime = override?.custom_open || schedule?.open_time || '08:00';
    const closeTime = override?.custom_close || schedule?.close_time || '17:00';
    const intervalH = schedule?.slot_interval_h || 1;

    const slots = this.generateSlots(openTime, closeTime, intervalH);

    const bookedSlots = await this.getBookedSlots(date, resolvedCategory);
    const bookedSet = new Set(bookedSlots);

    return {
      date,
      closed: false,
      slots: slots
        .filter(slot => this.slotFitsBeforeClose(slot, durationHours, closeTime))
        .map(slot => ({
          time: slot,
          available: !bookedSet.has(slot),
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

    const { data, error } = await this.supabase
      .getAdminClient()
      .from('bookings')
      .update({ status })
      .eq('id', id.toUpperCase())
      .select()
      .maybeSingle();

    if (error) throw new BadRequestException(`Failed to update status: ${error.message}`);
    if (!data) throw new NotFoundException(`Booking ${id.toUpperCase()} not found`);

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
    if (existing.status !== 'PENDING_VERIFICATION') {
      throw new BadRequestException('Booking must be in PENDING_VERIFICATION status to confirm');
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
    if (existing.status !== 'PENDING_VERIFICATION') {
      throw new BadRequestException('Booking must be in PENDING_VERIFICATION status to decline');
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
    const booking = this.toBooking(data);

    void this.notifyPaymentDeclined(booking, existing.customer_email, existing.user_id, sanitizedReason);
    return booking;
  }

  async reuploadProof(id: string, paymentProofPath: string, plainToken: string | undefined, userId?: string) {
    // Validate path before any DB query — reject paths outside proofs/ or with traversal
    if (!paymentProofPath.startsWith('proofs/') || paymentProofPath.includes('..')) {
      throw new BadRequestException('Invalid payment proof path');
    }

    const { data: existing } = await this.supabase
      .getAdminClient()
      .from('bookings')
      .select('status, status_token_hash, status_token_expires_at, user_id')
      .eq('id', id.toUpperCase())
      .single();

    if (!existing) throw new NotFoundException(`Booking ${id} not found`);
    if (existing.status !== 'REUPLOAD_REQUIRED') {
      throw new BadRequestException('Can only reupload proof for REUPLOAD_REQUIRED bookings');
    }

    // Auth: either owner or valid token
    const isOwner = userId && existing.user_id === userId;
    if (!isOwner) {
      if (!plainToken) throw new ForbiddenException('Authentication required');
      const tokenHash = createHash('sha256').update(plainToken).digest('hex');
      const tokenExpiry = new Date(existing.status_token_expires_at);
      if (existing.status_token_hash !== tokenHash || tokenExpiry < new Date()) {
        throw new ForbiddenException('Invalid or expired status token');
      }
    }

    const { data, error } = await this.supabase
      .getAdminClient()
      .from('bookings')
      .update({
        status: 'PENDING_VERIFICATION',
        payment_proof_path: paymentProofPath,
        payment_decline_reason: null,
      })
      .eq('id', id.toUpperCase())
      .select()
      .single();

    if (error) throw new Error(error.message);

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
        safeUpdates[key] = typeof updates[key] === 'string' ? stripHtml(updates[key]) : updates[key];
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

  private async notifyBookingCreated(booking: any, customerName: string, customerEmail?: string | null, isPaymentReview = false) {
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
      await this.emailService.sendBookingStatusEmail({
        to: email,
        customerName: booking.customerName,
        bookingId: booking.id,
        serviceName: booking.serviceName,
        date: booking.date,
        timeSlot: booking.timeSlot,
        status: `REUPLOAD_REQUIRED${reason ? ` — ${reason}` : ''}`,
      });
    } catch (error: any) {
      this.logger.warn(`Payment declined email failed: ${error?.message}`);
    }
  }

  private async notifyAdminsPaymentReview(booking: any) {
    try {
      await this.emailService.sendBookingCreatedAdminEmail({
        customerName: booking.customerName,
        bookingId: booking.id,
        serviceName: booking.serviceName,
        date: booking.date,
        timeSlot: booking.timeSlot,
        status: 'PENDING_VERIFICATION',
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
      createdAt: new Date(row.created_at).getTime(),
      updates,
    };
  }
}
