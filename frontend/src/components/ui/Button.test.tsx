import { render, screen } from '@testing-library/react';
import type { SyntheticEvent } from 'react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';
import './test-support';

describe('Button', () => {
  it('is a non-submitting button by default', () => {
    render(<Button>Save</Button>);

    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('type', 'button');
  });

  it('calls onClick on click and on keyboard activation', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<Button onClick={onClick}>Save</Button>);

    await user.click(screen.getByRole('button', { name: 'Save' }));
    await user.keyboard('{Enter}');
    await user.keyboard(' ');

    expect(onClick).toHaveBeenCalledTimes(3);
  });

  it('when disabled it stays focusable (so a tooltip can explain why) but ignores clicks', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <Button disabled onClick={onClick}>
        Analyze
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Analyze' });

    await user.click(button);
    button.focus();
    await user.keyboard('{Enter}');

    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveFocus();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('when disabled it does not submit its form', async () => {
    const onSubmit = vi.fn((event: SyntheticEvent) => {
      event.preventDefault();
    });
    const user = userEvent.setup();
    render(
      <form onSubmit={onSubmit}>
        <Button type="submit" disabled>
          Go
        </Button>
      </form>,
    );

    await user.click(screen.getByRole('button', { name: 'Go' }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits its form when enabled', async () => {
    const onSubmit = vi.fn((event: SyntheticEvent) => {
      event.preventDefault();
    });
    const user = userEvent.setup();
    render(
      <form onSubmit={onSubmit}>
        <Button type="submit">Go</Button>
      </form>,
    );

    await user.click(screen.getByRole('button', { name: 'Go' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('when loading it keeps its label, announces busy and ignores clicks', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <Button loading onClick={onClick}>
        Analyze
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Analyze' });

    await user.click(button);

    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(onClick).not.toHaveBeenCalled();
  });

  it('offers primary, secondary and ghost variants, with primary as the default', () => {
    render(
      <>
        <Button>Default</Button>
        <Button variant="secondary">Second</Button>
        <Button variant="ghost">Third</Button>
      </>,
    );

    expect(screen.getByRole('button', { name: 'Default' })).toHaveAttribute(
      'data-variant',
      'primary',
    );
    expect(screen.getByRole('button', { name: 'Second' })).toHaveAttribute(
      'data-variant',
      'secondary',
    );
    expect(screen.getByRole('button', { name: 'Third' })).toHaveAttribute('data-variant', 'ghost');
  });

  it('can render as another element, such as a link, with the same look', () => {
    render(
      <Button asChild variant="secondary">
        <a href="/login">Sign in</a>
      </Button>,
    );

    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'data-variant',
      'secondary',
    );
  });

  it('forwards a ref to the underlying element', () => {
    const ref = { current: null as HTMLButtonElement | null };
    render(<Button ref={ref}>Ref</Button>);

    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });
});
