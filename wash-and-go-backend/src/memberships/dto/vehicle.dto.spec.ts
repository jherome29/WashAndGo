import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { VehicleDto } from './vehicle.dto';

describe('VehicleDto', () => {
  it('normalizes a messily-typed plate number during transform', () => {
    const dto = plainToInstance(VehicleDto, { plateNumber: ' asd-1234 ' });
    expect(dto.plateNumber).toBe('ASD1234');
  });

  it('rejects a plate number that is only whitespace/punctuation after normalization', async () => {
    const dto = plainToInstance(VehicleDto, { plateNumber: '   - ' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a plate number longer than 10 characters after normalization', async () => {
    const dto = plainToInstance(VehicleDto, { plateNumber: 'A'.repeat(11) });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('accepts a normal plate number', async () => {
    const dto = plainToInstance(VehicleDto, { plateNumber: 'abc1234' });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
    expect(dto.plateNumber).toBe('ABC1234');
  });
});
