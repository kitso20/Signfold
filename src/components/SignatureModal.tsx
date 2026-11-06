import { useEffect, useRef, useState } from 'react';
import { Eraser, ImageUp, Loader2, PenLine, Save, Upload } from 'lucide-react';
import Modal from './Modal';
import SignatureCanvas, { type SignatureCanvasHandle } from './SignatureCanvas';
import { prepareSignatureImage, type PreparedImage } from '../lib/imageImport';
import type { SignatureKind } from '../types';

type MarkMode = 'draw' | 'upload';

interface SignatureModalProps {
  open: boolean;
  initialKind?: SignatureKind;
  initialMode?: MarkMode;
  onClose: () => void;
  onSave: (payload: {
    kind: SignatureKind;
    name: string;
    dataUrl: string;
    width: number;
    height: number;
  }) => Promise<void>;
}

export default function SignatureModal({
  open,
  initialKind = 'signature',
  initialMode = 'draw',
  onClose,
  onSave,
}: SignatureModalProps) {
  const canvasRef = useRef<SignatureCanvasHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<SignatureKind>(initialKind);
  const [mode, setMode] = useState<MarkMode>(initialMode);
  const [hasInk, setHasInk] = useState(false);
  const [imported, setImported] = useState<PreparedImage | null>(null);
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setKind(initialKind);
    setMode(initialMode);
    setName('');
    setHasInk(false);
    setImported(null);
    setFileName('');
    setImporting(false);
    setError('');
    setSaving(false);
  }, [open, initialKind, initialMode]);

  useEffect(() => {
    if (!open) return;
    canvasRef.current?.clear();
    setHasInk(false);
  }, [kind, open]);

  const changeMode = (next: MarkMode) => {
    setMode(next);
    setError('');
  };

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setImporting(true);
    setError('');
    try {
      const image = await prepareSignatureImage(file);
      setImported(image);
      setFileName(file.name);
    } catch (importError) {
      setImported(null);
      setFileName('');
      setError(
        importError instanceof Error ? importError.message : 'Could not import that image.',
      );
    } finally {
      setImporting(false);
    }
  };

  const handleSave = async () => {
    const image = mode === 'upload' ? imported : canvasRef.current?.exportTrimmed();
    if (!image) {
      setError(
        mode === 'upload'
          ? 'Choose a signature image first.'
          : 'Draw your signature or initials first.',
      );
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave({
        kind,
        name: name.trim() || (kind === 'signature' ? 'Signature' : 'Initials'),
        ...image,
      });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save this signature.');
      setSaving(false);
    }
  };

  const canSave = mode === 'draw' ? hasInk : Boolean(imported);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create a saved mark"
      subtitle="Draw or import once, then reuse it on any document from the toolbar."
    >
      <div className="segmented">
        <button
          type="button"
          className={kind === 'signature' ? 'active' : ''}
          onClick={() => setKind('signature')}
          disabled={saving}
        >
          Signature
        </button>
        <button
          type="button"
          className={kind === 'initials' ? 'active' : ''}
          onClick={() => setKind('initials')}
          disabled={saving}
        >
          Initials
        </button>
      </div>

      <div className="segmented mark-mode">
        <button
          type="button"
          className={mode === 'draw' ? 'active' : ''}
          onClick={() => changeMode('draw')}
          disabled={saving}
        >
          <PenLine size={15} /> Draw
        </button>
        <button
          type="button"
          className={mode === 'upload' ? 'active' : ''}
          onClick={() => changeMode('upload')}
          disabled={saving}
        >
          <ImageUp size={15} /> Upload image
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="visually-hidden"
        onChange={(event) => void handleFile(event)}
      />

      {mode === 'draw' ? (
        <div className="sig-pad-wrap">
          <div className="sig-baseline" />
          <SignatureCanvas
            ref={canvasRef}
            className={kind === 'initials' ? 'initials-pad' : ''}
            onInkChange={setHasInk}
          />
          {!hasInk && (
            <div className="sig-placeholder">
              <PenLine size={20} />
              <span>Draw here with your mouse, trackpad, or finger</span>
            </div>
          )}
        </div>
      ) : (
        <div className="import-area">
          {imported ? (
            <>
              <div className="import-preview">
                <img src={imported.dataUrl} alt="Imported signature preview" />
              </div>
              <div className="import-file">
                <span>{fileName}</span>
                <span>
                  {imported.width} × {imported.height}px
                </span>
              </div>
            </>
          ) : (
            <button
              className="import-drop"
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing || saving}
            >
              <span className="import-drop-icon">
                {importing ? <Loader2 className="spin" size={24} /> : <ImageUp size={24} />}
              </span>
              <strong>{importing ? 'Preparing image…' : 'Choose a signature image'}</strong>
              <span>PNG, JPG, or WebP. White backgrounds are removed automatically.</span>
            </button>
          )}
        </div>
      )}

      <div className="sig-meta-row">
        <label className="field grow">
          <span>Label (optional)</span>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={kind === 'signature' ? 'e.g. Full signature' : 'e.g. Initials'}
            disabled={saving}
          />
        </label>
        {mode === 'draw' ? (
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => {
              canvasRef.current?.clear();
              setHasInk(false);
            }}
            disabled={saving || !hasInk}
          >
            <Eraser size={16} /> Clear
          </button>
        ) : (
          imported && (
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={saving || importing}
            >
              <Upload size={16} /> Replace
            </button>
          )
        )}
      </div>

      {error && <div className="form-error">{error}</div>}

      <button
        className="btn btn-primary btn-full"
        type="button"
        onClick={() => void handleSave()}
        disabled={saving || importing || !canSave}
      >
        {saving ? (
          <span className="spinner" />
        ) : mode === 'upload' ? (
          <Upload size={16} />
        ) : (
          <Save size={16} />
        )}
        {saving ? 'Saving…' : 'Save mark'}
      </button>
    </Modal>
  );
}
