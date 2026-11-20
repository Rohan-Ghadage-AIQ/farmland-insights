import { describe, expect, it } from 'vitest';
import { devSignInFormSchema, registerFormSchema } from './schemas';

/** The message of the first issue for a field, or undefined when there is none. */
function fieldMessage(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
  field: string,
) {
  return issues.find((issue) => issue.path[0] === field)?.message;
}

describe('registerFormSchema', () => {
  it('accepts a valid email and a non-empty password', () => {
    const result = registerFormSchema.safeParse({ email: 'farmer@example.com', password: 'pw' });
    expect(result.success).toBe(true);
  });

  it('requires an email', () => {
    const result = registerFormSchema.safeParse({ email: '', password: 'pw' });
    expect(result.success).toBe(false);
    expect(result.success ? undefined : fieldMessage(result.error.issues, 'email')).toBe(
      'Enter your email address.',
    );
  });

  it('rejects a malformed email', () => {
    const result = registerFormSchema.safeParse({ email: 'not-an-email', password: 'pw' });
    expect(result.success).toBe(false);
    expect(result.success ? undefined : fieldMessage(result.error.issues, 'email')).toBe(
      'Enter a valid email address.',
    );
  });

  it('requires a non-empty password', () => {
    const result = registerFormSchema.safeParse({ email: 'farmer@example.com', password: '' });
    expect(result.success).toBe(false);
    expect(result.success ? undefined : fieldMessage(result.error.issues, 'password')).toBe(
      'Enter a password.',
    );
  });
});

describe('devSignInFormSchema', () => {
  it('accepts a valid email and nothing else', () => {
    const result = devSignInFormSchema.safeParse({ email: 'farmer@example.com' });
    expect(result.success).toBe(true);
  });

  it('requires an email', () => {
    const result = devSignInFormSchema.safeParse({ email: '' });
    expect(result.success).toBe(false);
  });
});
