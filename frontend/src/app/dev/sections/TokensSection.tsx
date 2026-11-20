import { DevSection } from '../DevSection';

const COLOUR_TOKENS = [
  '--bg',
  '--surface',
  '--surface-muted',
  '--fg',
  '--fg-muted',
  '--border',
  '--border-strong',
  '--accent',
  '--accent-fg',
  '--accent-subtle',
  '--ring',
  '--success',
  '--success-bg',
  '--warning',
  '--warning-bg',
  '--danger',
  '--danger-bg',
] as const;

const SPACING = [
  '--space-1',
  '--space-2',
  '--space-3',
  '--space-4',
  '--space-6',
  '--space-8',
  '--space-12',
] as const;
const TYPE = ['xs', 'sm', 'base', 'md', 'lg', 'xl'] as const;

export function TokensSection() {
  return (
    <DevSection
      title="Colour tokens"
      note="Contrast of every text and UI pair is verified numerically in src/styles/tokens.test.ts."
    >
      <ul className="m-0 grid w-full list-none grid-cols-2 gap-2 p-0 sm:grid-cols-3 lg:grid-cols-4">
        {COLOUR_TOKENS.map((token) => (
          <li key={token} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="size-8 shrink-0 rounded-control border border-border-strong"
              style={{ background: `var(${token})` }}
            />
            <code className="text-sm text-fg">{token}</code>
          </li>
        ))}
      </ul>
      <div
        className="flex w-full flex-wrap items-end gap-3"
        aria-label="Spacing scale"
        role="group"
      >
        {SPACING.map((token) => (
          <div key={token} className="flex flex-col items-center gap-1">
            <span
              aria-hidden="true"
              className="rounded-control bg-accent"
              style={{ width: `var(${token})`, height: `var(${token})` }}
            />
            <span className="text-xs text-fg-muted">{token.replace('--space-', '')}</span>
          </div>
        ))}
      </div>
      <div className="flex w-full flex-col gap-1">
        {TYPE.map((size) => (
          <p key={size} style={{ fontSize: `var(--font-size-${size})` }} className="text-fg">
            {`Type ${size}: Farmland 0123456789`}
          </p>
        ))}
      </div>
    </DevSection>
  );
}
