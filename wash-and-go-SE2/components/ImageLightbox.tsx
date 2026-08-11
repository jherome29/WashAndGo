import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export interface ImageLightboxProps {
  src: string;
  alt: string;
  onClose: () => void;
}

export default function ImageLightbox({ src, alt, onClose }: Readonly<ImageLightboxProps>) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Native <dialog> only gets modal behavior (focus trap, top-layer stacking,
  // Escape-to-close) when opened imperatively via showModal() — the `open`
  // attribute alone renders it as a plain, non-modal block element.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-label={alt}
      onClose={onClose}
      onClick={e => { if (e.target === dialogRef.current) onClose(); }}
      onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
      className="fixed inset-0 z-[60] m-0 h-full max-h-none w-full max-w-none border-0 bg-black/80 p-4 flex items-center justify-center"
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
        className="w-auto h-auto object-contain rounded-2xl shadow-2xl bg-white p-3"
        style={{ maxWidth: 'min(92vw, 480px)', maxHeight: '85vh' }}
      />
      <p className="absolute bottom-6 left-0 right-0 text-center text-white/70 text-xs px-4">
        Tap and hold (or right-click) the image to save it
      </p>
    </dialog>
  );
}
