// dependency-cruiser config — modularity fitness function for JS/TS.
// Installed by the `fitness-functions` skill. Run: npx depcruise --config this src
// Docs: https://github.com/sverweij/dependency-cruiser
//
// Tune `layer` names/paths to THIS repo's architecture (detected in Phase 1).
// Start rules at "warn" (monitoring) and flip to "error" (gating) once clean.

module.exports = {
  forbidden: [
    {
      name: "no-circular",
      comment: "Circular dependencies make modules impossible to reason about, test, or extract.",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-orphans",
      comment: "Orphan modules are usually dead code or a missed wiring.",
      severity: "warn",
      from: { orphan: true, pathNot: ["\\.d\\.ts$", "(^|/)index\\.[jt]s$"] },
      to: {},
    },
    {
      // LAYERING: domain must not depend on infrastructure/UI (clean-arch direction).
      // Adjust the path globs to match your folders.
      name: "domain-stays-pure",
      comment: "Domain layer must not import infrastructure or UI.",
      severity: "warn", // → "error" to gate
      from: { path: "^src/domain" },
      to: { path: "^src/(infrastructure|ui|web|api)" },
    },
    {
      name: "no-deprecated-deps",
      comment: "Don't add dependencies on deprecated npm packages.",
      severity: "warn",
      from: {},
      to: { dependencyTypes: ["deprecated"] },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: "tsconfig.json" }, // remove if plain JS
    enhancedResolveOptions: { exportsFields: ["exports"], conditionNames: ["import", "require"] },
  },
};
