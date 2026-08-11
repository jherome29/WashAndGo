import { StorageService } from './storage.service';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

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

  it('rejects a disallowed extension', async () => {
    const { svc } = makeService();
    await expect(svc.createSignedUploadUrl('payload.svg')).rejects.toThrow(BadRequestException);
  });
});

describe('StorageService.createAssetUploadUrl', () => {
  function makeService(role = 'admin') {
    const createSignedUploadUrl = jest
      .fn()
      .mockResolvedValue({ data: { signedUrl: 'https://x' }, error: null });
    const supabase = {
      getAdminClient: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: { role } }),
            }),
          }),
        }),
        storage: { from: jest.fn().mockReturnValue({ createSignedUploadUrl }) },
      }),
    };
    return { svc: new StorageService(supabase as any), createSignedUploadUrl };
  }

  it('rejects a non-string fileName (repeated query key)', async () => {
    const { svc } = makeService();
    await expect(svc.createAssetUploadUrl(['a.png', 'b.png'] as any, 'admin-1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects a disallowed extension', async () => {
    const { svc, createSignedUploadUrl } = makeService();
    await expect(svc.createAssetUploadUrl('malware.svg', 'admin-1')).rejects.toThrow(BadRequestException);
    expect(createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it('rejects a MIME type that does not match the extension', async () => {
    const { svc } = makeService();
    await expect(
      svc.createAssetUploadUrl('qr.png', 'admin-1', undefined, 'image/webp'),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a file over the 5 MB limit', async () => {
    const { svc } = makeService();
    await expect(
      svc.createAssetUploadUrl('qr.png', 'admin-1', String(6 * 1024 * 1024)),
    ).rejects.toThrow(BadRequestException);
  });

  it('strips path traversal from the filename instead of building an escaping path', async () => {
    const { svc, createSignedUploadUrl } = makeService();
    const result = await svc.createAssetUploadUrl('../../etc/passwd.png', 'admin-1');
    const nameSegment = result.path.slice('qr/'.length);
    expect(result.path.startsWith('qr/')).toBe(true);
    expect(nameSegment).not.toContain('/');
    expect(nameSegment).not.toContain('\\');
    expect(nameSegment).not.toContain('..');
    expect(createSignedUploadUrl).toHaveBeenCalledWith(result.path);
  });

  it('accepts a valid png filename', async () => {
    const { svc, createSignedUploadUrl } = makeService();
    const result = await svc.createAssetUploadUrl('gcash qr.png', 'admin-1', '1024', 'image/png');
    expect(result.signedUrl).toBe('https://x');
    expect(result.path).toMatch(/^qr\/\d+-gcash_qr_png$/);
    expect(createSignedUploadUrl).toHaveBeenCalledWith(result.path);
  });

  it('accepts a valid jpg filename', async () => {
    const { svc } = makeService();
    const result = await svc.createAssetUploadUrl('qr.jpg', 'admin-1', '1024', 'image/jpeg');
    expect(result.signedUrl).toBe('https://x');
  });

  it('rejects a non-admin caller before touching the filename', async () => {
    const { svc, createSignedUploadUrl } = makeService('user');
    await expect(svc.createAssetUploadUrl('qr.png', 'user-1')).rejects.toThrow(ForbiddenException);
    expect(createSignedUploadUrl).not.toHaveBeenCalled();
  });
});
