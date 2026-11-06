import { useCallback, useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { clamp } from '../lib/utils';
import type { AnnotationItem, PageSize, StampAnnotation, TextAnnotation } from '../types';

const FONT_STACKS: Record<TextAnnotation['fontFamily'], string> = {
  Helvetica: 'Helvetica, Arial, sans-serif',
  TimesRoman: '"Times New Roman", Times, serif',
  Courier: '"Courier New", Courier, monospace',
};

export const ASSET_DRAG_TYPE = 'application/x-signfold-asset';

interface PdfPageProps {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  baseSize: PageSize;
  scale: number;
  items: AnnotationItem[];
  selectedId: string | null;
  editingId: string | null;
  mode: 'text' | 'select';
  onPageClick: (page: number, x: number, y: number) => void;
  onSelect: (id: string | null) => void;
  onEdit: (id: string) => void;
  onUpdateItem: (id: string, updater: (item: AnnotationItem) => AnnotationItem) => void;
  onCommitText: (id: string) => void;
  onDropAsset: (page: number, x: number, y: number, payload: string) => void;
}

interface AnnotationViewProps {
  item: AnnotationItem;
  scale: number;
  pageSize: PageSize;
  selected: boolean;
  editing: boolean;
  onSelect: (id: string) => void;
  onEdit: (id: string) => void;
  onUpdateItem: (id: string, updater: (item: AnnotationItem) => AnnotationItem) => void;
  onCommitText: (id: string) => void;
}

function AnnotationView({
  item,
  scale,
  pageSize,
  selected,
  editing,
  onSelect,
  onEdit,
  onUpdateItem,
  onCommitText,
}: AnnotationViewProps) {
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);
  const resizeRef = useRef<{
    pointerId: number;
    startX: number;
    originWidth: number;
    originHeight: number;
    ratio: number;
  } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [moved, setMoved] = useState(false);

  useEffect(() => {
    if (editing) {
      const textarea = textareaRef.current;
      if (textarea) {
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      }
    }
  }, [editing]);

  const clampPosition = useCallback(
    (x: number, y: number) => {
      const width = item.kind === 'stamp' ? item.width : 0;
      const height = item.kind === 'stamp' ? item.height : 24;
      return {
        x: clamp(x, 0, Math.max(0, pageSize.width - width)),
        y: clamp(y, 0, Math.max(0, pageSize.height - height)),
      };
    },
    [item, pageSize.height, pageSize.width],
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (editing || event.button !== 0) return;
    event.stopPropagation();
    onSelect(item.id);
    setMoved(false);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: item.x,
      originY: item.y,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = (event.clientX - drag.startX) / scale;
    const dy = (event.clientY - drag.startY) / scale;
    if (!drag.moved && Math.hypot(dx * scale, dy * scale) < 3) return;
    drag.moved = true;
    setMoved(true);
    const next = clampPosition(drag.originX + dx, drag.originY + dy);
    onUpdateItem(item.id, (current) => ({ ...current, ...next }));
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      dragRef.current = null;
    }
  };

  const handleResizeDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (item.kind !== 'stamp') return;
    event.stopPropagation();
    event.preventDefault();
    resizeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      originWidth: item.width,
      originHeight: item.height,
      ratio: item.width / item.height,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleResizeMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    event.stopPropagation();
    const dx = (event.clientX - resize.startX) / scale;
    const maxWidth = Math.max(30, pageSize.width - item.x);
    const width = clamp(resize.originWidth + dx, 30, maxWidth);
    const height = Math.max(12, width / resize.ratio);
    onUpdateItem(item.id, (current) =>
      current.kind === 'stamp' ? { ...current, width, height } : current,
    );
  };

  const endResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (resizeRef.current?.pointerId === event.pointerId) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      resizeRef.current = null;
    }
  };

  const commonProps = {
    className: `annotation ${selected ? 'is-selected' : ''} ${editing ? 'is-editing' : ''}`,
    style: {
      left: item.x * scale,
      top: item.y * scale,
      touchAction: 'none' as const,
    },
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
    onClick: (event: React.MouseEvent) => event.stopPropagation(),
    onDoubleClick: (event: React.MouseEvent) => {
      event.stopPropagation();
      if (item.kind === 'text' && !moved) onEdit(item.id);
    },
  };

  if (item.kind === 'text') {
    if (editing) {
      const width = Math.max(
        160,
        ...item.text.split('\n').map((line) => Math.max(4, line.length) * item.fontSize * 0.62),
      );
      return (
        <div {...commonProps} className="annotation editing-shell">
          <textarea
            ref={textareaRef}
            className="text-editor"
            value={item.text}
            rows={Math.max(1, item.text.split('\n').length)}
            style={{
              width: `${width * scale}px`,
              fontSize: `${item.fontSize * scale}px`,
              lineHeight: 1.25,
              color: item.color,
              fontFamily: FONT_STACKS[item.fontFamily],
            }}
            onChange={(event) =>
              onUpdateItem(item.id, (current) =>
                current.kind === 'text' ? { ...current, text: event.target.value } : current,
              )
            }
            onBlur={() => onCommitText(item.id)}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === 'Escape') event.currentTarget.blur();
            }}
          />
        </div>
      );
    }

    return (
      <div
        {...commonProps}
        className={`${commonProps.className} text-annotation`}
        style={{
          ...commonProps.style,
          fontSize: item.fontSize * scale,
          lineHeight: 1.25,
          color: item.color,
          fontFamily: FONT_STACKS[item.fontFamily],
        }}
      >
        {item.text}
      </div>
    );
  }

  const stamp = item as StampAnnotation;
  return (
    <div {...commonProps} className={`${commonProps.className} stamp-annotation`}>
      <img
        src={stamp.dataUrl}
        alt="Signature stamp"
        draggable={false}
        style={{ width: stamp.width * scale, height: stamp.height * scale }}
      />
      {selected && !editing && (
        <button
          type="button"
          className="resize-handle"
          aria-label="Resize stamp"
          onPointerDown={handleResizeDown}
          onPointerMove={handleResizeMove}
          onPointerUp={endResize}
          onPointerCancel={endResize}
          onClick={(event) => event.stopPropagation()}
        />
      )}
    </div>
  );
}

export default function PdfPage({
  pdf,
  pageNumber,
  baseSize,
  scale,
  items,
  selectedId,
  editingId,
  mode,
  onPageClick,
  onSelect,
  onEdit,
  onUpdateItem,
  onCommitText,
  onDropAsset,
}: PdfPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let renderTask: { cancel: () => void } | null = null;
    let page: PDFPageProxy | null = null;

    const render = async () => {
      const loadedPage = await pdf.getPage(pageNumber);
      if (cancelled) return;
      page = loadedPage;
      const viewport = loadedPage.getViewport({ scale });
      const canvas = canvasRef.current;
      if (!canvas) return;
      const outputScale = Math.min(window.devicePixelRatio || 1, 3);
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      const context = canvas.getContext('2d');
      if (!context) return;
      context.save();
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.restore();
      const task = loadedPage.render({
        canvas,
        viewport,
        transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined,
      });
      renderTask = task;
      try {
        await task.promise;
      } catch {
      }
    };

    void render();
    return () => {
      cancelled = true;
      renderTask?.cancel();
      page?.cleanup();
    };
  }, [pdf, pageNumber, scale]);

  const handlePageClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / scale;
    const y = (event.clientY - rect.top) / scale;
    if (mode === 'text') onPageClick(pageNumber, x, y);
    else onSelect(null);
  };

  const width = baseSize.width * scale;
  const height = baseSize.height * scale;

  return (
    <div
      ref={pageRef}
      className={`pdf-page ${dragOver ? 'drag-over' : ''}`}
      data-page-number={pageNumber}
      style={{ width, height }}
    >
      <canvas ref={canvasRef} />
      <div
        className={`page-overlay mode-${mode}`}
        onClick={handlePageClick}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes(ASSET_DRAG_TYPE)) {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
            setDragOver(true);
          }
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          const payload = event.dataTransfer.getData(ASSET_DRAG_TYPE);
          setDragOver(false);
          if (!payload) return;
          event.preventDefault();
          event.stopPropagation();
          const rect = event.currentTarget.getBoundingClientRect();
          onDropAsset(
            pageNumber,
            (event.clientX - rect.left) / scale,
            (event.clientY - rect.top) / scale,
            payload,
          );
        }}
      >
        {items.map((item) => (
          <AnnotationView
            key={item.id}
            item={item}
            scale={scale}
            pageSize={baseSize}
            selected={item.id === selectedId}
            editing={item.id === editingId}
            onSelect={onSelect}
            onEdit={onEdit}
            onUpdateItem={onUpdateItem}
            onCommitText={onCommitText}
          />
        ))}
      </div>
    </div>
  );
}
