import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTs,
  {
    // Pre-existing Mini App code predates the React Compiler lint rules; keep them visible as warnings.
    files: ["app/(app)/**/*.{ts,tsx}"],
    rules: { "react-hooks/set-state-in-effect": "warn", "react-hooks/purity": "warn" },
  },
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts", "design/**"] },
];

export default config;
