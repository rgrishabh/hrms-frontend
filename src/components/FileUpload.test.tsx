import { useState } from 'react';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../test/axe';
import { renderUi } from '../test/render';
import { FileUpload, type FileUploadProps } from './FileUpload';

function Harness(props: Partial<FileUploadProps>) {
  const [file, setFile] = useState<File | null>(null);
  return <FileUpload label="Resume" file={file} onChange={setFile} {...props} />;
}
const csv = new File(['a,b'], 'people.csv', { type: 'text/csv' });

describe('FileUpload', () => {
  it('takes a file from the native input and can remove it', async () => {
    renderUi(<Harness accept=".csv" />);
    await userEvent.upload(screen.getByLabelText('Resume'), csv);
    expect(screen.getByText('people.csv')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Remove people.csv' }));
    expect(screen.queryByText('people.csv')).toBeNull();
  });
  it('refuses a dropped file of the wrong type', () => {
    const { container } = renderUi(<Harness accept=".pdf" />);
    fireEvent.drop(container.querySelector('.file-upload')!, { dataTransfer: { files: [csv] } });
    expect(screen.getByRole('alert').textContent).toBe('That file type is not allowed.');
  });
  it('refuses a file over the limit', () => {
    const { container } = renderUi(<Harness maxBytes={1} />);
    fireEvent.drop(container.querySelector('.file-upload')!, { dataTransfer: { files: [csv] } });
    expect(screen.getByRole('alert').textContent).toContain('larger than');
  });
  it('has no axe violations', async () => {
    const { container } = renderUi(<Harness hint="PDF only" />);
    await expectNoAxeViolations(container);
  });
});
