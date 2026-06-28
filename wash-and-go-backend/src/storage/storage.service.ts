import { Injectable, ForbiddenException, BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import { SupabaseService } from '../supabase/supabase.service';

const PROOF_BUCKET = 'payment-proofs';
const ASSET_BUCKET = 'shop-assets';

@Injectable()
export class StorageService {
  constructor(private supabase: SupabaseService) {}

  async createSignedUploadUrl(
    fileName: string,
    userId?: string,
    bookingId?: string,
    statusToken?: string,
    fileSize?: string,
  ): Promise<{ signedUrl: string; path: string }> {
    const MAX_BYTES = 5 * 1024 * 1024;
    if (fileSize !== undefined && Number(fileSize) > MAX_BYTES) {
      throw new BadRequestException('File exceeds the 5 MB size limit');
    }

    // Auth user: pass through. Guest reupload (has bookingId/token): validate.
    // Initial booking creation (no userId, no bookingId, no token): allow — booking doesn't exist yet.
    if (!userId && (bookingId || statusToken)) {
      await this.validateGuestToken(bookingId, statusToken);
    }

    // Validate extension — only allow safe image formats
    const ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.webp'];
    const dotIndex = fileName.lastIndexOf('.');
    const ext = dotIndex !== -1 ? fileName.slice(dotIndex).toLowerCase() : '';
    if (!ALLOWED_EXT.includes(ext)) {
      throw new BadRequestException('Only image files are allowed (jpg, jpeg, png, webp)');
    }

    // Strip path separators and dangerous characters from filename
    const safeName = fileName.replace(/[/\\..]/g, '_');
    const path = `proofs/${Date.now()}-${safeName}`;
    const { data, error } = await this.supabase
      .getAdminClient()
      .storage
      .from(PROOF_BUCKET)
      .createSignedUploadUrl(path);

    if (error) throw new Error(error.message);
    return { signedUrl: data.signedUrl, path };
  }

  async getSignedViewUrl(
    path: string,
    userId?: string,
    bookingId?: string,
    statusToken?: string,
  ): Promise<{ signedUrl: string }> {
    if (userId) {
      const isAdmin = await this.isAdmin(userId);
      if (!isAdmin) {
        // Customer: verify path belongs to their booking
        await this.verifyUserOwnsPath(userId, path);
      }
    } else {
      // Guest: must have valid token + bookingId
      await this.validateGuestToken(bookingId, statusToken);
      await this.verifyBookingMatchesPath(bookingId!, path);
    }

    const bucket = path.startsWith('qr/') || path.startsWith('assets/') ? ASSET_BUCKET : PROOF_BUCKET;
    const { data, error } = await this.supabase
      .getAdminClient()
      .storage
      .from(bucket)
      .createSignedUrl(path, 60 * 60);

    if (error) throw new Error(error.message);
    return { signedUrl: data.signedUrl };
  }

  async createAssetUploadUrl(fileName: string, userId: string): Promise<{ signedUrl: string; path: string }> {
    await this.requireAdmin(userId);
    const path = `qr/${Date.now()}-${fileName.replace(/\s+/g, '_')}`;
    const { data, error } = await this.supabase
      .getAdminClient()
      .storage
      .from(ASSET_BUCKET)
      .createSignedUploadUrl(path);
    if (error) throw new Error(error.message);
    return { signedUrl: data.signedUrl, path };
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

  private async requireAdmin(userId: string) {
    if (!(await this.isAdmin(userId))) throw new ForbiddenException('Admin access required');
  }

  private async verifyUserOwnsPath(userId: string, path: string) {
    const { data } = await this.supabase
      .getAdminClient()
      .from('bookings')
      .select('id')
      .eq('user_id', userId)
      .eq('payment_proof_path', path)
      .maybeSingle();
    if (!data) throw new ForbiddenException('Access denied');
  }

  private async verifyBookingMatchesPath(bookingId: string, path: string) {
    const { data } = await this.supabase
      .getAdminClient()
      .from('bookings')
      .select('payment_proof_path')
      .eq('id', bookingId.toUpperCase())
      .maybeSingle();
    if (!data || data.payment_proof_path !== path) throw new ForbiddenException('Access denied');
  }

  private async validateGuestToken(bookingId?: string, statusToken?: string) {
    if (!bookingId || !statusToken) throw new ForbiddenException('Authentication required');

    const { data } = await this.supabase
      .getAdminClient()
      .from('bookings')
      .select('status_token_hash, status_token_expires_at')
      .eq('id', bookingId.toUpperCase())
      .maybeSingle();

    if (!data) throw new ForbiddenException('Invalid booking');

    const tokenHash = createHash('sha256').update(statusToken).digest('hex');
    const expiry = new Date(data.status_token_expires_at);
    if (data.status_token_hash !== tokenHash || expiry < new Date()) {
      throw new ForbiddenException('Invalid or expired status token');
    }
  }
}
