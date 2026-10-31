'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Modal } from './Dialog';
import { Button, cx } from './ui';
import { inputCls } from './forms';

/**
 * Scanner-first input. USB keyboard-wedge scanners type the code and press Enter, so a focused
 * text box covers them; the camera button opens a QR / barcode reader for phones and tablets.
 */
export function ScanBox({ onScan, label = 'Scan or type a code', placeholder = 'Package ID, QR or barcode', busy, autoFocus = true }: {
  onScan: (code: string) => unknown;
  label?: string;
  placeholder?: string;
  busy?: boolean;
  autoFocus?: boolean;
}) {
  const [value, setValue] = useState('');
  const [camera, setCamera] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const code = value.trim();
    if (!code) return;
    setValue('');
    onScan(code);
    input.current?.focus();
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <div className="flex-1">
        <label htmlFor="scan-input" className="block text-sm font-medium text-slate-700">{label}</label>
        <input
          id="scan-input"
          ref={input}
          autoFocus={autoFocus}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          inputMode="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className={cx(inputCls, 'mt-1 py-3 text-base font-mono')}
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="lg" loading={busy}>Open</Button>
        <Button variant="secondary" size="lg" onClick={() => setCamera(true)} aria-label="Scan with camera">📷 Camera</Button>
      </div>
      <CameraScanner
        open={camera}
        onClose={() => setCamera(false)}
        onDetected={(code) => { setCamera(false); onScan(code); }}
      />
    </form>
  );
}

type Detector = { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> };

export function CameraScanner({ open, onClose, onDetected }: {
  open: boolean; onClose: () => void; onDetected: (code: string) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  // Parents pass inline callbacks; keep the camera running across their re-renders.
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;

  useEffect(() => {
    if (!open) return;
    let stopped = false;
    let stream: MediaStream | null = null;
    let zxingControls: { stop: () => void } | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    setError(null);

    const done = (code: string) => {
      if (stopped) return;
      stopped = true;
      onDetectedRef.current(code);
    };

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Camera access needs HTTPS (or localhost) and a browser with camera support. Use a USB scanner or type the code.');
        return;
      }
      const Native = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
      try {
        if (Native) {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
          if (stopped || !video.current) return;
          video.current.srcObject = stream;
          await video.current.play();
          const detector = new Native({ formats: ['qr_code', 'code_128', 'code_39', 'ean_13'] });
          const tick = async () => {
            if (stopped || !video.current) return;
            try {
              const codes = await detector.detect(video.current);
              if (codes[0]?.rawValue) return done(codes[0].rawValue);
            } catch { /* frame not ready */ }
            timer = setTimeout(tick, 200);
          };
          tick();
        } else {
          const { BrowserMultiFormatReader } = await import('@zxing/browser');
          if (stopped || !video.current) return;
          const reader = new BrowserMultiFormatReader();
          zxingControls = await reader.decodeFromVideoDevice(undefined, video.current, (result) => {
            if (result) done(result.getText());
          });
        }
      } catch (e) {
        setError(`Could not start the camera: ${(e as Error).message}. Check the browser's camera permission.`);
      }
    })();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      zxingControls?.stop();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title="Scan with camera">
      {error ? (
        <p role="alert" className="text-sm text-red-700">{error}</p>
      ) : (
        <div className="space-y-2">
          <video ref={video} className="aspect-video w-full rounded-md bg-black object-cover" muted playsInline />
          <p className="text-xs text-slate-500">Point the camera at the package QR code or barcode.</p>
        </div>
      )}
      <div className="mt-4 flex justify-end"><Button variant="secondary" onClick={onClose}>Close</Button></div>
    </Modal>
  );
}
