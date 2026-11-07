import Link from "next/link";
import { getDictionary } from "@/lib/site/i18n";
import { Icon } from "../components/Icon";

/** Shown when a page under /nl or /en does not exist. Not-found pages receive no params, so Dutch is used. */
export default function NotFound() {
  const t = getDictionary("nl");
  const en = getDictionary("en");
  return (
    <section className="phero" style={{ borderBottom: 0, minHeight: "60vh" }}>
      <div className="grid-bg" />
      <div className="wrap">
        <span className="eyebrow">404</span>
        <h1 className="h1">{t.notFound.title}</h1>
        <p className="lead">{t.notFound.body} <span lang="en" className="muted">— {en.notFound.title}.</span></p>
        <div className="hero-cta">
          <Link className="btn btn-primary" href="/nl">{t.notFound.back}<Icon name="arrow" size={16} className="arrow" /></Link>
          <Link className="btn btn-ghost" href="/en" lang="en">{en.notFound.back}</Link>
        </div>
      </div>
    </section>
  );
}
