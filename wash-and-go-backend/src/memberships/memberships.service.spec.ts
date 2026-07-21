import { MembershipsService } from './memberships.service';
import { ForbiddenException } from '@nestjs/common';

const mockEmailService = {
  sendMembershipIssuedEmail: jest.fn(),
  sendMembershipRenewedEmail: jest.fn(),
  sendFreeWashEarnedEmail: jest.fn(),
  sendMembershipExpiringSoonEmail: jest.fn(),
  sendMembershipExpiredEmail: jest.fn(),
};

afterEach(() => {
  jest.clearAllMocks();
});

function makePlateSupabase(membershipRow: any | null) {
  const chain: any = {};
  ['select', 'eq', 'gte'].forEach(m => { chain[m] = jest.fn().mockReturnValue(chain); });
  chain.maybeSingle = jest.fn().mockResolvedValue({ data: membershipRow ? { memberships: membershipRow } : null });
  return { getAdminClient: jest.fn().mockReturnValue({ from: jest.fn().mockReturnValue(chain) }) };
}

function makeService(membershipRow: any | null) {
  const supabase = makePlateSupabase(membershipRow);
  const auditLog = { log: jest.fn() };
  return new MembershipsService(supabase as any, auditLog as any, mockEmailService as any);
}

describe('MembershipsService.computeDiscount', () => {
  const carWash = { category: 'GROOMING', membership_discount_pct: 50 };
  const lube = { category: 'LUBE', membership_discount_pct: 10 };

  it('returns no discount when no plate number is given', async () => {
    const svc = makeService(null);
    const result = await svc.computeDiscount(undefined, carWash, 1000);
    expect(result).toEqual({ totalPrice: 1000, membershipId: null, discountType: null });
  });

  it('returns no discount when the plate matches no active membership', async () => {
    const svc = makeService(null);
    const result = await svc.computeDiscount('ABC-123', carWash, 1000);
    expect(result).toEqual({ totalPrice: 1000, membershipId: null, discountType: null });
  });

  it('FREE_WASH takes top priority when a credit is available (car wash)', async () => {
    const svc = makeService({ id: 'm1', free_wash_credits: 1, first_wash_used: true });
    const result = await svc.computeDiscount('ABC-123', carWash, 1000);
    expect(result).toEqual({ totalPrice: 0, membershipId: 'm1', discountType: 'FREE_WASH' });
  });

  it('FIRST_WASH applies when no credit but first wash unused (car wash)', async () => {
    const svc = makeService({ id: 'm1', free_wash_credits: 0, first_wash_used: false });
    const result = await svc.computeDiscount('ABC-123', carWash, 1000);
    expect(result).toEqual({ totalPrice: 500, membershipId: 'm1', discountType: 'FIRST_WASH' });
  });

  it('FREE_WASH still wins over an unused first wash', async () => {
    const svc = makeService({ id: 'm1', free_wash_credits: 2, first_wash_used: false });
    const result = await svc.computeDiscount('ABC-123', carWash, 1000);
    expect(result).toEqual({ totalPrice: 0, membershipId: 'm1', discountType: 'FREE_WASH' });
  });

  it('CATEGORY_PERCENT applies when no credit and first wash already used (car wash, e.g. Antibac)', async () => {
    const svc = makeService({ id: 'm1', free_wash_credits: 0, first_wash_used: true });
    const result = await svc.computeDiscount('ABC-123', carWash, 1000);
    expect(result).toEqual({ totalPrice: 500, membershipId: 'm1', discountType: 'CATEGORY_PERCENT' });
  });

  it('applies no discount (but still reports the membership match) when the service carries no tag', async () => {
    const svc = makeService({ id: 'm1', free_wash_credits: 0, first_wash_used: true });
    const result = await svc.computeDiscount('ABC-123', { category: 'GROOMING', membership_discount_pct: null }, 1000);
    expect(result).toEqual({ totalPrice: 1000, membershipId: 'm1', discountType: null });
  });

  it('rounds CATEGORY_PERCENT discounts to the nearest peso', async () => {
    const svc = makeService({ id: 'm1', free_wash_credits: 0, first_wash_used: true });
    const result = await svc.computeDiscount('ABC-123', { category: 'GROOMING', membership_discount_pct: 10 }, 999);
    // 999 * 0.9 = 899.1 -> rounds to 899
    expect(result.totalPrice).toBe(899);
  });

  it('never applies FREE_WASH to a non-car-wash booking, even with a credit available', async () => {
    const svc = makeService({ id: 'm1', free_wash_credits: 5, first_wash_used: true });
    const result = await svc.computeDiscount('ABC-123', lube, 1000);
    // Falls through to CATEGORY_PERCENT (Oil Change 10%) instead — the free wash is reserved for car washes
    expect(result).toEqual({ totalPrice: 900, membershipId: 'm1', discountType: 'CATEGORY_PERCENT' });
  });

  it('never applies FIRST_WASH to a non-car-wash booking, even when unused', async () => {
    const svc = makeService({ id: 'm1', free_wash_credits: 0, first_wash_used: false });
    const result = await svc.computeDiscount('ABC-123', lube, 1000);
    expect(result).toEqual({ totalPrice: 900, membershipId: 'm1', discountType: 'CATEGORY_PERCENT' });
  });
});

describe('MembershipsService.onBookingCompleted', () => {
  function makeCompletionSupabase(membershipRow: any, serviceCategory: string) {
    const updateCalls: { table: string; payload: any }[] = [];
    const from = jest.fn((table: string) => {
      if (table === 'services') {
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { category: serviceCategory } }) }) }) };
      }
      if (table === 'memberships') {
        return {
          select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: membershipRow }) }) }),
          update: (payload: any) => {
            updateCalls.push({ table, payload });
            return { eq: () => Promise.resolve({ data: null, error: null }) };
          },
        };
      }
      if (table === 'bookings') {
        return {
          update: (payload: any) => {
            updateCalls.push({ table, payload });
            return { eq: () => Promise.resolve({ data: null, error: null }) };
          },
        };
      }
      throw new Error(`Unexpected table ${table}`);
    });
    return {
      supabase: {
        getAdminClient: jest.fn().mockReturnValue({
          from,
          auth: { admin: { getUserById: jest.fn().mockResolvedValue({ data: { user: { email: 'member@example.com' } } }) } },
        }),
      },
      updateCalls,
    };
  }

  const baseBooking = { id: 'BK-1', service_id: 'grooming-exterior' };

  it('does nothing when the booking has no membership attached', async () => {
    const { supabase, updateCalls } = makeCompletionSupabase({ visit_count: 0, free_wash_credits: 0, first_wash_used: false }, 'GROOMING');
    const auditLog = { log: jest.fn() };
    const svc = new MembershipsService(supabase as any, auditLog as any, mockEmailService as any);

    await svc.onBookingCompleted({ ...baseBooking, membership_id: null, membership_discount_type: null, membership_visit_counted: false }, 'admin-1');

    expect(updateCalls).toHaveLength(0);
    expect(auditLog.log).not.toHaveBeenCalled();
  });

  it('does nothing when the booking was already counted (idempotency guard)', async () => {
    const { supabase, updateCalls } = makeCompletionSupabase({ visit_count: 3, free_wash_credits: 0, first_wash_used: true }, 'GROOMING');
    const svc = new MembershipsService(supabase as any, { log: jest.fn() } as any, mockEmailService as any);

    await svc.onBookingCompleted({ ...baseBooking, membership_id: 'm1', membership_discount_type: null, membership_visit_counted: true }, 'admin-1');

    expect(updateCalls).toHaveLength(0);
  });

  it('increments visit_count by 1 on an ordinary completed car-wash visit', async () => {
    const { supabase, updateCalls } = makeCompletionSupabase({ visit_count: 3, free_wash_credits: 0, first_wash_used: true }, 'GROOMING');
    const svc = new MembershipsService(supabase as any, { log: jest.fn() } as any, mockEmailService as any);

    await svc.onBookingCompleted({ ...baseBooking, membership_id: 'm1', membership_discount_type: null, membership_visit_counted: false }, 'admin-1');

    expect(updateCalls[0]).toEqual({ table: 'memberships', payload: { visit_count: 4, free_wash_credits: 0, first_wash_used: true } });
    expect(updateCalls[1]).toEqual({ table: 'bookings', payload: { membership_visit_counted: true } });
    expect(mockEmailService.sendFreeWashEarnedEmail).not.toHaveBeenCalled();
  });

  it('grants a free-wash credit on exactly the 10th car-wash visit', async () => {
    const { supabase, updateCalls } = makeCompletionSupabase({ visit_count: 9, free_wash_credits: 0, first_wash_used: true }, 'GROOMING');
    const svc = new MembershipsService(supabase as any, { log: jest.fn() } as any, mockEmailService as any);

    await svc.onBookingCompleted({ ...baseBooking, membership_id: 'm1', membership_discount_type: null, membership_visit_counted: false }, 'admin-1');

    expect(updateCalls[0].payload).toEqual({ visit_count: 10, free_wash_credits: 1, first_wash_used: true });
  });

  it('sends the free-wash-earned email when a credit is granted on the 10th visit', async () => {
    const { supabase } = makeCompletionSupabase(
      { user_id: 'u1', member_name: 'Jane Newbie', membership_no: 'CWG-000001', visit_count: 9, free_wash_credits: 0, first_wash_used: true },
      'GROOMING',
    );
    const svc = new MembershipsService(supabase as any, { log: jest.fn() } as any, mockEmailService as any);

    await svc.onBookingCompleted({ ...baseBooking, membership_id: 'm1', membership_discount_type: null, membership_visit_counted: false }, 'admin-1');
    await new Promise(resolve => setImmediate(resolve)); // flush the fire-and-forget notify call

    expect(mockEmailService.sendFreeWashEarnedEmail).toHaveBeenCalledWith({
      to: 'member@example.com',
      memberName: 'Jane Newbie',
      membershipNo: 'CWG-000001',
      visitCount: 10,
    });
  });

  it('redeems (decrements) a free-wash credit when the completed booking used FREE_WASH', async () => {
    const { supabase, updateCalls } = makeCompletionSupabase({ visit_count: 10, free_wash_credits: 1, first_wash_used: true }, 'GROOMING');
    const svc = new MembershipsService(supabase as any, { log: jest.fn() } as any, mockEmailService as any);

    await svc.onBookingCompleted({ ...baseBooking, membership_id: 'm1', membership_discount_type: 'FREE_WASH', membership_visit_counted: false }, 'admin-1');

    // visit 11 does not itself earn a new credit, and the one it redeemed is spent
    expect(updateCalls[0].payload).toEqual({ visit_count: 11, free_wash_credits: 0, first_wash_used: true });
  });

  it('never lets free_wash_credits go negative', async () => {
    const { supabase, updateCalls } = makeCompletionSupabase({ visit_count: 1, free_wash_credits: 0, first_wash_used: true }, 'GROOMING');
    const svc = new MembershipsService(supabase as any, { log: jest.fn() } as any, mockEmailService as any);

    await svc.onBookingCompleted({ ...baseBooking, membership_id: 'm1', membership_discount_type: 'FREE_WASH', membership_visit_counted: false }, 'admin-1');

    expect(updateCalls[0].payload.free_wash_credits).toBe(0);
  });

  it('flips first_wash_used to true when the completed booking used FIRST_WASH', async () => {
    const { supabase, updateCalls } = makeCompletionSupabase({ visit_count: 0, free_wash_credits: 0, first_wash_used: false }, 'GROOMING');
    const svc = new MembershipsService(supabase as any, { log: jest.fn() } as any, mockEmailService as any);

    await svc.onBookingCompleted({ ...baseBooking, membership_id: 'm1', membership_discount_type: 'FIRST_WASH', membership_visit_counted: false }, 'admin-1');

    expect(updateCalls[0].payload).toEqual({ visit_count: 1, free_wash_credits: 0, first_wash_used: true });
  });

  it('does NOT move visit_count/credits for a completed Lube booking, but still marks it processed', async () => {
    const { supabase, updateCalls } = makeCompletionSupabase({ visit_count: 5, free_wash_credits: 0, first_wash_used: true }, 'LUBE');
    const svc = new MembershipsService(supabase as any, { log: jest.fn() } as any, mockEmailService as any);

    await svc.onBookingCompleted({ id: 'BK-1', service_id: 'lube-express-gas', membership_id: 'm1', membership_discount_type: 'CATEGORY_PERCENT', membership_visit_counted: false }, 'admin-1');

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]).toEqual({ table: 'bookings', payload: { membership_visit_counted: true } });
  });

  it('does NOT move visit_count/credits for a completed Ceramic Coating booking', async () => {
    const { supabase, updateCalls } = makeCompletionSupabase({ visit_count: 5, free_wash_credits: 0, first_wash_used: true }, 'COATING');
    const svc = new MembershipsService(supabase as any, { log: jest.fn() } as any, mockEmailService as any);

    await svc.onBookingCompleted({ id: 'BK-1', service_id: 'ceramic-1yr-vehicle', membership_id: 'm1', membership_discount_type: null, membership_visit_counted: false }, 'admin-1');

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]).toEqual({ table: 'bookings', payload: { membership_visit_counted: true } });
  });
});

describe('MembershipsService admin guard', () => {
  it('rejects with ForbiddenException when no userId is provided', async () => {
    const supabase = { getAdminClient: jest.fn() };
    const svc = new MembershipsService(supabase as any, { log: jest.fn() } as any, mockEmailService as any);
    await expect((svc as any).requireAdmin(undefined)).rejects.toThrow(ForbiddenException);
  });

  it('rejects with ForbiddenException when the profile role is not admin', async () => {
    const chain: any = {};
    chain.select = jest.fn().mockReturnValue(chain);
    chain.eq = jest.fn().mockReturnValue(chain);
    chain.single = jest.fn().mockResolvedValue({ data: { role: 'customer' } });
    const supabase = { getAdminClient: jest.fn().mockReturnValue({ from: jest.fn().mockReturnValue(chain) }) };
    const svc = new MembershipsService(supabase as any, { log: jest.fn() } as any, mockEmailService as any);
    await expect((svc as any).requireAdmin('user-1')).rejects.toThrow(ForbiddenException);
  });
});

describe('MembershipsService.searchCustomers', () => {
  function makeSearchSupabase(opts: { profileMatches: any[]; authUsers: any[]; extraProfiles?: any[] }) {
    const chain: any = {};
    chain.select = jest.fn().mockReturnValue(chain);
    // requireAdmin's shape: select('role').eq('id', userId).single()
    chain.single = jest.fn().mockResolvedValue({ data: { role: 'admin' } });
    // searchCustomers' shapes: select(...).eq('role','customer').or(...) / select(...).in(...)
    chain.eq = jest.fn().mockReturnValue(chain);
    chain.or = jest.fn().mockResolvedValue({ data: opts.profileMatches, error: null });
    chain.in = jest.fn().mockResolvedValue({ data: opts.extraProfiles || [] });

    const from = jest.fn((table: string) => {
      if (table !== 'profiles') throw new Error(`Unexpected table ${table}`);
      return chain;
    });
    return {
      chain,
      supabase: {
        getAdminClient: jest.fn().mockReturnValue({
          from,
          auth: { admin: { listUsers: jest.fn().mockResolvedValue({ data: { users: opts.authUsers } }) } },
        }),
      },
    };
  }

  it('finds a brand-new account (zero bookings) by name', async () => {
    const { supabase } = makeSearchSupabase({
      profileMatches: [{ id: 'u1', full_name: 'Jane Newbie', phone: '09171112222' }],
      authUsers: [{ id: 'u1', email: 'jane@example.com' }],
    });
    const svc = new MembershipsService(supabase as any, { log: jest.fn() } as any, mockEmailService as any);

    const result = await svc.searchCustomers('Jane', 'admin-1');

    expect(result).toEqual([{ userId: 'u1', name: 'Jane Newbie', phone: '09171112222', email: 'jane@example.com' }]);
  });

  it('excludes admin accounts from the name/phone query itself', async () => {
    const { supabase, chain } = makeSearchSupabase({
      profileMatches: [{ id: 'u1', full_name: 'Jane Newbie', phone: '09171112222' }],
      authUsers: [{ id: 'u1', email: 'jane@example.com' }],
    });
    const svc = new MembershipsService(supabase as any, { log: jest.fn() } as any, mockEmailService as any);

    await svc.searchCustomers('Jane', 'admin-1');

    expect(chain.eq).toHaveBeenCalledWith('role', 'customer');
  });

  it('finds an account by email even when name/phone do not match the query', async () => {
    const { supabase } = makeSearchSupabase({
      profileMatches: [],
      authUsers: [{ id: 'u2', email: 'weirdmatch@example.com' }, { id: 'u3', email: 'other@example.com' }],
      extraProfiles: [{ id: 'u2', full_name: 'Bob Somebody', phone: '09170000000', role: 'customer' }],
    });
    const svc = new MembershipsService(supabase as any, { log: jest.fn() } as any, mockEmailService as any);

    const result = await svc.searchCustomers('weirdmatch', 'admin-1');

    expect(result).toEqual([{ userId: 'u2', name: 'Bob Somebody', phone: '09170000000', email: 'weirdmatch@example.com' }]);
  });

  it('excludes an admin account found only via email match', async () => {
    const { supabase } = makeSearchSupabase({
      profileMatches: [],
      authUsers: [{ id: 'u9', email: 'boss@example.com' }],
      extraProfiles: [{ id: 'u9', full_name: 'The Boss', phone: '09170000001', role: 'admin' }],
    });
    const svc = new MembershipsService(supabase as any, { log: jest.fn() } as any, mockEmailService as any);

    const result = await svc.searchCustomers('boss', 'admin-1');

    expect(result).toEqual([]);
  });

  it('returns an empty array for a blank query', async () => {
    const { supabase } = makeSearchSupabase({ profileMatches: [], authUsers: [] });
    const svc = new MembershipsService(supabase as any, { log: jest.fn() } as any, mockEmailService as any);

    const result = await svc.searchCustomers('   ', 'admin-1');

    expect(result).toEqual([]);
  });
});

describe('MembershipsService.issue', () => {
  function makeIssueSupabase(membershipRow: any, vehicleRows: any[]) {
    const from = jest.fn((table: string) => {
      if (table === 'profiles') {
        return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { role: 'admin' } }) }) }) };
      }
      if (table === 'memberships') {
        return {
          select: (_cols: string, opts?: any) => {
            if (opts) return Promise.resolve({ count: 0 }); // generateMembershipNo's count query
            throw new Error('Unexpected memberships.select() call in this test');
          },
          insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: membershipRow, error: null }) }) }),
        };
      }
      if (table === 'membership_vehicles') {
        return { insert: () => ({ select: () => Promise.resolve({ data: vehicleRows, error: null }) }) };
      }
      throw new Error(`Unexpected table ${table}`);
    });
    return {
      getAdminClient: jest.fn().mockReturnValue({
        from,
        auth: { admin: { getUserById: jest.fn().mockResolvedValue({ data: { user: { email: 'member@example.com' } } }) } },
      }),
    };
  }

  it('sends the membership-issued email after successfully issuing', async () => {
    const membershipRow = {
      id: 'm1', user_id: 'u1', member_name: 'Jane Newbie', membership_no: 'CWG-000001',
      purchase_date: '2026-01-01', expires_at: '2027-01-01', status: 'ACTIVE',
      visit_count: 0, first_wash_used: false, free_wash_credits: 0, created_at: '2026-01-01T00:00:00Z',
    };
    const vehicleRows = [{ id: 'v1', membership_id: 'm1', plate_number: 'ABC-123', vehicle_label: null }];
    const supabase = makeIssueSupabase(membershipRow, vehicleRows);
    const svc = new MembershipsService(supabase as any, { log: jest.fn() } as any, mockEmailService as any);

    await svc.issue({ memberName: 'Jane Newbie', userId: 'u1', vehicles: [{ plateNumber: 'ABC-123' }] } as any, 'admin-1');
    await new Promise(resolve => setImmediate(resolve));

    expect(mockEmailService.sendMembershipIssuedEmail).toHaveBeenCalledWith({
      to: 'member@example.com',
      memberName: 'Jane Newbie',
      membershipNo: 'CWG-000001',
      vehicles: [{ plateNumber: 'ABC-123', vehicleLabel: null }],
      expiresAt: '2027-01-01',
    });
  });
});

describe('MembershipsService.renew', () => {
  function makeRenewSupabase(existingRow: any, updatedRow: any) {
    const from = jest.fn((table: string) => {
      if (table === 'profiles') {
        return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { role: 'admin' } }) }) }) };
      }
      if (table === 'memberships') {
        return {
          select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: existingRow }) }) }),
          update: () => ({ eq: () => ({ select: () => ({ single: () => Promise.resolve({ data: updatedRow, error: null }) }) }) }),
        };
      }
      if (table === 'membership_vehicles') {
        return { select: () => ({ eq: () => Promise.resolve({ data: [] }) }) };
      }
      throw new Error(`Unexpected table ${table}`);
    });
    return {
      getAdminClient: jest.fn().mockReturnValue({
        from,
        auth: { admin: { getUserById: jest.fn().mockResolvedValue({ data: { user: { email: 'member@example.com' } } }) } },
      }),
    };
  }

  it('sends the membership-renewed email after renewing', async () => {
    const existingRow = { id: 'm1', user_id: 'u1', member_name: 'Jane Newbie', membership_no: 'CWG-000001', status: 'ACTIVE', expires_at: '2026-06-01' };
    const updatedRow = { ...existingRow, expires_at: '2027-06-01' };
    const supabase = makeRenewSupabase(existingRow, updatedRow);
    const svc = new MembershipsService(supabase as any, { log: jest.fn() } as any, mockEmailService as any);

    await svc.renew('m1', 'admin-1');
    await new Promise(resolve => setImmediate(resolve));

    expect(mockEmailService.sendMembershipRenewedEmail).toHaveBeenCalledWith({
      to: 'member@example.com',
      memberName: 'Jane Newbie',
      membershipNo: 'CWG-000001',
      newExpiresAt: '2027-06-01',
    });
  });
});

describe('MembershipsService.processMembershipExpiries', () => {
  function makeExpirySupabase(opts: { lapsedRows: any[]; expiringSoonRows: any[] }) {
    const updateCalls: { payload: any; id: string }[] = [];
    const chain: any = {};
    chain.eq = jest.fn().mockReturnValue(chain);
    chain.gte = jest.fn().mockReturnValue(chain);
    chain.lte = jest.fn().mockReturnValue(chain);
    chain.lt = jest.fn().mockResolvedValue({ data: opts.lapsedRows });
    chain.is = jest.fn().mockResolvedValue({ data: opts.expiringSoonRows });

    const from = jest.fn((table: string) => {
      if (table !== 'memberships') throw new Error(`Unexpected table ${table}`);
      return {
        select: () => chain,
        update: (payload: any) => ({
          eq: (_col: string, id: string) => {
            updateCalls.push({ payload, id });
            return Promise.resolve({ data: null, error: null });
          },
        }),
      };
    });
    return {
      supabase: {
        getAdminClient: jest.fn().mockReturnValue({
          from,
          auth: { admin: { getUserById: jest.fn().mockResolvedValue({ data: { user: { email: 'member@example.com' } } }) } },
        }),
      },
      updateCalls,
    };
  }

  it('flips a lapsed ACTIVE membership to EXPIRED and sends the expired email', async () => {
    const { supabase, updateCalls } = makeExpirySupabase({
      lapsedRows: [{ id: 'm1', user_id: 'u1', member_name: 'Jane Newbie', membership_no: 'CWG-000001', expires_at: '2026-01-01' }],
      expiringSoonRows: [],
    });
    const svc = new MembershipsService(supabase as any, { log: jest.fn() } as any, mockEmailService as any);

    await svc.processMembershipExpiries();
    await new Promise(resolve => setImmediate(resolve)); // flush the fire-and-forget notify call

    expect(updateCalls).toEqual([{ payload: { status: 'EXPIRED' }, id: 'm1' }]);
    expect(mockEmailService.sendMembershipExpiredEmail).toHaveBeenCalledWith({
      to: 'member@example.com',
      memberName: 'Jane Newbie',
      membershipNo: 'CWG-000001',
      expiredOn: '2026-01-01',
    });
  });

  it('sends the expiring-soon email and stamps the reminder timestamp', async () => {
    const { supabase, updateCalls } = makeExpirySupabase({
      lapsedRows: [],
      expiringSoonRows: [{ id: 'm2', user_id: 'u2', member_name: 'Bob Somebody', membership_no: 'CWG-000002', expires_at: '2026-08-01' }],
    });
    const svc = new MembershipsService(supabase as any, { log: jest.fn() } as any, mockEmailService as any);

    await svc.processMembershipExpiries();
    await new Promise(resolve => setImmediate(resolve)); // flush the fire-and-forget notify call

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].id).toBe('m2');
    expect(updateCalls[0].payload).toHaveProperty('expiring_reminder_sent_at');
    expect(mockEmailService.sendMembershipExpiringSoonEmail).toHaveBeenCalledWith({
      to: 'member@example.com',
      memberName: 'Bob Somebody',
      membershipNo: 'CWG-000002',
      expiresAt: '2026-08-01',
    });
  });

  it('does nothing when no memberships are lapsed or within the reminder window', async () => {
    const { supabase, updateCalls } = makeExpirySupabase({ lapsedRows: [], expiringSoonRows: [] });
    const svc = new MembershipsService(supabase as any, { log: jest.fn() } as any, mockEmailService as any);

    await svc.processMembershipExpiries();

    expect(updateCalls).toHaveLength(0);
    expect(mockEmailService.sendMembershipExpiredEmail).not.toHaveBeenCalled();
    expect(mockEmailService.sendMembershipExpiringSoonEmail).not.toHaveBeenCalled();
  });

  it('does not throw when the sweep query fails — just logs a warning', async () => {
    const supabase = {
      getAdminClient: jest.fn().mockReturnValue({
        from: jest.fn(() => { throw new Error('DB unreachable'); }),
      }),
    };
    const svc = new MembershipsService(supabase as any, { log: jest.fn() } as any, mockEmailService as any);

    await expect(svc.processMembershipExpiries()).resolves.toBeUndefined();
  });
});

describe('MembershipsService.renew resets the expiry reminder flag', () => {
  it('includes expiring_reminder_sent_at: null in the renewal update payload', async () => {
    // A future date, so renew() treats it as "not yet lapsed" and bases the new expiry off it
    // rather than off today — keeps this test's outcome independent of when it happens to run.
    const notYetLapsedExpiry = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const existingRow = { id: 'm1', user_id: 'u1', member_name: 'Jane Newbie', membership_no: 'CWG-000001', status: 'ACTIVE', expires_at: notYetLapsedExpiry };
    const updatedRow = { ...existingRow };
    let capturedPayload: any = null;

    const chain: any = {};
    chain.select = jest.fn().mockReturnValue(chain);
    chain.eq = jest.fn().mockReturnValue(chain);
    chain.single = jest.fn().mockResolvedValue({ data: existingRow });

    const from = jest.fn((table: string) => {
      if (table === 'profiles') {
        return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { role: 'admin' } }) }) }) };
      }
      if (table === 'memberships') {
        return {
          select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: existingRow }) }) }),
          update: (payload: any) => {
            capturedPayload = payload;
            return { eq: () => ({ select: () => ({ single: () => Promise.resolve({ data: updatedRow, error: null }) }) }) };
          },
        };
      }
      if (table === 'membership_vehicles') {
        return { select: () => ({ eq: () => Promise.resolve({ data: [] }) }) };
      }
      throw new Error(`Unexpected table ${table}`);
    });
    const supabase = {
      getAdminClient: jest.fn().mockReturnValue({
        from,
        auth: { admin: { getUserById: jest.fn().mockResolvedValue({ data: { user: { email: 'member@example.com' } } }) } },
      }),
    };
    const svc = new MembershipsService(supabase as any, { log: jest.fn() } as any, mockEmailService as any);

    await svc.renew('m1', 'admin-1');

    expect(capturedPayload).toMatchObject({ status: 'ACTIVE', expiring_reminder_sent_at: null });
    expect(typeof capturedPayload.expires_at).toBe('string');
  });
});
