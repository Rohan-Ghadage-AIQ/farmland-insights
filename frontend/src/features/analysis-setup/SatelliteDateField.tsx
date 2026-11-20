import { useController, type Control } from 'react-hook-form';
import { userMessage } from '@/api';
import { Badge, cn, ErrorBanner, Skeleton } from '@/components/ui';
import type { AnalysisSetupFormValues } from './schema';
import {
  CLEAR_SKY_MAX_CLOUD,
  describePass,
  formatPassDate,
  skyCondition,
  type SkyCondition,
} from './satellite-dates';
import type { SatelliteDatesState } from './use-satellite-dates';

export interface SatelliteDateFieldProps {
  readonly control: Control<AnalysisSetupFormValues>;
  readonly dates: SatelliteDatesState;
  readonly disabled?: boolean;
}

const SKY_BADGE: Readonly<
  Record<SkyCondition, { tone: 'success' | 'warning' | 'neutral' | 'accent'; text: string }>
> = {
  clear: { tone: 'success', text: 'Clear' },
  cloudy: { tone: 'warning', text: 'Cloudy' },
  unknown: { tone: 'neutral', text: 'Cloud unknown' },
  'radar-only': { tone: 'accent', text: 'Radar only' },
};

/**
 * The satellite pass the report is built from. Lists every day in the period on which Sentinel-2
 * (optical) or Sentinel-1 (radar) photographed the farm, with how cloudy the optical image was.
 */
export function SatelliteDateField({ control, dates, disabled = false }: SatelliteDateFieldProps) {
  const { field } = useController({ control, name: 'imageDate' });

  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="text-fg mb-1 text-sm font-semibold">Satellite image date</legend>

      {dates.status === 'idle' ? (
        <p className="text-fg-muted text-xs">
          Add a field and choose a period to see the days a satellite passed over it.
        </p>
      ) : null}

      {dates.status === 'loading' ? (
        <div role="status" aria-live="polite" className="flex flex-col gap-2">
          <span className="sr-only">Looking up satellite passes…</span>
          <Skeleton lines={3} />
        </div>
      ) : null}

      {dates.status === 'error' ? (
        <ErrorBanner
          title="Could not load satellite dates"
          message={`${userMessage(dates.error)} The report is built from one satellite image, so choose a date before running the analysis.`}
          onRetry={dates.retry}
        />
      ) : null}

      {dates.status === 'ready' && dates.passes.length === 0 ? (
        <p role="status" className="text-danger text-xs">
          No satellite passed over this field in the period, so there is no image to build the
          report from. Choose a longer or earlier period.
        </p>
      ) : null}

      {dates.status === 'ready' && dates.passes.length > 0 ? (
        <>
          <div
            role="radiogroup"
            aria-label="Satellite image date"
            className="border-border flex max-h-64 flex-col overflow-y-auto rounded-control border"
          >
            {dates.passes.map((pass) => {
              const checked = field.value === pass.date;
              const sky = SKY_BADGE[skyCondition(pass)];
              return (
                <label
                  key={pass.date}
                  className={cn(
                    'border-border flex cursor-pointer items-center gap-3 border-b px-3 py-2 text-sm last:border-b-0',
                    checked ? 'bg-accent-subtle' : 'hover:bg-surface-muted',
                  )}
                >
                  <input
                    type="radio"
                    name={field.name}
                    value={pass.date}
                    checked={checked}
                    onChange={() => {
                      field.onChange(pass.date);
                    }}
                    onBlur={field.onBlur}
                    aria-describedby={`pass-${pass.date}`}
                    className="accent-accent"
                  />
                  <span className="text-fg min-w-0 flex-1 font-medium tabular-nums">
                    {formatPassDate(pass.date)}
                  </span>
                  <span id={`pass-${pass.date}`} className="sr-only">
                    {describePass(pass)}
                  </span>
                  <span aria-hidden="true" className="flex shrink-0 items-center gap-1.5">
                    {pass.optical && pass.cloud_cover !== null ? (
                      <span className="text-fg-muted text-xs tabular-nums">
                        {Math.round(pass.cloud_cover)}% cloud
                      </span>
                    ) : null}
                    <Badge tone={sky.tone}>{sky.text}</Badge>
                    {pass.optical && pass.radar ? <Badge tone="accent">+ Radar</Badge> : null}
                  </span>
                </label>
              );
            })}
          </div>
          <p className="text-fg-muted text-xs">
            Optical indices (NDVI, EVI, SAVI, NDRE, NDWI, NDMI) need a clear sky; above{' '}
            {CLEAR_SKY_MAX_CLOUD}% cloud over the field they are unreliable. Radar (RVI, RSM) sees
            through cloud. When a sensor did not pass on the chosen day, its nearest pass is used
            and the report says which.
          </p>
        </>
      ) : null}
    </fieldset>
  );
}
