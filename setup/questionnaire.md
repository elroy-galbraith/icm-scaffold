# Workspace Setup Questionnaire

Purpose: configure this workspace for a new client engagement. The agent should ask these
questions conversationally (not as a form dump), then write the answers into
`shared/client-brief.md` and adjust `_config/voice.md`.

## 1. Client & audience

1. Who is the client (name, industry)?
2. Who will actually read the deliverable? Role, seniority, technical depth.
3. How formal should the report feel? (board-ready / internal working doc / something else)

## 2. The question

4. What single question must the report answer?
5. What decision will the client make based on it?
6. What's explicitly in scope? What's explicitly out?

## 3. Evidence standards

7. What sources does the client trust? (e.g., industry reports, primary interviews, public filings)
8. Any sources or claims to avoid?
9. How should uncertainty be handled — flag and proceed, or stop and ask?

## 4. Deliverable shape

10. Length target?
11. Required sections or a client template to follow?
12. Deadline and any interim checkpoints?

## After answers are collected

- [ ] Rewrite `shared/client-brief.md` (remove the SETUP PLACEHOLDER comment)
- [ ] Update the Audience section of `_config/voice.md`
- [ ] Seed `shared/glossary.md` with any domain terms mentioned
- [ ] Confirm the three-stage pipeline fits, or propose stage changes (see `templates/`)
