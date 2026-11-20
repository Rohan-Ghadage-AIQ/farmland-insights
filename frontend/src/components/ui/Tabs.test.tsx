import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './Tabs';
import './test-support';

function Example({ onValueChange }: { readonly onValueChange?: (value: string) => void }) {
  return (
    <Tabs defaultValue="signin" {...(onValueChange ? { onValueChange } : {})}>
      <TabsList aria-label="Account">
        <TabsTrigger value="signin">Sign in</TabsTrigger>
        <TabsTrigger value="create">Create account</TabsTrigger>
        <TabsTrigger value="sso" disabled>
          SSO
        </TabsTrigger>
      </TabsList>
      <TabsContent value="signin">Sign in form</TabsContent>
      <TabsContent value="create">Create account form</TabsContent>
      <TabsContent value="sso">SSO form</TabsContent>
    </Tabs>
  );
}

describe('Tabs', () => {
  it('exposes a labelled tablist with the default tab selected and only its panel shown', () => {
    render(<Example />);

    expect(screen.getByRole('tablist', { name: 'Account' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Sign in' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Create account' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Sign in form');
    expect(screen.queryByText('Create account form')).not.toBeInTheDocument();
  });

  it('switches panel on click and reports the change', async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(<Example onValueChange={onValueChange} />);

    await user.click(screen.getByRole('tab', { name: 'Create account' }));

    expect(onValueChange).toHaveBeenCalledWith('create');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Create account form');
  });

  it('moves between tabs with the arrow keys and skips disabled ones', async () => {
    const user = userEvent.setup();
    render(<Example />);

    await user.click(screen.getByRole('tab', { name: 'Sign in' }));
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Create account' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Create account' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Sign in' })).toHaveFocus();
  });

  it('does not select a disabled tab', async () => {
    const user = userEvent.setup();
    render(<Example />);

    await user.click(screen.getByRole('tab', { name: 'SSO' }));

    expect(screen.getByRole('tab', { name: 'SSO' })).toBeDisabled();
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Sign in form');
  });

  it('can be controlled', async () => {
    const user = userEvent.setup();
    function Controlled() {
      const [value, setValue] = useState('a');
      return (
        <Tabs value={value} onValueChange={setValue}>
          <TabsList aria-label="Layer">
            <TabsTrigger value="a">CPI</TabsTrigger>
            <TabsTrigger value="b">Raw metric</TabsTrigger>
          </TabsList>
          <TabsContent value="a">CPI layer</TabsContent>
          <TabsContent value="b">Metric layer</TabsContent>
        </Tabs>
      );
    }
    render(<Controlled />);

    await user.click(screen.getByRole('tab', { name: 'Raw metric' }));

    expect(screen.getByRole('tabpanel')).toHaveTextContent('Metric layer');
  });
});
