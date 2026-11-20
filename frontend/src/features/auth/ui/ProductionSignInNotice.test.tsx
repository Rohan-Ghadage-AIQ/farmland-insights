import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProductionSignInNotice } from './ProductionSignInNotice';

describe('ProductionSignInNotice', () => {
  it('explains that production sign-in is pending and points at creating an account', () => {
    render(<ProductionSignInNotice />);
    expect(screen.getByText(/production sign-in/i)).toBeInTheDocument();
    expect(screen.getByText(/create account/i)).toBeInTheDocument();
  });
});
