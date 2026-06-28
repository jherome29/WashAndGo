import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { UpdateShopSettingsDto } from './dto/update-shop-settings.dto';

const DEFAULT_SETTINGS_ID = 'default';

@Injectable()
export class ShopSettingsService {
  constructor(private supabase: SupabaseService) {}

  async findDefault(date?: string) {
    if (date) {
      const { data } = await this.supabase
        .getClient()
        .from('shop_settings')
        .select('id, setting_date, open_time, close_time, updated_at')
        .eq('setting_date', date)
        .maybeSingle();

      if (data) return data;
    }

    const { data, error } = await this.supabase
      .getClient()
      .from('shop_settings')
      .select('id, setting_date, open_time, close_time, updated_at')
      .eq('id', DEFAULT_SETTINGS_ID)
      .single();

    if (error || !data) {
      throw new NotFoundException('Shop settings not found');
    }

    return data;
  }

  async update(dto: UpdateShopSettingsDto, requestingUserId: string) {
    await this.assertAdmin(requestingUserId);

    const timeToMinutes = (t: string) => {
      const match = t.match(/^(\d{2}):(\d{2}) (AM|PM)$/);
      if (!match) return -1;
      const [, h, m, p] = match;
      let hours = parseInt(h);
      const minutes = parseInt(m);
      if (p === 'PM' && hours !== 12) hours += 12;
      if (p === 'AM' && hours === 12) hours = 0;
      return hours * 60 + minutes;
    };

    const openMin = timeToMinutes(dto.open_time);
    const closeMin = timeToMinutes(dto.close_time);

    if (openMin === -1 || closeMin === -1) {
      throw new BadRequestException('Open time and close time must be in HH:mm AM/PM format');
    }

    if (openMin >= closeMin) {
      throw new BadRequestException('Open time must be earlier than close time');
    }

    const targetDate = dto.date?.trim();
    const targetId = targetDate || DEFAULT_SETTINGS_ID;

    const { data, error } = await this.supabase
      .getAdminClient()
      .from('shop_settings')
      .upsert({
        id: targetId,
        setting_date: targetDate || null,
        open_time: dto.open_time,
        close_time: dto.close_time,
        updated_at: new Date().toISOString(),
      })
      .select('id, setting_date, open_time, close_time, updated_at')
      .single();

    if (error || !data) {
      throw new NotFoundException('Shop settings not found');
    }

    return data;
  }

  private async assertAdmin(requestingUserId: string): Promise<void> {
    const { data: profile } = await this.supabase
      .getAdminClient()
      .from('profiles')
      .select('role')
      .eq('id', requestingUserId)
      .single();

    if (profile?.role !== 'admin') {
      throw new ForbiddenException('Only admins can update shop settings');
    }
  }
}
