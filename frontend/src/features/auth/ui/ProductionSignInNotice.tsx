/** Shown instead of the dev token form when VITE_ENABLE_DEV_TOKEN_LOGIN is off (spec 3.5). */
export function ProductionSignInNotice() {
  return (
    <p role="status" className="text-base text-fg-muted">
      Production sign-in is pending backend support. Use Create account to get started.
    </p>
  );
}
