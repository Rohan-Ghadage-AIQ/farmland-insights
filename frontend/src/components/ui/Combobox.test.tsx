import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Combobox, type ComboboxOption } from './Combobox';
import './test-support';

const OPTIONS: readonly ComboboxOption[] = [
  {
    value: 'wheat',
    label: 'Wheat · Gehu',
    secondary: 'Cereals — C3 temperate',
    keywords: ['Wheat', 'Gehu'],
  },
  {
    value: 'rice',
    label: 'Rice · Chawal',
    secondary: 'Cereals — C4 tropical',
    keywords: ['Rice', 'Chawal', 'Dhan'],
  },
  { value: 'cafe', label: 'Café plant', keywords: ['Cafe'] },
];

function setup(props: Partial<React.ComponentProps<typeof Combobox>> = {}) {
  const onValueChange = vi.fn();
  const user = userEvent.setup();
  render(
    <Combobox
      label="Crop"
      options={OPTIONS}
      value={null}
      onValueChange={onValueChange}
      {...props}
    />,
  );
  return { user, onValueChange, input: screen.getByRole('combobox', { name: 'Crop' }) };
}

describe('Combobox', () => {
  it('is a labelled combobox, collapsed at first', () => {
    const { input } = setup();

    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input).toHaveAttribute('aria-autocomplete', 'list');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('opens with every option on ArrowDown', async () => {
    const { user, input } = setup();

    await user.click(input);
    await user.keyboard('{ArrowDown}');

    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('shows secondary text next to the label', async () => {
    const { user, input } = setup();

    await user.click(input);
    await user.keyboard('{ArrowDown}');

    const wheat = screen.getByRole('option', { name: /Wheat/ });
    expect(within(wheat).getByText('Cereals — C3 temperate')).toBeInTheDocument();
  });

  it('filters as you type, matching either name case-insensitively', async () => {
    const { user, input } = setup();

    await user.type(input, 'GEHU');

    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option', { name: /Wheat/ })).toBeInTheDocument();
  });

  it('ignores accents when matching', async () => {
    const { user, input } = setup();

    await user.type(input, 'cafe');
    expect(screen.getByRole('option', { name: /Café/ })).toBeInTheDocument();

    await user.clear(input);
    await user.type(input, 'café');
    expect(screen.getByRole('option', { name: /Café/ })).toBeInTheDocument();
  });

  it('says so when nothing matches, politely', async () => {
    const { user, input } = setup({ emptyMessage: 'No crop matches that name.' });

    await user.type(input, 'zzz');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('No crop matches that name.');
  });

  it('moves the active option with the arrow keys and exposes it through aria-activedescendant', async () => {
    const { user, input } = setup();

    await user.click(input);
    await user.keyboard('{ArrowDown}');
    const first = screen.getAllByRole('option')[0];
    expect(input).toHaveAttribute('aria-activedescendant', first?.id);

    await user.keyboard('{ArrowDown}');
    const second = screen.getAllByRole('option')[1];
    expect(input).toHaveAttribute('aria-activedescendant', second?.id);
    expect(second).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(input).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[2]?.id);
  });

  it('selects the active option with Enter and shows its label', async () => {
    const { user, input, onValueChange } = setup();

    await user.type(input, 'rice');
    await user.keyboard('{Enter}');

    expect(onValueChange).toHaveBeenCalledWith('rice');
    expect(input).toHaveValue('Rice · Chawal');
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });

  it('selects an option on click', async () => {
    const { user, input, onValueChange } = setup();

    await user.click(input);
    await user.keyboard('{ArrowDown}');
    await user.click(screen.getByRole('option', { name: /Rice/ }));

    expect(onValueChange).toHaveBeenCalledWith('rice');
  });

  it('closes on Escape without changing the selection', async () => {
    const { user, input, onValueChange } = setup();

    await user.click(input);
    await user.keyboard('{ArrowDown}{Escape}');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('shows the selected option label for a controlled value', () => {
    setup({ value: 'wheat' });

    expect(screen.getByRole('combobox', { name: 'Crop' })).toHaveValue('Wheat · Gehu');
  });

  it('puts the text back to the selected label when the user leaves with unmatched text', async () => {
    const { user, input } = setup({ value: 'wheat' });

    await user.clear(input);
    await user.type(input, 'zzz');
    await user.tab();

    expect(input).toHaveValue('Wheat · Gehu');
  });

  it('shows every option again when reopened, not only the ones matching the selected label', async () => {
    const { user, input } = setup({ value: 'wheat' });

    await user.click(input);
    await user.keyboard('{ArrowDown}');

    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('groups options under headings, such as recent picks first', async () => {
    const { user, input } = setup({
      options: [
        { value: 'rice', label: 'Rice', group: 'Recent' },
        { value: 'wheat', label: 'Wheat', group: 'All crops' },
        { value: 'cafe', label: 'Cafe', group: 'All crops' },
      ],
    });

    await user.click(input);
    await user.keyboard('{ArrowDown}');

    expect(screen.getByRole('group', { name: 'Recent' })).toBeInTheDocument();
    expect(
      within(screen.getByRole('group', { name: 'All crops' })).getAllByRole('option'),
    ).toHaveLength(2);
  });

  it('shows an error and marks the input invalid', () => {
    setup({ error: 'Pick a crop to continue.' });
    const input = screen.getByRole('combobox', { name: 'Crop' });

    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Pick a crop to continue.');
  });

  it('can be disabled', async () => {
    const { user, input } = setup({ disabled: true });

    expect(input).toBeDisabled();
    await user.click(input);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
