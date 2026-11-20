import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm, useWatch } from 'react-hook-form';
import { describe, expect, it } from 'vitest';
import '@/components/ui/test-support';
import type { AnalysisSetupFormValues } from './schema';
import { defaultAnalysisSetupValues } from './schema';
import { CropField } from './CropField';

function Harness({ disabled = false }: { readonly disabled?: boolean }) {
  const { control } = useForm<AnalysisSetupFormValues>({
    defaultValues: defaultAnalysisSetupValues(),
  });
  const crop = useWatch({ control, name: 'crop' });
  return (
    <>
      <CropField control={control} disabled={disabled} />
      <output data-testid="crop-value">{crop}</output>
    </>
  );
}

describe('CropField', () => {
  it('lets a person find a crop by its English name and records the choice', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByRole('combobox', { name: 'Crop' }), 'Whea');
    await user.click(await screen.findByRole('option', { name: /Wheat/ }));

    expect(screen.getByTestId('crop-value')).toHaveTextContent('Wheat');
  });

  it('finds a crop by its desi name', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByRole('combobox', { name: 'Crop' }), 'Gehu');

    expect(await screen.findByRole('option', { name: /Wheat/ })).toBeVisible();
  });

  it('shows the category as secondary text under each crop', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByRole('combobox', { name: 'Crop' }), 'Whea');

    expect(await screen.findByText('Cereals (C3, temperate)')).toBeVisible();
  });

  it('shows a previously picked crop first the next time the list is open', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByRole('combobox', { name: 'Crop' }), 'Whea');
    await user.click(await screen.findByRole('option', { name: /Wheat/ }));
    await user.click(screen.getByRole('combobox', { name: 'Crop' }));

    const options = await screen.findAllByRole('option');
    expect(options[0]).toHaveAccessibleName(/Wheat/);
  });

  it('disables the field when asked', () => {
    render(<Harness disabled />);
    expect(screen.getByRole('combobox', { name: 'Crop' })).toBeDisabled();
  });
});
