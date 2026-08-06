import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupabaseService } from '../supabase/supabase.service';
import { AuditLogService } from '../audit/audit-log.service';
import { EmailService } from '../email/email.service';
import { stripHtml } from '../bookings/bookings.service';
import { IssueMembershipDto } from './dto/issue-membership.dto';
import { VehicleDto } from './dto/vehicle.dto';
import { normalizePlate } from './plate.util';

export interface DiscountResult {
  totalPrice: number;
  membershipId: string | null;
  discountType: 'FREE_WASH' | 'FIRST_WASH' | 'CATEGORY_PERCENT' | null;
}

export interface CompletedBookingInfo {
  id: string;
  service_id: string;
  membership_id: string | null;
  membership_discount_type: string | null;
  membership_visit_counted: boolean;
}

@Injectable()
export class MembershipsService {
  private readonly logger = new Logger(MembershipsService.name);

  constructor(
    private supabase: SupabaseService,
    private readonly auditLog: AuditLogService,
    private readonly emailService: EmailService,
  ) {}

  async issue(dto: IssueMembershipDto, adminUserId: string) {
    await this.requireAdmin(adminUserId);

    const purchaseDate = dto.purchaseDate || new Date().toISOString().slice(0, 10);
    const expiresAt = this.addYears(purchaseDate, 1);
    const membershipNo = this.generateMembershipNo();

    const { data: membership, error } = await this.supabase
      .getAdminClient()
      .from('memberships')
      .insert({
        membership_no: membershipNo,
        member_name: stripHtml(dto.memberName),
        user_id: dto.userId || null,
        issued_by: adminUserId,
        purchase_date: purchaseDate,
        expires_at: expiresAt,
      })
      .select()
      .single();

    if (error) {
      if ((error as any).code === '23505') {
        throw new ConflictException('Membership number collision — please retry');
      }
      if ((error as any).code === '23503') {
        throw new NotFoundException(`Account ${dto.userId} not found`);
      }
      throw new Error(error.message);
    }

    const vehicleRows = dto.vehicles.map(v => ({
      membership_id: membership.id,
      plate_number: normalizePlate(v.plateNumber),
      vehicle_label: v.vehicleLabel ? stripHtml(v.vehicleLabel) : null,
    }));

    const { data: vehicles, error: vErr } = await this.supabase
      .getAdminClient()
      .from('membership_vehicles')
      .insert(vehicleRows)
      .select();

    if (vErr) {
      // Roll back the membership row so a failed vehicle insert doesn't leave an orphan.
      await this.supabase.getAdminClient().from('memberships').delete().eq('id', membership.id);
      if ((vErr as any).code === '23505') {
        throw new ConflictException('One or more plate numbers are already registered to another membership');
      }
      throw new Error(vErr.message);
    }

    void this.auditLog.log(adminUserId, 'ISSUE_MEMBERSHIP', membership.id, {
      membershipNo,
      memberName: dto.memberName,
      vehicleCount: vehicles.length,
    });
    void this.notifyMembershipIssued(membership, vehicles);

    return this.toMembership(membership, vehicles);
  }

  async renew(id: string, adminUserId: string) {
    await this.requireAdmin(adminUserId);

    const { data: existing } = await this.supabase
      .getAdminClient()
      .from('memberships')
      .select('*')
      .eq('id', id)
      .single();
    if (!existing) throw new NotFoundException(`Membership ${id} not found`);

    const isLapsed = existing.status !== 'ACTIVE' || new Date(existing.expires_at) < new Date();
    const base = isLapsed ? new Date().toISOString().slice(0, 10) : existing.expires_at;
    const newExpiry = this.addYears(base, 1);

    const { data, error } = await this.supabase
      .getAdminClient()
      .from('memberships')
      // Reset the reminder flag — this is a new expiry cycle, so a future "expiring soon"
      // email should be allowed to fire again for it.
      .update({ expires_at: newExpiry, status: 'ACTIVE', expiring_reminder_sent_at: null })
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(error.message);

    void this.auditLog.log(adminUserId, 'RENEW_MEMBERSHIP', id, {
      previousExpiry: existing.expires_at,
      newExpiry,
    });
    void this.notifyMembershipRenewed(data);

    return this.toMembership(data, await this.getVehicles(id));
  }

  async cancel(id: string, adminUserId: string, reason: string) {
    await this.requireAdmin(adminUserId);
    const cleanReason = stripHtml(reason);

    const { data, error } = await this.supabase
      .getAdminClient()
      .from('memberships')
      .update({ status: 'CANCELLED' })
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new NotFoundException(`Membership ${id} not found`);

    void this.auditLog.log(adminUserId, 'CANCEL_MEMBERSHIP', id, { reason: cleanReason });
    void this.notifyMembershipCancelled(data, cleanReason);
    return this.toMembership(data, await this.getVehicles(id));
  }

  private applyVisitDelta(
    visitCount: number,
    freeWashCredits: number,
    delta: 1 | -1,
  ): { visitCount: number; freeWashCredits: number } {
    if (delta === 1) {
      const newVisitCount = visitCount + 1;
      const earnedFreeWash = newVisitCount % 10 === 0;
      return {
        visitCount: newVisitCount,
        freeWashCredits: earnedFreeWash ? freeWashCredits + 1 : freeWashCredits,
      };
    }
    const removedWasMilestone = visitCount > 0 && visitCount % 10 === 0;
    return {
      visitCount: Math.max(0, visitCount - 1),
      freeWashCredits: removedWasMilestone ? Math.max(0, freeWashCredits - 1) : freeWashCredits,
    };
  }

  async incrementVisit(id: string, adminUserId: string) {
    return this.adjustVisit(id, adminUserId, 1);
  }

  async decrementVisit(id: string, adminUserId: string) {
    return this.adjustVisit(id, adminUserId, -1);
  }

  private async adjustVisit(id: string, adminUserId: string, delta: 1 | -1) {
    await this.requireAdmin(adminUserId);

    const { data: existing } = await this.supabase
      .getAdminClient()
      .from('memberships')
      .select('*')
      .eq('id', id)
      .single();
    if (!existing) throw new NotFoundException(`Membership ${id} not found`);
    if (existing.status !== 'ACTIVE') {
      throw new BadRequestException('Only active memberships can have visits adjusted');
    }

    const { visitCount, freeWashCredits } = this.applyVisitDelta(
      existing.visit_count,
      existing.free_wash_credits,
      delta,
    );
    const earnedFreeWash = delta === 1 && freeWashCredits > existing.free_wash_credits;

    const { data, error } = await this.supabase
      .getAdminClient()
      .from('memberships')
      .update({ visit_count: visitCount, free_wash_credits: freeWashCredits })
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(error.message);

    void this.auditLog.log(
      adminUserId,
      delta === 1 ? 'ADD_MEMBERSHIP_VISIT' : 'REMOVE_MEMBERSHIP_VISIT',
      id,
      { newVisitCount: visitCount, newFreeWashCredits: freeWashCredits },
    );
    if (earnedFreeWash) void this.notifyFreeWashEarned(data, visitCount);

    return this.toMembership(data, await this.getVehicles(id));
  }

  /** Cron entry point — kept separate from the logic itself so tests can call processMembershipExpiries() directly without waiting on a schedule. */
  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async handleDailyMembershipExpiryCheck() {
    await this.processMembershipExpiries();
  }

  /**
   * Daily sweep over ACTIVE memberships:
   *   - Past expires_at  -> flip status to EXPIRED, send the "expired" email.
   *   - Within 30 days   -> send the "expiring soon" email, but only once per cycle
   *                         (guarded by expiring_reminder_sent_at, reset on renew()).
   * Not admin-attributed, so these mutations are logged via the regular logger, not AuditLogService
   * (which requires a real admin_user_id).
   */
  async processMembershipExpiries(): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    const in30Days = this.addDays(today, 30);

    try {
      const { data: lapsed } = await this.supabase
        .getAdminClient()
        .from('memberships')
        .select('id, user_id, member_name, membership_no, expires_at')
        .eq('status', 'ACTIVE')
        .lt('expires_at', today);

      for (const membership of lapsed || []) {
        await this.supabase.getAdminClient().from('memberships').update({ status: 'EXPIRED' }).eq('id', membership.id);
        this.logger.log(`Membership ${membership.membership_no} expired (was due ${membership.expires_at})`);
        void this.notifyMembershipExpired(membership);
      }

      const { data: expiringSoon } = await this.supabase
        .getAdminClient()
        .from('memberships')
        .select('id, user_id, member_name, membership_no, expires_at')
        .eq('status', 'ACTIVE')
        .gte('expires_at', today)
        .lte('expires_at', in30Days)
        .is('expiring_reminder_sent_at', null);

      for (const membership of expiringSoon || []) {
        await this.supabase
          .getAdminClient()
          .from('memberships')
          .update({ expiring_reminder_sent_at: new Date().toISOString() })
          .eq('id', membership.id);
        void this.notifyMembershipExpiringSoon(membership);
      }
    } catch (err: any) {
      this.logger.warn(`Membership expiry sweep failed: ${err?.message}`);
    }
  }

  async addVehicle(id: string, dto: VehicleDto, adminUserId: string) {
    await this.requireAdmin(adminUserId);

    const { data: membership } = await this.supabase
      .getAdminClient()
      .from('memberships')
      .select('id')
      .eq('id', id)
      .single();
    if (!membership) throw new NotFoundException(`Membership ${id} not found`);

    const vehicles = await this.getVehicles(id);
    if (vehicles.length >= 3) {
      throw new BadRequestException('A membership can have at most 3 vehicles');
    }

    const { data, error } = await this.supabase
      .getAdminClient()
      .from('membership_vehicles')
      .insert({
        membership_id: id,
        plate_number: normalizePlate(dto.plateNumber),
        vehicle_label: dto.vehicleLabel ? stripHtml(dto.vehicleLabel) : null,
      })
      .select()
      .single();

    if (error) {
      if ((error as any).code === '23505') {
        throw new ConflictException(`Plate ${dto.plateNumber} is already registered to a membership`);
      }
      throw new Error(error.message);
    }

    void this.auditLog.log(adminUserId, 'ADD_MEMBERSHIP_VEHICLE', id, { plateNumber: data.plate_number });
    return data;
  }

  async removeVehicle(id: string, vehicleId: string, adminUserId: string) {
    await this.requireAdmin(adminUserId);

    const { data, error } = await this.supabase
      .getAdminClient()
      .from('membership_vehicles')
      .delete()
      .eq('id', vehicleId)
      .eq('membership_id', id)
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new NotFoundException('Vehicle not found on this membership');

    void this.auditLog.log(adminUserId, 'REMOVE_MEMBERSHIP_VEHICLE', id, { plateNumber: data.plate_number });
    return { removed: true };
  }

  async findAll(search: string | undefined, adminUserId: string) {
    await this.requireAdmin(adminUserId);

    let query = this.supabase
      .getAdminClient()
      .from('memberships')
      .select('*, membership_vehicles(*)')
      .order('created_at', { ascending: false });

    if (search) {
      const safe = search.replace(/[,()%]/g, '');
      query = query.or(`member_name.ilike.%${safe}%,membership_no.ilike.%${safe}%`);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data || []).map(row => this.toMembership(row, row.membership_vehicles));
  }

  async findOne(id: string, adminUserId: string) {
    await this.requireAdmin(adminUserId);

    const { data, error } = await this.supabase
      .getAdminClient()
      .from('memberships')
      .select('*, membership_vehicles(*)')
      .eq('id', id)
      .single();
    if (error || !data) throw new NotFoundException(`Membership ${id} not found`);

    return this.toMembership(data, data.membership_vehicles);
  }

  /**
   * Admin: find any existing Wash & Go *customer* account by name, phone, or email — including
   * brand-new accounts with zero bookings. Admin accounts are always excluded (a membership is
   * a customer perk, not something staff assign to each other). Name/phone come from `profiles`
   * (populated for every account on signup, role filter applied at the query itself); email
   * isn't stored in `profiles`, so it's matched via the Supabase Auth admin API and cross-checked
   * against `profiles.role` afterward.
   */
  async searchCustomers(query: string, adminUserId: string) {
    await this.requireAdmin(adminUserId);
    const q = query.trim();
    if (!q) return [];

    const safe = q.replace(/[,()%]/g, '');
    const { data: profileMatches, error } = await this.supabase
      .getAdminClient()
      .from('profiles')
      .select('id, full_name, phone')
      .eq('role', 'customer')
      .or(`full_name.ilike.%${safe}%,phone.ilike.%${safe}%`);
    if (error) throw new Error(error.message);

    // Email lives in auth.users, not profiles — fetch and filter in memory.
    const allUsers = await this.listAllUsers();
    const lowerQuery = safe.toLowerCase();
    const emailById = new Map<string, string | null>(allUsers.map(u => [u.id, u.email]));
    const emailMatchIds = [...emailById.entries()]
      .filter(([, email]) => email?.toLowerCase().includes(lowerQuery))
      .map(([id]) => id);

    let candidateIds = new Set([...(profileMatches || []).map(p => p.id), ...emailMatchIds]);
    if (candidateIds.size === 0) return [];

    // Email matches didn't go through the role filter above — fetch their role (and
    // name/phone) and drop any that turn out to be admin accounts.
    const knownIds = new Set((profileMatches || []).map(p => p.id));
    const missingIds = [...candidateIds].filter(id => !knownIds.has(id));
    let extraProfiles: { id: string; full_name: string | null; phone: string | null; role: string }[] = [];
    if (missingIds.length > 0) {
      const { data } = await this.supabase.getAdminClient().from('profiles').select('id, full_name, phone, role').in('id', missingIds);
      extraProfiles = data || [];
    }
    const excludedAdminIds = new Set(extraProfiles.filter(p => p.role === 'admin').map(p => p.id));
    candidateIds = new Set([...candidateIds].filter(id => !excludedAdminIds.has(id)));

    const allProfiles = [...(profileMatches || []), ...extraProfiles];

    return [...candidateIds].map(id => {
      const p = allProfiles.find(pr => pr.id === id);
      return {
        userId: id,
        name: p?.full_name || '(no name on file)',
        phone: p?.phone || '',
        email: emailById.get(id) ?? null,
      };
    });
  }

  /**
   * Fetches every Supabase Auth user, walking pages until one comes back
   * shorter than requested -- listUsers({ page: 1, perPage: 1000 }) alone
   * silently misses every account past the first 1000, which is exactly
   * the bug this fixes.
   */
  private async listAllUsers(): Promise<{ id: string; email: string | null }[]> {
    const perPage = 1000;
    const allUsers: { id: string; email: string | null }[] = [];
    let page = 1;
    while (true) {
      const { data } = await this.supabase.getAdminClient().auth.admin.listUsers({ page, perPage });
      const users = data?.users || [];
      allUsers.push(...users.map((u: any) => ({ id: u.id, email: u.email ?? null })));
      if (users.length < perPage) break;
      page++;
    }
    return allUsers;
  }

  /** Admin: an account's car-wash (GROOMING) booking history only — the only visits that count toward membership benefits. */
  async getCustomerCarwashHistory(userId: string, adminUserId: string) {
    await this.requireAdmin(adminUserId);

    const { data, error } = await this.supabase
      .getAdminClient()
      .from('bookings')
      .select('id, service_name, date, time_slot, status, total_price, services!inner(category)')
      .eq('user_id', userId)
      .eq('services.category', 'GROOMING')
      .order('date', { ascending: false });
    if (error) throw new Error(error.message);

    return (data || []).map((row: any) => ({
      id: row.id,
      serviceName: row.service_name,
      date: row.date,
      timeSlot: row.time_slot,
      status: row.status,
      totalPrice: row.total_price,
    }));
  }

  /** Public: guest lookup by membership number, mirrors the booking status-by-ID pattern. */
  async lookupByNo(membershipNo: string) {
    const { data, error } = await this.supabase
      .getAdminClient()
      .from('memberships')
      .select('*, membership_vehicles(*)')
      .eq('membership_no', membershipNo.toUpperCase())
      .maybeSingle();
    if (error || !data) throw new NotFoundException(`Membership ${membershipNo} not found`);

    return this.toPublicMembership(data, data.membership_vehicles);
  }

  /**
   * Public: lightweight lookup used by the booking wizard to preview a discount before
   * submitting. Returns null if the plate has no active membership. Deliberately excludes
   * personal fields (member name, vehicles) — the wizard only needs the discount-relevant state.
   */
  async getVehicleStatus(plateNumber: string) {
    const membership = await this.findActiveMembershipForPlate(plateNumber);
    if (!membership) return null;

    return {
      membershipNo: membership.membership_no,
      visitCount: membership.visit_count,
      freeWashCredits: membership.free_wash_credits,
      firstWashUsed: membership.first_wash_used,
    };
  }

  /** Authenticated customer's own membership, if any. Returns null rather than 404 — most users aren't members. */
  async findMine(userId: string) {
    const { data } = await this.supabase
      .getAdminClient()
      .from('memberships')
      .select('*, membership_vehicles(*)')
      .eq('user_id', userId)
      .eq('status', 'ACTIVE')
      .maybeSingle();
    if (!data) return null;

    return this.toPublicMembership(data, data.membership_vehicles);
  }

  /**
   * Computes the membership discount for a booking, if the plate matches an active membership.
   *
   * Priority (only one discount ever applies per booking):
   *   1. FREE_WASH        — a free-wash credit is available (full comp; it's already been earned).
   *                          GROOMING (car wash) bookings only — the reward is literally "a free car wash".
   *   2. FIRST_WASH        — the membership's one-time 50%-off new-member offer hasn't been used.
   *                          GROOMING (car wash) bookings only — "50% off first car wash".
   *   3. CATEGORY_PERCENT  — the service itself carries a membership discount tag (Antibac, Oil
   *                          Change, Rust Proof, Ceramic Tint, Ceramic Coating). Any category —
   *                          this is what covers non-car-wash services.
   * Redemption (decrementing credits / flipping first_wash_used) does NOT happen here — it only
   * happens when the booking is later marked COMPLETED (see onBookingCompleted), so a cancelled
   * or no-show booking never burns a benefit it never delivered.
   */
  async computeDiscount(
    plateNumber: string | null | undefined,
    service: { category?: string; membership_discount_pct?: number | null },
    totalPrice: number,
  ): Promise<DiscountResult> {
    if (!plateNumber) return { totalPrice, membershipId: null, discountType: null };

    const membership = await this.findActiveMembershipForPlate(plateNumber);
    if (!membership) return { totalPrice, membershipId: null, discountType: null };

    const isCarWash = service.category === 'GROOMING';

    if (isCarWash && membership.free_wash_credits > 0) {
      return { totalPrice: 0, membershipId: membership.id, discountType: 'FREE_WASH' };
    }
    if (isCarWash && !membership.first_wash_used) {
      return { totalPrice: Math.round(totalPrice * 0.5), membershipId: membership.id, discountType: 'FIRST_WASH' };
    }
    if (service.membership_discount_pct) {
      const discounted = Math.round(totalPrice * (1 - service.membership_discount_pct / 100));
      return { totalPrice: discounted, membershipId: membership.id, discountType: 'CATEGORY_PERCENT' };
    }
    return { totalPrice, membershipId: membership.id, discountType: null };
  }

  /**
   * Called when a booking transitions into COMPLETED. Increments the shared visit counter,
   * grants a free-wash credit every 10th visit, and redeems/records whichever discount (if
   * any) the booking actually used. Guarded by membership_visit_counted so a status flapped
   * back to COMPLETED a second time never double-counts.
   *
   * Only GROOMING (car wash) bookings move the counter or consume FREE_WASH/FIRST_WASH — Lube
   * and Ceramic Coating visits still get their own CATEGORY_PERCENT discount (computed in
   * computeDiscount) but don't count toward "every 10th car wash" or the first-wash offer.
   */
  async onBookingCompleted(booking: CompletedBookingInfo, adminUserId: string): Promise<void> {
    if (!booking.membership_id || booking.membership_visit_counted) return;

    try {
      const { data: service } = await this.supabase
        .getAdminClient()
        .from('services')
        .select('category')
        .eq('id', booking.service_id)
        .maybeSingle();

      if (service?.category !== 'GROOMING') {
        // Not a car wash — the CATEGORY_PERCENT discount (if any) was already applied at
        // creation time and needs no redemption. Just mark it processed and stop.
        await this.supabase.getAdminClient().from('bookings').update({ membership_visit_counted: true }).eq('id', booking.id);
        return;
      }

      const { data: membership } = await this.supabase
        .getAdminClient()
        .from('memberships')
        .select('user_id, member_name, membership_no, visit_count, free_wash_credits, first_wash_used')
        .eq('id', booking.membership_id)
        .single();
      if (!membership) return;

      const { visitCount: newVisitCount, freeWashCredits: creditsAfterEarning } = this.applyVisitDelta(
        membership.visit_count,
        membership.free_wash_credits,
        1,
      );
      const earnedFreeWash = newVisitCount % 10 === 0;
      let newFreeWashCredits = creditsAfterEarning;
      if (booking.membership_discount_type === 'FREE_WASH') {
        newFreeWashCredits = Math.max(0, newFreeWashCredits - 1);
      }
      const newFirstWashUsed = booking.membership_discount_type === 'FIRST_WASH' ? true : membership.first_wash_used;

      await this.supabase
        .getAdminClient()
        .from('memberships')
        .update({
          visit_count: newVisitCount,
          free_wash_credits: newFreeWashCredits,
          first_wash_used: newFirstWashUsed,
        })
        .eq('id', booking.membership_id);

      await this.supabase
        .getAdminClient()
        .from('bookings')
        .update({ membership_visit_counted: true })
        .eq('id', booking.id);

      void this.auditLog.log(adminUserId, 'MEMBERSHIP_VISIT_RECORDED', booking.membership_id, {
        bookingId: booking.id,
        newVisitCount,
        newFreeWashCredits,
        discountType: booking.membership_discount_type,
      });
      if (earnedFreeWash) void this.notifyFreeWashEarned(membership, newVisitCount);
    } catch (err: any) {
      this.logger.warn(`Failed to record membership visit for booking ${booking.id}: ${err?.message}`);
    }
  }

  private async findActiveMembershipForPlate(plateNumber: string): Promise<any | null> {
    const normalized = normalizePlate(plateNumber);
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await this.supabase
      .getAdminClient()
      .from('membership_vehicles')
      .select('memberships!inner(*)')
      .eq('plate_number', normalized)
      .eq('memberships.status', 'ACTIVE')
      .gte('memberships.expires_at', today)
      .maybeSingle();
    return (data as any)?.memberships ?? null;
  }

  private async getVehicles(membershipId: string) {
    const { data } = await this.supabase
      .getAdminClient()
      .from('membership_vehicles')
      .select('*')
      .eq('membership_id', membershipId);
    return data || [];
  }

  /**
   * Random, not sequential -- a predictable CWG-000001, CWG-000002, ... counter
   * let anyone enumerate every member via the public lookup-by-number endpoint.
   * Same pattern already used for booking IDs (see bookings.service.ts create()).
   * The DB's unique constraint on membership_no + issue()'s existing 23505
   * handling already cover the rare collision case -- no retry loop needed here.
   */
  private generateMembershipNo(): string {
    const sixDigits = Math.floor(100000 + Math.random() * 900000);
    return `CWG-${sixDigits}`;
  }

  private addYears(dateStr: string, years: number): string {
    const d = new Date(`${dateStr}T00:00:00Z`);
    d.setUTCFullYear(d.getUTCFullYear() + years);
    return d.toISOString().slice(0, 10);
  }

  private addDays(dateStr: string, days: number): string {
    const d = new Date(`${dateStr}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
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

  private async getUserEmail(userId?: string | null): Promise<string | undefined> {
    if (!userId) return undefined;
    const { data } = await this.supabase.getAdminClient().auth.admin.getUserById(userId);
    return data?.user?.email || undefined;
  }

  private async notifyMembershipIssued(membership: any, vehicles: any[]) {
    try {
      const email = await this.getUserEmail(membership.user_id);
      if (!email) return;
      await this.emailService.sendMembershipIssuedEmail({
        to: email,
        memberName: membership.member_name,
        membershipNo: membership.membership_no,
        vehicles: vehicles.map((v: any) => ({ plateNumber: v.plate_number, vehicleLabel: v.vehicle_label })),
        expiresAt: membership.expires_at,
      });
    } catch (err: any) {
      this.logger.warn(`Membership issued email failed for ${membership.id}: ${err?.message}`);
    }
  }

  private async notifyMembershipRenewed(membership: any) {
    try {
      const email = await this.getUserEmail(membership.user_id);
      if (!email) return;
      await this.emailService.sendMembershipRenewedEmail({
        to: email,
        memberName: membership.member_name,
        membershipNo: membership.membership_no,
        newExpiresAt: membership.expires_at,
      });
    } catch (err: any) {
      this.logger.warn(`Membership renewed email failed for ${membership.id}: ${err?.message}`);
    }
  }

  private async notifyMembershipExpiringSoon(membership: any) {
    try {
      const email = await this.getUserEmail(membership.user_id);
      if (!email) return;
      await this.emailService.sendMembershipExpiringSoonEmail({
        to: email,
        memberName: membership.member_name,
        membershipNo: membership.membership_no,
        expiresAt: membership.expires_at,
      });
    } catch (err: any) {
      this.logger.warn(`Membership expiring-soon email failed for ${membership.id}: ${err?.message}`);
    }
  }

  private async notifyMembershipCancelled(membership: any, reason: string) {
    try {
      const email = await this.getUserEmail(membership.user_id);
      if (!email) return;
      await this.emailService.sendMembershipCancelledEmail({
        to: email,
        memberName: membership.member_name,
        membershipNo: membership.membership_no,
        reason,
      });
    } catch (err: any) {
      this.logger.warn(`Membership cancelled email failed for ${membership.id}: ${err?.message}`);
    }
  }

  private async notifyMembershipExpired(membership: any) {
    try {
      const email = await this.getUserEmail(membership.user_id);
      if (!email) return;
      await this.emailService.sendMembershipExpiredEmail({
        to: email,
        memberName: membership.member_name,
        membershipNo: membership.membership_no,
        expiredOn: membership.expires_at,
      });
    } catch (err: any) {
      this.logger.warn(`Membership expired email failed for ${membership.id}: ${err?.message}`);
    }
  }

  private async notifyFreeWashEarned(membership: any, visitCount: number) {
    try {
      const email = await this.getUserEmail(membership.user_id);
      if (!email) return;
      await this.emailService.sendFreeWashEarnedEmail({
        to: email,
        memberName: membership.member_name,
        membershipNo: membership.membership_no,
        visitCount,
      });
    } catch (err: any) {
      this.logger.warn(`Free wash earned email failed for membership ${membership.membership_no}: ${err?.message}`);
    }
  }

  private toMembership(row: any, vehicles: any[] = []) {
    return {
      id: row.id,
      membershipNo: row.membership_no,
      memberName: row.member_name,
      userId: row.user_id,
      issuedBy: row.issued_by,
      purchaseDate: row.purchase_date,
      expiresAt: row.expires_at,
      status: row.status,
      visitCount: row.visit_count,
      firstWashUsed: row.first_wash_used,
      freeWashCredits: row.free_wash_credits,
      createdAt: row.created_at,
      vehicles: (vehicles || []).map((v: any) => ({
        id: v.id,
        plateNumber: v.plate_number,
        vehicleLabel: v.vehicle_label,
      })),
    };
  }

  private toPublicMembership(row: any, vehicles: any[] = []) {
    return {
      membershipNo: row.membership_no,
      memberName: row.member_name,
      status: row.status,
      expiresAt: row.expires_at,
      visitCount: row.visit_count,
      freeWashCredits: row.free_wash_credits,
      firstWashUsed: row.first_wash_used,
      visitsUntilNextFreeWash: 10 - (row.visit_count % 10),
      vehicles: (vehicles || []).map((v: any) => ({
        plateNumber: v.plate_number,
        vehicleLabel: v.vehicle_label,
      })),
    };
  }
}
