import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Chainable stand-in for Supabase's PostgREST query builder (.from().select().eq()...)
// and Storage API (.storage.from().upload()/getPublicUrl()). Every method returns the
// same chain object so any call sequence works, and the chain resolves to `result`
// when awaited (a real query builder is a thenable, not a Promise).
function makeChainable(result: { data: any; error: any } = { data: null, error: null }) {
  const chain: any = {
    select: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    upsert: vi.fn(() => chain),
    delete: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    single: vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result),
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  };
  return chain;
}

// Component/unit tests render presentational pieces with plain props and never
// need a real backend connection. lib/supabase.ts calls createClient() at
// module load time, which throws immediately if VITE_SUPABASE_URL isn't set --
// true in CI, where the frontend test job has no .env (only the gated E2E job
// writes one). Mocking here breaks that hard dependency for every test file
// that imports it (directly or via lib/api.ts), instead of requiring real
// credentials just to load a module under test.
vi.mock('./lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signInWithPassword: vi.fn().mockResolvedValue({ data: { user: { id: 'u1', email: 'test@example.com' } }, error: null }),
      updateUser: vi.fn().mockResolvedValue({ data: {}, error: null }),
      signInWithOAuth: vi.fn().mockResolvedValue({ data: {}, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
    from: vi.fn(() => makeChainable()),
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn().mockResolvedValue({ data: { path: 'mock-path' }, error: null }),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://example.com/mock.png' } }),
      })),
    },
  },
}));
