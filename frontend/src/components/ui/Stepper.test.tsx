import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Stepper, StepperStep } from './Stepper';
import './test-support';

describe('Stepper', () => {
  it('is an ordered list of steps with numbers and titles', () => {
    render(
      <Stepper aria-label="Analysis setup">
        <StepperStep
          number={1}
          title="Field"
          status="incomplete"
          open={false}
          onOpenChange={vi.fn()}
        >
          Field body
        </StepperStep>
        <StepperStep
          number={2}
          title="Crop"
          status="incomplete"
          open={false}
          onOpenChange={vi.fn()}
        >
          Crop body
        </StepperStep>
      </Stepper>,
    );

    expect(screen.getByRole('list', { name: 'Analysis setup' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByRole('button', { name: /Field/ })).toHaveTextContent('1');
  });

  it('shows the body only while open and wires aria-expanded to the header', () => {
    const { rerender } = render(
      <StepperStep number={1} title="Field" status="incomplete" open onOpenChange={vi.fn()}>
        Field body
      </StepperStep>,
    );
    expect(screen.getByRole('button', { name: /Field/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Field body')).toBeInTheDocument();

    rerender(
      <StepperStep number={1} title="Field" status="incomplete" open={false} onOpenChange={vi.fn()}>
        Field body
      </StepperStep>,
    );
    expect(screen.getByRole('button', { name: /Field/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Field body')).not.toBeInTheDocument();
  });

  it('asks to toggle when the header is activated by mouse or keyboard', async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(
      <StepperStep
        number={3}
        title="Period"
        status="incomplete"
        open={false}
        onOpenChange={onOpenChange}
      >
        Body
      </StepperStep>,
    );

    await user.click(screen.getByRole('button', { name: /Period/ }));
    expect(onOpenChange).toHaveBeenLastCalledWith(true);

    screen.getByRole('button', { name: /Period/ }).focus();
    await user.keyboard('{Enter}');
    expect(onOpenChange).toHaveBeenCalledTimes(2);
  });

  it('shows the one-line summary once complete and collapsed, and states completion in words', () => {
    render(
      <StepperStep
        number={2}
        title="Crop"
        status="complete"
        summary={'Wheat · Gehu'}
        open={false}
        onOpenChange={vi.fn()}
      >
        Body
      </StepperStep>,
    );

    expect(screen.getByText('Wheat · Gehu')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Crop/ })).toHaveAccessibleName(/complete/i);
  });

  it('hides the summary while the step is being edited', () => {
    render(
      <StepperStep
        number={2}
        title="Crop"
        status="complete"
        summary="Wheat"
        open
        onOpenChange={vi.fn()}
      >
        Body
      </StepperStep>,
    );

    expect(screen.queryByText('Wheat')).not.toBeInTheDocument();
  });

  it('never shows a summary for an incomplete step', () => {
    render(
      <StepperStep
        number={2}
        title="Crop"
        status="incomplete"
        summary="stale text"
        open={false}
        onOpenChange={vi.fn()}
      >
        Body
      </StepperStep>,
    );

    expect(screen.queryByText('stale text')).not.toBeInTheDocument();
  });

  it('flags a step that needs attention in words', () => {
    render(
      <StepperStep number={1} title="Field" status="error" open={false} onOpenChange={vi.fn()}>
        Body
      </StepperStep>,
    );

    expect(screen.getByRole('button', { name: /Field/ })).toHaveAccessibleName(/needs attention/i);
  });

  it('locks every interaction while locked (for example during a run)', async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(
      <StepperStep
        number={1}
        title="Field"
        status="complete"
        locked
        open={false}
        onOpenChange={onOpenChange}
      >
        Body
      </StepperStep>,
    );

    await user.click(screen.getByRole('button', { name: /Field/ }));

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Field/ })).toHaveAttribute('aria-disabled', 'true');
  });

  it('works as a controlled accordion of steps', async () => {
    const user = userEvent.setup();
    function Example() {
      const [openStep, setOpenStep] = useState(1);
      return (
        <Stepper aria-label="Setup">
          {[1, 2].map((n) => (
            <StepperStep
              key={n}
              number={n}
              title={`Step ${String(n)}`}
              status="incomplete"
              open={openStep === n}
              onOpenChange={(next) => {
                if (next) setOpenStep(n);
              }}
            >
              {`Body ${String(n)}`}
            </StepperStep>
          ))}
        </Stepper>
      );
    }
    render(<Example />);
    expect(screen.getByText('Body 1')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Step 2/ }));

    expect(screen.getByText('Body 2')).toBeInTheDocument();
    expect(screen.queryByText('Body 1')).not.toBeInTheDocument();
  });
});
