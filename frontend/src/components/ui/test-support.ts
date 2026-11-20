/**
 * jsdom lacks a few browser APIs that Radix primitives and our layout hooks rely on.
 * Import this module from component tests (never from app code); importing it installs the shims.
 */

class ResizeObserverStub implements ResizeObserver {
  observe(): void {
    // jsdom has no layout, so there is nothing to observe.
  }
  unobserve(): void {
    // See observe().
  }
  disconnect(): void {
    // See observe().
  }
}

/** Defines `name` on `target` only when the environment does not already provide it. */
function polyfill(target: object, name: string, value: unknown): void {
  if (name in target) return;
  Object.defineProperty(target, name, { value, configurable: true, writable: true });
}

function installDomShims(): void {
  polyfill(globalThis, 'ResizeObserver', ResizeObserverStub);

  // Radix Slider and Select use pointer capture and scrollIntoView, which jsdom does not implement.
  polyfill(Element.prototype, 'hasPointerCapture', () => false);
  polyfill(Element.prototype, 'setPointerCapture', () => undefined);
  polyfill(Element.prototype, 'releasePointerCapture', () => undefined);
  polyfill(Element.prototype, 'scrollIntoView', () => undefined);
}

installDomShims();

type MediaListener = (event: MediaQueryListEvent) => void;

export interface MediaQueryController {
  /** Changes whether the mocked query matches and notifies subscribers, as a real resize would. */
  setMatches(matches: boolean): void;
  restore(): void;
}

/**
 * Replaces window.matchMedia with a mock whose answer is controlled by the test.
 * Every query string gets the same answer, which is enough for the single-breakpoint hook.
 */
export function mockMatchMedia(initial: boolean): MediaQueryController {
  const original = Object.getOwnPropertyDescriptor(window, 'matchMedia');
  let matches = initial;
  const listeners = new Set<MediaListener>();

  const mock = (query: string): MediaQueryList => {
    const list = {
      get matches() {
        return matches;
      },
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: MediaListener) => listeners.add(listener),
      removeEventListener: (_type: string, listener: MediaListener) => listeners.delete(listener),
      addListener: (listener: MediaListener) => listeners.add(listener),
      removeListener: (listener: MediaListener) => listeners.delete(listener),
      dispatchEvent: () => true,
    };
    // The mock implements the parts of MediaQueryList the app reads.
    return list as unknown as MediaQueryList;
  };
  Object.defineProperty(window, 'matchMedia', { value: mock, configurable: true, writable: true });

  return {
    setMatches(next) {
      matches = next;
      for (const listener of listeners) {
        listener({ matches: next } as MediaQueryListEvent);
      }
    },
    restore() {
      if (original) {
        Object.defineProperty(window, 'matchMedia', original);
      } else {
        // jsdom has no matchMedia by default, so restoring means removing it again.
        Reflect.deleteProperty(window, 'matchMedia');
      }
    },
  };
}
