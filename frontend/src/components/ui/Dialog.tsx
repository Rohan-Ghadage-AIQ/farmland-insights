import { ModalSurface, type ModalSurfaceProps } from './ModalSurface';

export type DialogProps = ModalSurfaceProps;

/** Centered modal for decisions and confirmations (for example "This may take several minutes"). */
export function Dialog(props: DialogProps) {
  return (
    <ModalSurface
      {...props}
      panelClassName="top-1/2 left-1/2 w-[min(32rem,calc(100vw-2rem))] max-h-[calc(100vh-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-panel"
    />
  );
}
