/**
 * Shared return shape for framework-agnostic business-logic functions
 * (*-ops.ts). Callers (web Server Action wrappers today, sync API routes
 * later) map `code` to a localized message independently — ops themselves
 * never import the dictionary.
 */
export type OpResult<T, Code = never> =
  | { ok: true; data: T }
  | { ok: false; code: Code };
