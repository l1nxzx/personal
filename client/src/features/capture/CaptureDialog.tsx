import { Dialog } from '../../components/ui/Dialog';
import { useUI } from '../../context/UIContext';
import { CaptureForm } from './CaptureForm';

/** Quick Capture overlay, opened with `C`, the sidebar button, or the phone's center button. */
export function CaptureDialog() {
  const { captureOpen, captureSeed, closeCapture } = useUI();
  return (
    <Dialog open={captureOpen} onClose={closeCapture} title="Capture" hideTitle placement="top">
      <CaptureForm draftKey="capture:draft" autoFocus seed={captureSeed} onSaved={closeCapture} />
    </Dialog>
  );
}
