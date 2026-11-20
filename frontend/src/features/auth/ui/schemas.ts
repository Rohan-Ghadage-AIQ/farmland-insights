import { z } from 'zod';

/**
 * Form-level validation for the login card (spec 3.5). These are deliberately looser than the
 * backend's own rules (it only requires a non-empty password): the point is a fast, specific
 * message before a round trip, not re-implementing server validation.
 */

const emailField = z
  .string()
  .min(1, 'Enter your email address.')
  .pipe(z.email('Enter a valid email address.'));

export const registerFormSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'Enter a password.'),
});
export type RegisterFormValues = z.infer<typeof registerFormSchema>;

export const devSignInFormSchema = z.object({
  email: emailField,
});
export type DevSignInFormValues = z.infer<typeof devSignInFormSchema>;
