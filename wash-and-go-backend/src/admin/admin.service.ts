import { Injectable, ForbiddenException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { UpdatePaymentSettingsDto } from './dto/payment-settings.dto';
import { UpdateScheduleDto, CreateScheduleOverrideDto } from './dto/schedule-settings.dto';

@Injectable()
export class AdminService {
  constructor(private supabase: SupabaseService) {}

  private async requireAdmin(userId: string) {
    const { data } = await this.supabase
      .getAdminClient()
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();
    if (data?.role !== 'admin') throw new ForbiddenException('Admin access required');
  }

  async getPaymentSettings(userId: string) {
    await this.requireAdmin(userId);
    const { data, error } = await this.supabase
      .getAdminClient()
      .from('payment_settings')
      .select('*');
    if (error) throw new Error(error.message);
    return data || [];
  }

  async updatePaymentSettings(dto: UpdatePaymentSettingsDto, userId: string) {
    await this.requireAdmin(userId);
    const { data, error } = await this.supabase
      .getAdminClient()
      .from('payment_settings')
      .upsert({
        payment_method: dto.paymentMethod,
        account_name: dto.accountName,
        account_number: dto.accountNumber,
        qr_image_path: dto.qrImagePath || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'payment_method' })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  async getScheduleSettings(userId: string) {
    await this.requireAdmin(userId);
    const [{ data: schedule }, { data: overrides }] = await Promise.all([
      this.supabase.getAdminClient().from('branch_schedules').select('*').limit(1).maybeSingle(),
      this.supabase.getAdminClient().from('schedule_overrides').select('*').order('override_date'),
    ]);
    return { schedule, overrides: overrides || [] };
  }

  async updateScheduleSettings(dto: UpdateScheduleDto, userId: string) {
    await this.requireAdmin(userId);
    const { data: existing } = await this.supabase
      .getAdminClient()
      .from('branch_schedules')
      .select('id')
      .limit(1)
      .maybeSingle();

    const updates: Record<string, any> = {};
    if (dto.openTime) updates.open_time = dto.openTime;
    if (dto.closeTime) updates.close_time = dto.closeTime;
    if (dto.slotIntervalH) updates.slot_interval_h = dto.slotIntervalH;

    let result;
    if (existing?.id) {
      const { data, error } = await this.supabase
        .getAdminClient()
        .from('branch_schedules')
        .update(updates)
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      result = data;
    } else {
      const { data, error } = await this.supabase
        .getAdminClient()
        .from('branch_schedules')
        .insert({ branch_name: 'Baliwag', open_time: '08:00', close_time: '17:00', slot_interval_h: 1, ...updates })
        .select()
        .single();
      if (error) throw new Error(error.message);
      result = data;
    }
    return result;
  }

  async upsertScheduleOverride(dto: CreateScheduleOverrideDto, userId: string) {
    await this.requireAdmin(userId);
    const { data, error } = await this.supabase
      .getAdminClient()
      .from('schedule_overrides')
      .upsert({
        override_date: dto.overrideDate,
        is_closed: dto.isClosed ?? false,
        custom_open: dto.customOpen || null,
        custom_close: dto.customClose || null,
        label: dto.label || null,
      }, { onConflict: 'override_date' })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  async deleteScheduleOverride(date: string, userId: string) {
    await this.requireAdmin(userId);
    const { error } = await this.supabase
      .getAdminClient()
      .from('schedule_overrides')
      .delete()
      .eq('override_date', date);
    if (error) throw new Error(error.message);
    return { deleted: date };
  }

  async getPublicPaymentSettings() {
    const { data } = await this.supabase
      .getAdminClient()
      .from('payment_settings')
      .select('payment_method, account_name, account_number, qr_image_path');

    if (!data?.length) return [];

    return Promise.all(
      data.map(async (row) => {
        if (!row.qr_image_path) return { ...row, qr_signed_url: null };
        const { data: urlData } = await this.supabase
          .getAdminClient()
          .storage
          .from('shop-assets')
          .createSignedUrl(row.qr_image_path, 60 * 60);
        return { ...row, qr_signed_url: urlData?.signedUrl ?? null };
      }),
    );
  }
}
