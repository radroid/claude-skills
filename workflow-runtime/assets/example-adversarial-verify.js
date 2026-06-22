export const meta = {
  name: "reviewer-adversarial-verify",
  description:
    "Re-express orchestrated-delivery's reviewer step as a hostile adversarial-verify pass: run N refuters per claim across diverse lenses, BLOCK on majority-refute, emit the APPROVE / BLOCK <n> issues verdict grammar, and flag a zero-block streak as a smell.",
};

// =====================================================================
// COPY-PASTE PREAMBLE  (schemas + helpers inlined; NOT imported)
// The workflow runner has NO module loader — there is no require/import.
// Everything a script needs physically lives in the script. Paste this block
// verbatim below meta in any reviewer-style workflow, then edit the body.
// =====================================================================

// --- The reviewer's verdict grammar, as a validated schema. -----------
// orchestrated-delivery requires the reviewer to END with EXACTLY
//   "VERDICT: APPROVE"  or  "VERDICT: BLOCK — <n> issues".
// (This is the legacy binary reviewer grammar — a subset of the canonical
//  APPROVE | REVISE | BLOCK in assets/preamble.js. When orchestrated-delivery
//  is wired to the canon, a fixable BLOCK becomes REVISE; here we keep the
//  binary form to stay faithful to the reviewer step as it exists today.)
// This is the documented RETURN SHAPE: the pipeline builds objects of this shape
// BY CONSTRUCTION from deterministic values (no LLM round-trip — see the body).
const VERDICT_SCHEMA = {
  type: "object",
  required: ["claim", "verdict", "issue_count", "verdict_line", "votes", "free_hunt"],
  additionalProperties: false,
  properties: {
    claim: { type: "string" },
    verdict: { type: "string", enum: ["APPROVE", "BLOCK"] },
    // issue_count is 0 when APPROVE and >=1 when BLOCK — enforced in the body.
    issue_count: { type: "integer", minimum: 0 },
    // The literal trailing line, reproduced verbatim per the contract.
    verdict_line: { type: "string" },
    // Per-refuter ballots. Non-blocking doubts are FIRST-CLASS (anti-bias rule 6):
    // a refuter can register a concern without forcing the expensive BLOCK path.
    votes: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["lens", "refuted", "confidence", "finding"],
        additionalProperties: false,
        properties: {
          lens: { type: "string" },
          refuted: { type: "boolean" },
          // >=80% confidence to RAISE a blocking issue (reviewer contract).
          confidence: { type: "number", minimum: 0, maximum: 1 },
          finding: { type: "string" },
          nonblocking: { type: "boolean" },
        },
      },
    },
    // FREE-HUNT (anti-bias rule 1): the most plausible failure mode NOT on the
    // checklist, reported even below the confidence bar.
    free_hunt: { type: "string" },
  },
};

// The diverse hostile lenses, derived from orchestrated-delivery's ANTI-BIAS
// section. A claim is probed by N refuters; lenses are assigned round-robin by
// index so the run is deterministic (no RNG — the runner forbids it).
const REFUTER_LENSES = [
  // rule 5: hostile frame — "assume the author is wrong".
  "hostile: assume the author is WRONG; find the diff's load-bearing mistake",
  // rule 1: FREE-HUNT — a failure mode NOT on any checklist.
  "free-hunt: ignore the checklist; name the most plausible UNLISTED failure mode",
  // rule 2: COMPOSITION — cross-PR contract; re-read the callee, don't trust the label.
  "composition: each diff may be fine while the COMPOSITION is broken; re-read cross-PR contracts",
  // rule 3: SANCTIONED-DELTA CONSEQUENCE — blessed != harmless.
  "delta-consequence: a blessed delta can still violate an invariant or the spec goal",
  // rule 4: NO SELF-MARKED HOMEWORK — demand a REVIEWER-authored test + runtime oracle.
  "no-self-marked-homework: the executor's own tests don't count; demand a reviewer test + runtime smoke oracle",
];

// Vary deterministically by index/label — the runner has no clock and no RNG.
function lensFor(i) {
  return REFUTER_LENSES[i % REFUTER_LENSES.length];
}
// The free-hunt lens is index 1 of REFUTER_LENSES. Match free_hunt against the
// ASSIGNED lens (deterministic) — never regex over the model's echoed lens text.
const FREE_HUNT_LENS = REFUTER_LENSES[1];
function tag(label, i) {
  return label + "-" + i;
}

// adversarialVerify: run N hostile refuters against ONE claim on diverse
// lenses, then gate by REFUTE-BY-MAJORITY. Returns { survives, refutedCount, total, votes }.
// parallel() is a BARRIER — justified here because the majority tally needs
// ALL ballots before it can decide. A throwing thunk resolves to null -> filter.
async function adversarialVerify(claim, diff, opts) {
  const o = opts || {};
  const n = o.n || 3;
  const phaseTag = o.phase || "adversarial-verify";
  // The refuter returns only its judgement; the LENS is assigned deterministically
  // by index below (never trust the model to echo it back — see free_hunt).
  const REFUTER_BALLOT = {
    type: "object",
    required: ["refuted", "confidence", "finding"],
    additionalProperties: false,
    properties: {
      refuted: { type: "boolean" },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      finding: { type: "string" },
      nonblocking: { type: "boolean" },
    },
  };
  // parallel() is a BARRIER — the majority tally needs ALL ballots. Do NOT
  // .filter(Boolean) the raw results before tallying: a null (skip / death /
  // throw) is a NON-CONFIRMATION and MUST count as a refutation — never give a
  // claim the benefit of a missing vote. (Same null doctrine as the canon's
  // patterns.md adversarialVerify.)
  const raw = await parallel(
    Array.from({ length: n }, (_, i) => () =>
      agent(
        "You are a HOSTILE refuter on lens [" + lensFor(i) + "].\n" +
          "Diff-only review. Try to REFUTE this claim about the change.\n" +
          "Claim: " + claim + "\n\nDiff:\n" + diff + "\n\n" +
          "Set refuted=true ONLY at >=0.80 confidence (the reviewer bar). " +
          "Below the bar, set refuted=false and nonblocking=true but still record the finding. " +
          "NEVER write code; one-line fix direction only.",
        { label: tag("refuter", i), phase: phaseTag, schema: REFUTER_BALLOT },
      ),
    ),
  );
  const votes = raw.map((b, i) => {
    const lens = lensFor(i); // ASSIGNED lens (deterministic), not the model's echo
    if (!b) {
      // null = skip/death/throw = NON-CONFIRMATION → counts as a refutation.
      return { lens, refuted: true, confidence: 1, finding: "no ballot returned (skip/death) — defaulted to refuted", nonblocking: false };
    }
    return { lens, refuted: b.refuted === true, confidence: b.confidence, finding: b.finding, nonblocking: b.nonblocking === true };
  });

  const refutedCount = votes.filter((v) => v.refuted).length;
  const total = votes.length; // includes deaths — they count as refutations
  // BLOCK on majority-refute. Ties (n even) resolve to BLOCK — the hostile default.
  const survives = total > 0 && refutedCount < Math.ceil(total / 2);
  return { survives, refutedCount, total, votes };
}

// Render the EXACT trailing line the reviewer contract mandates.
function verdictLine(verdict, issueCount) {
  return verdict === "APPROVE" ? "VERDICT: APPROVE" : "VERDICT: BLOCK — " + issueCount + " issues";
}
// =====================================================================
// END PREAMBLE
// =====================================================================

// --- Body. args may be undefined — inline constants are the safe fallback. ---
const claims = (args && args.claims) || [
  {
    claim: "PR #41 paginate() fix is correct and regresses nothing.",
    diff: "--- a/paginate.js\n+++ b/paginate.js\n@@\n- return items.slice(start, start + size);\n+ return items.slice(start, start + size + 1);",
  },
  {
    claim: "PR #42 wires the new auth sentinel end-to-end across the feature's PRs.",
    diff: "--- a/auth.js\n+++ b/auth.js\n@@\n+ const SENTINEL = Symbol('unauth');",
  },
];

const N = (args && args.refutersPerClaim) || REFUTER_LENSES.length;

phase("reviewer adversarial-verify");
log("verifying " + claims.length + " claim(s) with " + N + " hostile refuters each");

// DEFAULT to pipeline(): each claim flows refute -> adjudicate independently,
// no barrier between claims. Stage callback gets (prevResult, originalItem, index).
const verdicts = (
  await pipeline(
    claims,
    (item, _orig, i) =>
      adversarialVerify(item.claim, item.diff, { n: N, phase: tag("verify", i) }),
    (av, orig) => {
      if (!av) return null; // a throwing refute stage drops the item to null
      const verdict = av.survives ? "APPROVE" : "BLOCK";
      const issueCount = av.survives ? 0 : Math.max(1, av.refutedCount);
      const fh = av.votes.find((v) => v.lens === FREE_HUNT_LENS);
      const freeHunt = (fh && fh.finding) || "none surfaced above the bar";
      // Every value here is DETERMINISTIC — build the (VERDICT_SCHEMA-shaped)
      // object directly. Do NOT round-trip known values through an LLM: a schema
      // validates SHAPE, not values, so an adjudicator agent could silently
      // reformat verdict_line or drop a vote. "The verdict is typed, not parsed"
      // — reserve agent()+schema for genuine judgement (the refuters above).
      return {
        claim: orig.claim,
        verdict,
        issue_count: issueCount,
        verdict_line: verdictLine(verdict, issueCount),
        votes: av.votes,
        free_hunt: freeHunt,
      };
    },
  )
).filter(Boolean);

// --- Anti-bias rule 6: a LONG ZERO-BLOCK STREAK IS A SMELL, NOT A TROPHY. ----
// Review-yield has a floor: if a whole non-trivial run produced zero BLOCKs,
// that is suspect — trigger a blind hostile re-review with zero streak context.
const blocks = verdicts.filter((v) => v.verdict === "BLOCK");
let smellProbe = null;
if (verdicts.length >= 2 && blocks.length === 0) {
  log("SMELL: zero-block streak across " + verdicts.length + " claims — triggering blind hostile re-review");
  smellProbe = await agent(
    "BLIND HOSTILE RE-REVIEW. You have ZERO streak context. These claims were all APPROVED. " +
      "Assume the reviewers rubber-stamped. Find the single most likely escaped defect:\n" +
      claims.map((c) => "- " + c.claim).join("\n"),
    { label: "blind-hostile-rereview", phase: "anti-bias-smell-check" },
  );
}

for (const v of verdicts) {
  log(v.claim + " -> " + v.verdict_line + " (free-hunt: " + v.free_hunt + ")");
}
log(
  "done: " + verdicts.length + " verdicts, " + blocks.length + " BLOCK; " +
    (smellProbe ? "smell-probe ran" : "no smell probe") +
    "; budget left " + budget.remaining(),
);

return { verdicts: verdicts, blocks: blocks.length, smellProbe: smellProbe };
