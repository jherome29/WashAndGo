import { Body, Controller, Get, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { SupabaseAuthGuard } from './guards/supabase-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { EmailSignupDto } from './dto/email-signup.dto';
import { RequestEmailChangeDto } from './dto/request-email-change.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import type { Request } from 'express';

@Controller('auth')
@Throttle({ default: { ttl: 60_000, limit: 10 } })
export class AuthController {
  constructor(private authService: AuthService) {}

  @Throttle({ default: { limit: 5, ttl: 60000, blockDuration: 120000 } })
  @Post('signup')
  async signup(@Body() dto: EmailSignupDto) {
    return this.authService.signUpWithEmail(dto);
  }

  @Throttle({ default: { limit: 5, ttl: 60000, blockDuration: 120000 } })
  @Post('request-password-reset')
  async requestPasswordReset(
    @Body() dto: RequestPasswordResetDto,
    @Req() req: Request,
  ) {
    return this.authService.requestPasswordReset(dto, req.ip);
  }

  @UseGuards(SupabaseAuthGuard)
  @Patch('request-email-change')
  async requestEmailChange(
    @Body() dto: RequestEmailChangeDto,
    @CurrentUser() user: any,
  ) {
    return this.authService.requestEmailChange(user.id, user.email, dto);
  }

  /**
   * GET /api/auth/google
   * Redirects the user to Google OAuth via Supabase.
   * Query param `redirectTo` = where Supabase should send the user after auth.
   */
  @Get('google')
  async googleAuth(
    @Query('redirectTo') redirectTo: string,
    @Res() res: Response,
  ) {
    const fallback = 'http://localhost:5173/auth/callback';
    const url = await this.authService.getGoogleOAuthUrl(redirectTo || fallback);
    return res.redirect(url);
  }

  /**
   * GET /api/auth/me
   * Returns the currently authenticated user's profile.
   * Requires a valid Supabase JWT in the Authorization header.
   */
  @UseGuards(SupabaseAuthGuard)
  @Get('me')
  async getMe(@CurrentUser() user: any) {
    return user;
  }
}
