import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StaleBadge } from './StaleBadge';

describe('StaleBadge', () => {
  it('says results are out of date', () => {
    render(<StaleBadge />);
    expect(screen.getByText('Inputs changed — re-run to update')).toBeVisible();
  });

  it('announces itself to assistive tech as a polite live status', () => {
    render(<StaleBadge />);
    expect(screen.getByRole('status')).toHaveTextContent('Inputs changed — re-run to update');
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });
});
