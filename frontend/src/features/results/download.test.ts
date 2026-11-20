import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadDataUrl, downloadText } from './download';

describe('downloadText', () => {
  let clickSpy: ReturnType<typeof vi.fn<() => void>>;
  let createObjectUrl: ReturnType<typeof vi.fn>;
  let revokeObjectUrl: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    clickSpy = vi.fn<() => void>();
    createObjectUrl = vi.fn(() => 'blob:fake-url');
    revokeObjectUrl = vi.fn();
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: createObjectUrl,
      revokeObjectURL: revokeObjectUrl,
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      clickSpy();
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates a Blob URL, clicks a hidden anchor with the given filename, then revokes the URL', () => {
    downloadText('a,b\n1,2', 'cells.csv', 'text/csv');

    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    const [blob] = createObjectUrl.mock.calls[0] as [Blob];
    expect(blob.type).toBe('text/csv');
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:fake-url');
  });

  it('does not leave the anchor attached to the document', () => {
    downloadText('{}', 'data.geojson', 'application/geo+json');
    expect(document.querySelector('a[download]')).toBeNull();
  });
});

describe('downloadDataUrl', () => {
  it('sets the anchor href directly from the data URL and clicks it, without touching URL.createObjectURL', () => {
    const createObjectUrl = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL: createObjectUrl });
    const clickSpy = vi.fn<() => void>();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      clickSpy();
    });

    downloadDataUrl('data:image/png;base64,AAAA', 'map.png');

    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(createObjectUrl).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
