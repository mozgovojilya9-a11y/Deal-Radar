"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Dictionary, Locale } from "@/lib/site/i18n";
import { LIMITS, normalizeContact, validateContact, type ContactErrorCode, type ContactField } from "@/lib/site/contact";
import { Icon } from "./Icon";

type State = { status: "idle" | "sending" | "sent" | "error"; error?: ContactErrorCode };

export function ContactForm({ locale, t, privacyHref }: { locale: Locale; t: Dictionary["contact"]["form"]; privacyHref: string }) {
  const [state, setState] = useState<State>({ status: "idle" });
  const [invalid, setInvalid] = useState<ContactField[]>([]);
  const startedAt = useRef(0);
  const formRef = useRef<HTMLFormElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);

  useEffect(() => { startedAt.current = Date.now(); }, []);
  useEffect(() => { if (state.status === "sent" || state.status === "error") statusRef.current?.focus(); }, [state.status]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<string, string>;
    const message = normalizeContact(data);
    const errors = validateContact(message);
    setInvalid(errors);
    if (errors.length) {
      formRef.current?.querySelector<HTMLElement>(`[name="${errors[0]}"]`)?.focus();
      setState({ status: "idle" });
      return;
    }
    setState({ status: "sending" });
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...message, website: data.website || "", startedAt: startedAt.current, locale }),
      });
      const result = await response.json().catch(() => ({})) as { ok?: boolean; error?: string; fields?: ContactField[] };
      if (response.ok && result.ok) {
        setState({ status: "sent" });
        formRef.current?.reset();
        return;
      }
      if (result.error === "invalid" && Array.isArray(result.fields)) {
        setInvalid(result.fields);
        setState({ status: "idle" });
        return;
      }
      const known: ContactErrorCode[] = ["rate", "unavailable", "spam", "failed"];
      setState({ status: "error", error: known.includes(result.error as ContactErrorCode) ? result.error as ContactErrorCode : "failed" });
    } catch {
      setState({ status: "error", error: "failed" });
    }
  }

  const sending = state.status === "sending";
  const field = (name: ContactField, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className={name === "message" || name === "subject" ? "field full" : "field"}>
      <label htmlFor={`cf-${name}`}>{label}</label>
      {name === "message"
        ? <textarea id={`cf-${name}`} name={name} required minLength={LIMITS.message[0]} maxLength={LIMITS.message[1]}
            aria-invalid={invalid.includes(name)} aria-describedby={invalid.includes(name) ? `cf-${name}-err` : undefined} />
        : <input id={`cf-${name}`} name={name} required minLength={LIMITS[name][0]} maxLength={LIMITS[name][1]}
            aria-invalid={invalid.includes(name)} aria-describedby={invalid.includes(name) ? `cf-${name}-err` : undefined} {...props} />}
      {invalid.includes(name) && <span className="field-err" id={`cf-${name}-err`}>{t.errors[name]}</span>}
    </div>
  );

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate>
      <div className="fields">
        {field("name", t.name, { autoComplete: "name" })}
        {field("email", t.email, { type: "email", autoComplete: "email", inputMode: "email" })}
        {field("subject", t.subject)}
        {field("message", t.message)}
      </div>
      <div className="hp" aria-hidden="true">
        <label htmlFor="cf-website">{t.honeypot}</label>
        <input id="cf-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <div className="form-foot">
        <p>{t.privacy} <Link href={privacyHref}>{t.privacyLink}</Link></p>
        <button className="btn btn-primary" type="submit" disabled={sending}>
          {sending ? t.sending : t.submit}{!sending && <Icon name="send" size={16} />}
        </button>
      </div>
      <div ref={statusRef} tabIndex={-1} role="status" aria-live="polite" style={{ outline: "none" }}>
        {state.status === "sent" && <div className="alert ok"><Icon name="check" size={18} strokeWidth={2.2} /><span>{t.success}</span></div>}
        {state.status === "error" && state.error && state.error in t.errors && (
          <div className="alert err"><Icon name="close" size={18} /><span>{t.errors[state.error as keyof typeof t.errors]}</span></div>
        )}
      </div>
    </form>
  );
}
