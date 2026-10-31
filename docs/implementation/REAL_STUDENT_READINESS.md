# Real student marksheets: launch status

This build remains a synthetic-data demo. Do not collect actual student
marksheets until the operating organization has completed the items below.

New uploads are parsed during the upload request, and the original bytes are
not written into application records. Extracted subject marks are stored for
review; confirmed results and earlier revisions remain in the workspace.
Uploads made before this change may still exist in the database or its backups.
The existing cleanup script only purges expired records when an operator runs it.

Before enabling real-student collection:

- Establish an appropriate privacy notice and consent process, including for
  minors, identify the organization responsible for the data, and publish its
  contact, retention, deletion and backup policies. Have the launch reviewed
  against the rules applicable to the deployment.
- Configure and test HTTPS, secure account/session handling, row-level
  isolation, recovery, rate limits and a monitored retention job in the actual
  deployment. Verify the database's backup retention and restore procedures.
- Rotate any database and Groq credentials exposed during development. The
  mentor now requires an explicit opt-in before any Groq call; it can still send
  saved marks and conversation context when opted in. Verify the disclosure,
  data minimization and provider terms for the intended users before launch.
- Build the scanner with `docker build -f services/api/Dockerfile.scanner -t
  careerquest-scanner:local services/api` and set `SCANNER_BACKEND=docker`.
  Non-demo and non-development configurations refuse the local process backend. Each scan uses a
  non-root, read-only, network-isolated container with resource limits and no
  host mounts. Confirm these restrictions work on the actual hosting platform,
  including cancellation and cleanup; the container runtime is a separate
  privileged dependency and needs its own access controls and monitoring.
  The Docker-backed scanner requires a Docker daemon and is not supported by a
  Vercel Function as currently implemented. Do not deploy the API to Vercel
  until an independently isolated scanner service is provided and tested.
- Test representative real-world document layouts with appropriately authorized
  samples. OCR is fallible. Students must review extracted subject marks and
  confirm the merit percentage, admission round and seat type; historical
  cutoffs do not guarantee admission.

Supabase's security advisor currently reports leaked-password protection as
disabled. Review availability and enable suitable account protections for the
chosen plan before using account sign-in for students.
