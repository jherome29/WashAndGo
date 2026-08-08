import React from 'react';
import { X } from 'lucide-react';

export interface ImageLightboxProps {
  src: string;
  alt: string;
  onClose: () => void;
}

export default function ImageLightbox({ src, alt, onClose }: Readonly<ImageLightboxProps>) {
  return (
    <div
      className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={alt}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute top-4 right-4 text-white bg-white/10 hover:bg-white/20 rounded-full p-2 transition-colors"
      >
        <X className="w-6 h-6" />
      </button>
      <img
        src={src}
        alt={alt}
        onClick={e => e.stopPropagation()}
        className="w-auto h-auto object-contain rounded-2xl shadow-2xl bg-white p-3"
        style={{ maxWidth: 'min(92vw, 480px)', maxHeight: '85vh' }}
      />
      <p className="absolute bottom-6 left-0 right-0 text-center text-white/70 text-xs px-4">
        Tap and hold (or right-click) the image to save it
      </p>
    </div>
  );
}
