import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { UpdateServiceDto } from './dto/update-service.dto';
import { AuditLogService } from '../audit/audit-log.service';

@Injectable()
export class ServicesService {
  constructor(
    private supabase: SupabaseService,
    private readonly auditLog: AuditLogService,
  ) {}

  async findAll() {
    const { data, error } = await this.supabase
      .getClient()
      .from('services')
      .select('*')
      .eq('is_active', true)
      .order('category');

    if (error) throw new Error(error.message);
    return data.map(this.toServicePackage);
  }

  async findOne(id: string) {
    const { data, error } = await this.supabase
      .getClient()
      .from('services')
      .select('*')
      .eq('id', id)
      .eq('is_active', true)
      .single();

    if (error || !data) throw new NotFoundException(`Service ${id} not found`);
    return this.toServicePackage(data);
  }

  async update(id: string, dto: UpdateServiceDto, userId: string) {
    const { data: profile } = await this.supabase
      .getAdminClient()
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();
    if (profile?.role !== 'admin') throw new ForbiddenException('Admin access required');

    const patch: Record<string, any> = {};
    if (dto.name !== undefined)              patch.name = dto.name;
    if (dto.description !== undefined)       patch.description = dto.description;
    if (dto.price_small !== undefined)       patch.price_small = dto.price_small;
    if (dto.price_medium !== undefined)      patch.price_medium = dto.price_medium;
    if (dto.price_large !== undefined)       patch.price_large = dto.price_large;
    if (dto.price_extra_large !== undefined) patch.price_extra_large = dto.price_extra_large;
    if (dto.lube_prices !== undefined)       patch.lube_prices = dto.lube_prices;

    const { data, error } = await this.supabase
      .getAdminClient()
      .from('services')
      .update(patch)
      .eq('id', id)
      .select()
      .single();

    if (error || !data) throw new NotFoundException(`Service ${id} not found`);
    void this.auditLog.log(userId, 'EDIT_SERVICE_PRICE', id, { serviceId: id, changes: patch });
    return this.toServicePackage(data);
  }

  private toServicePackage(row: any) {
    return {
      id: row.id,
      category: row.category,
      name: row.name,
      description: row.description,
      durationHours: row.duration_hours,
      isLubeFlat: row.is_lube_flat,
      lubePrices: row.lube_prices ?? undefined,
      vehicleType: row.vehicle_type ?? undefined,
      prices: {
        SMALL: row.price_small,
        MEDIUM: row.price_medium,
        LARGE: row.price_large,
        EXTRA_LARGE: row.price_extra_large,
      },
    };
  }
}
