import next from "eslint-config-next/core-web-vitals";
import tseslint from "typescript-eslint";

export default [
  ...next,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@next/next/no-html-link-for-pages": "off",
    },
  },
  {
    ignores: ["**/.next/**", "**/dist/**", "**/coverage/**", "node_modules/**"],
  },
];
