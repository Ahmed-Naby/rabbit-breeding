// Framework-agnostic (imported by both the Next.js API route and the
// Capacitor mobile bundle) so the phrase the mobile UI asks the user to
// type and the phrase the server checks can never drift apart. Distinct
// from WIPE_CONFIRM_PHRASE so the two destructive actions can't be
// triggered by muscle memory for the wrong one.
export const RESTORE_CONFIRM_PHRASE = "RESTORE ALL DATA";
