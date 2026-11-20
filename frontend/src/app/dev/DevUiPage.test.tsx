import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@/components/ui/test-support';
import { TestProviders } from '../test-utils';
import { DevUiPage } from './DevUiPage';

afterEach(() => {
  vi.restoreAllMocks();
});

function renderPage() {
  const user = userEvent.setup();
  render(
    <TestProviders>
      <DevUiPage />
    </TestProviders>,
  );
  return { user };
}

const SECTIONS = [
  'Colour tokens',
  'Button',
  'IconButton',
  'TextField',
  'NumberField',
  'Combobox',
  'DateRangePicker',
  'Slider',
  'Tabs',
  'Tooltip',
  'Toast',
  'Dialog',
  'Drawer',
  'Badge',
  'Skeleton',
  'EmptyState',
  'ErrorBanner',
  'Stepper',
];

describe('DevUiPage', () => {
  it('has one level-1 heading and a landmark', () => {
    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: 'UI kit' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it.each(SECTIONS)('has a section for %s', (name) => {
    renderPage();

    expect(screen.getByRole('region', { name })).toBeInTheDocument();
  });

  it('shows every button state: variants, disabled and loading', () => {
    renderPage();
    const section = screen.getByRole('region', { name: 'Button' });

    expect(within(section).getByRole('button', { name: 'Primary' })).toBeInTheDocument();
    expect(within(section).getByRole('button', { name: 'Secondary' })).toBeInTheDocument();
    expect(within(section).getByRole('button', { name: 'Ghost' })).toBeInTheDocument();
    expect(within(section).getByRole('button', { name: 'Disabled' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(within(section).getByRole('button', { name: 'Loading' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
  });

  it('shows form fields in their error and disabled states', () => {
    renderPage();
    const section = screen.getByRole('region', { name: 'TextField' });

    expect(within(section).getByRole('textbox', { name: 'With error' })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(within(section).getByRole('textbox', { name: 'Disabled' })).toBeDisabled();
  });

  it('shows stepper steps that are incomplete, complete, in error and locked', () => {
    renderPage();
    const section = screen.getByRole('region', { name: 'Stepper' });

    expect(within(section).getAllByRole('listitem').length).toBeGreaterThanOrEqual(4);
    expect(within(section).getByRole('button', { name: /Needs attention/ })).toBeInTheDocument();
    expect(within(section).getByRole('button', { name: /Complete/ })).toBeInTheDocument();
  });

  it('fires each toast tone on demand', async () => {
    const { user } = renderPage();
    const section = screen.getByRole('region', { name: 'Toast' });

    await user.click(within(section).getByRole('button', { name: 'Success toast' }));

    expect(await screen.findByText('Export ready')).toBeInTheDocument();
  });

  it('opens the dialog and the drawer', async () => {
    const { user } = renderPage();

    await user.click(
      within(screen.getByRole('region', { name: 'Dialog' })).getByRole('button', {
        name: 'Open dialog',
      }),
    );
    expect(await screen.findByRole('dialog', { name: 'Large area' })).toBeInTheDocument();
    await user.keyboard('{Escape}');

    await user.click(
      within(screen.getByRole('region', { name: 'Drawer' })).getByRole('button', {
        name: 'Open drawer',
      }),
    );
    expect(await screen.findByRole('dialog', { name: 'Inspector' })).toBeInTheDocument();
  });

  it('lists the colour tokens so contrast can be checked by eye as well as by test', () => {
    renderPage();
    const section = screen.getByRole('region', { name: 'Colour tokens' });

    expect(within(section).getByText('--accent')).toBeInTheDocument();
    expect(within(section).getByText('--danger')).toBeInTheDocument();
  });
});
