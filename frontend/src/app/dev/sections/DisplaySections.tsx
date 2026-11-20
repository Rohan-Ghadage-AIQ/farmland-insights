import { useState } from 'react';
import {
  Badge,
  Button,
  EmptyState,
  ErrorBanner,
  Skeleton,
  Stepper,
  StepperStep,
} from '@/components/ui';
import { DevSection, DevState } from '../DevSection';

export function BadgeSection() {
  return (
    <DevSection title="Badge">
      <Badge>Neutral</Badge>
      <Badge tone="accent">Accent</Badge>
      <Badge tone="success" dot>
        Healthy
      </Badge>
      <Badge tone="warning" dot>
        Inputs changed
      </Badge>
      <Badge tone="danger" dot>
        Unreachable
      </Badge>
    </DevSection>
  );
}

export function SkeletonSection() {
  return (
    <DevSection
      title="Skeleton"
      note="Decorative only. Pair with a live status message when the wait needs announcing."
    >
      <DevState label="Block">
        <Skeleton height={32} />
      </DevState>
      <DevState label="Text lines">
        <Skeleton lines={3} />
      </DevState>
    </DevSection>
  );
}

export function EmptyStateSection() {
  return (
    <DevSection title="EmptyState">
      <EmptyState
        title="No field yet"
        description="Draw a boundary on the map, or load the sample field."
        action={<Button variant="secondary">Load sample field</Button>}
      />
    </DevSection>
  );
}

export function ErrorBannerSection() {
  return (
    <DevSection title="ErrorBanner">
      <ErrorBanner
        className="w-96"
        title="Analysis failed"
        message="The server could not process this field. Check the boundary and try again."
        details={{ error: 'bad_request', detail: 'Polygon area too large', status: 400 }}
        onRetry={() => undefined}
      />
      <ErrorBanner
        className="w-96"
        tone="warning"
        title="Large area"
        message="This may take several minutes."
      />
      <ErrorBanner
        className="w-96"
        title="Can't reach the server"
        message="Check your connection and try again."
      />
    </DevSection>
  );
}

export function StepperSection() {
  const [open, setOpen] = useState<number | null>(2);
  const toggle = (step: number) => (next: boolean) => {
    setOpen(next ? step : null);
  };
  return (
    <DevSection
      title="Stepper"
      note="Each step shows a one-line summary once complete, and can be reopened to edit."
    >
      <Stepper aria-label="Analysis setup" className="w-80">
        <StepperStep
          number={1}
          title="Field"
          status="complete"
          summary={'12.4 ha \u00b7 8 vertices'}
          open={open === 1}
          onOpenChange={toggle(1)}
        >
          <p className="text-base text-fg">Field editor.</p>
        </StepperStep>
        <StepperStep
          number={2}
          title="Crop"
          status="incomplete"
          open={open === 2}
          onOpenChange={toggle(2)}
        >
          <p className="text-base text-fg">Crop picker.</p>
        </StepperStep>
        <StepperStep
          number={3}
          title="Period"
          status="error"
          open={open === 3}
          onOpenChange={toggle(3)}
        >
          <p className="text-base text-fg">Date range.</p>
        </StepperStep>
        <StepperStep
          number={4}
          title="Grid size"
          status="incomplete"
          locked
          open={false}
          onOpenChange={toggle(4)}
        >
          <p className="text-base text-fg">Locked while running.</p>
        </StepperStep>
      </Stepper>
    </DevSection>
  );
}
