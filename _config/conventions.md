# Conventions (Layer 3)

Mechanical rules for all stages. Cited by stage contracts.

## Files

- Inter-stage data is markdown or JSON only. No binaries, no databases.
- Output filenames are defined by each stage contract — never invent new ones.
- Use kebab-case for any additional files: `market-sizing-notes.md`.
- Never delete or overwrite files in another stage's `output/`.

## Markdown

- One `#` H1 per file, matching the file's purpose.
- Use tables for comparisons, lists only when order or enumeration matters.
- Every claim that came from a source carries an inline citation `[S1]`, `[S2]`...
  mapping to a `## Sources` section at the end of the file.

## Citations

- Sources section format: `[S1] Title — URL or document name (accessed YYYY-MM-DD)`
- A claim without a source must be labeled `(assumption)` or `(analyst judgment)`.
- Citations must survive stage transitions: if stage 02 uses a stage 01 finding,
  it carries the same `[Sn]` tag forward.

## Traceability

- Each output file starts with a metadata block:

  ```
  <!-- stage: 02_analysis | run: YYYY-MM-DD | inputs: ../01_research/output/findings.md -->
  ```

- This is the audit trail: any section of the final report should be traceable
  back through analysis to a research finding or a labeled assumption.
