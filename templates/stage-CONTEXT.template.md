# Stage NN: <stage name> (Layer 2)

<!-- Copy this file to stages/NN_name/CONTEXT.md. Keep the two-digit prefix.
     Create references/ and output/ alongside it. Add the stage to the root
     CONTEXT.md routing table. One stage, one job — if you need "and" to
     describe the Process, split the stage. -->

**Job:** <one sentence: the single transform this stage performs>

## Inputs

| Layer | File | What to use it for |
|---|---|---|
| 4 (working) | `../NN-1_previous/output/<file>.md` | <the material to transform> |
| 3 (reference) | `../../_config/voice.md` | Internalize as writing constraints |
| 3 (reference) | `../../_config/conventions.md` | File/citation/traceability rules |
| 3 (reference) | `references/<guide>.md` | <stage-specific rules> |

Load ONLY these files. If an input is missing, stop and tell the user which
precondition failed.

## Process

1. <step>
2. <step>
3. <step>

## Outputs

| File | Contents |
|---|---|
| `output/<name>.md` | <what goes in it> |

Start each output file with the metadata block from `conventions.md`.

## Verify

- <check output against an earlier stage's output or a reference rule>
- <e.g., every claim carries a citation tag or an (assumption) label>

## Review gate

After writing outputs, summarize what was produced and stop. The human edits
`output/` files before the next stage runs; edited files are authoritative.
