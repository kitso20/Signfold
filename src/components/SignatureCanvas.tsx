import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';

export interface SignatureCanvasHandle {
  clear: () => void;
  exportTrimmed: () => { dataUrl: string; width: number; height: number } | null;
}

interface SignatureCanvasProps {
  className?: string;
  penColor?: string;
  lineWidth?: number;
  onInkChange?: (hasInk: boolean) => void;
}

interface Point {
  x: number;
  y: number;
}

const SignatureCanvas = forwardRef<SignatureCanvasHandle, SignatureCanvasProps>(
  ({ className, penColor = '#171923', lineWidth = 2.6, onInkChange }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawingRef = useRef(false);
    const hasInkRef = useRef(false);
    const lastPointRef = useRef<Point | null>(null);

    const setupCanvas = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const nextWidth = Math.max(1, Math.round(rect.width * dpr));
      const nextHeight = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width === nextWidth && canvas.height === nextHeight) return;

      const previous = document.createElement('canvas');
      previous.width = canvas.width;
      previous.height = canvas.height;
      if (canvas.width && canvas.height) {
        previous.getContext('2d')?.drawImage(canvas, 0, 0);
      }

      canvas.width = nextWidth;
      canvas.height = nextHeight;
      const context = canvas.getContext('2d');
      if (!context) return;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.strokeStyle = penColor;
      context.lineWidth = lineWidth;

      if (canvas.width && previous.width) {
        context.save();
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.drawImage(previous, 0, 0, previous.width, previous.height, 0, 0, nextWidth, nextHeight);
        context.restore();
      }
    }, [lineWidth, penColor]);

    useEffect(() => {
      setupCanvas();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const observer = new ResizeObserver(() => setupCanvas());
      observer.observe(canvas);
      return () => observer.disconnect();
    }, [setupCanvas]);

    const pointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>): Point => {
      const rect = event.currentTarget.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };

    const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (event.button !== undefined && event.button !== 0 && event.pointerType === 'mouse') return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      drawingRef.current = true;
      const context = event.currentTarget.getContext('2d');
      const point = pointFromEvent(event);
      lastPointRef.current = point;
      if (!context) return;
      context.beginPath();
      context.arc(point.x, point.y, lineWidth / 2.4, 0, Math.PI * 2);
      context.fillStyle = penColor;
      context.fill();
      context.beginPath();
      context.moveTo(point.x, point.y);
      if (!hasInkRef.current) {
        hasInkRef.current = true;
        onInkChange?.(true);
      }
    };

    const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!drawingRef.current) return;
      event.preventDefault();
      const context = event.currentTarget.getContext('2d');
      if (!context) return;
      const point = pointFromEvent(event);
      const last = lastPointRef.current;
      if (last) {
        const mid = { x: (last.x + point.x) / 2, y: (last.y + point.y) / 2 };
        context.quadraticCurveTo(last.x, last.y, mid.x, mid.y);
        context.stroke();
      } else {
        context.lineTo(point.x, point.y);
        context.stroke();
      }
      lastPointRef.current = point;
    };

    const stopDrawing = (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!drawingRef.current) return;
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      drawingRef.current = false;
      lastPointRef.current = null;
    };

    const clear = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const context = canvas.getContext('2d');
      context?.clearRect(0, 0, canvas.width, canvas.height);
      hasInkRef.current = false;
      lastPointRef.current = null;
      onInkChange?.(false);
    }, [onInkChange]);

    const exportTrimmed = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas || !hasInkRef.current) return null;
      const context = canvas.getContext('2d');
      if (!context) return null;

      const { width, height } = canvas;
      const image = context.getImageData(0, 0, width, height).data;
      let minX = width;
      let minY = height;
      let maxX = -1;
      let maxY = -1;

      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          if (image[(y * width + x) * 4 + 3] > 0) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }

      if (maxX < minX || maxY < minY) return null;
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const padding = Math.round(10 * dpr);
      const cropWidth = maxX - minX + 1;
      const cropHeight = maxY - minY + 1;
      const output = document.createElement('canvas');
      output.width = cropWidth + padding * 2;
      output.height = cropHeight + padding * 2;
      const outputContext = output.getContext('2d');
      if (!outputContext) return null;
      outputContext.drawImage(
        canvas,
        minX,
        minY,
        cropWidth,
        cropHeight,
        padding,
        padding,
        cropWidth,
        cropHeight,
      );

      return {
        dataUrl: output.toDataURL('image/png'),
        width: output.width,
        height: output.height,
      };
    }, []);

    useImperativeHandle(ref, () => ({ clear, exportTrimmed }), [clear, exportTrimmed]);

    return (
      <canvas
        ref={canvasRef}
        className={`signature-canvas ${className || ''}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDrawing}
        onPointerCancel={stopDrawing}
        onPointerLeave={(event) => {
          if (drawingRef.current) stopDrawing(event);
        }}
      />
    );
  },
);

SignatureCanvas.displayName = 'SignatureCanvas';

export default SignatureCanvas;
