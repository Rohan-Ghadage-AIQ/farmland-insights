import { useState } from 'react';
import { TextArea } from '@/components/ui';
import { validateFarmGeometry, type FarmFeatureCollection } from '@/domain';

export interface PasteFieldProps {
  /** Called with the validated, sanitized farm outline each time the pasted text becomes valid. */
  readonly onLoad: (collection: FarmFeatureCollection) => void;
  readonly disabled?: boolean;
}

function issuesText(issues: readonly { message: string }[]): string {
  return issues.map((issue) => issue.message).join(' ');
}

/** A GeoJSON text box that validates as the person types or pastes (spec 3.3.1). */
export function PasteField({ onLoad, disabled = false }: PasteFieldProps) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleChange = (text: string): void => {
    setValue(text);
    if (text.trim() === '') {
      setError(null);
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      setError("That doesn't look like valid JSON.");
      return;
    }
    const result = validateFarmGeometry(parsed);
    if (!result.ok) {
      setError(issuesText(result.issues));
      return;
    }
    setError(null);
    onLoad(result.collection);
  };

  return (
    <TextArea
      label="Paste GeoJSON"
      value={value}
      disabled={disabled}
      rows={8}
      placeholder='{"type": "FeatureCollection", "features": [...]}'
      onChange={(event) => {
        handleChange(event.target.value);
      }}
      error={error === null ? undefined : <span role="alert">{error}</span>}
    />
  );
}
