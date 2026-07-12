1. Confirm your API key is in place (you already set this up):

```bash
cat platform/runner/.env   # should show OPENROUTER_API_KEY=sk-or-...
```

2. Build a demo workspace. `examples/meridian-support-automation/` alone won't work standalone — it's missing the routing files (CLAUDE.md/CONTEXT.md/stage contracts), only the template root has those. This one-liner builds a real, complete workspace by overlaying Meridian's filled-in client brief onto the template:

```bash
rm -rf /tmp/demo-workspace && mkdir -p /tmp/demo-workspace
cp icm-scaffold/CLAUDE.md icm-scaffold/CONTEXT.md /tmp/demo-workspace/
cp -r icm-scaffold/_config icm-scaffold/setup icm-scaffold/templates icm-scaffold/shared icm-scaffold/stages /tmp/demo-workspace/
rm -f /tmp/demo-workspace/stages/*/output/*.md
cp icm-scaffold/examples/meridian-support-automation/_config/voice.md /tmp/demo-workspace/_config/voice.md
cp icm-scaffold/examples/meridian-support-automation/shared/client-brief.md /tmp/demo-workspace/shared/client-brief.md
cp icm-scaffold/examples/meridian-support-automation/shared/glossary.md /tmp/demo-workspace/shared/glossary.md
cd /tmp/demo-workspace && git init -q && git add -A && git commit -qm seed
```
(Run from the parent of your icm-scaffold checkout, or adjust the paths.)

3. Run a stage and watch it:

```bash
cd icm-scaffold/platform/runner
set -a && source .env && set +a
npx tsx src/cli.ts run 01_research --workspace /tmp/demo-workspace
```

Heads up: right now the CLI prints a start message, then goes quiet while the model works (reading context, writing files), then prints the gate summary at the end — there's no live tool-by-tool streaming yet. If you want to watch it work step by step rather than just start→finish, that's a small, natural enhancement (stream each tool call to stdout as it happens) — say the word and I'll add it.

4. Inspect what happened:

```bash
npx tsx src/cli.ts status --workspace /tmp/demo-workspace
cat /tmp/demo-workspace/stages/01_research/output/findings.md
git -C /tmp/demo-workspace log --oneline
cat /tmp/demo-workspace/.runner/runs/*.json | python3 -m json.tool   # full trace: every file read/written, every tool call, tokens
```

5. Try the review-gate flow:

```bash
npx tsx src/cli.ts approve 01_research --workspace /tmp/demo-workspace
npx tsx src/cli.ts run 03_report --workspace /tmp/demo-workspace   # blocked: 02_analysis isn't approved yet
npx tsx src/cli.ts run 03_report --workspace /tmp/demo-workspace --force   # bypasses it
```

That last pair is worth trying since it's free — the stage-ordering check happens before any API call.