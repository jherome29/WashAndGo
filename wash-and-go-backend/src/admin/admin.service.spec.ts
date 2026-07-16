import { AdminService } from './admin.service';
import { BadRequestException } from '@nestjs/common';

/**
 * Builds a chainable Supabase query-builder mock. Every fluent method returns
 * the chain; terminal methods (single/maybeSingle) resolve to `result`.
 */
function mockChain(result: { data: any; error?: any }) {
  const chain: any = {};
  for (const m of ['select', 'eq', 'limit', 'update', 'insert', 'upsert', 'delete', 'order', 'gte', 'lte', 'in']) {
    chain[m] = jest.fn().mockReturnValue(chain);
  }
  chain.single = jest.fn().mockResolvedValue(result);
  chain.maybeSingle = jest.fn().mockResolvedValue(result);
  return chain;
}

function buildService(tables: Record<string, any>) {
  const from = jest.fn((table: string) => tables[table] ?? mockChain({ data: null }));
  const supabase = { getAdminClient: jest.fn().mockReturnValue({ from }) } as any;
  const auditLog = { log: jest.fn().mockResolvedValue(undefined) } as any;
  return { service: new AdminService(supabase, auditLog), auditLog, from };
}

const adminProfile = () => mockChain({ data: { role: 'admin' } });

describe('AdminService.updateScheduleSettings', () => {
  it('rejects closing time earlier than opening time', async () => {
    const { service } = buildService({
      profiles: adminProfile(),
      branch_schedules: mockChain({ data: { id: 'default', open_time: '08:00', close_time: '17:00' } }),
    });
    await expect(
      service.updateScheduleSettings({ closeTime: '07:00' } as any, 'admin-1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects closing time equal to opening time', async () => {
    const { service } = buildService({
      profiles: adminProfile(),
      branch_schedules: mockChain({ data: { id: 'default', open_time: '08:00', close_time: '17:00' } }),
    });
    await expect(
      service.updateScheduleSettings({ openTime: '09:00', closeTime: '09:00' } as any, 'admin-1'),
    ).rejects.toThrow('Closing time must be later than opening time');
  });

  it('persists closedDays and audit-logs UPDATE_SCHEDULE', async () => {
    const scheduleChain = mockChain({ data: { id: 'default', open_time: '08:00', close_time: '17:00' } });
    const { service, auditLog } = buildService({
      profiles: adminProfile(),
      branch_schedules: scheduleChain,
    });
    await service.updateScheduleSettings({ closedDays: [0, 6] } as any, 'admin-1');
    expect(scheduleChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ closed_days: [0, 6] }),
    );
    expect(auditLog.log).toHaveBeenCalledWith(
      'admin-1', 'UPDATE_SCHEDULE', 'default',
      expect.objectContaining({ updatedFields: ['closed_days'] }),
    );
  });

  it('rejects closing all seven weekdays', async () => {
    const { service } = buildService({
      profiles: adminProfile(),
      branch_schedules: mockChain({ data: { id: 'default', open_time: '08:00', close_time: '17:00' } }),
    });
    await expect(
      service.updateScheduleSettings({ closedDays: [0, 1, 2, 3, 4, 5, 6] } as any, 'admin-1'),
    ).rejects.toThrow('Cannot close every day of the week');
  });

  it('allows clearing closedDays with an empty array', async () => {
    const scheduleChain = mockChain({ data: { id: 'default', open_time: '08:00', close_time: '17:00' } });
    const { service } = buildService({ profiles: adminProfile(), branch_schedules: scheduleChain });
    await service.updateScheduleSettings({ closedDays: [] } as any, 'admin-1');
    expect(scheduleChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ closed_days: [] }),
    );
  });
});

describe('AdminService.upsertScheduleOverride', () => {
  it('rejects custom close earlier than or equal to custom open', async () => {
    const { service } = buildService({
      profiles: adminProfile(),
      schedule_overrides: mockChain({ data: null }),
    });
    await expect(
      service.upsertScheduleOverride(
        { overrideDate: '2026-12-24', isClosed: false, customOpen: '12:00', customClose: '08:00' } as any,
        'admin-1',
      ),
    ).rejects.toThrow('End time must be later than start time');
  });

  it('strips HTML from the label and audit-logs ADD_SCHEDULE_OVERRIDE', async () => {
    const overrideChain = mockChain({ data: { override_date: '2026-12-25' } });
    const { service, auditLog } = buildService({
      profiles: adminProfile(),
      schedule_overrides: overrideChain,
    });
    await service.upsertScheduleOverride(
      { overrideDate: '2026-12-25', isClosed: true, label: '<b>Christmas</b>' } as any,
      'admin-1',
    );
    expect(overrideChain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'Christmas', is_closed: true }),
      expect.anything(),
    );
    expect(auditLog.log).toHaveBeenCalledWith(
      'admin-1', 'ADD_SCHEDULE_OVERRIDE', '2026-12-25', expect.anything(),
    );
  });
});

describe('AdminService.deleteScheduleOverride', () => {
  it('audit-logs DELETE_SCHEDULE_OVERRIDE', async () => {
    const overrideChain = mockChain({ data: null });
    // delete().eq() resolves the chain itself — make eq resolve a result
    overrideChain.eq = jest.fn().mockResolvedValue({ error: null });
    const { service, auditLog } = buildService({
      profiles: adminProfile(),
      schedule_overrides: overrideChain,
    });
    await service.deleteScheduleOverride('2026-12-25', 'admin-1');
    expect(auditLog.log).toHaveBeenCalledWith(
      'admin-1', 'DELETE_SCHEDULE_OVERRIDE', '2026-12-25', expect.anything(),
    );
  });
});
