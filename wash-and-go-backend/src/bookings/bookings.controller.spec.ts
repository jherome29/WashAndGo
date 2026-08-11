import { BookingsController } from './bookings.controller';

describe('BookingsController.addUpdate', () => {
  function makeController() {
    const bookingsService = { addUpdate: jest.fn().mockResolvedValue({ id: 'u1' }) };
    const controller = new BookingsController(bookingsService as any);
    return { controller, bookingsService };
  }

  it('delegates to BookingsService.addUpdate with the optional status from a combined status + note action', () => {
    const { controller, bookingsService } = makeController();

    controller.addUpdate('bk-1001', { message: 'Confirmed:', imageUrls: ['a.png'], status: 'CONFIRMED' } as any, { id: 'admin-1' });

    expect(bookingsService.addUpdate).toHaveBeenCalledWith('bk-1001', 'Confirmed:', ['a.png'], 'admin-1', 'CONFIRMED');
  });

  it('defaults imageUrls to an empty array and status to undefined for a plain note', () => {
    const { controller, bookingsService } = makeController();

    controller.addUpdate('bk-1001', { message: 'Just a note' } as any, { id: 'admin-1' });

    expect(bookingsService.addUpdate).toHaveBeenCalledWith('bk-1001', 'Just a note', [], 'admin-1', undefined);
  });
});
