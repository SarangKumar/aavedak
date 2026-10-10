/**
 * Profile field limits shared by the server (lib/profile.ts) and the Profile settings form.
 * Kept in a client-safe module so the form can import it without pulling in the database code.
 */
export const PROFILE_BIO_MAX = 1600;
