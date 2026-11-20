import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { Drawer } from './Drawer';
import './test-support';

describe.each([
  ['Dialog', Dialog],
  ['Drawer', Drawer],
] as const)('%s', (_name, Surface) => {
  it('renders nothing while closed', () => {
    render(
      <Surface open={false} onOpenChange={vi.fn()} title="Confirm">
        Body
      </Surface>,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('is a modal dialog named by its title and described by its description', () => {
    render(
      <Surface open onOpenChange={vi.fn()} title="Large area" description="This may take minutes.">
        Body text
      </Surface>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Large area' });
    expect(dialog).toHaveAccessibleDescription('This may take minutes.');
    expect(dialog).toHaveTextContent('Body text');
  });

  it('works without a description', () => {
    render(
      <Surface open onOpenChange={vi.fn()} title="Plain">
        Body
      </Surface>,
    );

    expect(screen.getByRole('dialog', { name: 'Plain' })).not.toHaveAttribute('aria-describedby');
  });

  it('asks to close on Escape and on the close button', async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Surface open onOpenChange={onOpenChange} title="Close me">
        Body
      </Surface>,
    );

    await user.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenLastCalledWith(false);

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onOpenChange).toHaveBeenCalledTimes(2);
  });

  it('moves focus inside when opened and gives it back when closed', async () => {
    const user = userEvent.setup();
    function Host() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <Button
            onClick={() => {
              setOpen(true);
            }}
          >
            Open
          </Button>
          <Surface open={open} onOpenChange={setOpen} title="Focus test">
            <Button>Inside</Button>
          </Surface>
        </>
      );
    }
    render(<Host />);
    const opener = screen.getByRole('button', { name: 'Open' });

    await user.click(opener);
    expect(screen.getByRole('dialog', { name: 'Focus test' })).toContainElement(
      document.activeElement as HTMLElement,
    );

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // Radix restores focus on the next tick, after the layer has unmounted.
    await waitFor(() => {
      expect(opener).toHaveFocus();
    });
  });

  it('renders a footer for actions', () => {
    render(
      <Surface open onOpenChange={vi.fn()} title="With footer" footer={<Button>Continue</Button>}>
        Body
      </Surface>,
    );

    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
  });
});

describe('Drawer', () => {
  it('slides in from the right by default and can open from the left', () => {
    const { rerender } = render(
      <Drawer open onOpenChange={vi.fn()} title="Inspector">
        Body
      </Drawer>,
    );
    expect(screen.getByRole('dialog', { name: 'Inspector' })).toHaveAttribute('data-side', 'right');

    rerender(
      <Drawer open onOpenChange={vi.fn()} title="Inspector" side="left">
        Body
      </Drawer>,
    );
    expect(screen.getByRole('dialog', { name: 'Inspector' })).toHaveAttribute('data-side', 'left');
  });
});
