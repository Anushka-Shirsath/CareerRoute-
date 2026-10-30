"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { write } from "../api";
import { useData, useTask, useWorkspace } from "../context";
import {
  checklistLabels,
  costLabels,
  fmt,
  money,
  pretty,
  reportLabels,
  route,
  sections,
} from "../content";
import {
  ActionLink,
  Brand,
  Button,
  CheckField,
  Empty,
  ErrorState,
  Field,
  Icon,
  Loading,
  Notice,
  PageHeader,
  Panel,
  SourceLink,
  Tag,
  TextLink,
} from "../ui";
import type {
  Academic,
  Checklist,
  Cost,
  Locale,
  Offering,
  Page,
  ParentReport,
  PathwayId,
  ReportSnapshot,
} from "../types";

const reportCopy: Record<
  Locale,
  {
    title: string;
    intro: string;
    empty: string;
    goal: string;
    notVerified: string;
    estimates: string;
    institutional: string;
    personal: string;
    lower: string;
    total: string;
    next: string;
    notice: string;
    privateCategory: string;
    questions: string[];
  }
> = {
  en: {
    title: "A conversation about what comes next",
    intro: "A snapshot of the sections you chose to share. Plans can change.",
    empty: "Not added to this workspace yet.",
    goal: "Your selected goal",
    notVerified: "Not verified",
    estimates: "Student estimates",
    institutional: "Verified institutional subtotal",
    personal: "Personal estimates subtotal",
    lower: "Known lower bound",
    total: "Estimated total",
    next: "Next steps",
    notice:
      "Demo data. Past records do not predict future admission. Student estimates are not verified college fees.",
    privateCategory:
      "You explicitly chose to include this private comparison category.",
    questions: [
      "Which daily activities would I enjoy?",
      "Which costs are still unknown?",
      "Which official admission rules should we verify together?",
    ],
  },
  mr: {
    title: "पुढील वाटचालीबद्दल एक संवाद",
    intro:
      "तुम्ही शेअर करण्यासाठी निवडलेल्या भागांचा सारांश. योजना बदलू शकतात.",
    empty: "ही माहिती अद्याप जतन केलेली नाही.",
    goal: "तुम्ही निवडलेले ध्येय",
    notVerified: "पडताळलेले नाही",
    estimates: "विद्यार्थ्याचे अंदाज",
    institutional: "पडताळलेल्या संस्थात्मक शुल्काची बेरीज",
    personal: "वैयक्तिक अंदाजांची बेरीज",
    lower: "ज्ञात किमान खर्च",
    total: "अंदाजित एकूण खर्च",
    next: "पुढील पावले",
    notice:
      "डेमो माहिती. मागील नोंदींवरून भविष्यातील प्रवेशाचा अंदाज लावता येत नाही. विद्यार्थ्याचे अंदाज हे पडताळलेले महाविद्यालयीन शुल्क नाही.",
    privateCategory:
      "तुम्ही ही खाजगी तुलना श्रेणी शेअर करण्याची स्पष्ट निवड केली आहे.",
    questions: [
      "कोणती दैनंदिन कामे मला आवडतील?",
      "कोणते खर्च अजून माहीत नाहीत?",
      "प्रवेशाचे कोणते अधिकृत नियम आपण एकत्र तपासू?",
    ],
  },
  hi: {
    title: "आगे के रास्ते पर एक बातचीत",
    intro:
      "आपने साझा करने के लिए जो हिस्से चुने हैं, उनका सारांश। योजनाएँ बदल सकती हैं।",
    empty: "यह जानकारी अभी सेव नहीं की गई है।",
    goal: "आपका चुना हुआ लक्ष्य",
    notVerified: "सत्यापित नहीं",
    estimates: "विद्यार्थी के अनुमान",
    institutional: "सत्यापित संस्थागत शुल्क का उप-योग",
    personal: "व्यक्तिगत अनुमानों का उप-योग",
    lower: "ज्ञात न्यूनतम खर्च",
    total: "अनुमानित कुल खर्च",
    next: "अगले कदम",
    notice:
      "डेमो डेटा। पिछले रिकॉर्ड भविष्य के प्रवेश की भविष्यवाणी नहीं करते। विद्यार्थी के अनुमान सत्यापित कॉलेज शुल्क नहीं हैं।",
    privateCategory:
      "आपने इस निजी तुलना श्रेणी को साझा करने की स्पष्ट अनुमति दी है।",
    questions: [
      "मुझे कौन से दैनिक काम पसंद आएँगे?",
      "कौन से खर्च अभी अज्ञात हैं?",
      "हम प्रवेश के कौन से आधिकारिक नियम साथ में जाँचें?",
    ],
  },
};
const stepTranslations: Record<Locale, string[]> = {
  en: Object.values(checklistLabels),
  mr: [
    "सध्याचे अधिकृत प्रवेश नियम वाचा",
    "पुष्टी केलेल्या निकालाची प्रत ठेवा",
    "ओळख आणि रहिवासाची कागदपत्रे तपासा",
    "लागू असल्यास पर्यायी श्रेणीची कागदपत्रे तपासा",
    "अभ्यासक्रम आणि ज्ञात खर्चांची तुलना करा",
    "अधिकृत पोर्टलवर स्वतः अर्ज करा",
  ],
  hi: [
    "वर्तमान आधिकारिक प्रवेश नियम पढ़ें",
    "पुष्टि किए हुए परिणाम की प्रति रखें",
    "पहचान और निवास के दस्तावेज जाँचें",
    "लागू होने पर वैकल्पिक श्रेणी के दस्तावेज जाँचें",
    "पाठ्यक्रम और ज्ञात खर्चों की तुलना करें",
    "आधिकारिक पोर्टल पर स्वयं आवेदन करें",
  ],
};
const routeNames: Record<Locale, Record<string, string>> = {
  en: {},
  mr: {
    fyjc_science: "FYJC विज्ञान",
    fyjc_commerce: "FYJC वाणिज्य",
    fyjc_arts: "FYJC कला",
    polytechnic_diploma: "पॉलिटेक्निक डिप्लोमा",
    iti_trade: "ITI व्यवसाय",
    vocational: "व्यावसायिक अभ्यासक्रम",
  },
  hi: {
    fyjc_science: "FYJC विज्ञान",
    fyjc_commerce: "FYJC वाणिज्य",
    fyjc_arts: "FYJC कला",
    polytechnic_diploma: "पॉलिटेक्निक डिप्लोमा",
    iti_trade: "ITI ट्रेड",
    vocational: "व्यावसायिक पाठ्यक्रम",
  },
};
const routeName = (id: string, locale: Locale) =>
  routeNames[locale][id] || route(id)?.name || pretty(id);
export function ReportView({
  snapshot,
  locale = "en",
  publicView = false,
}: {
  snapshot: ReportSnapshot;
  locale?: Locale;
  publicView?: boolean;
}) {
  const copy = reportCopy[locale];
  return (
    <article className="report-preview">
      <Brand />
      {publicView ? <h1>{copy.title}</h1> : <h2>{copy.title}</h2>}
      <p className="report-meta">
        {copy.intro}
        <br />
        {new Date(snapshot.created_at).toLocaleDateString(
          locale === "en" ? "en-IN" : locale + "-IN",
          { day: "numeric", month: "long", year: "numeric" },
        )}{" "}
        ·{" "}
        {locale === "en"
          ? "Demo data"
          : locale === "mr"
            ? "डेमो माहिती"
            : "डेमो डेटा"}
      </p>
      {Object.entries(snapshot.sections).map(([key, value]) => (
        <section className="report-section" key={key}>
          <h3>{reportLabels[locale][key] || pretty(key)}</h3>
          {value == null ? (
            <p>{copy.empty}</p>
          ) : key === "academic_summary" ? (
            (() => {
              const a = value as Academic;
              return (
                <>
                  <p>
                    {a.board === "SSC_MH" ? "Maharashtra SSC" : a.board} ·{" "}
                    {a.exam_year}
                  </p>
                  <div className="subject-chart">
                    {a.subjects.map((s, i) => (
                      <div className="subject-bar-row" key={i}>
                        <span>{s.name_as_shown}</span>
                        <div className="subject-bar-track">
                          <div
                            className="subject-bar-fill"
                            style={{
                              width:
                                s.percentage == null ? 0 : s.percentage + "%",
                            }}
                          />
                        </div>
                        <span className="num">
                          {s.percentage == null
                            ? s.grade_label
                            : s.percentage.toFixed(1) + "%"}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="panel-note">
                    {locale === "en"
                      ? "Average of entered subjects, not an official admission aggregate"
                      : locale === "mr"
                        ? "नोंदवलेल्या विषयांची सरासरी; अधिकृत प्रवेश गुणांची बेरीज नाही"
                        : "दर्ज किए विषयों का औसत; आधिकारिक प्रवेश अंक नहीं"}
                    :{" "}
                    {a.aggregate.value == null
                      ? "—"
                      : a.aggregate.value.toFixed(1) + "%"}
                  </p>
                </>
              );
            })()
          ) : key === "compass_summary" ? (
            (() => {
              const summary = value as {
                coverage: string;
                routes: {
                  pathway_id: string;
                  why: string[];
                  limited_evidence: boolean;
                }[];
              };
              return (
                <>
                  <p>
                    {locale === "en"
                      ? "Exploratory signals, not a verdict."
                      : "हे संकेत शोधासाठी आहेत; अंतिम निर्णय नाही."}
                  </p>
                  {summary.routes.map((r) => (
                    <div className="readiness-row" key={r.pathway_id}>
                      <strong>{routeName(r.pathway_id, locale)}</strong>
                      {locale === "en" &&
                        r.why.slice(0, 2).map((w, i) => <p key={i}>{w}</p>)}
                    </div>
                  ))}
                </>
              );
            })()
          ) : key === "routes_and_alternatives" ? (
            (() => {
              const routes = value as {
                goal: string | null;
                alternatives: string[];
              };
              return (
                <>
                  <p>
                    {copy.goal}:{" "}
                    <strong>
                      {routes.goal
                        ? routeName(routes.goal, locale)
                        : copy.empty}
                    </strong>
                  </p>
                  <ul>
                    {routes.alternatives.map((id) => (
                      <li key={id}>{routeName(id, locale)}</li>
                    ))}
                  </ul>
                </>
              );
            })()
          ) : key === "shortlist" ? (
            (() => {
              const items = value as {
                offering_id: string;
                status_label: string;
                facts: Offering | null;
              }[];
              return items.length ? (
                <>
                  {items.map((item) => (
                    <div className="readiness-row" key={item.offering_id}>
                      <strong>{item.facts?.program_name || "Offering"}</strong>
                      <p>{item.facts?.name}</p>
                      <p>
                        {item.facts?.academic_year || copy.notVerified} ·{" "}
                        {item.status_label}
                      </p>
                      {item.facts && <SourceLink id={item.facts.source_id} />}
                    </div>
                  ))}
                </>
              ) : (
                <p>{copy.empty}</p>
              );
            })()
          ) : key === "costs" ? (
            (() => {
              const costs = value as { offerings: Cost[] };
              return costs.offerings?.length ? (
                <>
                  {costs.offerings.map((cost) => {
                    const known = cost.lines.some(
                      (l) => l.status !== "unknown",
                    );
                    return (
                      <div className="readiness-row" key={cost.offering_id}>
                        <strong>{cost.institution_name}</strong>
                        <p>
                          {cost.academic_year} ·{" "}
                          {cost.total_label === "at least"
                            ? copy.lower
                            : copy.total}
                          :{" "}
                          <strong>
                            {known
                              ? money(cost.estimated_total)
                              : copy.notVerified}
                          </strong>
                        </p>
                        <div className="cost-row">
                          <span>{copy.institutional}</span>
                          <span>
                            {cost.lines.some(
                              (l) =>
                                l.status === "official_source" ||
                                l.status === "institution_source",
                            )
                              ? money(cost.verified_institutional_total)
                              : copy.notVerified}
                          </span>
                        </div>
                        <div className="cost-row">
                          <span>{copy.personal}</span>
                          <span>
                            {cost.lines.some((l) => l.status === "estimate")
                              ? money(cost.estimated_personal_total)
                              : copy.empty}
                          </span>
                        </div>
                        <p>
                          {locale === "en"
                            ? "Incomplete institutional fees; estimates do not make this a complete cost."
                            : locale === "mr"
                              ? "संस्थात्मक शुल्क अपूर्ण आहे. हे पूर्ण खर्चाचे मोजमाप नाही."
                              : "संस्थागत शुल्क अधूरा है। यह पूर्ण खर्च का माप नहीं है।"}
                        </p>
                      </div>
                    );
                  })}
                </>
              ) : (
                <p>{copy.empty}</p>
              );
            })()
          ) : key === "next_steps" ? (
            (() => {
              const items = value as Checklist[];
              return items.length ? (
                <div>
                  {items.map((item) => {
                    const index = Object.keys(checklistLabels).indexOf(
                      item.label_key,
                    );
                    return (
                      <div className="checklist-row" key={item.id}>
                        <Icon name={item.done ? "done" : "circle"} size={15} />
                        <span>
                          {stepTranslations[locale][index] ||
                            checklistLabels[item.label_key] ||
                            item.label_key}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p>{copy.empty}</p>
              );
            })()
          ) : key === "questions_to_discuss" ? (
            <ul>
              {copy.questions.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
          ) : key === "category_used_in_comparison" ? (
            <>
              <p>{copy.privateCategory}</p>
              <p>
                <strong>
                  {(value as { category_code: string | null }).category_code ||
                    copy.notVerified}
                </strong>
              </p>
            </>
          ) : (
            <p>{copy.empty}</p>
          )}
        </section>
      ))}
      <div className="notice section-gap">
        <Icon name="shield" />
        <p>{copy.notice}</p>
      </div>
    </article>
  );
}

type ShareItem = {
  id: string;
  report_id: string;
  expires_at: string;
  revoked: boolean;
  sections: string[];
};
export function ReportBuilderPage() {
  const ws = useWorkspace(),
    task = useTask();
  const locale: Locale = "en";
  const [selected, setSelected] = useState<string[]>(["costs", "next_steps"]),
    [days, setDays] = useState(7),
    [report, setReport] = useState<ParentReport | null>(null),
    [createdSelection, setCreatedSelection] = useState(""),
    [revoked, setRevoked] = useState(false);
  const shares = useData<Page<ShareItem>>("/me/parent-reports");
  const create = () =>
    task.run(async () => {
      const value = await write<ParentReport>("/parent-reports", {
        sections: selected,
        locale_default: locale,
        expires_in_days: days,
      });
      setReport(value);
      setCreatedSelection(selected.join("|"));
      setRevoked(false);
      await shares.reload();
      ws.notify("Your report includes only the sections you selected.");
    });
  const token = report?.share_url.split("/").pop() || "";
  const shareUrl =
    report && typeof window !== "undefined"
      ? window.location.origin + "/r/" + token + "?locale=" + locale
      : "";
  const revoke = (id: string) =>
    task.run(async () => {
      await write("/parent-reports/" + id + "/share", undefined, "DELETE");
      if (report?.report_id === id) setRevoked(true);
      await shares.reload();
      ws.notify("That share link is revoked immediately.");
    });
  const copyLink = () =>
    task.run(async () => {
      await navigator.clipboard.writeText(shareUrl);
      ws.notify("Report link copied.");
    });
  return (
    <>
      <PageHeader
        title="Start a good conversation"
        description="Choose what to share with your parents. The report is a snapshot; private chats, notes and raw game choices stay out."
      />
      <div className="report-layout">
        <div className="flow">
          <Panel
            title="What would you like to share?"
            className="report-options"
          >
            <div className="report-section-options">
              {sections.map((section) => (
                <CheckField
                  key={section.key}
                  label={section.label}
                  description={section.description}
                  checked={selected.includes(section.key)}
                  onChange={(value) =>
                    setSelected((old) =>
                      value
                        ? [...old, section.key]
                        : old.filter((k) => k !== section.key),
                    )
                  }
                />
              ))}
            </div>
            <div className="form-grid section-gap">
              <Field label="Link expires after">
                <select
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value))}
                >
                  <option value={1}>1 day</option>
                  <option value={7}>7 days</option>
                  <option value={14}>14 days</option>
                  <option value={30}>30 days</option>
                </select>
              </Field>
            </div>
            <div className="section-gap">
              <Button
                busy={task.busy}
                disabled={!selected.length}
                onClick={create}
                icon="book"
              >
                Create report & preview
              </Button>
            </div>
            {task.error && <ErrorState message={task.error} />}
          </Panel>
          {shares.data && shares.data.items.length > 0 && (
            <Panel title="Your share links">
              {shares.data.items.map((item) => (
                <div className="share-row" key={item.id}>
                  <div>
                    <strong>
                      {item.revoked
                        ? "Revoked"
                        : new Date(item.expires_at) < new Date()
                          ? "Expired"
                          : "Active report"}
                    </strong>
                    <small>
                      {item.sections.length} sections · until{" "}
                      {new Date(item.expires_at).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                      })}
                    </small>
                  </div>
                  {!item.revoked && new Date(item.expires_at) > new Date() && (
                    <button
                      className="text-link"
                      onClick={() => revoke(item.report_id)}
                      disabled={task.busy}
                    >
                      Revoke
                    </button>
                  )}
                </div>
              ))}
            </Panel>
          )}
        </div>
        <div className="flow">
          {!report ? (
            <Panel>
              <Empty
                title="A report with your boundaries"
                action={<Tag>{selected.length} sections selected</Tag>}
              >
                Create the report to preview exactly what the share link will
                contain. An unchecked section is excluded, and changes to your
                workspace don’t change an existing snapshot.
              </Empty>
              <Notice icon="shield">
                Your optional comparison category stays out unless you
                explicitly check its own section.
              </Notice>
            </Panel>
          ) : (
            <>
              {createdSelection !== selected.join("|") && (
                <Notice>
                  Your selection changed. Create a new report to apply it to the
                  shared snapshot.
                </Notice>
              )}
              <div className="share-actions panel">
                <div className="actions spaced">
                  <strong>
                    {revoked
                      ? "This share link is revoked"
                      : "Your report is ready to share"}
                  </strong>
                  <Tag>
                    {report.preview.sections
                      ? Object.keys(report.preview.sections).length
                      : 0}{" "}
                    sections
                  </Tag>
                </div>
                {!revoked && (
                  <>
                    <div className="share-link-field">
                      <input
                        aria-label="Parent report share link"
                        readOnly
                        value={shareUrl}
                        onFocus={(e) => e.target.select()}
                      />
                      <button
                        aria-label="Copy parent report link"
                        onClick={copyLink}
                      >
                        <Icon name="copy" size={16} />
                      </button>
                    </div>
                    <div className="actions">
                      <a
                        className="button primary"
                        href={shareUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Open shared report <Icon name="up" size={15} />
                      </a>
                      <a
                        className="button secondary"
                        href={
                          "https://wa.me/?text=" +
                          encodeURIComponent(
                            "Here is my CareerQuest report: " + shareUrl,
                          )
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Share on WhatsApp <Icon name="external" size={15} />
                      </a>
                      <Button
                        variant="text"
                        icon="download"
                        onClick={() => window.print()}
                      >
                        Print
                      </Button>
                    </div>
                    <p className="panel-note">
                      Expires{" "}
                      {new Date(report.expires_at).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                      . Anyone with this link can see these selected sections.
                    </p>
                  </>
                )}
              </div>
              <ReportView snapshot={report.preview} locale={locale} />
            </>
          )}
        </div>
      </div>
    </>
  );
}

export function SharedReportPage({ token }: { token: string }) {
  const locale: Locale = "en";
  const { data, loading, error, reload } = useData<ReportSnapshot>(
    "/r/" + encodeURIComponent(token) + "?locale=" + locale,
  );
  return (
    <div className="public-report-shell">
      <header className="public-report-controls">
        <Brand small />
        <div className="actions">
          <Button
            variant="secondary"
            icon="download"
            onClick={() => window.print()}
          >
            Print report
          </Button>
        </div>
      </header>
      <main>
        {loading ? (
          <div style={{ maxWidth: 850, margin: "auto" }}>
            <Panel>
              <h1>Opening your report</h1>
              <Loading />
            </Panel>
          </div>
        ) : error ? (
          <div style={{ maxWidth: 850, margin: "auto" }}>
            <Panel>
              <h1>This report isn’t available</h1>
              <p className="section-gap muted">
                The link may have expired or been revoked by the student. Ask
                them for a new report link.
              </p>
              <div className="section-gap">
                <ActionLink href="/" variant="secondary">
                  About CareerQuest
                </ActionLink>
              </div>
            </Panel>
          </div>
        ) : data ? (
          <>
            <ReportView snapshot={data} locale={locale} publicView />
          </>
        ) : null}
      </main>
      <footer className="public-report-footer">
        <span>CareerQuest Maharashtra · A student-controlled snapshot</span>
        <Link href="/privacy">Privacy & data</Link>
      </footer>
    </div>
  );
}
