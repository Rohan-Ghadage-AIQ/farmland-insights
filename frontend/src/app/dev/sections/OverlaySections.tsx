import { useState } from 'react';
import {
  Button,
  Dialog,
  Drawer,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tooltip,
  useToast,
} from '@/components/ui';
import { DevSection } from '../DevSection';

export function TabsSection() {
  return (
    <DevSection title="Tabs">
      <Tabs defaultValue="signin" className="w-72">
        <TabsList aria-label="Account">
          <TabsTrigger value="signin">Sign in</TabsTrigger>
          <TabsTrigger value="create">Create account</TabsTrigger>
          <TabsTrigger value="sso" disabled>
            SSO
          </TabsTrigger>
        </TabsList>
        <TabsContent value="signin">Sign in form goes here.</TabsContent>
        <TabsContent value="create">Create account form goes here.</TabsContent>
      </Tabs>
    </DevSection>
  );
}

export function TooltipSection() {
  return (
    <DevSection
      title="Tooltip"
      note="Supplementary text only. Shows on hover and on keyboard focus; Escape closes it."
    >
      <Tooltip content="Explains the control">
        <Button variant="secondary">Hover or focus me</Button>
      </Tooltip>
      <Tooltip content="Draw or upload a field first">
        <Button disabled>Analyze (disabled with reason)</Button>
      </Tooltip>
    </DevSection>
  );
}

export function ToastSection() {
  const { toast } = useToast();
  return (
    <DevSection title="Toast" note="For background and async events only, never for validation.">
      <Button
        variant="secondary"
        onClick={() => toast({ title: 'Heads up', description: 'A neutral message.' })}
      >
        Info toast
      </Button>
      <Button variant="secondary" onClick={() => toast({ title: 'Export ready', tone: 'success' })}>
        Success toast
      </Button>
      <Button
        variant="secondary"
        onClick={() =>
          toast({ title: 'Large area', description: 'This may take minutes.', tone: 'warning' })
        }
      >
        Warning toast
      </Button>
      <Button
        variant="secondary"
        onClick={() => toast({ title: 'Analysis failed', tone: 'danger' })}
      >
        Error toast
      </Button>
      <Button
        variant="secondary"
        onClick={() =>
          toast({
            title: 'Session expires in 5 min',
            duration: Infinity,
            action: { label: 'Stay signed in', onAction: () => undefined },
          })
        }
      >
        Toast with action
      </Button>
    </DevSection>
  );
}

export function DialogSection() {
  const [open, setOpen] = useState(false);
  return (
    <DevSection title="Dialog">
      <Button
        variant="secondary"
        onClick={() => {
          setOpen(true);
        }}
      >
        Open dialog
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Large area"
        description="This may take several minutes. Continue?"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                setOpen(false);
              }}
            >
              Continue
            </Button>
          </>
        }
      >
        <p className="text-base text-fg">About 12,000 cells will be analysed.</p>
      </Dialog>
    </DevSection>
  );
}

export function DrawerSection() {
  const [open, setOpen] = useState(false);
  return (
    <DevSection title="Drawer">
      <Button
        variant="secondary"
        onClick={() => {
          setOpen(true);
        }}
      >
        Open drawer
      </Button>
      <Drawer
        open={open}
        onOpenChange={setOpen}
        title="Inspector"
        description="Cell details open here on narrow screens."
      >
        <p className="text-base text-fg">Drawer content.</p>
      </Drawer>
    </DevSection>
  );
}
