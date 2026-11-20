import { useId, type ReactNode } from 'react';
import { cn } from './cn';

export interface FieldIds {
  readonly id: string;
  readonly labelId: string;
  readonly descriptionId: string;
  readonly errorId: string;
}

/** Stable ids that wire a control to its label, description and error message. */
export function useFieldIds(idProp?: string): FieldIds {
  const generated = useId();
  const id = idProp ?? generated;
  return {
    id,
    labelId: `${id}-label`,
    descriptionId: `${id}-description`,
    errorId: `${id}-error`,
  };
}

/** The value for `aria-describedby`, or undefined when there is nothing to describe. */
export function describedBy(
  ids: FieldIds,
  { description, error }: { readonly description?: ReactNode; readonly error?: ReactNode },
): string | undefined {
  const parts = [description ? ids.descriptionId : null, error ? ids.errorId : null].filter(
    (part): part is string => part !== null,
  );
  return parts.length > 0 ? parts.join(' ') : undefined;
}

/** Shared visual treatment for text-like controls, including their error state. */
export const CONTROL_CLASSES =
  'h-9 w-full min-w-0 rounded-control border border-border-strong bg-surface px-3 text-base text-fg ' +
  'placeholder:text-fg-muted aria-invalid:border-danger disabled:cursor-not-allowed disabled:opacity-60 ' +
  'read-only:bg-surface-muted';

export interface FieldShellProps {
  readonly ids: FieldIds;
  readonly label: string;
  readonly description?: ReactNode;
  readonly error?: ReactNode;
  readonly required?: boolean | undefined;
  readonly className?: string | undefined;
  readonly children: ReactNode;
}

/** Label above, control in the middle, hint and error below. Errors are inline, never toasts. */
export function FieldShell({
  ids,
  label,
  description,
  error,
  required,
  className,
  children,
}: FieldShellProps) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label id={ids.labelId} htmlFor={ids.id} className="text-sm font-medium text-fg">
        {label}
        {required ? (
          <span aria-hidden="true" className="ml-0.5 text-danger">
            *
          </span>
        ) : null}
      </label>
      {children}
      {description ? (
        <p id={ids.descriptionId} className="text-sm text-fg-muted">
          {description}
        </p>
      ) : null}
      {error ? (
        <p id={ids.errorId} className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
