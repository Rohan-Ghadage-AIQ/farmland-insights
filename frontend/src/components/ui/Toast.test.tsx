import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider, useToast, type ToastOptions } from './Toast';
import './test-support';

function Launcher({ options }: { readonly options: ToastOptions }) {
  const { toast } = useToast();
  return (
    <button
      type="button"
      onClick={() => {
        toast(options);
      }}
    >
      Fire
    </button>
  );
}

function setup(options: ToastOptions) {
  const user = userEvent.setup();
  render(
    <ToastProvider>
      <Launcher options={options} />
    </ToastProvider>,
  );
  return { user, fire: () => user.click(screen.getByRole('button', { name: 'Fire' })) };
}

describe('Toast', () => {
  it('shows nothing until one is fired, then shows title and description', async () => {
    const { fire } = setup({
      title: 'Session expires in 5 min',
      description: 'Stay signed in to keep working.',
    });
    expect(screen.queryByText('Session expires in 5 min')).not.toBeInTheDocument();

    await fire();

    expect(await screen.findByText('Session expires in 5 min')).toBeInTheDocument();
    expect(screen.getByText('Stay signed in to keep working.')).toBeInTheDocument();
  });

  it('uses a labelled notifications region so it can be reached from the keyboard', async () => {
    const { fire } = setup({ title: 'Saved' });

    await fire();
    await screen.findByText('Saved');

    expect(screen.getByRole('region', { name: /notifications/i })).toBeInTheDocument();
  });

  it('states the tone in words as well as colour', async () => {
    const { fire } = setup({ title: 'Export ready', tone: 'success' });

    await fire();

    expect(await screen.findByText('Success')).toBeInTheDocument();
  });

  it('runs the action and then dismisses', async () => {
    const onAction = vi.fn();
    const { fire, user } = setup({
      title: 'Session expires soon',
      action: { label: 'Stay signed in', onAction },
    });
    await fire();

    await user.click(await screen.findByRole('button', { name: 'Stay signed in' }));

    expect(onAction).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.queryByText('Session expires soon')).not.toBeInTheDocument();
    });
  });

  it('can be dismissed with its close button', async () => {
    const { fire, user } = setup({ title: 'Hello' });
    await fire();

    await user.click(await screen.findByRole('button', { name: 'Dismiss notification' }));

    await waitFor(() => {
      expect(screen.queryByText('Hello')).not.toBeInTheDocument();
    });
  });

  it('dismisses itself after its duration', async () => {
    const { fire } = setup({ title: 'Brief', duration: 1000 });
    // A long-enough duration that a loaded machine (coverage runs) still sees the toast appear.
    await fire();
    expect(await screen.findByText('Brief')).toBeInTheDocument();

    await waitFor(
      () => {
        expect(screen.queryByText('Brief')).not.toBeInTheDocument();
      },
      { timeout: 5000 },
    );
  });

  it('stacks several toasts', async () => {
    const user = userEvent.setup();
    function Two() {
      const { toast } = useToast();
      return (
        <button
          type="button"
          onClick={() => {
            toast({ title: 'First' });
            toast({ title: 'Second' });
          }}
        >
          Fire
        </button>
      );
    }
    render(
      <ToastProvider>
        <Two />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Fire' }));

    expect(await screen.findByText('First')).toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();
  });

  it('lets the caller dismiss a toast programmatically', async () => {
    const user = userEvent.setup();
    function Programmatic() {
      const { toast, dismiss } = useToast();
      return (
        <>
          <button
            type="button"
            onClick={() => {
              const id = toast({ title: 'Working', duration: 60_000 });
              window.setTimeout(() => {
                dismiss(id);
              }, 0);
            }}
          >
            Fire
          </button>
        </>
      );
    }
    render(
      <ToastProvider>
        <Programmatic />
      </ToastProvider>,
    );

    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Fire' }));
    });

    await waitFor(() => {
      expect(screen.queryByText('Working')).not.toBeInTheDocument();
    });
  });

  it('refuses to be used outside its provider, with a clear message', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Launcher options={{ title: 'x' }} />)).toThrow(/ToastProvider/);
    spy.mockRestore();
  });
});
