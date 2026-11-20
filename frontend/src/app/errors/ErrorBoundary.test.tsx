import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@/components/ui/test-support';
import { AppErrorBoundary } from './AppErrorBoundary';
import { ErrorBoundary } from './ErrorBoundary';
import { PanelErrorBoundary } from './PanelErrorBoundary';

function Boom({ message = 'kaboom' }: { readonly message?: string }): never {
  throw new Error(message);
}

beforeEach(() => {
  // React and the logger both report caught errors to the console; keep test output readable.
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ErrorBoundary', () => {
  it('renders its children when nothing throws', () => {
    render(
      <ErrorBoundary fallback={() => <p>fallback</p>}>
        <p>fine</p>
      </ErrorBoundary>,
    );

    expect(screen.getByText('fine')).toBeInTheDocument();
    expect(screen.queryByText('fallback')).not.toBeInTheDocument();
  });

  it('shows the fallback with the error and reports it once', () => {
    const onError = vi.fn();
    render(
      <ErrorBoundary fallback={({ error }) => <p>failed: {error.message}</p>} onError={onError}>
        <Boom />
      </ErrorBoundary>,
    );

    expect(screen.getByText('failed: kaboom')).toBeInTheDocument();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(Error);
  });

  it('turns thrown non-errors into errors', () => {
    function ThrowsString(): never {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- the point of this test
      throw 'just a string';
    }
    render(
      <ErrorBoundary fallback={({ error }) => <p>failed: {error.message}</p>}>
        <ThrowsString />
      </ErrorBoundary>,
    );

    expect(screen.getByText('failed: just a string')).toBeInTheDocument();
  });

  it('recovers when reset is called and the child no longer throws', async () => {
    const user = userEvent.setup();
    let shouldThrow = true;
    function Flaky() {
      if (shouldThrow) throw new Error('flaky');
      return <p>recovered</p>;
    }
    render(
      <ErrorBoundary
        fallback={({ reset }) => (
          <button type="button" onClick={reset}>
            retry
          </button>
        )}
      >
        <Flaky />
      </ErrorBoundary>,
    );

    shouldThrow = false;
    await user.click(screen.getByRole('button', { name: 'retry' }));

    expect(screen.getByText('recovered')).toBeInTheDocument();
  });

  it('resets by itself when a reset key changes', async () => {
    const user = userEvent.setup();
    function Host() {
      const [key, setKey] = useState(0);
      return (
        <>
          <button
            type="button"
            onClick={() => {
              setKey(1);
            }}
          >
            change input
          </button>
          <ErrorBoundary fallback={() => <p>fallback</p>} resetKeys={[key]}>
            {key === 0 ? <Boom /> : <p>works now</p>}
          </ErrorBoundary>
        </>
      );
    }
    render(<Host />);
    expect(screen.getByText('fallback')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'change input' }));

    expect(screen.getByText('works now')).toBeInTheDocument();
  });
});

describe('PanelErrorBoundary', () => {
  it('contains the failure to its own panel and offers a retry', async () => {
    const user = userEvent.setup();
    let shouldThrow = true;
    function Flaky() {
      if (shouldThrow) throw new Error('inspector blew up');
      return <p>inspector content</p>;
    }
    render(
      <>
        <PanelErrorBoundary label="the inspector">
          <Flaky />
        </PanelErrorBoundary>
        <p>map still here</p>
      </>,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent("Couldn't show the inspector");
    expect(screen.getByText('map still here')).toBeInTheDocument();

    shouldThrow = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(screen.getByText('inspector content')).toBeInTheDocument();
  });

  it('keeps the error message out of the headline and puts it under Technical details', async () => {
    const user = userEvent.setup();
    render(
      <PanelErrorBoundary label="the setup panel">
        <Boom message="secret internals" />
      </PanelErrorBoundary>,
    );

    expect(screen.queryByText(/secret internals/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Technical details' }));

    expect(screen.getByTestId('error-details')).toHaveTextContent('secret internals');
  });
});

describe('AppErrorBoundary', () => {
  it('shows a full-page failure with a reload action', async () => {
    const onReload = vi.fn();
    const user = userEvent.setup();
    render(
      <AppErrorBoundary onReload={onReload}>
        <Boom />
      </AppErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
    expect(screen.getByRole('main')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reload page' }));

    expect(onReload).toHaveBeenCalledTimes(1);
  });
});
