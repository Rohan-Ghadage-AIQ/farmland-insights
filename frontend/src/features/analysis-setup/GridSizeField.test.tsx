import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm, useWatch } from 'react-hook-form';
import { describe, expect, it } from 'vitest';
import '@/components/ui/test-support';
import type { AnalysisSetupFormValues } from './schema';
import { defaultAnalysisSetupValues } from './schema';
import { GridSizeField } from './GridSizeField';

function Harness({ areaHectares }: { readonly areaHectares: number | null }) {
  const { control } = useForm<AnalysisSetupFormValues>({
    defaultValues: defaultAnalysisSetupValues(),
  });
  const gridSize = useWatch({ control, name: 'gridSize' });
  return (
    <>
      <GridSizeField control={control} areaHectares={areaHectares} />
      <output data-testid="grid-size">{gridSize}</output>
    </>
  );
}

describe('GridSizeField', () => {
  it('defaults to 50 metres', () => {
    render(<Harness areaHectares={null} />);
    expect(screen.getByRole('spinbutton', { name: 'Grid size' })).toHaveValue('50');
  });

  it('applies a preset', async () => {
    const user = userEvent.setup();
    render(<Harness areaHectares={null} />);

    await user.click(screen.getByRole('button', { name: '100 m' }));

    expect(screen.getByTestId('grid-size')).toHaveTextContent('100');
  });

  it('types an exact grid size into the number field', async () => {
    const user = userEvent.setup();
    render(<Harness areaHectares={null} />);

    const input = screen.getByRole('spinbutton', { name: 'Grid size' });
    await user.clear(input);
    await user.type(input, '75');
    input.blur();

    expect(screen.getByTestId('grid-size')).toHaveTextContent('75');
  });

  it('prompts for a field when there is no area yet', () => {
    render(<Harness areaHectares={null} />);
    expect(screen.getByText(/add a field to estimate/i)).toBeVisible();
  });

  it('shows a live cell-count estimate once there is a field', () => {
    // 10 ha at 50 m cells: 100,000 m^2 / 2,500 m^2 = 40 cells.
    render(<Harness areaHectares={10} />);
    expect(screen.getByText(/≈ 40 cells/)).toBeVisible();
  });

  it('warns above 2,000 cells', () => {
    // 1100 ha at 50 m cells = 4400 cells.
    render(<Harness areaHectares={1100} />);
    expect(screen.getByText(/this may take several minutes/i)).toBeVisible();
  });

  it('warns more strongly above 10,000 cells', () => {
    // 3000 ha at 50 m cells = 12000 cells.
    render(<Harness areaHectares={3000} />);
    expect(screen.getByText(/ask you to confirm/i)).toBeVisible();
  });
});
