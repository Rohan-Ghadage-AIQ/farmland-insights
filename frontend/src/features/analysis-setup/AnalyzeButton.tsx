import { Button, Tooltip } from '@/components/ui';

export interface AnalyzeButtonProps {
  readonly canSubmit: boolean;
  /** What to list in the tooltip when disabled. Ignored once `canSubmit` is true. */
  readonly missingReasons: readonly string[];
  readonly isRunning: boolean;
  readonly onSubmit: () => void;
}

function tooltipContent(missingReasons: readonly string[]) {
  if (missingReasons.length === 0) return null;
  return (
    <ul className="list-disc pl-4">
      {missingReasons.map((reason) => (
        <li key={reason}>{reason}</li>
      ))}
    </ul>
  );
}

/** Spec 3.3: "There is exactly one primary button: Analyze." Disabled until the form is valid. */
export function AnalyzeButton({
  canSubmit,
  missingReasons,
  isRunning,
  onSubmit,
}: AnalyzeButtonProps) {
  const disabled = !canSubmit || isRunning;
  return (
    <Tooltip content={disabled && !isRunning ? tooltipContent(missingReasons) : null}>
      <Button variant="primary" disabled={disabled} onClick={onSubmit} className="w-full">
        Analyze
      </Button>
    </Tooltip>
  );
}
