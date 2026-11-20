import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from './cn';
import { CONTROL_CLASSES, describedBy, FieldShell, useFieldIds } from './Field';
import { CheckIcon, ChevronDownIcon } from './icons';

export interface ComboboxOption {
  readonly value: string;
  /** Main text; what the input shows once the option is chosen. */
  readonly label: string;
  /** Muted second line, for example a category. */
  readonly secondary?: string;
  /** Extra names that should match a search, such as desi crop names. */
  readonly keywords?: readonly string[];
  /** Options sharing a group are listed under one heading, in the order given. */
  readonly group?: string;
}

export interface ComboboxProps {
  readonly label: string;
  readonly options: readonly ComboboxOption[];
  readonly value: string | null;
  readonly onValueChange: (value: string) => void;
  readonly placeholder?: string;
  readonly description?: ReactNode;
  readonly error?: ReactNode;
  readonly emptyMessage?: string;
  readonly disabled?: boolean;
  readonly id?: string;
  readonly className?: string;
}

/** Lower-cases and strips accents so "cafe" finds "Café". */
export function normaliseSearch(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

function matches(option: ComboboxOption, query: string): boolean {
  if (query === '') return true;
  return [option.label, ...(option.keywords ?? [])].some((text) =>
    normaliseSearch(text).includes(query),
  );
}

interface Section {
  readonly heading: string | null;
  readonly items: readonly { readonly option: ComboboxOption; readonly index: number }[];
}

function toSections(results: readonly ComboboxOption[]): Section[] {
  const sections: { heading: string | null; items: Section['items'][number][] }[] = [];
  results.forEach((option, index) => {
    const heading = option.group ?? null;
    let section = sections.find((s) => s.heading === heading);
    if (!section) {
      section = { heading, items: [] };
      sections.push(section);
    }
    section.items.push({ option, index });
  });
  return sections;
}

export function Combobox({
  label,
  options,
  value,
  onValueChange,
  placeholder,
  description,
  error,
  emptyMessage = 'No matches',
  disabled = false,
  id,
  className,
}: ComboboxProps) {
  const ids = useFieldIds(id);
  const listboxId = `${ids.id}-listbox`;
  const selected = options.find((option) => option.value === value);
  const selectedLabel = selected?.label ?? '';

  const [text, setText] = useState(selectedLabel);
  const [previousLabel, setPreviousLabel] = useState(selectedLabel);
  const [open, setOpen] = useState(false);
  // Until the user types, the list shows everything rather than only the current selection.
  const [typed, setTyped] = useState(false);
  const [active, setActive] = useState(-1);

  if (selectedLabel !== previousLabel) {
    setPreviousLabel(selectedLabel);
    setText(selectedLabel);
  }

  const query = typed ? normaliseSearch(text) : '';
  const results = options.filter((option) => matches(option, query));
  const optionId = (index: number) => `${ids.id}-option-${String(index)}`;

  const close = () => {
    setOpen(false);
    setActive(-1);
  };

  const choose = (option: ComboboxOption) => {
    setText(option.label);
    setTyped(false);
    close();
    onValueChange(option.value);
  };

  const move = (delta: 1 | -1) => {
    if (results.length === 0) return;
    setOpen(true);
    setActive((current) => {
      if (current === -1) return delta > 0 ? 0 : results.length - 1;
      return (current + delta + results.length) % results.length;
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        move(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        move(-1);
        break;
      case 'Enter': {
        const option = results[active];
        if (open && option) {
          event.preventDefault();
          choose(option);
        }
        break;
      }
      case 'Escape':
        if (open) {
          // Keep an enclosing dialog or drawer from also closing.
          event.preventDefault();
          event.stopPropagation();
          close();
        }
        break;
      default:
        break;
    }
  };

  const activeOption = results[active];
  const showEmpty = open && results.length === 0;

  return (
    <FieldShell
      ids={ids}
      label={label}
      description={description}
      error={error}
      className={className}
    >
      <div className="relative">
        <input
          id={ids.id}
          type="text"
          role="combobox"
          autoComplete="off"
          value={text}
          disabled={disabled}
          placeholder={placeholder}
          aria-expanded={open && results.length > 0}
          aria-controls={open && results.length > 0 ? listboxId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={open && activeOption ? optionId(active) : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(ids, { description, error })}
          onChange={(event) => {
            setText(event.target.value);
            setTyped(true);
            setOpen(true);
            setActive(0);
          }}
          onClick={() => {
            if (!disabled) setOpen(true);
          }}
          onFocus={(event) => {
            event.currentTarget.select();
          }}
          onBlur={() => {
            close();
            setText(selectedLabel);
            setTyped(false);
          }}
          onKeyDown={handleKeyDown}
          className={cn(CONTROL_CLASSES, 'pr-8')}
        />
        <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-fg-muted" />

        {open && results.length > 0 ? (
          <div
            id={listboxId}
            role="listbox"
            aria-label={label}
            className="absolute top-full right-0 left-0 z-40 mt-1 max-h-72 overflow-auto rounded-panel border border-border bg-surface py-1 shadow-float"
          >
            {toSections(results).map((section, sectionIndex) => (
              <ComboboxSection
                key={section.heading ?? ''}
                sectionIndex={sectionIndex}
                section={section}
                idPrefix={ids.id}
                activeIndex={active}
                selectedValue={value}
                optionId={optionId}
                onChoose={choose}
              />
            ))}
          </div>
        ) : null}
        {showEmpty ? (
          <div
            role="status"
            className="absolute top-full right-0 left-0 z-40 mt-1 rounded-panel border border-border bg-surface p-3 text-sm text-fg-muted shadow-float"
          >
            {emptyMessage}
          </div>
        ) : null}
      </div>
    </FieldShell>
  );
}

interface SectionProps {
  readonly section: Section;
  readonly sectionIndex: number;
  readonly idPrefix: string;
  readonly activeIndex: number;
  readonly selectedValue: string | null;
  readonly optionId: (index: number) => string;
  readonly onChoose: (option: ComboboxOption) => void;
}

function ComboboxSection({
  section,
  sectionIndex,
  idPrefix,
  activeIndex,
  selectedValue,
  optionId,
  onChoose,
}: SectionProps) {
  const headingId = `${idPrefix}-group-${String(sectionIndex)}`;
  const options = section.items.map(({ option, index }) => (
    // Options are never focused: DOM focus stays on the input and the active option is exposed through
    // aria-activedescendant (ARIA APG combobox pattern). Keyboard users act on the input instead.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus
    <div
      key={option.value}
      id={optionId(index)}
      role="option"
      aria-selected={index === activeIndex}
      data-selected={option.value === selectedValue ? '' : undefined}
      // mousedown would blur the input and close the list before the click lands.
      onMouseDown={(event) => {
        event.preventDefault();
      }}
      onClick={() => {
        onChoose(option);
      }}
      ref={(node) => {
        if (node && index === activeIndex) node.scrollIntoView({ block: 'nearest' });
      }}
      className={cn(
        'flex cursor-pointer items-center justify-between gap-2 px-3 py-2',
        index === activeIndex && 'bg-accent-subtle',
      )}
    >
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-base text-fg">{option.label}</span>
        {option.secondary ? (
          <span className="truncate text-sm text-fg-muted">{option.secondary}</span>
        ) : null}
      </span>
      {option.value === selectedValue ? <CheckIcon className="shrink-0 text-accent" /> : null}
    </div>
  ));

  if (section.heading === null) return <>{options}</>;
  return (
    <div role="group" aria-labelledby={headingId}>
      <div
        id={headingId}
        role="presentation"
        className="px-3 pt-2 pb-1 text-xs font-medium text-fg-muted"
      >
        {section.heading}
      </div>
      {options}
    </div>
  );
}
