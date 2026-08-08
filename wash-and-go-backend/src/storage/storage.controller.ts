import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { StorageService } from './storage.service';
import { OptionalAuthGuard } from '../auth/guards/optional-auth.guard';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('storage')
export class StorageController {
  constructor(private storageService: StorageService) {}

  /**
   * POST /api/storage/upload-url?fileName=proof.jpg
   * Guest (with statusToken+bookingId) or auth user can get a signed upload URL.
   */
  @Throttle({ default: { limit: 5, ttl: 300000 } })
  @UseGuards(OptionalAuthGuard)
  @Post('upload-url')
  getUploadUrl(
    @Query('fileName') fileName: string,
    @Query('bookingId') bookingId?: string,
    @Query('statusToken') statusToken?: string,
    @Query('fileSize') fileSize?: string,
    @Query('mimeType') mimeType?: string,
    @CurrentUser() user?: any,
  ) {
    return this.storageService.createSignedUploadUrl(fileName, user?.id, bookingId, statusToken, fileSize, mimeType);
  }

  /**
   * GET /api/storage/view-url?path=proofs/file.jpg
   * Admin: any path. Auth customer: own bookings only. Guest: valid token + bookingId.
   */
  @UseGuards(OptionalAuthGuard)
  @Get('view-url')
  getViewUrl(
    @Query('path') path: string,
    @Query('bookingId') bookingId?: string,
    @Query('statusToken') statusToken?: string,
    @CurrentUser() user?: any,
  ) {
    return this.storageService.getSignedViewUrl(path, user?.id, bookingId, statusToken);
  }

  /**
   * POST /api/storage/asset-upload-url?fileName=qr.png
   * Admin only — signed upload URL for shop assets (payment QR codes).
   */
  @UseGuards(SupabaseAuthGuard)
  @Post('asset-upload-url')
  getAssetUploadUrl(@Query('fileName') fileName: string, @CurrentUser() user: any) {
    return this.storageService.createAssetUploadUrl(fileName, user.id);
  }
}
