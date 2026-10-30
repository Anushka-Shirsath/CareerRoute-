"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, write } from "../api";
import { useData, useTask, useWorkspace } from "../context";
import { pathways, pretty, route } from "../content";
import {
  ActionLink,
  Button,
  Empty,
  ErrorState,
  Field,
  Icon,
  Loading,
  Notice,
  PageHeader,
  Panel,
  Tag,
} from "../ui";
import type { Compass, GameSession, GameNode } from "../types";
import { FestivalHunt } from "./festival-hunt";

const sequence = [
  "S1",
  "S2",
  "S3",
  "R1",
  "S4",
  "S5",
  "MT",
  "MT_RATE",
  "S6",
  "V1",
];
const dimensions: Record<string, string> = {
  AN: "Analytical curiosity",
  PM: "Practical making",
  CR: "Creative expression",
  EN: "Enterprise & organising",
  SO: "Social & service",
};
type CompassData = Compass & {
  dimensions: { code: string; evidence: number; observations: number }[];
  values: string[];
  game_session_ids: string[];
};
const taskChoices: Record<string, string[]> = {
  AN: ["24", "32", "20"],
  CR: ["A large, clear diagram", "A short photo story", "Illustrated steps"],
  EN: ["₹15 · sell 20 badges", "₹20 · sell 18 badges", "₹30 · sell 8 badges"],
  SO: [
    "Reassure them and offer to help",
    "Explain ways to repair the model",
    "Invite them to rebuild it together",
  ],
};
export function CompassPlayPage() {
  const ws = useWorkspace(),
    router = useRouter(),
    params = useSearchParams(),
    task = useTask();
  const [session, setSession] = useState<GameSession | null>(null),
    [showHunt, setShowHunt] = useState(true),
    [options, setOptions] = useState<string[]>([]),
    [rating, setRating] = useState<number | null>(null),
    [taskChoice, setTaskChoice] = useState(""),
    [taskText, setTaskText] = useState(""),
    [hint, setHint] = useState(false),
    [order, setOrder] = useState([2, 0, 3, 1]);
  const initial = useRef<Promise<GameSession> | null>(null),
    eventKey = useRef("");
  useEffect(() => {
    let active = true;
    if (!initial.current)
      initial.current = (async () => {
        const stored =
          params.get("session") || localStorage.getItem("cq_compass_session");
        if (stored) {
          try {
            return await api<GameSession>("/compass/sessions/" + stored);
          } catch {
            localStorage.removeItem("cq_compass_session");
          }
        }
        const created = await write<GameSession>("/compass/sessions", {
          locale: ws.locale,
        });
        localStorage.setItem("cq_compass_session", created.session_id);
        return created;
      })();
    initial.current
      .then((data) => {
        if (active) setSession(data);
      })
      .catch((e) => {
        if (active) task.setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const node = session?.node;
  useEffect(() => {
    setOptions([]);
    setRating(null);
    setTaskChoice("");
    setTaskText("");
    setHint(false);
    setOrder([2, 0, 3, 1]);
    eventKey.current = "";
  }, [node?.id]);
  const select = (id: string) => {
    if (!node) return;
    if (node.type === "choice") setOptions([id]);
    else if (node.id === "R1") {
      setOptions((ids) =>
        id === "R1.none"
          ? ["R1.none"]
          : ids.includes(id)
            ? ids.filter((x) => x !== id)
            : [...ids.filter((x) => x !== "R1.none"), id],
      );
    } else
      setOptions((ids) =>
        ids.includes(id)
          ? ids.filter((x) => x !== id)
          : ids.length < 2
            ? [...ids, id]
            : ids,
      );
  };
  const submit = (skip = false) =>
    task.run(async () => {
      if (!session || !node) return;
      const payload: Record<string, unknown> = {
        node_id: node.id,
        idempotency_key:
          eventKey.current || (eventKey.current = crypto.randomUUID()),
        skip,
      };
      if (!skip) {
        if (node.type === "rating") payload.rating = rating;
        else if (node.type === "minitask")
          payload.task_outcome = {
            choice: taskChoice,
            reflection: taskText,
            ordered_steps: node.dimension === "PM" ? order : undefined,
            hints_used: hint,
            correct:
              node.dimension === "AN"
                ? taskChoice === "32"
                : node.dimension === "EN"
                  ? taskChoice.startsWith("₹20")
                  : undefined,
          };
        else payload.option_ids = options;
      }
      const response = await write<GameSession>(
        "/compass/sessions/" + session.session_id + "/events",
        payload,
      );
      setSession({ ...session, ...response });
      if (response.done) {
        await ws.refresh();
        router.push("/compass/report");
      }
    });
  const stop = () =>
    task.run(async () => {
      if (!session) return;
      await write("/compass/report", { session_id: session.session_id });
      await ws.refresh();
      router.push("/compass/report");
    });
  const canContinue = node
    ? node.type === "rating"
      ? rating !== null
      : node.type === "minitask"
        ? node.dimension === "PM" || Boolean(taskChoice)
        : options.length > 0
    : false;
  const steps = [
    "Switch off the power",
    "Inspect the connection",
    "Secure the loose connection",
    "Switch on and test",
  ];
  if (showHunt) return <FestivalHunt onContinue={() => setShowHunt(false)} />;
  return (
    <>
      <PageHeader
        title="The Innovation Festival"
        description="An optional story about the work you enjoy. No right personality, no timer, no verdict."
        action={
          <ActionLink href="/compass/report" variant="text">
            My Compass
          </ActionLink>
        }
      />
      <div className="game-layout">
        {!session ? (
          <Panel>
            <Loading lines={4} />
            {task.error && (
              <ErrorState
                message={task.error}
                retry={() => window.location.reload()}
              />
            )}
          </Panel>
        ) : !node ? (
          <Panel>
            <Empty
              title="Your Compass is ready"
              action={
                <ActionLink href="/compass/report" variant="primary">
                  See my report
                </ActionLink>
              }
            >
              You can reflect on your choices, try a new route, or replay the
              mission.
            </Empty>
          </Panel>
        ) : (
          <>
            <div
              className="game-progress"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={10}
              aria-valuenow={sequence.indexOf(node.id)}
              aria-label={`${sequence.indexOf(node.id)} of 10 moments completed`}
            >
              {sequence.map((id, i) => (
                <span
                  key={id}
                  className={i <= sequence.indexOf(node.id) ? "filled" : ""}
                />
              ))}
            </div>
            <Panel>
              <p className="game-context">
                {node.type === "values"
                  ? "What matters to you"
                  : node.type === "rating"
                    ? "A moment to reflect"
                    : node.type === "minitask"
                      ? "Try something different"
                      : "Your school festival is coming together"}{" "}
                · {sequence.indexOf(node.id) + 1} of 10
              </p>
              <h2 className="game-question" tabIndex={-1} aria-live="polite">
                {node.text}
              </h2>
              {(node.type === "choice" ||
                node.type === "multi_select" ||
                node.type === "values") && (
                <>
                  <div
                    className="game-options"
                    role="group"
                    aria-label="Mission choices"
                  >
                    {node.options.map((option) => (
                      <button
                        className={
                          "game-option " +
                          (options.includes(option.id) ? "selected" : "")
                        }
                        aria-pressed={options.includes(option.id)}
                        key={option.id}
                        onClick={() => select(option.id)}
                        disabled={task.busy}
                      >
                        <span>
                          {options.includes(option.id) && (
                            <Icon name="check" size={12} />
                          )}
                        </span>
                        <span>{option.text}</span>
                      </button>
                    ))}
                  </div>
                  {node.type === "values" && (
                    <p className="panel-note">
                      Choose up to two. Staying near home is a preference hint,
                      not a route score.
                    </p>
                  )}
                  {node.type === "multi_select" && (
                    <p className="panel-note">
                      Choose any activities you’d like to do again, or choose
                      “None of these”.
                    </p>
                  )}
                </>
              )}
              {node.type === "rating" && (
                <>
                  <div
                    className="rating-buttons"
                    role="group"
                    aria-label="Task enjoyment rating"
                  >
                    {[1, 2, 3, 4, 5].map((value) => (
                      <button
                        className={
                          "rating-button " +
                          (rating === value ? "selected" : "")
                        }
                        aria-pressed={rating === value}
                        aria-label={`Enjoyment ${value} of 5`}
                        key={value}
                        onClick={() => setRating(value)}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                  <p className="muted text-small">
                    1 = not much · 5 = a lot. Enjoyment matters more than
                    getting an answer right.
                  </p>
                </>
              )}
              {node.type === "minitask" && (
                <>
                  <div className="task-well">
                    <p>{node.task?.text}</p>
                    <details
                      onToggle={(e) => {
                        if (e.currentTarget.open) setHint(true);
                      }}
                    >
                      <summary>
                        <Icon name="info" size={14} />A small hint
                      </summary>
                      <p className="text-small section-gap">
                        {node.task?.hint}
                      </p>
                    </details>
                  </div>
                  {node.dimension === "PM" ? (
                    <div className="flow-tight">
                      {order.map((value, index) => (
                        <div className="game-option" key={value}>
                          <span
                            style={{ border: 0, width: 20 }}
                            className="num"
                          >
                            {index + 1}
                          </span>
                          <span style={{ flex: 1 }}>{steps[value]}</span>
                          <button
                            className="icon-button"
                            aria-label={`Move ${steps[value]} up`}
                            disabled={index === 0}
                            onClick={() =>
                              setOrder((items) => {
                                const next = [...items];
                                [next[index - 1], next[index]] = [
                                  next[index],
                                  next[index - 1],
                                ];
                                return next;
                              })
                            }
                          >
                            <Icon
                              name="up"
                              style={{ transform: "rotate(-45deg)" }}
                              size={15}
                            />
                          </button>
                          <button
                            className="icon-button"
                            aria-label={`Move ${steps[value]} down`}
                            disabled={index === 3}
                            onClick={() =>
                              setOrder((items) => {
                                const next = [...items];
                                [next[index], next[index + 1]] = [
                                  next[index + 1],
                                  next[index],
                                ];
                                return next;
                              })
                            }
                          >
                            <Icon name="down" size={15} />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="game-options">
                      {(
                        taskChoices[node.dimension || ""] ||
                        node.task?.choices ||
                        []
                      ).map((choice) => (
                        <button
                          className={
                            "game-option " +
                            (taskChoice === choice ? "selected" : "")
                          }
                          aria-pressed={taskChoice === choice}
                          key={choice}
                          onClick={() => setTaskChoice(choice)}
                        >
                          <span>
                            {taskChoice === choice && (
                              <Icon name="check" size={12} />
                            )}
                          </span>
                          <span>{choice}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {node.dimension === "AN" && (
                    <div className="section-gap">
                      <Field
                        label="What would you measure?"
                        hint="Optional reflection; no right answer needed."
                      >
                        <input
                          value={taskText}
                          onChange={(e) => setTaskText(e.target.value)}
                          maxLength={500}
                          placeholder="For example, what visitors learned"
                        />
                      </Field>
                    </div>
                  )}
                  <p className="panel-note">
                    Your task outcome is recorded, but it never ranks your study
                    routes.
                  </p>
                </>
              )}
              {task.error && <ErrorState message={task.error} />}
              <div className="game-footer">
                <button
                  className="text-link"
                  onClick={stop}
                  disabled={task.busy}
                >
                  Stop and see my report <Icon name="up" size={14} />
                </button>
                <div>
                  <Button
                    variant="text"
                    disabled={task.busy}
                    onClick={() => submit(true)}
                  >
                    Skip this
                  </Button>
                  <Button
                    busy={task.busy}
                    disabled={!canContinue}
                    onClick={() => submit()}
                    icon="arrow"
                  >
                    {node.id === "V1" ? "See my Compass" : "Continue"}
                  </Button>
                </div>
              </div>
            </Panel>
            <p className="panel-note">
              Your place is saved after each answer.
            </p>
          </>
        )}
      </div>
    </>
  );
}

export function CompassReportPage() {
  const ws = useWorkspace(),
    router = useRouter(),
    task = useTask();
  const { data, loading, error, reload } = useData<CompassData>(
    "/compass/report",
    [ws.revision],
  );
  const replay = () =>
    task.run(async () => {
      const session = await write<GameSession>("/compass/sessions", {
        locale: ws.locale,
      });
      localStorage.setItem("cq_compass_session", session.session_id);
      router.push("/compass/play?session=" + session.session_id);
    });
  const makeMarksReport = () =>
    task.run(async () => {
      await write("/compass/report", {});
      await ws.refresh();
      await reload();
    });
  return (
    <>
      <PageHeader
        title="Your Career Compass"
        description="Routes worth exploring, based on what you’ve actually shared. You choose the direction."
        action={
          data ? (
            <Button
              variant="secondary"
              busy={task.busy}
              onClick={replay}
              icon="refresh"
            >
              Play again
            </Button>
          ) : undefined
        }
      />
      {loading ? (
        <Loading lines={5} />
      ) : error ? (
        <ErrorState message={error} retry={reload} />
      ) : !data ? (
        <Panel>
          <Empty
            title="Make room for your interests"
            action={
              <div className="actions">
                <ActionLink href="/compass/play" variant="primary">
                  Try the festival mission
                </ActionLink>
                <Button
                  variant="text"
                  busy={task.busy}
                  onClick={makeMarksReport}
                >
                  Continue without the game
                </Button>
              </div>
            }
          >
            A short school-festival mission helps you notice what you enjoy. You
            can skip it and explore every route anyway.
          </Empty>
        </Panel>
      ) : (
        <>
          <div className="demo-line">
            <Tag>{pretty(data.coverage)} evidence</Tag>
            <span>
              {data.mode === "marks_only"
                ? "No game-based ranking. Every route remains open to exploration."
                : data.mode === "game_only"
                  ? "Based on mission choices. Confirm a result to add academic readiness."
                  : "Interests and academic readiness are shown separately."}
            </span>
          </div>
          <div className="grid">
            <Panel
              className="span-8"
              title={
                data.ranked
                  ? "Routes worth a closer look"
                  : "Explore without a ranking"
              }
            >
              {data.top_routes.map((r) => (
                <article className="compass-route" key={r.pathway_id}>
                  <div className="actions spaced">
                    <h3>{route(r.pathway_id)?.name || r.pathway_id}</h3>
                    {r.close_call && <Tag>Close call</Tag>}
                  </div>
                  {r.score != null && (
                    <div
                      className="route-score"
                      role="img"
                      aria-label="Exploration interest signal, not an admission prediction"
                    >
                      <span
                        style={{
                          width: Math.min(100, (r.score / 1.1) * 100) + "%",
                        }}
                      />
                    </div>
                  )}
                  {r.why.length > 0 ? (
                    <ul>
                      {r.why.map((item, i) => (
                        <li key={i}>{item.text}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="panel-note">
                      No mission observations yet. This route is unranked.
                    </p>
                  )}
                  {r.limited_evidence && (
                    <p className="text-small muted">
                      Limited evidence so far. Try another activity before
                      drawing a conclusion.
                    </p>
                  )}
                  <p className="readiness-note">
                    <strong>Academic readiness:</strong>{" "}
                    {r.readiness.band === "not_available"
                      ? "Not available from the confirmed subjects"
                      : `${pretty(r.readiness.band)} base in ${r.readiness.subjects.map(pretty).join(" and ")}${r.readiness.average != null ? ` · average ${r.readiness.average.toFixed(1)}%` : ""}`}
                    . Readiness does not change your interest score.
                  </p>
                  <div className="actions">
                    <ActionLink
                      href={"/explore/" + r.pathway_id}
                      variant="text"
                    >
                      Explore this route
                    </ActionLink>
                    <Button
                      variant="text"
                      busy={task.busy}
                      onClick={() => task.run(() => ws.setGoal(r.pathway_id))}
                      icon={
                        ws.dashboard?.profile.active_goal_pathway ===
                        r.pathway_id
                          ? "check"
                          : "plus"
                      }
                    >
                      {ws.dashboard?.profile.active_goal_pathway ===
                      r.pathway_id
                        ? "Your goal"
                        : "Set as my goal"}
                    </Button>
                  </div>
                </article>
              ))}
            </Panel>
            <div className="span-4 flow">
              <Panel title="What your choices explored">
                {data.dimensions.some((d) => d.observations > 0) ? (
                  <div className="dimension-chart">
                    {data.dimensions.map((d) => (
                      <div className="dimension-row" key={d.code}>
                        <div>
                          <span>{dimensions[d.code] || d.code}</span>
                          <small>{d.observations} observations</small>
                        </div>
                        <div className="subject-bar-track">
                          <div
                            className="subject-bar-fill"
                            style={{ width: d.evidence * 100 + "%" }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="muted">
                    No mission evidence is recorded. Your marks do not
                    substitute for your interests.
                  </p>
                )}
              </Panel>
              <Panel title="Your direction can change">
                <p className="muted text-small">
                  Want a route outside this list? You can choose any of the six
                  pathways as your goal.
                </p>
                <div className="actions section-gap">
                  <ActionLink href="/explore" variant="secondary">
                    Explore all six
                  </ActionLink>
                </div>
              </Panel>
            </div>
          </div>
          <div className="section-gap">
            <Notice icon="compass">
              {data.footer} Interest bars are exploratory signals, never
              admission odds or a prediction of success.
            </Notice>
          </div>
        </>
      )}
      {task.error && <ErrorState message={task.error} />}
    </>
  );
}
