# Document uploads in Insight Discovery

The primary Input pack accepts PDF, PowerPoint (`.pptx`), Word (`.docx`), TXT, Markdown and CSV, for both the IMC brief and supporting evidence. Extraction is deterministic and happens in the browser. Selecting a file makes no AI request and sends no original file to the server or an external service. Explicit later generation sends the applied extracted text through the existing AI workflow.

## Review before applying

An upload stages text in the editable draft. For the brief, choose **Update input pack** to apply it. For evidence, review its source name/reference, date and audience, then choose **Add supplied evidence**. The source filename, extraction description and warnings stay with the extracted text. Existing applied input packs, research versions, saved findings and human approvals keep their existing history behavior.

The importer preserves textual content without model rewriting. Office paragraphs, headings and field/value tables are normalized to text; PDF page and PowerPoint slide boundaries are retained. PowerPoint presentation order comes from the primary slide relationship list, not repeated IDs in section metadata. Word deleted/moved-from text is excluded. These are text imports, not visual or legal/claim validation. Uploading a document never supplies approval that the document does not establish.

## Limits and explicit gaps

- Up to 15 MiB per file, 60,000 extracted characters including provenance, and 150 PDF pages/PowerPoint slides. Oversized input is rejected, not silently truncated.
- Embedded images/charts are not interpreted, and OCR is not implemented. Image-bearing slides and PDF pages with no extractable text are flagged. Image-only documents fail with instructions to supply searchable text. The Black Friday deck has important text inside images; that text must be supplied separately.
- PowerPoint speaker notes and linked documents are not imported. Word body text and textual headers, footers, footnotes and endnotes are included. Review complex tables, columns and floating text against the original.
- Older binary `.ppt` and `.doc` files are not parsed. Save them as `.pptx`/`.docx` or a searchable PDF. Corrupt/password-protected Office or PDF files report an error; no mock or invented text is substituted.
- ZIP imports restrict extracted XML parts, part count and expanded XML size; they do not extract images/attachments or execute macros. XML entity/DOCTYPE declarations are rejected. No files are written to disk by the importer.

The existing creative workspace's text importer and protected creative files are unchanged. New upload controls are isolated to the primary Insight Discovery workflow. Model, low reasoning effort, credentials and AI endpoints are unchanged. Existing `fflate` and `pdfjs-dist` versions are promoted from development to production dependencies; no new service or package version is introduced.

## Files

- `lib/document-import.ts`: bounded browser extraction and validation.
- `components/DocumentFileImport.tsx`: upload, progress, preview/error notes.
- `components/DiscoveryInputPack.tsx`: primary brief and evidence controls.
- `package.json`, `package-lock.json`: dependency classification only.
- `tests/document-upload.spec.ts`, `tests/fixtures/document-uploads.ts`: deterministic format fixtures, preservation/error tests and optional real-source acceptance (`XC_IMPORT_SAMPLE_DIR`). Private source files are not committed.
- `playwright.upload-production.config.ts`: isolated production-mode browser acceptance on port 3103 after building with Discovery enabled.
- `README.md`, `docs/insight-discovery-primary.md`, this report: current capabilities and limitations.

## Verification

| Check                                                | Result                                                                                      |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Discovery + upload browser acceptance                | 17 passed; one flag-off assertion correctly skipped.                                        |
| Upload acceptance against optimized production build | 8 passed, including the user's actual `BLK_FRI.pptx`, tactical Word brief and PDF template. |
| Full legacy suite, Discovery off                     | 41 passed; 17 Discovery-only cases correctly skipped. No legacy specification was edited.   |
| AI / contract suite                                  | 66 passed using mocks/simulated transport.                                                  |
| Typecheck, lint, production build                    | Passed.                                                                                     |
| Visual QA                                            | Production desktop/mobile PowerPoint-upload screenshots inspected; no horizontal overflow.  |

Coverage includes exact RTB preservation and unknown approval, Word field/value tables and tracked deletions, PowerPoint primary slide order despite repeated section IDs, searchable PDF worker loading, blank/scanned PDFs, malformed files, expansion/file/text limits, older-format conversion messages, failure preservation, explicit evidence addition, and no automatic AI/file POST requests when importing.

Verification ran in an isolated source copy, with mock-mode test servers on ports 3102/3103. No paid model call was made. The user's private source files were read for optional local acceptance only and are not included in the application or committed tests.

The tested source was applied on `insight-discovery-poc`. Localhost:3000 returns HTTP 200 and serves the new upload controls. No dev-server restart, commit, push or environment change was performed. The protected legacy file diff from `fc4dfd3^` is empty and `git diff --check` passes.

To reproduce production upload acceptance, build with `NEXT_PUBLIC_INSIGHT_DISCOVERY=true AI_MODE=mock npm run build`, then run `NEXT_PUBLIC_INSIGHT_DISCOVERY=true npx playwright test -c playwright.upload-production.config.ts`. Optionally set `XC_IMPORT_SAMPLE_DIR` to an authorized local source directory to enable the three real-source cases; otherwise those cases are explicitly skipped.
