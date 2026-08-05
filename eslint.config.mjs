import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "out-e2e/**",
      ".vscode-test/**",
      "src/generated/**",
      "idl/**",
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // F1.4 / N2: nothing refreshes on a timer — liveness is tick-driven.
    // setInterval in extension source is a polling loop by construction.
    files: ["src/**/*.ts"],
    rules: {
      // N4: row contents never leave the machine; ad-hoc console logging is
      // where value leaks start. The OutputChannel call sites are audited.
      "no-console": "error",
      "no-restricted-globals": [
        "error",
        { name: "setInterval", message: "No polling (F1.4/N2): refresh is tick-driven via AR-5." },
      ],
      "no-restricted-properties": [
        "error",
        {
          object: "global",
          property: "setInterval",
          message: "No polling (F1.4/N2): refresh is tick-driven via AR-5.",
        },
      ],
    },
  },
);
