import { useEffect, useRef, useState } from 'react';
import { Eraser, PenLine, Save } from 'lucide-react';
import Modal from './Modal';
import SignatureCanvas, { type SignatureCanvasHandle } from './SignatureCanvas';
import type { SignatureKind } from '../types';

interface SignatureModalProps {
  open: boolean;
  initialKind?: SignatureKind;
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
  onClose,
  onSave,
}: SignatureModalProps) {
  const canvasRef = useRef<SignatureCanvasHandle>(null);
  const [kind, setKind] = useState<SignatureKind>(initialKind);
  const [hasInk, setHasInk] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setKind(initialKind);
    setName('');
    setHasInk(false);
    setError('');
    setSaving(false);
  }, [open, initialKind]);

  useEffect(() => {
    if (!open) return;
    canvasRef.current?.clear();
    setHasInk(false);
  }, [kind, open]);

  const handleSave = async () => {
    const image = canvasRef.current?.exportTrimmed();
    if (!image) {
      setError('Draw your signature or initials first.');
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

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create a saved mark"
      subtitle="Draw once, then reuse it on any document from the toolbar."
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
      </div>

      {error && <div className="form-error">{error}</div>}

      <button
        className="btn btn-primary btn-full"
        type="button"
        onClick={() => void handleSave()}
        disabled={saving || !hasInk}
      >
        {saving ? <span className="spinner" /> : <Save size={16} />}
        {saving ? 'Saving…' : 'Save mark'}
      </button>
    </Modal>
  );
}
