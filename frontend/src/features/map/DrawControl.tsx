import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { logger } from '@/lib/logger';
import {
  createDrawController,
  createTerraDraw,
  farmsEqual,
  type DrawController,
  type DrawState,
} from './draw';
import { useMapActions, useMapInstance } from './map-context';
import type { FarmFeatureCollection } from './types';

export interface DrawControlProps {
  /** The current farm from outside the editor (upload, paste, sample). Loaded for editing. */
  readonly value?: FarmFeatureCollection | null;
  /** Called after every completed change; null when the drawing is empty. */
  readonly onChange?: (farm: FarmFeatureCollection | null) => void;
  readonly onStateChange?: (state: DrawState) => void;
  readonly disabled?: boolean;
  /** `D` starts drawing and `Escape` cancels. On by default; ignored while typing in a field. */
  readonly shortcuts?: boolean;
}

const IDLE: DrawState = { mode: 'idle', canUndo: false, canRedo: false, hasPolygon: false };

const isTypingTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

const TOOL_CLASS =
  'bg-surface text-fg hover:bg-surface-muted border-border rounded-control border px-3 py-1.5 text-sm disabled:opacity-50';
const ACTIVE_CLASS =
  'bg-accent text-accent-fg rounded-control border border-transparent px-3 py-1.5 text-sm';

/**
 * Polygon drawing and vertex editing on the map, with undo/redo. Must be rendered inside
 * `<MapView>`. Terra Draw is created once the basemap style is ready and rebuilt after a
 * basemap switch (which wipes its layers), keeping the drawn field.
 */
export function DrawControl({
  value = null,
  onChange,
  onStateChange,
  disabled = false,
  shortcuts = true,
}: DrawControlProps) {
  const map = useMapInstance();
  const actions = useMapActions();
  const [state, setState] = useState<DrawState>(IDLE);
  const controllerRef = useRef<DrawController | null>(null);

  const emitChange = useEffectEvent((farm: FarmFeatureCollection | null) => {
    onChange?.(farm);
  });
  const reportState = useEffectEvent((next: DrawState) => {
    setState(next);
    onStateChange?.(next);
  });
  const latestValue = useEffectEvent(() => value);

  useEffect(() => {
    const teardown = (): void => {
      try {
        controllerRef.current?.destroy();
      } catch (error) {
        // After a style reload Terra Draw's layers are already gone; there is nothing to recover.
        logger.warn('Terra Draw teardown failed', error);
      }
      controllerRef.current = null;
    };

    // Order 2: after the grid and farm layers, so drawing renders on top of them.
    const off = actions.onStyleReady(() => {
      const keep = controllerRef.current?.getValue() ?? latestValue();
      teardown();
      const controller = createDrawController(createTerraDraw(map), {
        onChange: emitChange,
        onState: reportState,
      });
      controller.start();
      controller.setFarm(keep);
      controllerRef.current = controller;
    }, 2);

    return () => {
      off();
      teardown();
    };
  }, [actions, map]);

  // Load a farm that changed outside the editor, but never echo the editor's own edits back.
  useEffect(() => {
    const controller = controllerRef.current;
    if (controller === null || farmsEqual(controller.getValue(), value)) return;
    controller.setFarm(value);
  }, [value]);

  useEffect(() => {
    if (disabled) controllerRef.current?.stopDrawing();
  }, [disabled]);

  const startDrawing = useEffectEvent(() => {
    if (!disabled) controllerRef.current?.startDrawing();
  });
  const cancel = useEffectEvent(() => {
    controllerRef.current?.stopDrawing();
  });

  useEffect(() => {
    if (!shortcuts) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (isTypingTarget(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === 'd' || event.key === 'D') startDrawing();
      else if (event.key === 'Escape') cancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [shortcuts]);

  const drawing = state.mode === 'drawing';
  const editing = state.mode === 'editing';

  return (
    <div
      role="toolbar"
      aria-label="Drawing tools"
      className="bg-surface border-border rounded-panel shadow-float absolute top-3 left-1/2 z-10 flex -translate-x-1/2 gap-1 border p-1"
    >
      <button
        type="button"
        aria-pressed={drawing}
        disabled={disabled}
        onClick={() => {
          if (drawing) controllerRef.current?.stopDrawing();
          else controllerRef.current?.startDrawing();
        }}
        className={drawing ? ACTIVE_CLASS : TOOL_CLASS}
      >
        Draw field
      </button>
      <button
        type="button"
        aria-pressed={editing}
        disabled={disabled || !state.hasPolygon}
        onClick={() => {
          if (editing) controllerRef.current?.stopDrawing();
          else controllerRef.current?.startEditing();
        }}
        className={editing ? ACTIVE_CLASS : TOOL_CLASS}
      >
        Edit vertices
      </button>
      <button
        type="button"
        disabled={disabled || !state.canUndo}
        onClick={() => controllerRef.current?.undo()}
        className={TOOL_CLASS}
      >
        Undo
      </button>
      <button
        type="button"
        disabled={disabled || !state.canRedo}
        onClick={() => controllerRef.current?.redo()}
        className={TOOL_CLASS}
      >
        Redo
      </button>
      <button
        type="button"
        disabled={disabled || !state.hasPolygon}
        onClick={() => controllerRef.current?.clear()}
        className={TOOL_CLASS}
      >
        Clear
      </button>
    </div>
  );
}
