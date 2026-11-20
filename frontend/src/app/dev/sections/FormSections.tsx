import { useState } from 'react';
import {
  Combobox,
  DateRangePicker,
  NumberField,
  Slider,
  TextArea,
  TextField,
  addDays,
  todayIso,
  type ComboboxOption,
  type DateRange,
} from '@/components/ui';
import { DevSection } from '../DevSection';

export function TextFieldSection() {
  return (
    <DevSection title="TextField">
      <TextField label="Default" wrapperClassName="w-64" placeholder="you@farm.example" />
      <TextField
        label="With description"
        description="We never share it."
        wrapperClassName="w-64"
      />
      <TextField label="Required" required wrapperClassName="w-64" />
      <TextField
        label="With error"
        error="Enter a valid email address."
        defaultValue="not-an-email"
        wrapperClassName="w-64"
      />
      <TextField label="Disabled" disabled defaultValue="Locked" wrapperClassName="w-64" />
      <TextField label="Read-only" readOnly defaultValue="Fixed value" wrapperClassName="w-64" />
      <TextField label="With unit suffix" suffix="m" defaultValue="50" wrapperClassName="w-64" />
      <TextArea label="Multi-line (paste GeoJSON)" rows={3} wrapperClassName="w-64" />
    </DevSection>
  );
}

export function NumberFieldSection() {
  const [size, setSize] = useState<number | null>(50);
  const [atMin, setAtMin] = useState<number | null>(10);
  return (
    <DevSection title="NumberField">
      <NumberField
        label="Grid size"
        unit="m"
        min={10}
        max={500}
        step={10}
        integer
        value={size}
        onValueChange={setSize}
        className="w-64"
      />
      <NumberField
        label="At minimum"
        min={10}
        max={500}
        value={atMin}
        onValueChange={setAtMin}
        className="w-64"
      />
      <NumberField
        label="Empty"
        min={1}
        max={100}
        value={null}
        onValueChange={() => undefined}
        description="Leave blank until you decide."
        className="w-64"
      />
      <NumberField
        label="With error"
        min={10}
        max={500}
        value={5}
        onValueChange={() => undefined}
        error="Use at least 10 m."
        className="w-64"
      />
      <NumberField
        label="Disabled field"
        min={10}
        max={500}
        value={50}
        onValueChange={() => undefined}
        disabled
        className="w-64"
      />
    </DevSection>
  );
}

const CROPS: readonly ComboboxOption[] = [
  {
    value: 'wheat',
    label: 'Wheat \u00b7 Gehu',
    secondary: 'Cereals \u2014 C3 temperate',
    keywords: ['Wheat', 'Gehu'],
    group: 'Recent',
  },
  {
    value: 'rice',
    label: 'Rice \u00b7 Chawal',
    secondary: 'Cereals \u2014 C4 tropical',
    keywords: ['Rice', 'Chawal', 'Dhan'],
    group: 'All crops',
  },
  {
    value: 'maize',
    label: 'Maize \u00b7 Makka',
    secondary: 'Cereals \u2014 C4 tropical',
    keywords: ['Maize', 'Makka', 'Corn'],
    group: 'All crops',
  },
  {
    value: 'potato',
    label: 'Potato \u00b7 Aloo',
    secondary: 'Tubers \u2014 temperate',
    keywords: ['Potato', 'Aloo'],
    group: 'All crops',
  },
];

export function ComboboxSection() {
  const [value, setValue] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string | null>('rice');
  return (
    <DevSection
      title="Combobox"
      note="Type to filter, arrow keys to move, Enter to choose. Matches English and desi names, ignoring accents."
    >
      <Combobox
        label="Empty crop"
        options={CROPS}
        value={value}
        onValueChange={setValue}
        placeholder="Search crops"
        className="w-64"
      />
      <Combobox
        label="Chosen crop"
        options={CROPS}
        value={chosen}
        onValueChange={setChosen}
        className="w-64"
      />
      <Combobox
        label="Crop with error"
        options={CROPS}
        value={null}
        onValueChange={() => undefined}
        error="Pick a crop to continue."
        className="w-64"
      />
      <Combobox
        label="Disabled crop"
        options={CROPS}
        value="wheat"
        onValueChange={() => undefined}
        disabled
        className="w-64"
      />
    </DevSection>
  );
}

export function DateRangeSection() {
  const today = todayIso();
  const [empty, setEmpty] = useState<DateRange>({ start: null, end: null });
  const [limited, setLimited] = useState<DateRange>({ start: addDays(today, -30), end: today });
  const presets = [
    { label: 'Last 7 days', range: { start: addDays(today, -6), end: today } },
    { label: 'Last 30 days', range: { start: addDays(today, -29), end: today } },
  ];
  return (
    <DevSection
      title="DateRangePicker"
      note="Dates after today + 16 days are blocked, and the reason is written in the calendar (not only in a hover tooltip)."
    >
      <DateRangePicker label="Empty period" value={empty} onChange={setEmpty} className="w-72" />
      <DateRangePicker
        label="Limited period"
        value={limited}
        onChange={setLimited}
        presets={presets}
        maxDate={addDays(today, 16)}
        maxDateReason="Forecasts only reach 16 days ahead."
        className="w-72"
      />
      <DateRangePicker
        label="Period with error"
        value={{ start: null, end: null }}
        onChange={() => undefined}
        error="Choose a start and end date."
        className="w-72"
      />
      <DateRangePicker
        label="Disabled period"
        value={{ start: '2025-03-01', end: '2025-03-30' }}
        onChange={() => undefined}
        disabled
        className="w-72"
      />
    </DevSection>
  );
}

export function SliderSection() {
  const [value, setValue] = useState(50);
  return (
    <DevSection title="Slider">
      <Slider
        label="Grid size slider"
        min={10}
        max={100}
        step={10}
        value={value}
        onValueChange={setValue}
        formatValue={(v) => `${String(v)} m`}
        className="w-64"
      />
      <Slider
        label="Disabled slider"
        min={10}
        max={100}
        value={40}
        onValueChange={() => undefined}
        disabled
        className="w-64"
      />
    </DevSection>
  );
}
