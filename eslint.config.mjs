import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  // `next lint` skipped these for us; the ESLint CLI does not. Without them the
  // run lints the static export and the build cache — thousands of errors in
  // generated bundles that no one can fix.
  {
    ignores: [
      "out/**",
      ".next/**",
      "next-env.d.ts",
      // The three services next to the site. They ship on their own schedule
      // (`booking-api` via its own `npm run deploy`, the others separately) and
      // `next lint` never covered them, so a stale `any` in one of them must not
      // block a website deploy. Lint them from their own package when wanted.
      "booking-api/**",
      "kchat-api/**",
      "mailer/**",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];

export default eslintConfig;
