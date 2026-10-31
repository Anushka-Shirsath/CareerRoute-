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
  mentor sends student workspace context, including marks, to Groq when enabled;
  leave it disabled for real data until disclosure, authorization, data
  minimization and provider terms have been addressed.
- Review the document parser isolation against the actual hosting environment.
  The worker has time and CPU limits and a Linux address-space limit, but it is
  not a complete operating-system sandbox, and Windows and macOS do not get the
  Linux address-space limit. Apply and test ingress, resource, filesystem and
  network restrictions for the deployed worker.
- Test representative real-world document layouts with appropriately authorized
  samples. OCR is fallible. Students must review extracted subject marks and
  confirm the merit percentage, admission round and seat type; historical
  cutoffs do not guarantee admission.

Supabase's security advisor currently reports leaked-password protection as
disabled. Review availability and enable suitable account protections for the
chosen plan before using account sign-in for students.
