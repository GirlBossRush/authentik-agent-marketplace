# ak-dev skill gaps — backlog for a later pass

Not started. This pass enriched only `ak-admin`. The `ak-dev` skills are thinner
routers; below is the single highest-value outcome-oriented recipe each one currently
lacks, phrased the way a contributor would ask. Use it to scope a future "wave" the
same way the admin plan did.

| Skill             | Top missing recipe (contributor's words)                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `dev-environment` | "From a fresh clone to a running stack I can log into" — the full zero-to-first-login path, plus "my dev stack is broken, reset it."             |
| `backend`         | "I changed a model — take me from edit to a committed migration" end-to-end (makemigrations → inspect → migrate → test).                         |
| `frontend`        | "Run the web UI against my local backend with hot reload", and "build a production bundle and preview it."                                       |
| `docs`            | "Preview my docs change locally and check links/build before I open the PR."                                                                     |
| `testing`         | "Run only the tests that touch my change" (selective runs), "run one e2e test with a visible browser", "this test is flaky — how do I debug it." |
| `linting`         | "Fix everything before I push, in one command", and "CI failed on lint — what do I run locally to reproduce."                                    |
| `contributing`    | "Take my branch to a well-formed PR" end-to-end (issue link → branch → PR template → CLA → required checks).                                     |
| `community`       | A decision tree: "is this a bug, a security report, a feature idea, or a support question — and where does each go?"                             |
| `de-slop`         | Already deep. Possible add: a fast "de-slop just this PR description / commit message" mode for the common small case.                           |

Cross-cutting: the `ak-dev` skills would benefit from the same `description` rewrite
(lead with the contributor's outcome) and, where a task spans tools, the same
where-it-happens tagging the admin recipes use.
