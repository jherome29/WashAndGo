import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type VerificationEmailParams = {
  to: string;
  fullName?: string;
  confirmationUrl: string;
};

type PasswordResetEmailParams = {
  to: string;
  fullName?: string;
  resetUrl: string;
};

type BookingEmailParams = {
  to?: string;
  customerName: string;
  bookingId: string;
  serviceName: string;
  date: string;
  timeSlot: string;
  status?: string;
  statusToken?: string;
  declineReason?: string;
};

type ProgressUpdateEmailParams = {
  to: string;
  customerName: string;
  bookingId: string;
  serviceName: string;
  date: string;
  timeSlot: string;
  status: string;
  message: string;
  imageUrls: string[];
};

const BRAND_HEADER = `
  <tr>
    <td style="background:#1a1a1a;padding:28px 32px;text-align:center;border-radius:14px 14px 0 0;">
      <div style="font-size:40px;line-height:1;font-weight:900;letter-spacing:3px;color:#ffffff;font-family:Arial,sans-serif;">
        WASH <span style="color:#ee4923;">&amp;</span> GO
      </div>
      <div style="margin-top:8px;color:#888;font-size:11px;letter-spacing:3px;text-transform:uppercase;font-family:Arial,sans-serif;">
        Auto Salon &nbsp;&middot;&nbsp; Baliwag Branch
      </div>
    </td>
  </tr>`;

const BRAND_FOOTER = (year: number) => `
  <tr>
    <td style="background:#1a1a1a;padding:18px 32px;text-align:center;border-radius:0 0 14px 14px;">
      <p style="margin:0;color:#555;font-size:11px;font-family:Arial,sans-serif;">
        &copy; ${year} Wash &amp; Go Auto Salon &nbsp;&middot;&nbsp; Baliwag Branch
      </p>
      <p style="margin:6px 0 0;color:#444;font-size:10px;font-family:Arial,sans-serif;">
        You received this email because you have a booking with us.
      </p>
    </td>
  </tr>`;

function wrapper(content: string): string {
  return `
    <div style="margin:0;padding:32px 16px;background:#f0f2f5;font-family:Arial,Helvetica,sans-serif;">
      <table role="presentation" style="max-width:600px;width:100%;margin:0 auto;border-collapse:collapse;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.10);">
        ${BRAND_HEADER}
        ${content}
        ${BRAND_FOOTER(new Date().getFullYear())}
      </table>
    </div>`;
}

function statusBadge(status: string): string {
  const s = status.toUpperCase().replace(/[\s-]/g, '_');
  const map: Record<string, { bg: string; color: string; label: string }> = {
    PENDING:     { bg: '#fef3c7', color: '#92400e', label: 'Pending' },
    CONFIRMED:   { bg: '#dbeafe', color: '#1e40af', label: 'Confirmed' },
    IN_PROGRESS: { bg: '#ffedd5', color: '#9a3412', label: 'In Progress' },
    REUPLOAD_REQUIRED: { bg: '#ffedd5', color: '#9a3412', label: 'Re-upload Required' },
    COMPLETED:   { bg: '#dcfce7', color: '#14532d', label: 'Completed' },
    CANCELLED:   { bg: '#fee2e2', color: '#7f1d1d', label: 'Cancelled' },
  };
  const cfg = map[s] ?? { bg: '#f3f4f6', color: '#374151', label: status };
  return `<span style="display:inline-block;padding:4px 14px;border-radius:999px;font-size:11px;font-weight:700;background:${cfg.bg};color:${cfg.color};letter-spacing:0.05em;text-transform:uppercase;">${cfg.label}</span>`;
}

function bookingInfoBlock(
  bookingId: string, serviceName: string, date: string, timeSlot: string,
  safeEscape: (s: string) => string,
): string {
  return `
    <table role="presentation" style="width:100%;border-collapse:collapse;background:#f8f9fb;border-radius:10px;overflow:hidden;margin:0 0 20px;">
      <tr>
        <td style="padding:12px 16px;border-bottom:1px solid #edf0f4;">
          <span style="font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.12em;font-weight:600;">Booking ID</span><br/>
          <span style="font-size:15px;font-weight:900;color:#1a1a1a;letter-spacing:0.05em;">#${safeEscape(bookingId)}</span>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 16px;border-bottom:1px solid #edf0f4;">
          <span style="font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.12em;font-weight:600;">Service</span><br/>
          <span style="font-size:14px;font-weight:700;color:#383838;">${safeEscape(serviceName)}</span>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 16px;border-bottom:1px solid #edf0f4;">
          <span style="font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.12em;font-weight:600;">Date</span><br/>
          <span style="font-size:14px;font-weight:700;color:#383838;">${safeEscape(date)}</span>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 16px;">
          <span style="font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.12em;font-weight:600;">Time</span><br/>
          <span style="font-size:14px;font-weight:700;color:#383838;">${safeEscape(timeSlot)}</span>
        </td>
      </tr>
    </table>`;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private mailTimeoutMs?: number;

  constructor(private readonly config: ConfigService) {}

  async sendVerificationEmail(params: VerificationEmailParams) {
    const name = params.fullName?.trim() || 'there';
    const safeName = this.escapeHtml(name);
    const safeEmail = this.escapeHtml(params.to);
    const safeUrl = this.escapeHtml(params.confirmationUrl);

    const body = `
      <tr>
        <td style="background:#ffffff;padding:36px 32px;">
          <h2 style="margin:0 0 4px;font-size:22px;font-weight:900;color:#1a1a1a;letter-spacing:0.04em;">Confirm Your Email</h2>
          <div style="width:36px;height:3px;background:#ee4923;border-radius:2px;margin:10px 0 20px;"></div>
          <p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#4b5563;">Hi <strong>${safeName}</strong>,</p>
          <p style="margin:0 0 24px;font-size:14px;line-height:1.7;color:#4b5563;">
            Welcome to Wash &amp; Go! Please confirm your email address to activate your account and start booking our premium auto care services.
          </p>
          <p style="text-align:center;margin:0 0 24px;">
            <a href="${safeUrl}" style="display:inline-block;background:#ee4923;color:#ffffff;text-decoration:none;font-weight:800;font-size:13px;padding:14px 36px;border-radius:10px;letter-spacing:0.1em;text-transform:uppercase;">
              Confirm Email Address
            </a>
          </p>
          <div style="background:#f8f9fb;border-radius:10px;padding:14px 16px;margin-bottom:20px;">
            <p style="margin:0 0 6px;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.1em;font-weight:600;">Or copy this link:</p>
            <p style="margin:0;word-break:break-all;font-size:12px;line-height:1.6;">
              <a href="${safeUrl}" style="color:#ee4923;text-decoration:none;">${safeUrl}</a>
            </p>
          </div>
          <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">
            This email was sent to <strong>${safeEmail}</strong>. If you did not create an account, you can safely ignore this email.
          </p>
        </td>
      </tr>`;

    await this.sendMail({
      to: params.to,
      subject: 'Confirm your Wash & Go account',
      html: wrapper(body),
      text: `Hi ${name}, confirm your Wash & Go account here: ${params.confirmationUrl}`,
    });
  }

  async sendEmailChangeVerificationEmail(params: {
    to: string;
    fullName?: string;
    oldEmail: string;
    confirmationUrl: string;
  }) {
    const name = params.fullName?.trim() || 'there';
    const safeName = this.escapeHtml(name);
    const safeOld = this.escapeHtml(params.oldEmail);
    const safeNew = this.escapeHtml(params.to);
    const safeUrl = this.escapeHtml(params.confirmationUrl);

    const body = `
      <tr>
        <td style="background:#ffffff;padding:36px 32px;">
          <h2 style="margin:0 0 4px;font-size:22px;font-weight:900;color:#1a1a1a;letter-spacing:0.04em;">Confirm New Email</h2>
          <div style="width:36px;height:3px;background:#ee4923;border-radius:2px;margin:10px 0 20px;"></div>
          <p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#4b5563;">Hi <strong>${safeName}</strong>,</p>
          <p style="margin:0 0 20px;font-size:14px;line-height:1.7;color:#4b5563;">
            You requested an email address change for your Wash &amp; Go account.
            Click the button below to confirm your new address. This link expires in <strong>24 hours</strong>.
          </p>

          <table role="presentation" style="width:100%;border-collapse:collapse;background:#f8f9fb;border-radius:10px;overflow:hidden;margin:0 0 24px;">
            <tr>
              <td style="padding:14px 16px;border-bottom:1px solid #edf0f4;">
                <span style="font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.12em;font-weight:600;">Current Email</span><br/>
                <span style="font-size:14px;font-weight:700;color:#6b7280;">${safeOld}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:14px 16px;">
                <span style="font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.12em;font-weight:600;">New Email</span><br/>
                <span style="font-size:14px;font-weight:900;color:#ee4923;">${safeNew}</span>
              </td>
            </tr>
          </table>

          <p style="text-align:center;margin:0 0 24px;">
            <a href="${safeUrl}" style="display:inline-block;background:#ee4923;color:#ffffff;text-decoration:none;font-weight:800;font-size:13px;padding:14px 36px;border-radius:10px;letter-spacing:0.1em;text-transform:uppercase;">
              Confirm New Email
            </a>
          </p>

          <div style="background:#f8f9fb;border-radius:10px;padding:14px 16px;margin-bottom:20px;">
            <p style="margin:0 0 6px;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.1em;font-weight:600;">Or copy this link:</p>
            <p style="margin:0;word-break:break-all;font-size:12px;line-height:1.6;">
              <a href="${safeUrl}" style="color:#ee4923;text-decoration:none;">${safeUrl}</a>
            </p>
          </div>

          <div style="background:#fff5f5;border:1px solid #fecaca;border-radius:10px;padding:12px 16px;margin-bottom:20px;">
            <p style="margin:0;font-size:12px;color:#dc2626;line-height:1.6;">
              <strong>Didn&apos;t request this?</strong> If you did not request an email change, please ignore this email. Your current email remains active.
            </p>
          </div>

          <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">
            After confirming, please log out and log back in to refresh your session.
          </p>
        </td>
      </tr>`;

    await this.sendMail({
      to: params.to,
      subject: 'Confirm your new email — Wash & Go',
      html: wrapper(body),
      text: `Hi ${name}, confirm your new Wash & Go email address here: ${params.confirmationUrl}`,
    });
  }

  async sendPasswordResetEmail(params: PasswordResetEmailParams) {
    const name = params.fullName?.trim() || 'there';
    const safeName = this.escapeHtml(name);
    const safeEmail = this.escapeHtml(params.to);
    const safeUrl = this.escapeHtml(params.resetUrl);

    const body = `
      <tr>
        <td style="background:#ffffff;padding:36px 32px;">
          <h2 style="margin:0 0 4px;font-size:22px;font-weight:900;color:#1a1a1a;letter-spacing:0.04em;">Reset Your Password</h2>
          <div style="width:36px;height:3px;background:#ee4923;border-radius:2px;margin:10px 0 20px;"></div>
          <p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#4b5563;">Hi <strong>${safeName}</strong>,</p>
          <p style="margin:0 0 24px;font-size:14px;line-height:1.7;color:#4b5563;">
            We received a request to reset the password for your Wash &amp; Go account. Click the button below to set a new password. This link expires in <strong>1 hour</strong>.
          </p>
          <p style="text-align:center;margin:0 0 24px;">
            <a href="${safeUrl}" style="display:inline-block;background:#ee4923;color:#ffffff;text-decoration:none;font-weight:800;font-size:13px;padding:14px 36px;border-radius:10px;letter-spacing:0.1em;text-transform:uppercase;">
              Reset Password
            </a>
          </p>
          <div style="background:#f8f9fb;border-radius:10px;padding:14px 16px;margin-bottom:20px;">
            <p style="margin:0 0 6px;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.1em;font-weight:600;">Or copy this link:</p>
            <p style="margin:0;word-break:break-all;font-size:12px;line-height:1.6;">
              <a href="${safeUrl}" style="color:#ee4923;text-decoration:none;">${safeUrl}</a>
            </p>
          </div>
          <div style="background:#fff5f5;border:1px solid #fecaca;border-radius:10px;padding:12px 16px;margin-bottom:20px;">
            <p style="margin:0;font-size:12px;color:#dc2626;line-height:1.6;">
              <strong>Didn&apos;t request this?</strong> If you did not request a password reset, please ignore this email. Your account is safe.
            </p>
          </div>
          <p style="margin:0;font-size:12px;color:#9ca3af;">This email was sent to <strong>${safeEmail}</strong>.</p>
        </td>
      </tr>`;

    await this.sendMail({
      to: params.to,
      subject: 'Reset your Wash & Go password',
      html: wrapper(body),
      text: `Hi ${name}, reset your Wash & Go password here: ${params.resetUrl}`,
    });
  }

  async sendBookingCreatedCustomerEmail(params: BookingEmailParams) {
    if (!params.to) return;
    const safeName = this.escapeHtml(params.customerName);
    const esc = this.escapeHtml.bind(this);

    const bookingIdNote = `<div style="background:#fff5f0;border:1px solid #fde8dc;border-radius:10px;padding:14px 16px;margin-bottom:20px;">
        <p style="margin:0 0 4px;font-size:11px;color:#c2410c;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;">&#128274; Save Your Booking ID</p>
        <p style="margin:0;font-size:13px;color:#9a3412;line-height:1.6;">
          Keep your Booking ID <strong style="font-family:monospace;">${esc(params.bookingId)}</strong> for reference. You can use it to check your booking status anytime at <strong>CHECK STATUS</strong> in the navigation bar.
        </p>
      </div>`;

    const body = `
      <tr>
        <td style="background:#ffffff;padding:36px 32px;">
          <h2 style="margin:0 0 4px;font-size:22px;font-weight:900;color:#1a1a1a;letter-spacing:0.04em;">Booking Received</h2>
          <div style="width:36px;height:3px;background:#ee4923;border-radius:2px;margin:10px 0 20px;"></div>
          <p style="margin:0 0 20px;font-size:14px;line-height:1.7;color:#4b5563;">
            Hi <strong>${safeName}</strong>, your booking has been submitted successfully! Our team will review it and confirm shortly.
          </p>
          ${bookingInfoBlock(params.bookingId, params.serviceName, params.date, params.timeSlot, esc)}
          ${bookingIdNote}
          <div style="background:#fff5f0;border:1px solid #fde8dc;border-radius:10px;padding:14px 16px;margin-bottom:20px;">
            <p style="margin:0;font-size:13px;color:#c2410c;line-height:1.7;font-weight:600;">
              What&apos;s next?
            </p>
            <p style="margin:6px 0 0;font-size:13px;color:#9a3412;line-height:1.7;">
              We&apos;ll send you a confirmation email once your booking has been reviewed.
            </p>
          </div>
          <p style="margin:0;font-size:12px;color:#9ca3af;">Thank you for choosing Wash &amp; Go Auto Salon.</p>
        </td>
      </tr>`;

    await this.sendMail({
      to: params.to,
      subject: `Booking Received — #${params.bookingId}`,
      html: wrapper(body),
      text: `Hi ${params.customerName}, your booking #${params.bookingId} was submitted. Keep your Booking ID for reference — you can use it to check your status at CHECK STATUS in the nav.`,
    });
  }

  async sendBookingCreatedAdminEmail(params: BookingEmailParams) {
    const adminEmails = this.getAdminNotificationEmails();
    if (!adminEmails.length) return;
    const esc = this.escapeHtml.bind(this);

    const body = `
      <tr>
        <td style="background:#ffffff;padding:36px 32px;">
          <h2 style="margin:0 0 4px;font-size:22px;font-weight:900;color:#1a1a1a;letter-spacing:0.04em;">New Booking</h2>
          <div style="width:36px;height:3px;background:#ee4923;border-radius:2px;margin:10px 0 20px;"></div>
          <p style="margin:0 0 20px;font-size:14px;line-height:1.7;color:#4b5563;">
            A new booking has been submitted and is awaiting your review.
          </p>
          <table role="presentation" style="width:100%;border-collapse:collapse;background:#f8f9fb;border-radius:10px;overflow:hidden;margin:0 0 20px;">
            <tr>
              <td style="padding:12px 16px;border-bottom:1px solid #edf0f4;">
                <span style="font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.12em;font-weight:600;">Booking ID</span><br/>
                <span style="font-size:15px;font-weight:900;color:#1a1a1a;letter-spacing:0.05em;">#${esc(params.bookingId)}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 16px;border-bottom:1px solid #edf0f4;">
                <span style="font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.12em;font-weight:600;">Customer</span><br/>
                <span style="font-size:14px;font-weight:700;color:#383838;">${esc(params.customerName)}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 16px;border-bottom:1px solid #edf0f4;">
                <span style="font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.12em;font-weight:600;">Service</span><br/>
                <span style="font-size:14px;font-weight:700;color:#383838;">${esc(params.serviceName)}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 16px;border-bottom:1px solid #edf0f4;">
                <span style="font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.12em;font-weight:600;">Date</span><br/>
                <span style="font-size:14px;font-weight:700;color:#383838;">${esc(params.date)}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 16px;">
                <span style="font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.12em;font-weight:600;">Time</span><br/>
                <span style="font-size:14px;font-weight:700;color:#383838;">${esc(params.timeSlot)}</span>
              </td>
            </tr>
          </table>
          <p style="margin:0;font-size:12px;color:#9ca3af;">Log in to the admin panel to review and confirm this booking.</p>
        </td>
      </tr>`;

    await this.sendMail({
      to: adminEmails.join(','),
      subject: `New Booking — #${params.bookingId} · ${params.customerName}`,
      html: wrapper(body),
      text: `New booking #${params.bookingId} by ${params.customerName}. Service: ${params.serviceName} on ${params.date} at ${params.timeSlot}.`,
    });
  }

  async sendPaymentDeclinedEmail(params: BookingEmailParams) {
    if (!params.to) return;
    const safeName = this.escapeHtml(params.customerName);
    const esc = this.escapeHtml.bind(this);

    const reasonBlock = params.declineReason
      ? `<div style="background:#fff1f2;border:1px solid #fecdd3;border-radius:10px;padding:14px 16px;margin-bottom:20px;">
        <p style="margin:0 0 4px;font-size:11px;color:#9f1239;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;">Reason</p>
        <p style="margin:0;font-size:13px;color:#9f1239;line-height:1.7;">${esc(params.declineReason)}</p>
      </div>`
      : '';


    const body = `
    <tr>
      <td style="background:#ffffff;padding:36px 32px;">
        <h2 style="margin:0 0 4px;font-size:22px;font-weight:900;color:#1a1a1a;letter-spacing:0.04em;">Payment Proof Declined</h2>
        <div style="width:36px;height:3px;background:#ee4923;border-radius:2px;margin:10px 0 20px;"></div>
        <p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:#4b5563;">
          Hi <strong>${safeName}</strong>,
        </p>
        <p style="margin:0 0 20px;font-size:14px;line-height:1.7;color:#4b5563;">
          Your payment proof for booking <strong>#${esc(params.bookingId)}</strong> has been declined and requires a new upload before we can proceed.
        </p>
        ${reasonBlock}
        ${bookingInfoBlock(params.bookingId, params.serviceName, params.date, params.timeSlot, esc)}
        <div style="background:#fff5f0;border:1px solid #fde8dc;border-radius:10px;padding:16px 18px;margin-bottom:20px;">
          <p style="margin:0 0 10px;font-size:13px;color:#c2410c;font-weight:700;">How to reupload your payment proof:</p>
          <ol style="margin:0;padding-left:20px;font-size:13px;color:#9a3412;line-height:2.2;">
            <li>Open the Wash &amp; Go website</li>
            <li>Click <strong>CHECK STATUS</strong> in the navigation bar</li>
            <li>Enter your Booking ID: <strong style="font-family:monospace;">${esc(params.bookingId)}</strong></li>
            <li>Upload a clear screenshot of your GCash or bank payment</li>
          </ol>
        </div>
        <p style="margin:0;font-size:12px;color:#9ca3af;">Thank you for your patience — Wash &amp; Go Auto Salon.</p>
      </td>
    </tr>`;

    await this.sendMail({
      to: params.to,
      subject: `Action Required: Reupload Payment Proof — #${params.bookingId}`,
      html: wrapper(body),
      text: `Hi ${params.customerName}, your payment proof for booking #${params.bookingId} was declined.${params.declineReason ? ` Reason: ${params.declineReason}.` : ''} Go to CHECK STATUS in the nav, enter your Booking ID, and reupload your proof.`,
    });
  }

  async sendBookingStatusEmail(params: BookingEmailParams) {
    if (!params.to) return;
    const safeName = this.escapeHtml(params.customerName);
    const safeStatus = this.escapeHtml(params.status || 'UPDATED');
    const esc = this.escapeHtml.bind(this);

    const statusMessages: Record<string, string> = {
      CONFIRMED:   'Great news! Your booking has been confirmed. We look forward to serving you.',
      IN_PROGRESS: 'Your vehicle service is now in progress. We\'ll keep you updated.',
      REUPLOAD_REQUIRED: 'Your booking needs a corrected upload or missing requirement before we can continue reviewing it.',
      COMPLETED:   'Your service has been completed. Thank you for choosing Wash &amp; Go!',
      CANCELLED:   'Your booking has been cancelled. Please contact us if you have questions.',
    };
    const statusKey = safeStatus.toUpperCase().replace(/[\s-]/g, '_');
    const statusMsg = statusMessages[statusKey] || 'Your booking status has been updated.';

    const body = `
      <tr>
        <td style="background:#ffffff;padding:36px 32px;">
          <h2 style="margin:0 0 4px;font-size:22px;font-weight:900;color:#1a1a1a;letter-spacing:0.04em;">Booking Update</h2>
          <div style="width:36px;height:3px;background:#ee4923;border-radius:2px;margin:10px 0 20px;"></div>
          <p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:#4b5563;">
            Hi <strong>${safeName}</strong>,
          </p>
          <p style="margin:0 0 20px;font-size:14px;line-height:1.7;color:#4b5563;">
            Your booking status has been updated to ${statusBadge(safeStatus)}.
          </p>
          <p style="margin:0 0 24px;font-size:14px;line-height:1.7;color:#4b5563;">${statusMsg}</p>
          ${bookingInfoBlock(params.bookingId, params.serviceName, params.date, params.timeSlot, esc)}
          <p style="margin:0;font-size:12px;color:#9ca3af;">Thank you for choosing Wash &amp; Go Auto Salon.</p>
        </td>
      </tr>`;

    await this.sendMail({
      to: params.to,
      subject: `Booking #${params.bookingId} — ${safeStatus}`,
      html: wrapper(body),
      text: `Hi ${params.customerName}, your booking #${params.bookingId} is now ${params.status}.`,
    });
  }

  async sendProgressUpdateEmail(params: ProgressUpdateEmailParams) {
    const safeName = this.escapeHtml(params.customerName);
    const safeMessage = this.escapeHtml(params.message);
    const esc = this.escapeHtml.bind(this);

    const imageGrid = params.imageUrls.length > 0
      ? `<table role="presentation" style="width:100%;border-collapse:collapse;margin:16px 0 0;">
          <tr>
            ${params.imageUrls.slice(0, 4).map(url => `
              <td style="padding:4px;width:${Math.floor(100 / Math.min(params.imageUrls.length, 4))}%;">
                <img src="${esc(url)}" alt="Update photo"
                  style="width:100%;max-height:180px;object-fit:cover;border-radius:8px;display:block;border:1px solid #edf0f4;" />
              </td>`).join('')}
          </tr>
        </table>`
      : '';

    const body = `
      <tr>
        <td style="background:#ffffff;padding:36px 32px;">
          <h2 style="margin:0 0 4px;font-size:22px;font-weight:900;color:#1a1a1a;letter-spacing:0.04em;">Progress Update</h2>
          <div style="width:36px;height:3px;background:#ee4923;border-radius:2px;margin:10px 0 20px;"></div>
          <p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:#4b5563;">
            Hi <strong>${safeName}</strong>,
          </p>
          <p style="margin:0 0 8px;font-size:14px;line-height:1.7;color:#4b5563;">
            Our team posted an update on your booking (${statusBadge(params.status)}):
          </p>
          <div style="background:#f8f9fb;border-left:3px solid #ee4923;border-radius:0 10px 10px 0;padding:16px 18px;margin:0 0 20px;">
            <p style="margin:0;font-size:14px;line-height:1.7;color:#383838;">${safeMessage}</p>
            ${imageGrid}
          </div>
          ${bookingInfoBlock(params.bookingId, params.serviceName, params.date, params.timeSlot, esc)}
          <p style="margin:0;font-size:12px;color:#9ca3af;">Thank you for choosing Wash &amp; Go Auto Salon.</p>
        </td>
      </tr>`;

    await this.sendMail({
      to: params.to,
      subject: `Update on Booking #${params.bookingId}`,
      html: wrapper(body),
      text: `Hi ${params.customerName}, your booking #${params.bookingId} has a new update: ${params.message}`,
    });
  }

  private async sendMail(input: { to: string; subject: string; html: string; text: string }) {
    const apiKey = this.getBrevoApiKey();
    const baseUrl = this.getBrevoBaseUrl();
    const sender = this.getSender();
    const recipients = this.parseRecipients(input.to);
    const sandboxEnabled = this.getBoolean('BREVO_SANDBOX', false);

    const requestBody: Record<string, unknown> = {
      sender,
      to: recipients,
      subject: input.subject,
      htmlContent: input.html,
      textContent: input.text,
    };

    if (sandboxEnabled) {
      requestBody.headers = { 'X-Sib-Sandbox': 'drop' };
    }

    const response = await this.withTimeout(
      fetch(`${baseUrl}/v3/smtp/email`, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'api-key': apiKey,
        },
        body: JSON.stringify(requestBody),
      }),
      this.getMailTimeoutMs(),
      'Brevo send timed out',
    );

    if (!response.ok) {
      const details = await response.text().catch(() => response.statusText);
      this.logger.error(`Brevo send failed (${response.status}): ${details}`);
      throw new InternalServerErrorException('Email delivery failed. Please try again.');
    }

    const payload = (await response.json().catch(() => null)) as { messageId?: string } | null;
    if (payload?.messageId) {
      this.logger.log(`Brevo email sent: ${payload.messageId}`);
    }
  }

  private getMailTimeoutMs(): number {
    if (this.mailTimeoutMs) return this.mailTimeoutMs;
    const raw =
      this.config.get<string>('BREVO_TIMEOUT_MS') ||
      this.config.get<string>('SMTP_TIMEOUT_MS') ||
      '15000';
    const parsed = Number(raw);
    this.mailTimeoutMs = Number.isFinite(parsed) && parsed > 0 ? parsed : 15000;
    return this.mailTimeoutMs;
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(label)), timeoutMs);
      });
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private getBoolean(name: string, fallback: boolean): boolean {
    const value = (this.config.get<string>(name) ?? '').trim().toLowerCase();
    if (!value) return fallback;
    return value === 'true' || value === '1' || value === 'yes';
  }

  isConfigured(): boolean {
    return !!(this.config.get<string>('BREVO_API_KEY') || '').trim();
  }

  private getBrevoApiKey(): string {
    const apiKey = (this.config.get<string>('BREVO_API_KEY') || '').trim();
    if (!apiKey) {
      throw new InternalServerErrorException('Email is not configured. Set BREVO_API_KEY.');
    }
    return apiKey;
  }

  private getBrevoBaseUrl(): string {
    const baseUrl = (this.config.get<string>('BREVO_BASE_URL') || 'https://api.brevo.com').trim();
    return baseUrl.replace(/\/+$/, '');
  }

  private getSender(): { email: string; name: string } {
    const email =
      (this.config.get<string>('BREVO_SENDER_EMAIL') || this.config.get<string>('SMTP_FROM') || '').trim();
    const name =
      (this.config.get<string>('BREVO_SENDER_NAME') || this.config.get<string>('SMTP_FROM_NAME') || 'Wash & Go Auto Salon').trim();
    if (!email) {
      throw new InternalServerErrorException(
        'Email sender is not configured. Set BREVO_SENDER_EMAIL or SMTP_FROM.',
      );
    }
    return { email, name };
  }

  private parseRecipients(to: string): Array<{ email: string }> {
    const emails = to
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => entry.replace(/^"[^"]*"\s*<([^>]+)>$/, '$1').trim());
    if (!emails.length) {
      throw new InternalServerErrorException('No recipient email provided.');
    }
    return emails.map((email) => ({ email }));
  }

  private getAdminNotificationEmails(): string[] {
    const raw = this.config.get<string>('ADMIN_NOTIFICATION_EMAILS') || '';
    return raw.split(',').map(e => e.trim()).filter(Boolean);
  }

  private escapeHtml(value: string): string {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
