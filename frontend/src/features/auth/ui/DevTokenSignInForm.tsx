import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button, ErrorBanner, TextField } from '@/components/ui';
import { isApiError } from '@/api';
import { useTokenMutation } from '../api-hooks';
import { applyAuthFormError } from './apply-auth-error';
import { devSignInFormSchema, type DevSignInFormValues } from './schemas';

const FORM_FIELDS = ['email'] as const;

export interface DevTokenSignInFormProps {
  /** Called once a token is issued and the session is stored. */
  readonly onSuccess?: () => void;
}

/**
 * "Sign in" tab, dev mode only (spec 2.2, 3.5): mints a token for an email with no password.
 * Shown only behind `VITE_ENABLE_DEV_TOKEN_LOGIN`; never presented as a real sign-in.
 */
export function DevTokenSignInForm({ onSuccess }: DevTokenSignInFormProps) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<DevSignInFormValues>({ resolver: zodResolver(devSignInFormSchema) });
  const mutation = useTokenMutation();
  const [banner, setBanner] = useState<string | null>(null);

  const onSubmit = handleSubmit(async (values) => {
    setBanner(null);
    try {
      await mutation.mutateAsync(values);
      onSuccess?.();
    } catch (error) {
      if (!isApiError(error)) throw error;
      const { bannerMessage } = applyAuthFormError(
        error,
        (field, message) => {
          setError(field as keyof DevSignInFormValues, { message });
        },
        FORM_FIELDS,
        { action: 'signIn' },
      );
      setBanner(bannerMessage);
    }
  });

  return (
    <form className="flex flex-col gap-4" onSubmit={(event) => void onSubmit(event)} noValidate>
      <p className="text-sm text-fg-muted">
        Dev-only: this mints a token for any email, with no password. It is not a real sign-in.
      </p>
      {banner ? <ErrorBanner title="Could not get a token" message={banner} /> : null}
      <TextField
        label="Email"
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        {...register('email')}
      />
      <Button type="submit" loading={mutation.isPending} className="mt-1">
        Get token
      </Button>
    </form>
  );
}
