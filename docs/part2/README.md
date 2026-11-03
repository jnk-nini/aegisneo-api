# Part II: Cloud Database Integration (Neon)

Documentation for Part II of the cloud database activity. Phases 1 to 3 are done; implementation
starts in Phase 4.

| Path | Contents |
| --- | --- |
| `AegisNEO_Part2_Phases1-3.docx` / `.pdf` | Phase 1 (existing API assessment), Phase 2 (database design), Phase 3 (integration architecture) |
| `evidence/phase1/` | Raw curl output from the API before any change (v1.1, commit `7e61ec8`, 3 Nov 2026) |
| `screenshots/phase1/` | Swagger UI, website and terminal figures made from that output |
| `diagrams/` | ERD, architecture and request-flow diagrams (SVG and PNG) |
| `tools/` | Scripts that produced the figures, diagrams and the Word document |

Rebuilding the document (from the repository root, with Node and Playwright available):

```bash
node docs/part2/tools/diagrams.js .
node docs/part2/tools/build_doc.js .
```
