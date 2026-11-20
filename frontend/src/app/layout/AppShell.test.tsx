import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { mockMatchMedia, type MediaQueryController } from '@/components/ui/test-support';
import { TestProviders } from '../test-utils';
import { AppShell } from './AppShell';
import { useShell } from './ShellContext';

let media: MediaQueryController | undefined;
afterEach(() => {
  media?.restore();
  media = undefined;
});

function OpenInspectorButton() {
  const { openInspector } = useShell();
  return (
    <button type="button" onClick={openInspector}>
      Select a cell
    </button>
  );
}

function renderShell({ wide = true }: { readonly wide?: boolean } = {}) {
  media = mockMatchMedia(wide);
  const user = userEvent.setup();
  render(
    <TestProviders>
      <AppShell
        healthSlot={<span>health slot</span>}
        userSlot={<span>user slot</span>}
        setupPanel={<p>setup content</p>}
        map={
          <>
            <p>map content</p>
            <OpenInspectorButton />
          </>
        }
        inspector={<p>inspector content</p>}
      />
    </TestProviders>,
  );
  return { user };
}

describe('AppShell', () => {
  it('provides banner, setup, map and inspector landmarks, each holding its slot', () => {
    renderShell();

    expect(
      within(screen.getByRole('banner')).getByRole('heading', {
        level: 1,
        name: 'Farmland Insights',
      }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('complementary', { name: 'Setup' })).getByText('setup content'),
    ).toBeInTheDocument();
    expect(within(screen.getByRole('main')).getByText('map content')).toBeInTheDocument();
    expect(
      within(screen.getByRole('complementary', { name: 'Inspector' })).getByText(
        'inspector content',
      ),
    ).toBeInTheDocument();
  });

  it('puts the health slot, user slot and theme toggle in the top bar', () => {
    renderShell();
    const bar = screen.getByRole('banner');

    expect(within(bar).getByText('health slot')).toBeInTheDocument();
    expect(within(bar).getByText('user slot')).toBeInTheDocument();
    expect(
      within(bar).getByRole('button', { name: /Switch to (dark|light) theme/ }),
    ).toBeInTheDocument();
  });

  it('offers a skip link straight to the map', () => {
    renderShell();

    expect(screen.getByRole('link', { name: 'Skip to map' })).toHaveAttribute('href', '#map');
    expect(screen.getByRole('main')).toHaveAttribute('id', 'map');
  });

  it('on a wide screen shows no desktop notice', () => {
    renderShell({ wide: true });

    expect(screen.queryByText(/best on a desktop screen/i)).not.toBeInTheDocument();
  });

  it('collapses and restores the inspector with its toggle, reporting the state', async () => {
    const { user } = renderShell();
    const toggle = screen.getByRole('button', { name: 'Hide inspector' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    await user.click(toggle);

    expect(screen.queryByRole('complementary', { name: 'Inspector' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show inspector' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );

    await user.click(screen.getByRole('button', { name: 'Show inspector' }));

    expect(screen.getByRole('complementary', { name: 'Inspector' })).toBeInTheDocument();
  });

  it('keeps the inspector mounted while collapsed so its state is not lost', async () => {
    const { user } = renderShell();

    await user.click(screen.getByRole('button', { name: 'Hide inspector' }));

    expect(screen.getByText('inspector content')).toBeInTheDocument();
  });

  it('lets content in a slot open the inspector through useShell', async () => {
    const { user } = renderShell();
    await user.click(screen.getByRole('button', { name: 'Hide inspector' }));

    await user.click(screen.getByRole('button', { name: 'Select a cell' }));

    expect(screen.getByRole('complementary', { name: 'Inspector' })).toBeVisible();
  });

  it('below 1280px shows a polite notice that can be dismissed', async () => {
    const { user } = renderShell({ wide: false });

    const notice = screen.getByRole('status');
    expect(notice).toHaveTextContent('Best on a desktop screen');

    await user.click(within(notice).getByRole('button', { name: 'Dismiss' }));

    expect(screen.queryByText(/best on a desktop screen/i)).not.toBeInTheDocument();
  });

  it('below 1280px the inspector is a drawer that starts closed and opens on demand', async () => {
    const { user } = renderShell({ wide: false });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Inspector' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show inspector' }));

    const drawer = screen.getByRole('dialog', { name: 'Inspector' });
    expect(within(drawer).getByText('inspector content')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens the drawer when content selects something on a narrow screen', async () => {
    const { user } = renderShell({ wide: false });

    await user.click(screen.getByRole('button', { name: 'Select a cell' }));

    expect(screen.getByRole('dialog', { name: 'Inspector' })).toBeInTheDocument();
  });

  it('keeps the map visible and the setup panel in place on a narrow screen', () => {
    renderShell({ wide: false });

    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Setup' })).toBeInTheDocument();
  });

  it('adapts when the window is resized across the breakpoint', () => {
    renderShell({ wide: true });
    expect(screen.getByRole('complementary', { name: 'Inspector' })).toBeInTheDocument();

    act(() => {
      media?.setMatches(false);
    });

    expect(screen.queryByRole('complementary', { name: 'Inspector' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Best on a desktop screen');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('refuses useShell outside the shell', () => {
    function Bad() {
      useShell();
      return null;
    }
    expect(() => render(<Bad />)).toThrow(/AppShell/);
  });
});
