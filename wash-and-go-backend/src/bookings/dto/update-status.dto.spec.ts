import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateStatusDto, BookingStatus } from './update-status.dto';

describe('UpdateStatusDto', () => {
  it('accepts every known booking status', async () => {
    for (const status of Object.values(BookingStatus)) {
      const dto = plainToInstance(UpdateStatusDto, { status });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    }
  });

  it('rejects a status value outside the BookingStatus enum', async () => {
    const dto = plainToInstance(UpdateStatusDto, { status: 'NOT_A_REAL_STATUS' });
    const errors = await validate(dto);
    expect(errors.some(e => e.property === 'status')).toBe(true);
  });
});
