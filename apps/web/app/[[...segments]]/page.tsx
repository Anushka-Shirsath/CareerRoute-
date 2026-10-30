import { Suspense } from "react";
import { CareerQuest } from "@/app";
export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="initial-loading">
          Opening your CareerQuest workspace…
        </div>
      }
    >
      <CareerQuest />
    </Suspense>
  );
}
