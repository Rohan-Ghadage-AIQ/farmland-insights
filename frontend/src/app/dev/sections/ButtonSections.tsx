import { useState } from 'react';
import { Button, CloseIcon, IconButton, PlusIcon, SunIcon } from '@/components/ui';
import { DevSection, DevState } from '../DevSection';

export function ButtonSection() {
  return (
    <DevSection
      title="Button"
      note="One primary action per screen. Disabled buttons stay focusable so a tooltip can say why."
    >
      <Button>Primary</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button disabled>Disabled</Button>
      <Button variant="secondary" disabled>
        Secondary disabled
      </Button>
      <Button loading>Loading</Button>
      <Button size="sm">Small</Button>
      <Button variant="secondary" asChild>
        <a href="/login">As link</a>
      </Button>
    </DevSection>
  );
}

export function IconButtonSection() {
  const [pressed, setPressed] = useState(false);
  return (
    <DevSection title="IconButton" note="The label is the accessible name and the tooltip.">
      <DevState label="Default">
        <IconButton label="Add" icon={<PlusIcon />} />
      </DevState>
      <DevState label="Pressed (toggle)">
        <IconButton
          label="Toggle layer"
          icon={<SunIcon />}
          pressed={pressed}
          onClick={() => {
            setPressed((value) => !value);
          }}
        />
      </DevState>
      <DevState label="Disabled">
        <IconButton label="Remove" icon={<CloseIcon />} disabled />
      </DevState>
      <DevState label="Small">
        <IconButton label="Close small" size="sm" icon={<CloseIcon />} />
      </DevState>
    </DevSection>
  );
}
