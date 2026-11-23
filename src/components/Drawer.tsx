import { Dialog, type DialogProps } from './Dialog';

export type DrawerProps = Omit<DialogProps, 'kind'>;

/** A panel from the edge of the screen: same focus and dismissal rules as Modal. */
export function Drawer(props: DrawerProps) {
  return <Dialog {...props} kind="drawer" />;
}
