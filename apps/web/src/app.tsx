"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Shell } from "./shell";
import { ActionLink, Empty, PageHeader, Panel } from "./ui";
import { HomePage } from "./screens/home";
import { MarksPage, SnapshotPage } from "./screens/results";
import { ExplorePage, PathwayPage } from "./screens/explore";
import { CompassPlayPage, CompassReportPage } from "./screens/compass";
import { DirectoryPage, FinderPage, OfferingPage } from "./screens/discovery";
import { ComparePage, ShortlistPage } from "./screens/planning";
import { MentorPage } from "./screens/mentor";
import { ReportBuilderPage, SharedReportPage } from "./screens/reports";
import { CoveragePage, PrivacyPage, SettingsPage } from "./screens/settings";

function Screens() {
  const path = usePathname();
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  let screen: React.ReactNode;
  let parts: string[];
  try {
    parts = path.split("/").filter(Boolean).map(decodeURIComponent);
  } catch {
    parts = [];
  }
  if (parts[0] === "r" && parts[1])
    return <SharedReportPage token={parts[1]} />;
  if (path === "/" || path === "/dashboard" || path === "/login") screen = <HomePage />;
  else if (path === "/start") screen = <MarksPage key="entry" />;
  else if (path === "/start/review") screen = <MarksPage review key="review" />;
  else if (path === "/snapshot") screen = <SnapshotPage />;
  else if (path === "/explore") screen = <ExplorePage />;
  else if ((parts[0] === "explore" || parts[0] === "guides") && parts[1])
    screen = <PathwayPage id={parts[1]} />;
  else if (path === "/compass/play") screen = <CompassPlayPage />;
  else if (path === "/compass/report") screen = <CompassReportPage />;
  else if (path === "/colleges") screen = <DirectoryPage />;
  else if (parts[0] === "colleges" && parts[1])
    screen = <OfferingPage id={parts[1]} />;
  else if (path === "/finder") screen = <FinderPage />;
  else if (path === "/shortlist") screen = <ShortlistPage />;
  else if (path === "/compare") screen = <ComparePage />;
  else if (path === "/mentor") screen = <MentorPage />;
  else if (path === "/report/new") screen = <ReportBuilderPage />;
  else if (path === "/data") screen = <CoveragePage />;
  else if (path === "/privacy") screen = <PrivacyPage />;
  else if (path === "/settings/privacy") screen = <SettingsPage />;
  else
    screen = (
      <>
        <PageHeader title="Let’s find your way back" />
        <Panel>
          <Empty
            title="This page isn’t on the map"
            action={
              <ActionLink href="/" variant="primary">
                Back to my journey
              </ActionLink>
            }
          >
            Use the navigation to explore your result, pathways and saved
            possibilities.
          </Empty>
        </Panel>
      </>
    );
  return (
    <>
      {offline && (
        <div className="offline-banner" role="status">
          You’re offline. Pathway explanations already open may remain readable;
          saved data and the mentor need a connection.
        </div>
      )}
      <Shell>{screen}</Shell>
    </>
  );
}
export function CareerQuest() {
  return <Screens />;
}

