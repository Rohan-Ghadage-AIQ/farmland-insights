import type { ComponentProps, ReactNode } from 'react';
import { cn } from './cn';
import { CONTROL_CLASSES, describedBy, FieldShell, useFieldIds } from './Field';

interface CommonFieldProps {
  readonly label: string;
  readonly description?: ReactNode;
  readonly error?: ReactNode;
  /** Class for the outer wrapper. */
  readonly wrapperClassName?: string;
}

export interface TextFieldProps extends CommonFieldProps, Omit<ComponentProps<'input'>, 'size'> {
  /** Text shown inside the field after the value, such as a unit. */
  readonly suffix?: ReactNode;
}

export function TextField({
  label,
  description,
  error,
  suffix,
  wrapperClassName,
  id,
  className,
  required,
  ...rest
}: TextFieldProps) {
  const ids = useFieldIds(id);
  return (
    <FieldShell
      ids={ids}
      label={label}
      description={description}
      error={error}
      {...(required === undefined ? {} : { required })}
      {...(wrapperClassName === undefined ? {} : { className: wrapperClassName })}
    >
      <div className="relative">
        <input
          {...rest}
          id={ids.id}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(ids, { description, error })}
          className={cn(CONTROL_CLASSES, suffix ? 'pr-8' : false, className)}
        />
        {suffix ? (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-fg-muted">
            {suffix}
          </span>
        ) : null}
      </div>
    </FieldShell>
  );
}

export interface TextAreaProps extends CommonFieldProps, ComponentProps<'textarea'> {}

export function TextArea({
  label,
  description,
  error,
  wrapperClassName,
  id,
  className,
  required,
  ...rest
}: TextAreaProps) {
  const ids = useFieldIds(id);
  return (
    <FieldShell
      ids={ids}
      label={label}
      description={description}
      error={error}
      {...(required === undefined ? {} : { required })}
      {...(wrapperClassName === undefined ? {} : { className: wrapperClassName })}
    >
      <textarea
        {...rest}
        id={ids.id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(ids, { description, error })}
        className={cn(CONTROL_CLASSES, 'h-auto min-h-20 py-2 font-mono text-sm', className)}
      />
    </FieldShell>
  );
}
