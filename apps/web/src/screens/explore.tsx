"use client";
import { pathways, route, checklistLabels } from "../content";
import { useData, useTask, useWorkspace } from "../context";
import {
  ActionLink,
  Button,
  Empty,
  ErrorState,
  Icon,
  Loading,
  Notice,
  PageHeader,
  Panel,
  Tag,
} from "../ui";
import type { PathwayId } from "../types";

export function ExplorePage() {
  return (
    <>
      <PageHeader
        title="There’s more than one route"
        description="Explore the kind of learning and work behind each option. No route is reserved for a type of student."
      />
      <div className="route-page-list">
        {pathways.map((p) => (
          <section className="pathway-row" key={p.id}>
            <div>
              <h2>{p.name}</h2>
              <div className="duration">{p.duration}</div>
            </div>
            <p>{p.description}</p>
            <ActionLink href={"/explore/" + p.id} variant="text" icon="up">
              Explore route
            </ActionLink>
          </section>
        ))}
      </div>
      <div className="section-gap">
        <Notice icon="compass">
          You can choose any of these as your goal. Marks and Compass results
          are prompts for exploration, not a verdict.
        </Notice>
      </div>
    </>
  );
}
type Guide = {
  portal_url: string;
  date_note: string;
  notice: string;
  checklist: { label_key: string; note: string }[];
};
export function PathwayPage({ id }: { id: string }) {
  const p = route(id),
    ws = useWorkspace(),
    task = useTask();
  const {
    data: guide,
    loading,
    error,
    reload,
  } = useData<Guide>(p ? "/guides/" + p.id : null);
  if (!p)
    return (
      <>
        <PageHeader title="Pathway not found" />
        <ActionLink href="/explore">Explore the six routes</ActionLink>
      </>
    );
  const isGoal = ws.dashboard?.profile.active_goal_pathway === p.id;
  return (
    <>
      <PageHeader
        title={p.name}
        description={p.description}
        action={
          <Button
            variant={isGoal ? "secondary" : "primary"}
            icon={isGoal ? "check" : "route"}
            busy={task.busy}
            onClick={() => task.run(() => ws.setGoal(p.id))}
          >
            {isGoal ? "Your saved goal" : "Make this my goal"}
          </Button>
        }
      />
      <div className="grid">
        <Panel
          className="span-8 detail-copy"
          title="What learning can look like"
        >
          <p>{p.study}</p>
          <h2>Bring your curiosity</h2>
          <p>{p.subjects}</p>
          <h2>Possibilities to explore later</h2>
          <ul>
            {p.possibilities.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
          <h2>A question worth asking</h2>
          <p>{p.consider}</p>
          <div className="actions section-gap">
            <ActionLink href={"/colleges?pathway=" + p.id} variant="primary">
              Browse offerings
            </ActionLink>
            <ActionLink href="/mentor" variant="text">
              Talk it through
            </ActionLink>
          </div>
        </Panel>
        <Panel className="span-4" title="Admission steps">
          {loading ? (
            <Loading />
          ) : error ? (
            <ErrorState message={error} retry={reload} />
          ) : guide ? (
            <>
              <p className="text-small muted">{guide.date_note}</p>
              <div className="section-gap">
                {guide.checklist.map((item) => (
                  <div className="checklist-row" key={item.label_key}>
                    <Icon name="circle" size={15} />
                    <span>
                      {checklistLabels[item.label_key] || item.label_key}
                    </span>
                  </div>
                ))}
              </div>
              <p className="panel-note">
                Preparation reminders only. Verify the current requirements for
                your course and year.
              </p>
              <a
                className="button secondary section-gap"
                href={guide.portal_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Official admission portal <Icon name="external" size={15} />
              </a>
            </>
          ) : null}
        </Panel>
      </div>
      {task.error && <ErrorState message={task.error} />}
      <div className="section-gap">
        <Notice icon="shield">
          No admission date is shown unless it has been verified. CareerQuest
          doesn’t submit applications or make payments for you.
        </Notice>
      </div>
    </>
  );
}
