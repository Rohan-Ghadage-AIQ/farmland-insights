import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FakeMap,
  FakeNavigationControl,
  FakeScaleControl,
  maplibreFakeModule,
} from './maplibre-fake';
import { createMapController } from './map-controller';

vi.mock('maplibre-gl', async () => (await import('./maplibre-fake')).maplibreFakeModule);

const INIT = {
  style: 'https://example.com/style.json',
  center: [79, 22] as [number, number],
  zoom: 4,
};

function latestMap(): FakeMap {
  const map = FakeMap.instances[FakeMap.instances.length - 1];
  if (map === undefined) throw new Error('no map was created');
  return map;
}

describe('createMapController', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    FakeMap.reset();
    container = document.createElement('div');
  });

  afterEach(() => {
    FakeMap.reset();
  });

  it('has no map until attached', () => {
    expect(createMapController().getSnapshot()).toBeNull();
  });

  it('creates the map with preserveDrawingBuffer so the canvas can be exported as PNG', () => {
    createMapController().attach(container, INIT);
    const { options } = latestMap();
    expect(options.container).toBe(container);
    expect(options.style).toBe(INIT.style);
    expect(options.center).toEqual(INIT.center);
    expect(options.zoom).toBe(4);
    expect(options.canvasContextAttributes).toEqual({ preserveDrawingBuffer: true });
  });

  it('points MapLibre at the bundled worker before creating the map', () => {
    createMapController().attach(container, INIT);
    expect(maplibreFakeModule.setWorkerUrl).toHaveBeenCalledWith(
      expect.stringContaining('maplibre-gl-worker'),
    );
  });

  it('limits zoom so stretched imagery stays usable', () => {
    createMapController().attach(container, INIT);
    expect(latestMap().options.maxZoom).toBe(20);
  });

  it('is a flat 2D map: no rotation or pitch', () => {
    createMapController().attach(container, INIT);
    expect(latestMap().options).toMatchObject({ dragRotate: false, maxPitch: 0 });
  });

  it('adds zoom controls without a compass, plus a scale bar', () => {
    createMapController().attach(container, INIT);
    const { controls } = latestMap();
    const nav = controls.find((c) => c instanceof FakeNavigationControl);
    expect(nav).toBeInstanceOf(FakeNavigationControl);
    expect(nav).toMatchObject({ options: { showCompass: false } });
    expect(controls.some((c) => c instanceof FakeScaleControl)).toBe(true);
  });

  it('keeps the attribution control on (OSM licence requirement)', () => {
    createMapController().attach(container, INIT);
    expect(latestMap().options.attributionControl).not.toBe(false);
  });

  it('publishes the map and typed actions to subscribers once attached', () => {
    const controller = createMapController();
    const listener = vi.fn();
    controller.subscribe(listener);
    controller.attach(container, INIT);
    expect(listener).toHaveBeenCalledTimes(1);
    const snapshot = controller.getSnapshot();
    expect(snapshot?.map).toBe(latestMap());
    expect(typeof snapshot?.actions.fitBounds).toBe('function');
    expect(typeof snapshot?.actions.setData).toBe('function');
    expect(typeof snapshot?.actions.setFeatureState).toBe('function');
    expect(typeof snapshot?.actions.resize).toBe('function');
  });

  it('keeps a stable snapshot between notifications (required by useSyncExternalStore)', () => {
    const controller = createMapController();
    controller.attach(container, INIT);
    expect(controller.getSnapshot()).toBe(controller.getSnapshot());
  });

  it('runs style-ready callbacks on style.load, and again after a style change', () => {
    const controller = createMapController();
    controller.attach(container, INIT);
    const callback = vi.fn();
    controller.getSnapshot()?.actions.onStyleReady(callback);
    expect(callback).not.toHaveBeenCalled();
    latestMap().emit('style.load');
    expect(callback).toHaveBeenCalledTimes(1);

    controller.setStyle('https://example.com/other.json');
    expect(latestMap().setStyle).toHaveBeenCalledWith('https://example.com/other.json', {
      diff: false,
    });
    latestMap().emit('style.load');
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('detach removes the map, clears the snapshot and notifies', () => {
    const controller = createMapController();
    const detach = controller.attach(container, INIT);
    const map = latestMap();
    const listener = vi.fn();
    controller.subscribe(listener);
    detach();
    expect(map.removed).toBe(true);
    expect(controller.getSnapshot()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('survives React StrictMode: attach, detach, attach creates a second working map', () => {
    const controller = createMapController();
    controller.attach(container, INIT)();
    controller.attach(container, INIT);
    expect(FakeMap.instances).toHaveLength(2);
    expect(FakeMap.instances[0]?.removed).toBe(true);
    expect(controller.getSnapshot()?.map).toBe(FakeMap.instances[1]);
  });

  it('ignores setStyle when no map is attached', () => {
    expect(() => {
      createMapController().setStyle('x');
    }).not.toThrow();
  });
});
