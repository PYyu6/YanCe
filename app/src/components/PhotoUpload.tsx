/**
 * PhotoUpload.tsx — "Use an existing photo" path.
 *
 * DUAL-PURPOSE ON PRINCIPLE: this is a real product feature (climbers have
 * wall photos on their phone already; forcing live camera is friction) AND
 * the deterministic entry point for e2e tests — Playwright sets the file
 * input directly and never has to fake getUserMedia. One affordance, both
 * jobs; no test-only code paths in the app.
 *
 * Images are downscaled to ≤1600px on the long side at load time: phone
 * photos are 4000px+, and the full-res canvas only needs enough resolution
 * for blob detection + tap accuracy. 1600 keeps memory flat on mobile
 * (browser-memory NFR) while staying above the 1280 API cap so the API
 * downscale still has headroom.
 */

import { useRef } from 'react';

const UPLOAD_MAX_DIMENSION = 1600;

interface Props {
  onLoaded: (dataUrl: string, width: number, height: number) => void;
}

export default function PhotoUpload({ onLoaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, UPLOAD_MAX_DIMENSION / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
        // JPEG 0.92: photographic content; PNG would triple the data-URL size
        // held in the store for the whole session.
        onLoaded(canvas.toDataURL('image/jpeg', 0.92), w, h);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        data-testid="photo-upload-input"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        className="px-3 py-2 bg-black/50 backdrop-blur text-white/90 rounded-lg text-sm hover:bg-black/70 border border-white/20"
      >
        📁 Use existing photo
      </button>
    </div>
  );
}
