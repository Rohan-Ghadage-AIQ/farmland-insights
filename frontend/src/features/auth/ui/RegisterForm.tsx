import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button, ErrorBanner, TextField } from '@/components/ui';
import { isApiError } from '@/api';
import { useRegisterMutation } from '../api-hooks';
import { applyAuthFormError } from './apply-auth-error';
import { registerFormSchema, type RegisterFormValues } from './schemas';

const FORM_FIELDS = ['email', 'password'] as const;

export interface RegisterFormProps {
  /** Called once the account is created and the session is stored. */
  readonly onSuccess?: () => void;
}

/** "Create account" tab (spec 3.5): calls /auth/register and stores the returned token. */
export function RegisterForm({ onSuccess }: RegisterFormProps) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<RegisterFormValues>({ resolver: zodResolver(registerFormSchema) });
  const mutation = useRegisterMutation();
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
          setError(field as keyof RegisterFormValues, { message });
        },
        FORM_FIELDS,
        { action: 'register' },
      );
      setBanner(bannerMessage);
    }
  });

  return (
    <form className="flex flex-col gap-4" onSubmit={(event) => void onSubmit(event)} noValidate>
      {banner ? <ErrorBanner title="Could not create your account" message={banner} /> : null}
      <TextField
        label="Email"
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        {...register('email')}
      />
      <TextField
        label="Password"
        type="password"
        autoComplete="new-password"
        error={errors.password?.message}
        {...register('password')}
      />
      <Button type="submit" loading={mutation.isPending} className="mt-1">
        Create account
      </Button>
    </form>
  );
}
