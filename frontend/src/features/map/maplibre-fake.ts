/**
 * Test double for the `maplibre-gl` module. MapLibre needs WebGL, which jsdom does not have, so
 * component tests replace the module at its boundary:
 *
 *   vi.mock('maplibre-gl', async () => (await import('./maplibre-fake')).maplibreFakeModule);
 *
 * Only used from tests.
 */
import { vi } from 'vitest';

type Handler = (event?: unknown) => void;

export class FakeMap {
  static instances: FakeMap[] = [];

  readonly options: Record<string, unknown>;
  readonly controls: unknown[] = [];
  readonly handlers = new Map<string, Handler[]>();
  readonly sources = new Map<string, { type: string; setData: ReturnType<typeof vi.fn> }>();
  readonly layers = new Set<string>();
  readonly images = new Set<string>();
  removed = false;

  readonly fitBounds = vi.fn();
  readonly resize = vi.fn();
  readonly triggerRepaint = vi.fn();
  readonly project = vi.fn(([lng, lat]: [number, number]) => ({ x: lng, y: lat }));
  readonly unproject = vi.fn(([x, y]: [number, number]) => ({ lng: x, lat: y }));
  readonly flyTo = vi.fn();
  readonly jumpTo = vi.fn();
  readonly setLayoutProperty = vi.fn();
  readonly getLayoutProperty = vi.fn();
  readonly getStyle = vi.fn(() => ({ layers: [...this.layers].map((id) => ({ id })) }));
  readonly setStyle = vi.fn();
  readonly setPaintProperty = vi.fn();
  readonly setFeatureState = vi.fn();
  readonly removeFeatureState = vi.fn();
  readonly zoomIn = vi.fn();
  readonly zoomOut = vi.fn();
  readonly getCanvas = vi.fn(() => ({ toDataURL: () => 'data:image/png;base64,FAKE' }));

  constructor(options: Record<string, unknown>) {
    this.options = options;
    FakeMap.instances.push(this);
  }

  on(type: string, ...rest: unknown[]): this {
    // on(type, handler) or on(type, layerId, handler)
    const handler = rest[rest.length - 1] as Handler;
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), handler]);
    return this;
  }

  off(): this {
    return this;
  }

  once(type: string, handler: Handler): this {
    return this.on(type, handler);
  }

  addControl(control: unknown): this {
    this.controls.push(control);
    return this;
  }

  getSource(id: string) {
    return this.sources.get(id);
  }

  addSource(id: string): void {
    this.sources.set(id, { type: 'geojson', setData: vi.fn() });
  }

  getLayer(id: string) {
    return this.layers.has(id) ? { id } : undefined;
  }

  addLayer(layer: { id: string }): void {
    this.layers.add(layer.id);
  }

  hasImage(id: string): boolean {
    return this.images.has(id);
  }

  addImage(id: string): void {
    this.images.add(id);
  }

  remove(): void {
    this.removed = true;
  }

  isStyleLoaded(): boolean {
    return true;
  }

  /** Simulates MapLibre firing an event. */
  emit(type: string, event?: unknown): void {
    for (const handler of this.handlers.get(type) ?? []) handler(event);
  }

  static reset(): void {
    FakeMap.instances = [];
  }
}

export class FakeNavigationControl {
  constructor(readonly options?: unknown) {}
}

export class FakeScaleControl {
  constructor(readonly options?: unknown) {}
}

export const maplibreFakeModule = {
  Map: FakeMap,
  NavigationControl: FakeNavigationControl,
  ScaleControl: FakeScaleControl,
  setWorkerUrl: vi.fn(),
};
