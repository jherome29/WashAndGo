import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

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
    },
    from: vi.fn(),
  },
}));
