import { useMemo } from 'react';
import { useController, type Control } from 'react-hook-form';
import { Combobox } from '@/components/ui';
import { buildCropOptions } from './crop-options';
import type { AnalysisSetupFormValues } from './schema';
import { useRecentCrops } from './use-recent-crops';

export interface CropFieldProps {
  readonly control: Control<AnalysisSetupFormValues>;
  readonly disabled?: boolean;
}

/**
 * Spec 3.3 step 2: a searchable crop combobox. Matches English and desi names, shows the
 * category as secondary text, and remembers recent picks. The form stores the crop's catalogue
 * identity (its English name); `useAnalysisFlow` resolves the category key to send to the API.
 */
export function CropField({ control, disabled = false }: CropFieldProps) {
  const {
    field,
    fieldState: { error },
  } = useController({ control, name: 'crop' });
  const { recents, addRecent } = useRecentCrops();
  const options = useMemo(() => buildCropOptions(recents), [recents]);

  return (
    <Combobox
      label="Crop"
      options={options}
      value={field.value === '' ? null : field.value}
      onValueChange={(value) => {
        field.onChange(value);
        addRecent(value);
      }}
      placeholder="Search by English or desi name"
      error={error?.message}
      disabled={disabled}
    />
  );
}
