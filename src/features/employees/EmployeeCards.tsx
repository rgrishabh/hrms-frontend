import { useState } from 'react';
import { api, errorMessage } from '../../api';
import { Card } from '../../components/Card';
import { DownloadButton } from '../../components/DownloadButton';
import { FileUpload } from '../../components/FileUpload';
import { useToast } from '../../components/Toast';

const MAX_WIDTH = 600;
const MAX_HEIGHT = 800;

/**
 * A camera photo is far bigger than a card needs, and the server takes up to 2 MB, so it is scaled here. This also turns it upright as the browser
 * shows it. A browser that cannot do this sends the original, and the server's answer says if that is too big.
 */
export async function shrinkPhoto(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_WIDTH / bitmap.width, MAX_HEIGHT / bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    return blob ? new File([blob], 'photo.jpg', { type: 'image/jpeg' }) : file;
  } catch {
    return file;
  }
}

/** One person's cards, and the photo the ID card carries. */
export function EmployeeCards({ employeeId }: { employeeId: string }) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const choose = async (chosen: File | null) => {
    setFile(chosen);
    setError(null);
    if (!chosen) return;
    const form = new FormData();
    form.append('file', await shrinkPhoto(chosen));
    try {
      await api.upload(`/api/v1/employees/${employeeId}/photo`, form, 'PUT');
      toast('Photo saved. It prints on the next ID card');
      setFile(null);
    } catch (x) { setError(errorMessage(x)); }
  };
  return (
    <Card title="ID and business cards">
      <div className="stack-3">
        <div className="cluster">
          <DownloadButton url={`/api/v1/employees/${employeeId}/id-card.pdf`} fileName="id-card.pdf">ID card</DownloadButton>
          <DownloadButton url={`/api/v1/employees/${employeeId}/business-card.pdf`} fileName="business-card.pdf">Business card</DownloadButton>
        </div>
        <p className="text-sm text-2">Print business cards on both sides, flipping on the long edge. Print ID cards on one side: each has its front and back side by side.</p>
        <FileUpload label="Photo for the ID card" hint="JPEG or PNG. Without a photo, the card prints a box to paste one into." accept="image/jpeg,image/png" file={file} error={error} onChange={(f) => void choose(f)} />
      </div>
    </Card>
  );
}
