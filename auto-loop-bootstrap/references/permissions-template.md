# Permissions template — `.claude/settings.local.json`

The auto-loop driver runs `claude -p` with `--permission-mode bypassPermissions`. That's required for headless operation — there's nobody to approve prompts. To compensate, use the project-local settings file to DENY access to sensitive files.

## Skeleton

Write to `<repo>/.claude/settings.local.json`:

```json
{
  "permissions": {
    "deny": [
      "Read(.env)",
      "Read(.env.*)",
      "Read(secrets/**)",
      "Read(keys/**)",
      "Read(**/*.pem)",
      "Read(**/*.key)",
      "Edit(.env)",
      "Edit(.env.*)",
      "Edit(secrets/**)",
      "Edit(keys/**)",
      "Bash(rm -rf:*)",
      "Bash(git push --force:*)",
      "Bash(git reset --hard:*)",
      "Bash(npx convex deploy:*)"
    ]
  }
}
```

Customize the deny list to the repo's actual sensitive paths.

## What to ask the user in Phase 3

> "Are there files in this repo the autonomous loop should never read or modify? Common categories: .env / secrets / keys / production credentials / customer data. Anything specific to this repo?"

For each path they name, add `Read(<path>)` AND `Edit(<path>)` entries.

## Dangerous Bash patterns to always deny

Regardless of repo:

| Pattern | Why deny |
|---------|----------|
| `Bash(rm -rf:*)` | Catastrophic accidental delete |
| `Bash(git push --force:*)` | Overwrites remote history |
| `Bash(git reset --hard:*)` | Discards uncommitted work silently |
| `Bash(git push origin main --force:*)` | Specific force-push to main |
| `Bash(npx convex deploy:*)` | Production deploy (if Convex-based) |
| `Bash(npm publish:*)` | Public package publish |
| `Bash(gh release create:*)` | Public release |
| `Bash(vercel deploy --prod:*)` | Production deploy |

The autonomous-build-loop skill already encodes "no force-push / no production deploys" as hard rules, but a settings-level deny is a defense in depth.

## What NOT to deny

Don't deny things the loop needs:
- `Bash(git commit:*)` — the loop must commit
- `Bash(git push:*)` — push cadence is part of the protocol (denying force-push is enough)
- `Bash(npm test:*)` / `Bash(npx tsc:*)` — verification
- Reads on most source files

## Verification

After writing the file:

```bash
python3 -c "import json; print(json.dumps(json.load(open('.claude/settings.local.json')), indent=2))"
```

Confirms valid JSON. The auto-loop's `claude -p` will load these settings automatically (it inherits the project's settings dir).
