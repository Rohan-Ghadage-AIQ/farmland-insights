import { ThemeToggle } from '../theme';
import { ButtonSection, IconButtonSection } from './sections/ButtonSections';
import {
  BadgeSection,
  EmptyStateSection,
  ErrorBannerSection,
  SkeletonSection,
  StepperSection,
} from './sections/DisplaySections';
import {
  ComboboxSection,
  DateRangeSection,
  NumberFieldSection,
  SliderSection,
  TextFieldSection,
} from './sections/FormSections';
import {
  DialogSection,
  DrawerSection,
  TabsSection,
  ToastSection,
  TooltipSection,
} from './sections/OverlaySections';
import { TokensSection } from './sections/TokensSection';

/**
 * Component showcase at /dev/ui: every primitive in every state. Dev builds only; the route is
 * absent from production bundles (see dev-routes.ts). Also the target of the axe checks.
 */
export function DevUiPage() {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 bg-bg p-6 text-fg">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">UI kit</h1>
        <ThemeToggle />
      </header>
      <TokensSection />
      <ButtonSection />
      <IconButtonSection />
      <TextFieldSection />
      <NumberFieldSection />
      <ComboboxSection />
      <DateRangeSection />
      <SliderSection />
      <TabsSection />
      <TooltipSection />
      <ToastSection />
      <DialogSection />
      <DrawerSection />
      <BadgeSection />
      <SkeletonSection />
      <EmptyStateSection />
      <ErrorBannerSection />
      <StepperSection />
    </main>
  );
}
