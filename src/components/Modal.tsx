import { Dialog, type DialogProps } from './Dialog';

export type ModalProps = Omit<DialogProps, 'kind' | 'side'>;

/** Centred dialog on desktop, full-screen sheet on phones. */
export function Modal(props: ModalProps) {
  return <Dialog {...props} kind="modal" />;
}
