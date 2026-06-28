import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';
import { EmailService } from '../email/email.service';
import { EmailSignupDto } from './dto/email-signup.dto';
import { RequestEmailChangeDto } from './dto/request-email-change.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private supabase: SupabaseService,
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
  ) {}

  async signUpWithEmail(dto: EmailSignupDto) {
    const email = dto.email?.trim().toLowerCase();
    const fullName = dto.fullName?.trim();
    const phone = dto.phone?.trim();
    const password = dto.password;

    if (!email || !fullName || !password) {
      throw new BadRequestException('Full name, email, and password are required.');
    }

    const redirectTo =
      dto.redirectTo?.trim() ||
      this.config.get<string>('FRONTEND_URL') ||
      'http://localhost:3000';

    const { data, error } = await this.supabase.getAdminClient().auth.admin.generateLink({
      type: 'signup',
      email,
      password,
      options: {
        data: { full_name: fullName },
        redirectTo,
      },
    });

    if (error || !data?.user || !data?.properties?.action_link) {
      throw new BadRequestException(error?.message || 'Unable to create account.');
    }

    if (phone) {
      const { error: phoneUpdateError } = await this.supabase
        .getAdminClient()
        .from('profiles')
        .update({ phone })
        .eq('id', data.user.id);

      if (phoneUpdateError) {
        this.logger.warn(`Profile phone update failed for ${data.user.id}: ${phoneUpdateError.message}`);
      }
    }

    if (!this.emailService.isConfigured()) {
      // No Brevo API key — auto-confirm user so local dev/testing works without email setup
      this.logger.warn(`BREVO_API_KEY not set — auto-confirming user ${email} (email not configured)`);
      await this.supabase.getAdminClient().auth.admin.updateUserById(data.user.id, {
        email_confirm: true,
      });
      return {
        message: 'Account created. You can now log in. (Email confirmation skipped — email service not configured.)',
      };
    }

    try {
      await this.emailService.sendVerificationEmail({
        to: email,
        fullName,
        confirmationUrl: data.properties.action_link,
      });
    } catch (mailError: any) {
      this.logger.error(`Verification email failed for ${email}: ${mailError?.message || mailError}`);
      try {
        await this.supabase.getAdminClient().auth.admin.deleteUser(data.user.id);
      } catch (cleanupError: any) {
        this.logger.error(
          `Failed cleanup for user ${data.user.id}: ${cleanupError?.message || cleanupError}`,
        );
      }
      throw new InternalServerErrorException(
        'Unable to send verification email. Please try again after SMTP is configured.',
      );
    }

    return {
      message: 'Account created. Please check your email to confirm your account.',
    };
  }

  async checkEmailExists(email: string): Promise<boolean> {
    const normalized = email?.trim().toLowerCase();
    if (!normalized) return false;
    // generateLink(recovery) succeeds only when the email is registered; no email is sent
    // and no account state changes — the generated link is simply discarded.
    const { data, error } = await this.supabase
      .getAdminClient()
      .auth.admin.generateLink({
        type: 'recovery',
        email: normalized,
        options: { redirectTo: 'http://localhost:3000' },
      });
    return !error && !!data?.properties?.action_link;
  }

  async requestEmailChange(userId: string, currentEmail: string, dto: RequestEmailChangeDto) {
    const newEmail = dto.newEmail.trim().toLowerCase();

    if (newEmail === currentEmail.toLowerCase()) {
      throw new BadRequestException('New email must be different from current email.');
    }

    const redirectTo =
      this.config.get<string>('FRONTEND_URL') || 'http://localhost:5173';

    const { data, error } = await this.supabase
      .getAdminClient()
      .auth.admin.generateLink({
        type: 'email_change_new',
        email: currentEmail,
        newEmail,
        options: { redirectTo },
      });

    if (error || !data?.properties?.action_link) {
      throw new BadRequestException(error?.message || 'Unable to generate email change link.');
    }

    const profile = await this.getProfile(userId).catch(() => null);

    try {
      await this.emailService.sendEmailChangeVerificationEmail({
        to: newEmail,
        fullName: profile?.full_name,
        oldEmail: currentEmail,
        confirmationUrl: data.properties.action_link,
      });
    } catch (mailError: any) {
      this.logger.error(`Email change email failed for ${newEmail}: ${mailError?.message}`);
      throw new InternalServerErrorException(
        'Unable to send verification email. Please try again.',
      );
    }

    return { message: 'Verification email sent. Check your new inbox and confirm to apply the change.' };
  }

  async requestPasswordReset(dto: RequestPasswordResetDto, requesterIp?: string) {
    const email = dto.email?.trim().toLowerCase();
    if (!email) {
      throw new BadRequestException('Email is required.');
    }

    const ipKey = requesterIp?.trim() || 'unknown';
    if (await this.isPasswordResetRateLimited(ipKey)) {
      throw new HttpException(
        'Too many reset attempts. Please try again in a minute.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const redirectTo =
      dto.redirectTo?.trim() ||
      this.config.get<string>('FRONTEND_URL') ||
      'http://localhost:5173';

    try {
      const { data, error } = await this.supabase.getAdminClient().auth.admin.generateLink({
        type: 'recovery',
        email,
        options: { redirectTo },
      });

      if (error || !data?.properties?.action_link) {
        this.logger.log(`Password reset requested for ${email}; no reset link issued.`);
        return {
          message: 'If an account exists for this email, a password reset link has been sent.',
        };
      }

      try {
        const fullName =
          (data.user?.user_metadata as Record<string, unknown> | undefined)?.full_name;
        await this.emailService.sendPasswordResetEmail({
          to: email,
          fullName: typeof fullName === 'string' ? fullName : undefined,
          resetUrl: data.properties.action_link,
        });
      } catch (mailError: any) {
        this.logger.error(
          `Password reset email failed for ${email}: ${mailError?.message || mailError}`,
        );
      }
    } catch (error: any) {
      this.logger.error(
        `Password reset request failed for ${email}: ${error?.message || error}`,
      );
    }

    return {
      message: 'If an account exists for this email, a password reset link has been sent.',
    };
  }

  /**
   * Generates the Google OAuth redirect URL via Supabase Auth.
   * The frontend redirects the user to this URL to begin the OAuth flow.
   */
  async getGoogleOAuthUrl(redirectTo: string): Promise<string> {
    const { data, error } = await this.supabase
      .getClient()
      .auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          scopes: 'email profile',
          skipBrowserRedirect: true,
        },
      });

    if (error) throw new UnauthorizedException(error.message);
    return data.url;
  }

  /**
   * Validates a Supabase JWT access token.
   * Call this from the auth guard on protected routes.
   */
  async getUserFromToken(accessToken: string) {
    const { data, error } = await this.supabase
      .getClient()
      .auth.getUser(accessToken);

    if (error || !data.user) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    return data.user;
  }

  /**
   * Fetches the profile row for a given user ID.
   */
  async getProfile(userId: string) {
    const { data, error } = await this.supabase
      .getAdminClient()
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) throw new UnauthorizedException(error.message);
    return data;
  }

  private async isPasswordResetRateLimited(ipKey: string): Promise<boolean> {
    const windowStart = new Date(Date.now() - 60_000).toISOString();

    const { count } = await this.supabase
      .getAdminClient()
      .from('password_reset_attempts')
      .select('*', { count: 'exact', head: true })
      .eq('ip_key', ipKey)
      .gte('attempted_at', windowStart);

    if ((count ?? 0) >= 3) return true;

    await this.supabase
      .getAdminClient()
      .from('password_reset_attempts')
      .insert({ ip_key: ipKey });

    return false;
  }
}
