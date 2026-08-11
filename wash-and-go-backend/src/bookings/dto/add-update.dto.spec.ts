import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AddUpdateDto } from './add-update.dto';
import { BookingStatus } from './update-status.dto';

describe('AddUpdateDto', () => {
  it('accepts a plain note with no status', async () => {
    const dto = plainToInstance(AddUpdateDto, { message: 'Customer called to ask about pickup time' });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
    expect(dto.status).toBeUndefined();
  });

  it('accepts a combined status + note action', async () => {
    const dto = plainToInstance(AddUpdateDto, { message: 'Confirmed:', status: BookingStatus.CONFIRMED });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
    expect(dto.status).toBe(BookingStatus.CONFIRMED);
  });

  it('rejects a status value outside the BookingStatus enum', async () => {
    const dto = plainToInstance(AddUpdateDto, { message: 'Confirmed:', status: 'NOT_A_REAL_STATUS' });
    const errors = await validate(dto);
    expect(errors.some(e => e.property === 'status')).toBe(true);
  });

  it('rejects a missing message', async () => {
    const dto = plainToInstance(AddUpdateDto, { status: BookingStatus.CONFIRMED });
    const errors = await validate(dto);
    expect(errors.some(e => e.property === 'message')).toBe(true);
  });
});
