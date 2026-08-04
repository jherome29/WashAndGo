import { EmailService } from './email.service';
import { ConfigService } from '@nestjs/config';

function makeConfig(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = {
    BREVO_API_KEY: 'test-key',
    BREVO_SENDER_EMAIL: 'noreply@washandgo.test',
    ADMIN_NOTIFICATION_EMAILS: 'admin@washandgo.test',
    ...overrides,
  };
  return { get: jest.fn((key: string) => values[key]) } as unknown as ConfigService;
}

function lastRequestBody(fetchMock: jest.Mock): { subject: string; htmlContent: string; textContent: string } {
  const [, options] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
  return JSON.parse(options.body);
}

describe('EmailService.sendPaymentResubmittedAdminEmail', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ messageId: 'msg-1' }) });
    (global as any).fetch = fetchMock;
  });

  const params = {
    customerName: 'Juan Dela Cruz',
    bookingId: 'BK-000001',
    serviceName: 'Premium Wash',
    date: '2026-08-01',
    timeSlot: '10:00 AM',
  };

  it('sends nothing when no admin notification emails are configured', async () => {
    const service = new EmailService(makeConfig({ ADMIN_NOTIFICATION_EMAILS: '' }));
    await service.sendPaymentResubmittedAdminEmail(params);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('emails admins with a resubmission-specific subject and message when configured', async () => {
    const service = new EmailService(makeConfig());
    await service.sendPaymentResubmittedAdminEmail(params);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = lastRequestBody(fetchMock);
    expect(body.subject).toContain('Payment Proof Resubmitted');
    expect(body.subject).toContain('BK-000001');
    expect(body.htmlContent).toContain('resubmitted payment proof');
    expect(body.htmlContent).not.toContain('New Booking');
  });
});

describe('EmailService.sendBookingStatusEmail', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ messageId: 'msg-1' }) });
    (global as any).fetch = fetchMock;
  });

  const baseParams = {
    to: 'customer@example.com',
    customerName: 'Juan Dela Cruz',
    bookingId: 'BK-000001',
    serviceName: 'Premium Wash',
    date: '2026-08-01',
    timeSlot: '10:00 AM',
  };

  it('includes step-by-step reupload instructions when the status is REUPLOAD_REQUIRED', async () => {
    const service = new EmailService(makeConfig());
    await service.sendBookingStatusEmail({ ...baseParams, status: 'REUPLOAD_REQUIRED' });

    const body = lastRequestBody(fetchMock);
    expect(body.htmlContent).toContain('How to reupload your payment proof');
    expect(body.htmlContent).toContain('BK-000001');
    expect(body.textContent).toContain('To reupload');
  });

  it('omits reupload instructions for a status that does not need them', async () => {
    const service = new EmailService(makeConfig());
    await service.sendBookingStatusEmail({ ...baseParams, status: 'CONFIRMED' });

    const body = lastRequestBody(fetchMock);
    expect(body.htmlContent).not.toContain('How to reupload your payment proof');
    expect(body.textContent).not.toContain('To reupload');
  });
});
