// Ambient module types for asset imports used under src/mobile, which is
// built separately by Vite (vite.config.mobile.ts, Phase 3) rather than by
// Next.js — this file exists purely so `tsc --noEmit`/`next build`'s
// whole-project type-check (which walks all of src/, not just what Next
// actually bundles) doesn't choke on Vite-only import syntax.
declare module "*.sql?raw" {
  const content: string;
  export default content;
}
