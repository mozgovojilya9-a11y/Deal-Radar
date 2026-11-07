/** Contact form rules, shared by the browser (instant feedback) and /api/contact (authoritative). */

export type ContactField = "name" | "email" | "subject" | "message";
export type ContactInput = { name: string; email: string; subject: string; message: string };
export type ContactErrorCode = ContactField | "rate" | "unavailable" | "failed" | "spam";

export const LIMITS = {
  name: [2, 80],
  email: [6, 254],
  subject: [3, 120],
  message: [10, 4000],
} as const satisfies Record<ContactField, readonly [number, number]>;

/** Minimum time between rendering the form and submitting it; faster submissions are bots. */
export const MIN_FILL_MS = 2500;

const EMAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i;

function clean(value: unknown, multiline = false): string {
  if (typeof value !== "string") return "";
  // Strip control characters (keep newlines and tabs in the message body).
  const stripped = multiline ? value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "") : value.replace(/[\u0000-\u001F\u007F]/g, " ");
  return stripped.trim();
}

export function normalizeContact(raw: Record<string, unknown>): ContactInput {
  return {
    name: clean(raw.name).replace(/\s+/g, " "),
    email: clean(raw.email).toLowerCase(),
    subject: clean(raw.subject).replace(/\s+/g, " "),
    message: clean(raw.message, true).replace(/\r\n?/g, "\n"),
  };
}

export function validateContact(input: ContactInput): ContactField[] {
  const errors: ContactField[] = [];
  for (const field of Object.keys(LIMITS) as ContactField[]) {
    const [min, max] = LIMITS[field];
    const length = input[field].length;
    if (length < min || length > max) errors.push(field);
  }
  if (!errors.includes("email") && !EMAIL.test(input.email)) errors.push("email");
  return errors;
}

/** Cheap heuristics on top of the honeypot and timing checks. */
export function looksLikeSpam(input: ContactInput): boolean {
  const text = `${input.subject}\n${input.message}`;
  const links = (text.match(/https?:\/\/|www\./gi) || []).length;
  if (links > 3) return true;
  if (/<a\s+href|\[url=/i.test(text)) return true;
  return false;
}
