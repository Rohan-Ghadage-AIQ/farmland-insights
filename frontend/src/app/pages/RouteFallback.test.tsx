import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RouteFallback } from './RouteFallback';

describe('RouteFallback', () => {
  it('announces loading politely, so a slow route is never a blank screen', () => {
    render(<RouteFallback />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading');
  });
});
