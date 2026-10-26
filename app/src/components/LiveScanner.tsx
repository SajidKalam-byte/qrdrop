import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { CameraView, type BarcodeScanningResult } from 'expo-camera';

import { decodeQrFromJpegBase64, pickPictureSize } from '../services/qrDecode';

// Module-level constant: a new object on every render makes the native camera re-bind (and restart its
// barcode analyzer) each time the parent re-renders, which can starve the scanner of frames.
const SETTINGS = { barcodeTypes: ['qr' as const] };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Props {
  onDetect: (data: string) => void;
  onEvent: (msg: string) => void;
  /** True while a pairing attempt is running: the JS reader then stops taking photos. */
  isBusy: () => boolean;
}

/**
 * The live camera, with two independent QR readers:
 *  1. expo-camera's native ML Kit scanner (fast, but silent on some Android phones), and
 *  2. a JS backup that takes small photos about once a second and decodes them with jsQR.
 * Memoised with stable props so parent state changes never re-bind the camera.
 */
export const LiveScanner = memo(function LiveScanner({ onDetect, onEvent, isBusy }: Props) {
  const cam = useRef<CameraView>(null);
  const readyCount = useRef(0);
  const [ready, setReady] = useState(false);
  const [pictureSize, setPictureSize] = useState<string | undefined>();

  const onReady = useCallback(async () => {
    readyCount.current += 1;
    onEvent(`camera ready (#${readyCount.current})`);
    setReady(true);
    if (pictureSize) return;
    try {
      const size = pickPictureSize((await cam.current?.getAvailablePictureSizesAsync()) ?? []);
      if (size) setPictureSize(size);
      else onEvent('js backup off: camera lists no picture sizes');
    } catch (e) {
      onEvent(`js backup off: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [onEvent, pictureSize]);

  const onError = useCallback((e: { message: string }) => onEvent(`camera error: ${e.message}`), [onEvent]);

  const onScanned = useCallback(
    ({ type, data }: BarcodeScanningResult) => {
      onEvent(`saw ${type}: ${data.slice(0, 70)}`);
      onDetect(data);
    },
    [onDetect, onEvent],
  );

  // JS backup reader. Only runs once a small picture size is chosen, so decoding stays fast.
  useEffect(() => {
    if (!ready || !pictureSize) return;
    let stop = false;
    onEvent(`js backup on (${pictureSize})`);
    (async () => {
      let n = 0;
      while (!stop) {
        await sleep(700);
        if (stop) break;
        if (isBusy()) continue; // pairing in progress: no photos, no flicker
        try {
          const pic = await cam.current?.takePictureAsync({ base64: true, skipProcessing: true, shutterSound: false, exif: false });
          if (stop || !pic?.base64) continue;
          const t0 = Date.now();
          const r = decodeQrFromJpegBase64(pic.base64);
          n += 1;
          if (n === 1 || n % 6 === 0) onEvent(`js scan #${n}: ${r.width}x${r.height}, ${Date.now() - t0} ms`);
          if (r.data) {
            onEvent(`js saw qr: ${r.data.slice(0, 70)}`);
            onDetect(r.data);
          }
        } catch (e) {
          onEvent(`js scan error: ${e instanceof Error ? e.message.slice(0, 80) : String(e)}`);
          await sleep(2500);
        }
      }
    })();
    return () => {
      stop = true;
    };
  }, [ready, pictureSize, onDetect, onEvent, isBusy]);

  return (
    <CameraView
      ref={cam}
      style={StyleSheet.absoluteFill}
      facing="back"
      animateShutter={false}
      pictureSize={pictureSize}
      barcodeScannerSettings={SETTINGS}
      onCameraReady={onReady}
      onMountError={onError}
      onBarcodeScanned={onScanned}
    />
  );
});
