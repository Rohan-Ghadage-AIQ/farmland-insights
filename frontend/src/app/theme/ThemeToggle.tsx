import { IconButton, MoonIcon, SunIcon } from '@/components/ui';
import { useTheme } from './ThemeProvider';

/** Manual light/dark switch. The label names the theme you will get, not the one you have. */
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <IconButton
      label={`Switch to ${next} theme`}
      icon={theme === 'dark' ? <SunIcon /> : <MoonIcon />}
      onClick={toggle}
    />
  );
}
