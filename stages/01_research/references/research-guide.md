# Research Guide (Layer 3)

## Source standards

- Prefer primary sources (filings, official statistics, direct documentation) over
  commentary. Rank each source: **A** primary, **B** reputable secondary, **C** other.
- Two independent sources for any load-bearing claim (one that a recommendation
  will rest on). Single-source load-bearing claims get flagged `(single source)`.
- Record access dates — findings go stale.

## Coverage checklist

Before declaring research complete, confirm each is either covered or flagged as a gap:

- [ ] Current state (what is true today, with numbers where possible)
- [ ] Trend (what direction it is moving, over what period)
- [ ] Key players / alternatives the client should know about
- [ ] Known risks or counterevidence to the emerging narrative
- [ ] What we could NOT find (explicit gaps beat silent omissions)

## Anti-patterns

- Don't stop at the first confirming source (confirmation shopping).
- Don't average contradictory numbers — report both with sources.
- Don't research out-of-scope questions because they're interesting.

## Using fetch_url

`fetch_url` fetches one exact https URL from `runner.config.json`'s `allowedDomains`
allowlist — there is no search tool, so URLs cannot be discovered, only fetched.

- Only guess URLs for domains you're confident about the structure of (e.g. a
  Wikipedia article title). Guessing deep slugs (press-release titles, blog post
  paths) on unfamiliar domains mostly 404s and burns the run's error budget.
- Large commercial/analyst sites (Gartner, McKinsey, Forrester, and similar) commonly
  block scripted fetches with a 403 regardless of allowlist status. Don't allowlist
  or retry these unless the engagement specifically requires them — treat their data
  as a `(gap — source blocked)` rather than spending retries on it.
- If a stage's `references/` folder lists specific starting URLs, fetch those first
  before improvising others.
