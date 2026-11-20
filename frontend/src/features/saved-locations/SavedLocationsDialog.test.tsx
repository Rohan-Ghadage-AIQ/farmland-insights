import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import '@/components/ui/test-support';
import { SavedLocationsDialog, type SavedLocationsDialogProps } from './SavedLocationsDialog';
import { makeLocation, makeRun } from './test-support';

function setup(overrides: Partial<SavedLocationsDialogProps> = {}) {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    entries: [],
    isLoading: false,
    canSave: true,
    suggestedName: 'Wheat field',
    hasResult: false,
    onSave: vi.fn(),
    onOpen: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  } satisfies SavedLocationsDialogProps;
  render(<SavedLocationsDialog {...props} />);
  return props;
}

const nameBox = () => screen.getByRole('textbox', { name: 'Name' });

describe('SavedLocationsDialog: saving', () => {
  it('starts the name box with the suggestion', () => {
    setup({ suggestedName: 'Wheat field' });
    expect(nameBox()).toHaveValue('Wheat field');
  });

  it('saves under the name typed, and confirms it', async () => {
    const { onSave } = setup();
    await userEvent.clear(nameBox());
    await userEvent.type(nameBox(), '  North field ');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith('  North field ');
    expect(screen.getByText('Saved “North field”.')).toBeInTheDocument();
  });

  it('saves when Enter is pressed in the name box', async () => {
    const { onSave } = setup();
    await userEvent.type(nameBox(), ' 2{Enter}');
    expect(onSave).toHaveBeenCalledWith('Wheat field 2');
  });

  it('clears the confirmation once the name is edited again', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText(/^Saved “/)).toBeInTheDocument();
    await userEvent.type(nameBox(), 'x');
    expect(screen.queryByText(/^Saved “/)).not.toBeInTheDocument();
  });

  it('cannot save an empty name', async () => {
    const { onSave } = setup();
    await userEvent.clear(nameBox());
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('explains that a field is needed first, and cannot save without one', async () => {
    const { onSave } = setup({ canSave: false });
    expect(screen.getByText(/draw, upload or load a field first/i)).toBeInTheDocument();
    expect(nameBox()).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('says what will be saved, including results when there are some', () => {
    setup({ hasResult: false });
    expect(screen.getByText('Saves the field, crop, dates and grid size.')).toBeInTheDocument();
  });

  it('mentions the results when they will be kept', () => {
    setup({ hasResult: true });
    expect(screen.getByText(/and the results on screen/i)).toBeInTheDocument();
  });

  it('offers to update a location that already has that name (any case)', async () => {
    setup({ entries: [makeLocation({ name: 'North field' })] });
    await userEvent.clear(nameBox());
    await userEvent.type(nameBox(), 'north FIELD');
    expect(
      screen.getByText(/“North field” already exists and will be updated/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Update' })).toBeInTheDocument();
  });
});

describe('SavedLocationsDialog: the list', () => {
  it('shows each location with its crop, period, area and save time', () => {
    setup({ entries: [makeLocation({ name: 'North field' })] });
    const list = screen.getByRole('list', { name: 'Saved locations' });
    expect(within(list).getByText('North field')).toBeInTheDocument();
    expect(
      within(list).getByText(/Wheat · 2026-11-01 to 2026-11-07 · [\d.,]+ ha/),
    ).toBeInTheDocument();
    expect(within(list).getByText(/^Saved /)).toBeInTheDocument();
  });

  it('flags the locations that include results', () => {
    setup({
      entries: [
        makeLocation({ id: 'a', name: 'With results', run: makeRun() }),
        makeLocation({ id: 'b', name: 'Field only' }),
      ],
    });
    expect(screen.getAllByText('Includes results')).toHaveLength(1);
  });

  it('opens a location', async () => {
    const location = makeLocation({ name: 'North field' });
    const { onOpen } = setup({ entries: [location] });
    await userEvent.click(screen.getByRole('button', { name: 'Open North field' }));
    expect(onOpen).toHaveBeenCalledWith(location);
  });

  it('asks before deleting, and deletes only once confirmed', async () => {
    const { onDelete } = setup({ entries: [makeLocation({ id: 'a', name: 'North field' })] });
    await userEvent.click(screen.getByRole('button', { name: 'Delete North field' }));
    expect(onDelete).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Confirm delete North field' }));
    expect(onDelete).toHaveBeenCalledWith('a');
  });

  it('keeps a location when the person changes their mind', async () => {
    const { onDelete } = setup({ entries: [makeLocation({ name: 'North field' })] });
    await userEvent.click(screen.getByRole('button', { name: 'Delete North field' }));
    await userEvent.click(screen.getByRole('button', { name: 'Keep' }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Open North field' })).toBeInTheDocument();
  });

  it('shows an empty message with nothing saved', () => {
    setup();
    expect(screen.getByText('Nothing saved yet')).toBeInTheDocument();
  });

  it('shows a loading state while locations load', () => {
    setup({ isLoading: true });
    expect(screen.getByText('Loading saved locations…')).toBeInTheDocument();
    expect(screen.queryByText('Nothing saved yet')).not.toBeInTheDocument();
  });

  it('renders nothing while closed', () => {
    setup({ open: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
