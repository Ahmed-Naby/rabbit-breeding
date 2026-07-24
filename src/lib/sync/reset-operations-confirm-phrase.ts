// Framework-agnostic (imported by both the Next.js API route and the
// Capacitor mobile bundle) so the phrase the mobile UI sends and the phrase
// the server checks can never drift apart. Distinct from WIPE_CONFIRM_PHRASE
// so a call intended to wipe everything can never accidentally trip the
// (less destructive, herd-preserving) operations-only reset, or vice versa.
export const RESET_OPERATIONS_CONFIRM_PHRASE = "RESET ALL OPERATIONS";
