import { ModalSurface, type ModalSurfaceProps } from './ModalSurface';

export interface DrawerProps extends ModalSurfaceProps {
  readonly side?: 'left' | 'right';
}

/** Edge-attached modal panel. The shell uses it for the inspector on narrow screens. */
export function Drawer({ side = 'right', ...props }: DrawerProps) {
  return (
    <ModalSurface
      {...props}
      side={side}
      panelClassName={`inset-y-0 ${side === 'right' ? 'right-0 fi-slide-in' : 'left-0 fi-slide-in'} w-[min(380px,100vw)] rounded-none border-y-0 ${side === 'right' ? 'border-r-0' : 'border-l-0'}`}
    />
  );
}
