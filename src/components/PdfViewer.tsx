import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Minus,
  MousePointer2,
  Plus,
  Scan,
  Trash2,
  Type,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import PdfPage from './PdfPage';
import { clamp } from '../lib/utils';
import type { AnnotationItem, PdfDocumentState, TextAnnotation } from '../types';

interface PdfViewerProps {
  document: PdfDocumentState;
  items: AnnotationItem[];
  selectedId: string | null;
  editingId: string | null;
  mode: 'text' | 'select';
  onModeChange: (mode: 'text' | 'select') => void;
  onCurrentPageChange: (page: number) => void;
  onTextCreate: (page: number, x: number, y: number) => void;
  onSelect: (id: string | null) => void;
  onEdit: (id: string) => void;
  onUpdateItem: (id: string, updater: (item: AnnotationItem) => AnnotationItem) => void;
  onCommitText: (id: string) => void;
  onDeleteItem: (id: string) => void;
  onDropAsset: (page: number, x: number, y: number, payload: string) => void;
}

export default function PdfViewer({
  document,
  items,
  selectedId,
  editingId,
  mode,
  onModeChange,
  onCurrentPageChange,
  onTextCreate,
  onSelect,
  onEdit,
  onUpdateItem,
  onCommitText,
  onDeleteItem,
  onDropAsset,
}: PdfViewerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [fitWidth, setFitWidth] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  const maxPageWidth = useMemo(
    () => Math.max(...document.pageSizes.map((size) => size.width), 1),
    [document],
  );

  useEffect(() => {
    setFitWidth(true);
    setCurrentPage(1);
  }, [document]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const updateScale = () => {
      const available = container.clientWidth - 56;
      setScale(clamp(available / maxPageWidth, 0.2, 3));
    };
    if (fitWidth) updateScale();
    const observer = new ResizeObserver(() => {
      if (fitWidth) updateScale();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [fitWidth, maxPageWidth]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const pages = container.querySelectorAll<HTMLElement>('[data-page-number]');
      if (!pages.length) return;
      const containerRect = container.getBoundingClientRect();
      const focusY = containerRect.top + containerRect.height * 0.35;
      let bestPage = 1;
      let bestDistance = Number.POSITIVE_INFINITY;
      pages.forEach((page) => {
        const rect = page.getBoundingClientRect();
        const center = rect.top + rect.height / 2;
        const distance = Math.abs(center - focusY);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestPage = Number(page.dataset.pageNumber) || 1;
        }
      });
      setCurrentPage(bestPage);
      onCurrentPageChange(bestPage);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    container.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(frame);
      container.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [document, onCurrentPageChange]);

  const selected = items.find((item) => item.id === selectedId);
  const selectedText = selected?.kind === 'text' ? (selected as TextAnnotation) : null;

  const zoom = (factor: number) => {
    setFitWidth(false);
    setScale((current) => clamp(current * factor, 0.2, 4));
  };

  const adjustSelectedSize = (delta: number) => {
    if (!selected) return;
    if (selected.kind === 'text') {
      onUpdateItem(selected.id, (item) =>
        item.kind === 'text'
          ? { ...item, fontSize: clamp(item.fontSize + delta, 6, 120) }
          : item,
      );
      return;
    }
    const factor = delta > 0 ? 1.12 : 0.89;
    onUpdateItem(selected.id, (item) => {
      if (item.kind !== 'stamp') return item;
      const width = clamp(item.width * factor, 24, 1200);
      return { ...item, width, height: item.height * (width / item.width) };
    });
  };

  return (
    <section className="viewer">
      <div className="viewer-toolbar">
        <div className="toolbar-group">
          <button
            className={`tool-btn ${mode === 'text' ? 'active' : ''}`}
            type="button"
            onClick={() => onModeChange('text')}
            title="Click the page to type"
          >
            <Type size={16} />
            <span>Text</span>
          </button>
          <button
            className={`tool-btn ${mode === 'select' ? 'active' : ''}`}
            type="button"
            onClick={() => onModeChange('select')}
            title="Select and move marks"
          >
            <MousePointer2 size={16} />
            <span>Select</span>
          </button>
        </div>

        <div className="toolbar-divider" />

        <div className="toolbar-group zoom-group">
          <button className="icon-btn" type="button" onClick={() => zoom(0.86)} aria-label="Zoom out">
            <ZoomOut size={17} />
          </button>
          <span className="zoom-label">{Math.round(scale * 100)}%</span>
          <button className="icon-btn" type="button" onClick={() => zoom(1.16)} aria-label="Zoom in">
            <ZoomIn size={17} />
          </button>
          <button
            className={`icon-btn ${fitWidth ? 'active' : ''}`}
            type="button"
            onClick={() => setFitWidth(true)}
            aria-label="Fit page width"
            title="Fit width"
          >
            <Scan size={17} />
          </button>
        </div>

        <div className="toolbar-spacer" />

        <div className="page-indicator">
          Page {currentPage} <span>/ {document.pageSizes.length}</span>
        </div>

        {selected && (
          <>
            <div className="toolbar-divider" />
            <div className="selection-tools">
              {selectedText ? (
                <>
                  <select
                    className="mini-select"
                    value={selectedText.fontFamily}
                    onChange={(event) =>
                      onUpdateItem(selected.id, (item) =>
                        item.kind === 'text'
                          ? {
                              ...item,
                              fontFamily: event.target.value as TextAnnotation['fontFamily'],
                            }
                          : item,
                      )
                    }
                    aria-label="Font family"
                  >
                    <option value="Helvetica">Helvetica</option>
                    <option value="TimesRoman">Times</option>
                    <option value="Courier">Courier</option>
                  </select>
                  <input
                    className="mini-color"
                    type="color"
                    value={selectedText.color}
                    onChange={(event) =>
                      onUpdateItem(selected.id, (item) =>
                        item.kind === 'text' ? { ...item, color: event.target.value } : item,
                      )
                    }
                    aria-label="Text color"
                  />
                </>
              ) : null}
              <button
                className="icon-btn"
                type="button"
                onClick={() => adjustSelectedSize(-1)}
                aria-label="Make selection smaller"
              >
                <Minus size={15} />
              </button>
              <button
                className="icon-btn"
                type="button"
                onClick={() => adjustSelectedSize(1)}
                aria-label="Make selection larger"
              >
                <Plus size={15} />
              </button>
              <button
                className="icon-btn danger"
                type="button"
                onClick={() => onDeleteItem(selected.id)}
                aria-label="Delete selection"
              >
                <Trash2 size={15} />
              </button>
            </div>
          </>
        )}
      </div>

      <div ref={scrollRef} className="pdf-scroll">
        <div className="pages-stack">
          {document.pageSizes.map((size, index) => {
            const pageNumber = index + 1;
            return (
              <PdfPage
                key={pageNumber}
                pdf={document.pdf}
                pageNumber={pageNumber}
                baseSize={size}
                scale={scale}
                items={items.filter((item) => item.page === pageNumber)}
                selectedId={selectedId}
                editingId={editingId}
                mode={mode}
                onPageClick={onTextCreate}
                onSelect={onSelect}
                onEdit={onEdit}
                onUpdateItem={onUpdateItem}
                onCommitText={onCommitText}
                onDropAsset={onDropAsset}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}
