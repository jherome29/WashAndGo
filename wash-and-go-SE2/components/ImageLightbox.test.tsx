import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ImageLightbox from './ImageLightbox';

describe('ImageLightbox', () => {
  it('renders the image with the given src and alt', () => {
    render(<ImageLightbox src="https://example.com/qr.png" alt="GCash QR Code" onClose={vi.fn()} />);
    expect(screen.getByAltText('GCash QR Code')).toHaveAttribute('src', 'https://example.com/qr.png');
  });

  it('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn();
    render(<ImageLightbox src="https://example.com/qr.png" alt="GCash QR Code" onClose={onClose} />);
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(<ImageLightbox src="https://example.com/qr.png" alt="GCash QR Code" onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('does not call onClose when the image itself is clicked', () => {
    const onClose = vi.fn();
    render(<ImageLightbox src="https://example.com/qr.png" alt="GCash QR Code" onClose={onClose} />);
    fireEvent.click(screen.getByAltText('GCash QR Code'));
    expect(onClose).not.toHaveBeenCalled();
  });
});
