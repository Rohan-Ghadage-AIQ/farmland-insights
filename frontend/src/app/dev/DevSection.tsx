import { useId, type ReactNode } from 'react';

/** A labelled region of the showcase: the heading names the primitive, the body shows its states. */
export function DevSection({
  title,
  note,
  children,
}: {
  readonly title: string;
  readonly note?: string;
  readonly children: ReactNode;
}) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-3 border-t border-border pt-6"
    >
      <h2 id={headingId} className="text-lg font-semibold text-fg">
        {title}
      </h2>
      {note ? <p className="text-base text-fg-muted">{note}</p> : null}
      <div className="flex flex-wrap items-start gap-4">{children}</div>
    </section>
  );
}

/** Small caption above one state of a primitive. */
export function DevState({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex w-64 flex-col gap-1">
      <p className="text-xs text-fg-muted">{label}</p>
      {children}
    </div>
  );
}
