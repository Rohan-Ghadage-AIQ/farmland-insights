import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ErrorBanner, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui';
import { env } from '@/lib/env';
import { DevTokenSignInForm } from './DevTokenSignInForm';
import { ProductionSignInNotice } from './ProductionSignInNotice';
import { RegisterForm } from './RegisterForm';

export interface LoginCardProps {
  /** Defaults to VITE_ENABLE_DEV_TOKEN_LOGIN; overridable for tests. */
  readonly devTokenLoginEnabled?: boolean;
}

interface LoginLocationState {
  readonly reason?: 'expired';
}

function isLoginLocationState(value: unknown): value is LoginLocationState {
  return typeof value === 'object' && value !== null;
}

/** Centered /login card (spec 3.5): Sign in (dev token, or a pending note) and Create account. */
export function LoginCard({ devTokenLoginEnabled = env.enableDevTokenLogin }: LoginCardProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const next = searchParams.get('next') ?? '/';
  const state = isLoginLocationState(location.state) ? location.state : undefined;
  const expired = state?.reason === 'expired';

  const handleSuccess = (): void => {
    void navigate(next, { replace: true });
  };

  return (
    <div className="flex flex-col gap-4">
      {expired ? (
        <ErrorBanner tone="warning" title="Signed out" message="Your session expired." />
      ) : null}
      <Tabs defaultValue="sign-in">
        <TabsList aria-label="Sign in or create an account">
          <TabsTrigger value="sign-in">Sign in</TabsTrigger>
          <TabsTrigger value="register">Create account</TabsTrigger>
        </TabsList>
        <TabsContent value="sign-in">
          {devTokenLoginEnabled ? (
            <DevTokenSignInForm onSuccess={handleSuccess} />
          ) : (
            <ProductionSignInNotice />
          )}
        </TabsContent>
        <TabsContent value="register">
          <RegisterForm onSuccess={handleSuccess} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
