# ARCHITECTURE.md

Canonical architecture for `{{PROJECT_NAME}}`. The autonomous build loop reads this file every iter (section-scoped) before picking work.

## Table of contents

1. [Domain summary](#1-domain-summary)
2. [Tech stack](#2-tech-stack)
3. [System diagram](#3-system-diagram)
4. [Data model](#4-data-model)
5. [Key flows](#5-key-flows)
6. [Non-goals](#6-non-goals)

## 1. Domain summary

<!-- 1–2 paragraphs: what the product is, who uses it, what it does. -->

REPLACE THIS — describe the product in 1–2 paragraphs.

## 2. Tech stack

<!-- Bullet list of key technology choices and why. -->

- `{{TECH_STACK}}`
- REPLACE THIS — list runtime, framework, database, auth, hosting, key third-party services.

## 3. System diagram

<!-- ASCII diagram OR link to docs/diagrams/. Keep it small. -->

```
[Client] → [API] → [Database]
```

REPLACE THIS with a real diagram once the system has 2+ services.

## 4. Data model

<!-- For each main entity: name, key fields, relationships. -->

REPLACE THIS — list the 3–7 main entities with key fields.

## 5. Key flows

<!-- For each user-facing flow: trigger, steps, end state. -->

### Flow 1 — REPLACE THIS

1. ...

## 6. Non-goals

<!-- What this build EXPLICITLY won't do. Saves loop from scope creep. -->

- REPLACE THIS — list features the loop should NOT pursue (e.g. "no native mobile app", "no offline mode in v1").
