import { Controller, Get, Patch, Post, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UpdatePaymentSettingsDto } from './dto/payment-settings.dto';
import { UpdateScheduleDto, CreateScheduleOverrideDto } from './dto/schedule-settings.dto';

@Controller('admin')
export class AdminController {
  constructor(private adminService: AdminService) {}

  /** GET /api/admin/payment-settings — Admin: all payment settings */
  @UseGuards(SupabaseAuthGuard)
  @Get('payment-settings')
  getPaymentSettings(@CurrentUser() user: any) {
    return this.adminService.getPaymentSettings(user.id);
  }

  /** PATCH /api/admin/payment-settings — Admin: upsert payment method settings */
  @UseGuards(SupabaseAuthGuard)
  @Patch('payment-settings')
  updatePaymentSettings(@Body() dto: UpdatePaymentSettingsDto, @CurrentUser() user: any) {
    return this.adminService.updatePaymentSettings(dto, user.id);
  }

  /** GET /api/admin/schedule-settings — Admin: schedule + overrides */
  @UseGuards(SupabaseAuthGuard)
  @Get('schedule-settings')
  getScheduleSettings(@CurrentUser() user: any) {
    return this.adminService.getScheduleSettings(user.id);
  }

  /** PATCH /api/admin/schedule-settings — Admin: update default schedule */
  @UseGuards(SupabaseAuthGuard)
  @Patch('schedule-settings')
  updateScheduleSettings(@Body() dto: UpdateScheduleDto, @CurrentUser() user: any) {
    return this.adminService.updateScheduleSettings(dto, user.id);
  }

  /** POST /api/admin/schedule-overrides — Admin: add/update a date override */
  @UseGuards(SupabaseAuthGuard)
  @Post('schedule-overrides')
  upsertOverride(@Body() dto: CreateScheduleOverrideDto, @CurrentUser() user: any) {
    return this.adminService.upsertScheduleOverride(dto, user.id);
  }

  /** DELETE /api/admin/schedule-overrides/:date — Admin: remove a date override */
  @UseGuards(SupabaseAuthGuard)
  @Delete('schedule-overrides/:date')
  deleteOverride(@Param('date') date: string, @CurrentUser() user: any) {
    return this.adminService.deleteScheduleOverride(date, user.id);
  }

  /** GET /api/admin/payment-methods — Public: get payment methods for checkout */
  @Get('payment-methods')
  getPublicPaymentSettings() {
    return this.adminService.getPublicPaymentSettings();
  }
}
