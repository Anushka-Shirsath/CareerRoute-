"use client";
import { useState } from "react";
import { write } from "../api";
import { useData, useTask, useWorkspace } from "../context";
import { districts, fmt, money, pretty } from "../content";
import {
  ActionLink,
  Button,
  ConfirmDialog,
  ErrorState,
  Field,
  Icon,
  Loading,
  Notice,
  PageHeader,
  Panel,
  TextLink,
  Toggle,
} from "../ui";
import type { AuthStatus, Coverage, Memory, Page } from "../types";
import { PASSWORD_HINT } from "./login";

function memoryText(memory: Memory) {
  if (memory.kind === "preference") {
    try {
      const p = JSON.parse(memory.content);
      return [
        p.target_districts?.length
          ? "Target districts: " + p.target_districts.join(", ")
          : "All districts",
        p.tuition_cap_inr != null
          ? "Tuition budget: " + money(p.tuition_cap_inr)
          : null,
        p.government !== "any" ? "Government " + p.government : null,
        p.hostel !== "any" ? "Hostel " + p.hostel : null,
      ]
        .filter(Boolean)
        .join(" · ");
    } catch {}
  }
  return memory.content.replaceAll("SSC_MH", "Maharashtra SSC");
}
function AccountSection() {
  const status = useData<AuthStatus>("/auth/status");
  const task = useTask();
  const [email, setEmail] = useState(""),
    [current, setCurrent] = useState(""),
    [next, setNext] = useState(""),
    [done, setDone] = useState("");
  if (!status.data?.enabled) return null;
  const leave = (path: string) =>
    task.run(async () => {
      await write(path);
      window.location.assign("/");
    });
  const change = (event: React.FormEvent) => {
    event.preventDefault();
    setDone("");
    task.run(async () => {
      const result = await write<{ message: string }>("/auth/password/change", {
        email,
        current_password: current,
        new_password: next,
      });
      setCurrent("");
      setNext("");
      setDone(result.message);
    });
  };
  return (
    <section className="settings-section">
      <div className="settings-label">
        <h2>Your account</h2>
        <p>
          {status.data.signed_in
            ? `You stay signed in for up to ${status.data.session_days} days, or until ${status.data.idle_days} days pass without a visit.`
            : "Sign in to keep your work across devices. Your guest workspace stays separate."}
        </p>
      </div>
      <Panel>
        {!status.data.signed_in ? (
          <ActionLink href="/login" variant="primary">
            Sign in or create an account
          </ActionLink>
        ) : (
          <>
            <div className="actions spaced">
              <Button variant="secondary" busy={task.busy} onClick={() => leave("/auth/logout")}>
                Sign out
              </Button>
              <Button variant="text" disabled={task.busy} onClick={() => leave("/auth/logout-all")}>
                Sign out of all devices
              </Button>
            </div>
            <form className="section-gap" onSubmit={change} aria-labelledby="change-password-heading">
              <h3 id="change-password-heading">Change password</h3>
              <div className="form-grid section-gap">
              <Field label="Email address" className="wide">
                <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} required />
              </Field>
              <Field label="Current password">
                <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} minLength={8} maxLength={128} required />
              </Field>
              <Field label="New password" hint={PASSWORD_HINT + " Other devices will be signed out."}>
                <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} minLength={10} maxLength={128} required />
              </Field>
              </div>
              <div className="actions section-gap">
                <Button type="submit" busy={task.busy}>Change password</Button>
              </div>
            </form>
          </>
        )}
        {task.error && <ErrorState message={task.error} />}
        {done && <Notice icon="check">{done}</Notice>}
      </Panel>
    </section>
  );
}

export function SettingsPage() {
  const ws = useWorkspace(),
    task = useTask(),
    profile = ws.dashboard!.profile;
  const memory = useData<Page<Memory>>("/me/memory");
  const [name, setName] = useState(profile.display_name || ""),
    [city, setCity] = useState(profile.home_city || ""),
    [district, setDistrict] = useState(profile.home_district || ""),
    [history, setHistory] = useState(profile.chat_history_enabled !== false),
    [confirm, setConfirm] = useState<"workspace" | "memory" | "chat" | null>(
      null,
    );
  const save = () =>
    task.run(async () => {
      await write(
        "/me/profile",
        {
          display_name: name || null,
          home_city: city || null,
          home_district: district || null,
          locale: "en",
        },
        "PATCH",
      );
      await ws.refresh();
      ws.notify("Your profile is saved.");
    });
  const removeMemory = (id: string) =>
    task.run(async () => {
      await write("/me/memory/" + id, undefined, "DELETE");
      await memory.reload();
      ws.notify("Memory removed.");
    });
  return (
    <>
      <PageHeader
        title="Your information, your say"
        description="Review what’s saved, change what matters, and remove what you no longer want to keep."
      />
      <AccountSection />
      <section className="settings-section">
        <div className="settings-label">
          <h2>Your workspace</h2>
          <p>
            Your home location helps with proximity preferences. Keep this
            assignment workspace synthetic.
          </p>
          <p>
            Browser sessions last up to 30 days. Your demo workspace is linked
            to this browser and cannot be recovered on another device.
          </p>
        </div>
        <Panel>
          <div className="form-grid">
            <Field label="Display name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
              />
            </Field>
            <Field label="Home city">
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                maxLength={80}
              />
            </Field>
            <Field label="Home district">
              <select
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
              >
                <option value="">Not provided</option>
                {districts.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="actions end section-gap">
            <Button busy={task.busy} onClick={save}>
              Save profile
            </Button>
          </div>
          {task.error && <ErrorState message={task.error} />}
        </Panel>
      </section>
      <section className="settings-section">
        <div className="settings-label">
          <h2>What the mentor remembers</h2>
          <p>
            Confirmed facts come from your reviewed result. Preferences come
            from your saved settings. A remembered inference is labelled as a
            guess.
          </p>
          <p>
            Deleting a memory leaves its original result or preference in your
            workspace. Use the controls for those records to change them.
          </p>
          <div className="section-gap">
            <TextLink href="/mentor">Back to the mentor</TextLink>
          </div>
        </div>
        <Panel>
          {memory.loading ? (
            <Loading />
          ) : memory.error ? (
            <ErrorState message={memory.error} retry={memory.reload} />
          ) : memory.data?.items.length ? (
            <>
              {memory.data.items.map((m) => (
                <div className="memory-row" key={m.id}>
                  <div>
                    <strong>{memoryText(m)}</strong>
                    <small>
                      {m.kind === "inference"
                        ? "Guess, accepted by you"
                        : pretty(m.kind)}
                    </small>
                  </div>
                  <button
                    className="icon-button"
                    aria-label={"Delete memory: " + memoryText(m)}
                    disabled={task.busy}
                    onClick={() => removeMemory(m.id)}
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              ))}
              <Button
                variant="text"
                className="section-gap"
                onClick={() => setConfirm("memory")}
                icon="trash"
              >
                Clear all mentor memory
              </Button>
            </>
          ) : (
            <p className="muted">No mentor memories are saved.</p>
          )}
        </Panel>
      </section>
      <section className="settings-section">
        <div className="settings-label">
          <h2>Chat history</h2>
          <p>
            When history is off, new messages are not stored. Turning it off
            also removes the messages already stored in this workspace.
          </p>
        </div>
        <Panel>
          <Toggle
            label="Save mentor conversations"
            description={
              history
                ? "Conversations can be restored when you return."
                : "New conversations won’t be saved."
            }
            checked={history}
            onChange={setHistory}
          />
          <div className="actions spaced section-gap">
            <Button variant="text" onClick={() => setConfirm("chat")}>
              Delete chat history
            </Button>
            <Button
              variant="secondary"
              busy={task.busy}
              onClick={() =>
                task.run(async () => {
                  await write(
                    "/me/profile",
                    { chat_history_enabled: history },
                    "PATCH",
                  );
                  await ws.refresh();
                  ws.notify("Your chat-history preference is saved.");
                })
              }
            >
              Save history setting
            </Button>
          </div>
        </Panel>
      </section>
      <section className="settings-section">
        <div className="settings-label">
          <h2>Delete this workspace</h2>
          <p>
            This removes your results, mission history, memories, saved
            offerings, uploaded content and parent-report shares. Existing share
            links stop working.
          </p>
        </div>
        <Panel className="danger-panel">
          <p className="muted">
            This action can’t be undone. You can start a new anonymous demo
            workspace afterwards.
          </p>
          <div className="section-gap">
            <Button
              variant="danger"
              icon="trash"
              onClick={() => setConfirm("workspace")}
            >
              Delete my workspace
            </Button>
          </div>
        </Panel>
      </section>
      {confirm && (
        <ConfirmDialog
          title={
            confirm === "workspace"
              ? "Delete your entire workspace?"
              : confirm === "memory"
                ? "Clear all mentor memory?"
                : "Delete all saved chat history?"
          }
          description={
            confirm === "workspace"
              ? "All owned data and report shares will be removed. Your existing report links will become unavailable."
              : confirm === "memory"
                ? "Every saved mentor memory will be removed. Your original result and preferences remain available in their own sections."
                : "Saved mentor messages will be permanently removed from this workspace."
          }
          confirmLabel={
            confirm === "workspace"
              ? "Delete workspace"
              : confirm === "memory"
                ? "Clear memory"
                : "Delete history"
          }
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            if (confirm === "workspace") await ws.deleteWorkspace();
            else if (confirm === "memory") {
              await write("/me/memory", undefined, "DELETE");
              await memory.reload();
              ws.notify("All mentor memory cleared.");
            } else {
              await write("/me/chat-history", undefined, "DELETE");
              ws.notify("Chat history deleted.");
            }
          }}
        />
      )}
    </>
  );
}

export function CoveragePage() {
  const ws = useWorkspace();
  const { data, loading, error, reload } = useData<Coverage>("/data/coverage");
  const [filter, setFilter] = useState("");
  const rows =
    data?.districts.filter((d) =>
      d.district.toLowerCase().includes(filter.toLowerCase()),
    ) || [];
  return (
    <>
      <PageHeader
        title="Good guidance starts with honest data"
        description="See exactly what is published, which academic years are covered, and where the gaps remain."
      />
      <Panel>
        <div className="coverage-summary">
          <div>
            <span>Published institutions</span>
            <strong>{fmt(ws.stats?.institutions)}</strong>
            <span>Unresolved records are withheld</span>
          </div>
          <div>
            <span>Published offerings</span>
            <strong>{fmt(ws.stats?.offerings)}</strong>
            <span>Programs and years stay distinct</span>
          </div>
          <div>
            <span>Linked source records</span>
            <strong>{fmt(ws.stats?.sources)}</strong>
            <span>Inherited provenance + reviewed extract</span>
          </div>
        </div>
        <Notice icon="shield">
          The supplied Polytechnic extract confirms no district, fee, hostel or
          public institute-level cutoff data in the checked feeds. FYJC
          historical values have an unspecified metric. Missing values are never
          presented as zero or false.
        </Notice>
      </Panel>
      <Panel
        title="District coverage"
        className="section-gap"
        action={
          <div className="search-field" style={{ maxWidth: 220 }}>
            <Icon name="search" size={15} />
            <input
              aria-label="Search coverage districts"
              placeholder="Find a district"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              maxLength={80}
            />
          </div>
        }
      >
        {loading ? (
          <Loading lines={5} />
        ) : error ? (
          <ErrorState message={error} retry={reload} />
        ) : data ? (
          <>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="District coverage table">
              <table className="coverage-table">
                <caption>
                  Blank or a dash means no data, not an assertion that an
                  institute or fee does not exist.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">District</th>
                    <th scope="col" className="num">
                      FYJC colleges
                    </th>
                    <th scope="col" className="num">
                      Polytechnic
                    </th>
                    <th scope="col" className="num">
                      ITI institutes
                    </th>
                    <th scope="col">Historical years</th>
                    <th scope="col" className="num">
                      Poly fee verified
                    </th>
                    <th scope="col" className="num">
                      Hostel known
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((d) => (
                    <tr key={d.district}>
                      <td>
                        {d.district}
                        <small>
                          {d.layer === "depth"
                            ? "Depth target"
                            : "Directory layer"}
                        </small>
                      </td>
                      <td className="num">
                        {fmt(d.fyjc_colleges)}
                        {d.fyjc_offerings != null && (
                          <small>{fmt(d.fyjc_offerings)} offerings</small>
                        )}
                      </td>
                      <td className="num">
                        {fmt(d.poly_institutes)}
                        {d.poly_offerings != null && (
                          <small>{fmt(d.poly_offerings)} offerings</small>
                        )}
                      </td>
                      <td className="num">{fmt(d.iti_institutes)}</td>
                      <td>
                        {d.fyjc_cutoff_years.length
                          ? d.fyjc_cutoff_years.join(", ")
                          : "—"}
                        <small>Metric not verified</small>
                      </td>
                      <td className="num">
                        {d.poly_fee_verified_pct == null
                          ? "—"
                          : d.poly_fee_verified_pct + "%"}
                      </td>
                      <td className="num">
                        {d.hostel_known_pct == null
                          ? "—"
                          : d.hostel_known_pct + "%"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!rows.length && (
              <p className="panel-note">No district matches your search.</p>
            )}
            <p className="panel-note">
              {fmt(data.unknown_location_institutions)} published institutions
              have unknown or ambiguous district assignments. A combined Mumbai
              City/Suburban source label is not silently assigned to either
              district.
            </p>
          </>
        ) : null}
      </Panel>
      <div className="grid section-gap">
        <Panel className="span-6" title="What the labels mean">
          <div className="readiness-row">
            <strong>Official source</strong>
            <p>
              Source-linked information inherited from the provided database or
              reviewed extract, with its academic year displayed.
            </p>
          </div>
          <div className="readiness-row">
            <strong>Student estimate</strong>
            <p>
              A cost assumption you entered. It is kept separate from verified
              institutional fees.
            </p>
          </div>
          <div className="readiness-row">
            <strong>Not verified</strong>
            <p>
              No trustworthy value is available. It never means free,
              unavailable or ineligible.
            </p>
          </div>
        </Panel>
        <Panel className="span-6" title="What we will never turn into a score">
          <p className="muted">
            Eligibility rules, historical record comparison and preference
            ranking are separate answers. CareerQuest does not provide admission
            probabilities or predict an allotment.
          </p>
          <p className="panel-note">
            Existing verification flags come from the supplied dataset; this is
            not a claim of a new independent human audit. Source redistribution
            terms still need review.
          </p>
          <div className="actions section-gap">
            <ActionLink href="/colleges" variant="secondary">
              Browse source-linked offerings
            </ActionLink>
          </div>
        </Panel>
      </div>
    </>
  );
}

export function PrivacyPage() {
  return (
    <>
      <PageHeader
        title="Room to explore, control to choose"
        description="A straightforward guide to this assignment build and the information it saves."
      />
      <div className="prose">
        <section>
          <h2>This is a synthetic-data demo</h2>
          <p>
            CareerQuest is an assignment website for exploring
            options after Class 10. Use sample results, synthetic marksheets and
            fictional personal details. Real-student launch and parental-consent
            processes are outside this demo.
          </p>
        </section>
        <section>
          <h2>Your browser has its own workspace</h2>
          <p>
            An opaque browser cookie links your results, preferences, mission
            progress, shortlist and saved mentor conversations. Demo workspaces
            remain in this browser. Sessions last up to 30 days; deleting the
            cookie means the workspace cannot be recovered on another device.
          </p>
        </section>
        <section>
          <h2>Confirmation comes before use</h2>
          <p>
            Typed and extracted marks start as drafts. Only a result you confirm
            informs the academic summary. Revisions replace the active result
            while preserving the earlier revision as superseded.
          </p>
        </section>
        <section>
          <h2>Uploads have a short life</h2>
          <p>
            New PDFs and images are processed during upload without saving the
            original file to the database. Extracted subject marks are saved for
            review. Older uploads may remain until the retention job runs. The
            parser only accepts recognized subject rows.
          </p>
        </section>
        <section>
          <h2>The mentor has boundaries</h2>
          <p>
            If you choose to use the Groq-powered mentor and check the consent
            box, your message, recent conversation and relevant saved details,
            including draft and confirmed marks, may be sent to Groq. You can
            uncheck the box to stop further messages. Your optional comparison
            category is excluded. Preference changes require your confirmation.
          </p>
        </section>
        <section>
          <h2>You decide what a parent sees</h2>
          <p>
            Parent reports are immutable snapshots of the sections you selected.
            Private chat, shortlist notes and raw game events are excluded.
            Optional comparison category information is excluded unless you
            specifically select it. Anyone with a valid share link can see its
            selected sections until it expires or you revoke it.
          </p>
        </section>
        <section>
          <h2>Change or remove your information</h2>
          <p>
            Privacy settings let you review or clear mentor memory, turn off
            chat storage, delete chat history, and delete the whole workspace.
            Workspace deletion removes owned records, temporary upload contents
            and report shares.
          </p>
          <div className="actions section-gap">
            <ActionLink href="/settings/privacy" variant="primary">
              Open my privacy settings
            </ActionLink>
            <ActionLink href="/data" variant="text">
              Read our data notes
            </ActionLink>
          </div>
        </section>
      </div>
    </>
  );
}
