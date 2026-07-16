import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class AuditLogService {
  constructor(private supabase: SupabaseService) {}

  async log(adminUserId: string, action: string, targetId: string, details?: Record<string, any>): Promise<void> {
    try {
      // Must await: supabase-js builders are lazy and only execute on .then()
      await this.supabase.getAdminClient()
        .from('admin_audit_logs')
        .insert({ admin_user_id: adminUserId, action, target_id: targetId, details: details ?? null });
    } catch {
      // fire-and-forget: audit failures must never break the admin operation
    }
  }
}
