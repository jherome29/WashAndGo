import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { AddUpdateDto } from './dto/add-update.dto';
import { PaymentDeclineDto } from './dto/payment-decline.dto';
import { ReuploadProofDto } from './dto/reupload-proof.dto';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { OptionalAuthGuard } from '../auth/guards/optional-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('bookings')
export class BookingsController {
  constructor(private bookingsService: BookingsService) {}

  /** POST /api/bookings — Create booking (auth optional) */
  @UseGuards(OptionalAuthGuard)
  @Post()
  create(@Body() dto: CreateBookingDto, @CurrentUser() user: any) {
    return this.bookingsService.create(dto, user?.id);
  }

  /** GET /api/bookings/status?id=&token= — Guest status lookup */
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Get('status')
  getStatusByToken(@Query('id') id: string, @Query('token') token: string) {
    return this.bookingsService.findByToken(id, token);
  }

  /** GET /api/bookings/booked-slots?date=YYYY-MM-DD&category=LUBE — Booked time slots */
  @Get('booked-slots')
  getBookedSlots(
    @Query('date') date: string,
    @Query('category') category?: string,
  ) {
    return this.bookingsService.getBookedSlots(date, category);
  }

  /** GET /api/bookings/availability?date=&serviceId= — Availability for a date */
  @Get('availability')
  getAvailability(
    @Query('date') date: string,
    @Query('serviceId') serviceId?: string,
    @Query('category') category?: string,
  ) {
    return this.bookingsService.getAvailability(date, serviceId, category);
  }

  /** GET /api/bookings/my-bookings — Customer's own bookings */
  @UseGuards(SupabaseAuthGuard)
  @Get('my-bookings')
  findMyBookings(@CurrentUser() user: any) {
    return this.bookingsService.findMyBookings(user.id);
  }

  /** GET /api/bookings — All bookings (admin only) */
  @UseGuards(SupabaseAuthGuard)
  @Get()
  findAll(
    @Query('status') status?: string,
    @Query('date') date?: string,
    @CurrentUser() user?: any,
  ) {
    return this.bookingsService.findAll({ status, date }, user?.id);
  }

  /** GET /api/bookings/:id — Get booking by ID (public) */
  @Get(':id')
  findById(@Param('id') id: string) {
    return this.bookingsService.findById(id);
  }

  /** POST /api/bookings/:id/payment/confirm — Admin confirms payment */
  @UseGuards(SupabaseAuthGuard)
  @Post(':id/payment/confirm')
  confirmPayment(@Param('id') id: string, @CurrentUser() user: any) {
    return this.bookingsService.confirmPayment(id, user.id);
  }

  /** POST /api/bookings/:id/payment/decline — Admin declines payment */
  @UseGuards(SupabaseAuthGuard)
  @Post(':id/payment/decline')
  declinePayment(
    @Param('id') id: string,
    @Body() dto: PaymentDeclineDto,
    @CurrentUser() user: any,
  ) {
    return this.bookingsService.declinePayment(id, dto.declineReason, user.id);
  }

  /** POST /api/bookings/:id/payment-proof — Customer reupload proof (token or auth) */
  @Throttle({ default: { limit: 5, ttl: 300000 } })
  @UseGuards(OptionalAuthGuard)
  @Post(':id/payment-proof')
  reuploadProof(
    @Param('id') id: string,
    @Body() dto: ReuploadProofDto,
    @CurrentUser() user: any,
  ) {
    return this.bookingsService.reuploadProof(id, dto.paymentProofPath, dto.statusToken, user?.id);
  }

  /** PATCH /api/bookings/:id/status — Update status (admin only) */
  @UseGuards(SupabaseAuthGuard)
  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateStatusDto,
    @CurrentUser() user: any,
  ) {
    return this.bookingsService.updateStatus(id, dto.status, user.id);
  }

  /** PATCH /api/bookings/:id — Admin edit any field */
  @UseGuards(SupabaseAuthGuard)
  @Patch(':id')
  adminUpdate(
    @Param('id') id: string,
    @Body() body: Record<string, any>,
    @CurrentUser() user: any,
  ) {
    return this.bookingsService.adminUpdate(id, body, user.id);
  }

  /** POST /api/bookings/:id/updates — Add progress update with photos (admin only) */
  @UseGuards(SupabaseAuthGuard)
  @Post(':id/updates')
  addUpdate(
    @Param('id') id: string,
    @Body() dto: AddUpdateDto,
    @CurrentUser() user: any,
  ) {
    return this.bookingsService.addUpdate(id, dto.message, dto.imageUrls || [], user.id);
  }
}
