import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TextArea, TextField } from './TextField';
import './test-support';

describe('TextField', () => {
  it('labels the input so it can be found by its label', () => {
    render(<TextField label="Email" />);

    expect(screen.getByRole('textbox', { name: 'Email' })).toBeInTheDocument();
  });

  it('links description and error to the input for screen readers', () => {
    render(
      <TextField label="Email" description="We never share it." error="Enter a valid email." />,
    );
    const input = screen.getByRole('textbox', { name: 'Email' });

    expect(input).toHaveAccessibleDescription('We never share it. Enter a valid email.');
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('is not marked invalid when there is no error', () => {
    render(<TextField label="Email" />);

    expect(screen.getByRole('textbox', { name: 'Email' })).not.toHaveAttribute('aria-invalid');
  });

  it('reports typing through onChange', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<TextField label="Email" onChange={onChange} />);

    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'ab');

    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('marks required fields on the input and shows a visual marker', () => {
    render(<TextField label="Email" required />);

    expect(screen.getByRole('textbox', { name: /Email/ })).toBeRequired();
  });

  it('supports disabled and read-only states', async () => {
    const user = userEvent.setup();
    render(
      <>
        <TextField label="Off" disabled />
        <TextField label="Fixed" readOnly defaultValue="locked" />
      </>,
    );

    expect(screen.getByRole('textbox', { name: 'Off' })).toBeDisabled();
    await user.type(screen.getByRole('textbox', { name: 'Fixed' }), 'x');
    expect(screen.getByRole('textbox', { name: 'Fixed' })).toHaveValue('locked');
  });

  it('shows a suffix such as a unit next to the value', () => {
    render(<TextField label="Width" suffix="m" />);

    expect(screen.getByText('m')).toBeInTheDocument();
  });

  it('forwards a ref to the input', () => {
    const ref = { current: null as HTMLInputElement | null };
    render(<TextField label="Email" ref={ref} />);

    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });

  it('passes native attributes such as type and autocomplete through', () => {
    render(<TextField label="Password" type="password" autoComplete="current-password" />);

    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'current-password');
  });
});

describe('TextArea', () => {
  it('is a labelled multi-line text box with the same error wiring', () => {
    render(<TextArea label="GeoJSON" error="Not valid JSON." rows={4} />);
    const area = screen.getByRole('textbox', { name: 'GeoJSON' });

    expect(area.tagName).toBe('TEXTAREA');
    expect(area).toHaveAccessibleDescription('Not valid JSON.');
    expect(area).toHaveAttribute('aria-invalid', 'true');
  });
});
