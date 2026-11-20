import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { mockMatchMedia, type MediaQueryController } from '@/components/ui/test-support';
import { useMediaQuery } from './use-media-query';

let media: MediaQueryController | undefined;
afterEach(() => {
  media?.restore();
  media = undefined;
});

function Probe({ fallback }: { readonly fallback?: boolean }) {
  const matches = useMediaQuery('(min-width: 1280px)', fallback);
  return <p>{matches ? 'wide' : 'narrow'}</p>;
}

describe('useMediaQuery', () => {
  it('reports the current answer and follows changes', () => {
    media = mockMatchMedia(true);
    render(<Probe />);
    expect(screen.getByText('wide')).toBeInTheDocument();

    act(() => {
      media?.setMatches(false);
    });

    expect(screen.getByText('narrow')).toBeInTheDocument();
  });

  it('uses the fallback where matchMedia does not exist', () => {
    render(<Probe fallback />);
    expect(screen.getByText('wide')).toBeInTheDocument();
  });

  it('falls back to false when no fallback is given', () => {
    render(<Probe />);
    expect(screen.getByText('narrow')).toBeInTheDocument();
  });
});
