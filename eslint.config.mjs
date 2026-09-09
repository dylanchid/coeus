import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),

  // --- src/lib layer + domain boundaries (bareaga_web-tpy / docs/lib-architecture.md) ---
  // Mechanical guard for the layer direction and the server/browser split.
  // Runs in `warn` so it surfaces modules that already cross an edge; they get
  // moved one slice at a time, then this ratchets to `error`. `no-restricted-
  // imports` matches the import specifier (alias, bare, and relative forms) and
  // exempts `import type`, which is erased at build.
  {
    // Layer 2 — domain core: plain `src/lib/*.ts` (not a store, API, or test).
    // Must stay pure and client-safe: no `server-only`, no `next`, and no
    // reaching "up" into a store (`*.server`, layer 3) or domain API (`*Api`,
    // layer 4). Depend on another domain's *core types* instead.
    files: ["src/lib/**/*.ts"],
    ignores: [
      "src/lib/**/*.server.ts",
      "src/lib/**/*Api.ts",
      "src/lib/**/*.test.mjs",
      "src/lib/**/*.test.ts",
    ],
    rules: {
      "no-restricted-imports": ["warn", {
        patterns: [
          {
            group: ["server-only", "next", "next/*"],
            message:
              "Layer 2 (domain core, plain src/lib/*.ts) stays pure and client-safe: no server-only, no next. See docs/lib-architecture.md.",
          },
          {
            group: [
              "@/lib/*.server", "@/lib/**/*.server",
              "./*.server", "../**/*.server",
              "@/lib/*Api", "@/lib/**/*Api",
              "./*Api", "../**/*Api",
            ],
            allowTypeImports: true,
            message:
              "Layer 2 (domain core) imports only its own domain core + primitives — never a store (*.server) or domain API (*Api). Lift the thing you need to a core type. See docs/lib-architecture.md.",
          },
        ],
      }],
    },
  },
  {
    // Client & RSC trees: a `*.server` module may only be imported `import type`
    // (erased). A value import pulls the admin Supabase client toward a bundle.
    files: ["src/components/**/*.{ts,tsx}", "src/hooks/**/*.{ts,tsx}"],
    ignores: ["src/**/*.test.{ts,tsx,mjs}"],
    rules: {
      "no-restricted-imports": ["warn", {
        patterns: [
          {
            group: [
              "@/lib/*.server", "@/lib/**/*.server",
              "./*.server", "../**/*.server", "../lib/*.server",
            ],
            allowTypeImports: true,
            message:
              "Client / shared component code imports a *.server module by value. Keep it `import type`, or lift the value you need into a client-safe module. See docs/lib-architecture.md.",
          },
        ],
      }],
    },
  },
]);

export default eslintConfig;
