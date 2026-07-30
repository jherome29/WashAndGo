import { StorageService } from './storage.service';
import { BadRequestException } from '@nestjs/common';

describe('StorageService.createSignedUploadUrl', () => {
  function makeService() {
    const supabase = { getAdminClient: jest.fn() };
    return { svc: new StorageService(supabase as any), supabase };
  }

  it('rejects a non-string fileName (CodeQL js/type-confusion-through-parameter-tampering regression — repeated query key makes Express hand back an array)', async () => {
    const { svc } = makeService();
    await expect(svc.createSignedUploadUrl(['a.jpg', 'b.jpg'] as any)).rejects.toThrow(BadRequestException);
  });

  it('still accepts a normal string fileName', async () => {
    const { svc, supabase } = makeService();
    supabase.getAdminClient.mockReturnValue({
      storage: {
        from: () => ({
          createSignedUploadUrl: jest.fn().mockResolvedValue({ data: { signedUrl: 'https://x', path: 'proofs/1-a.jpg' }, error: null }),
        }),
      },
    });
    const result = await svc.createSignedUploadUrl('a.jpg');
    expect(result.signedUrl).toBe('https://x');
  });
});
