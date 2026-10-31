import { createESLintConfig } from "@the-rabbit-hole/eslint-config";

export default [
  { ignores: ["**/coverage/**", "**/node_modules/**", "**/src/generated/**"] },
  ...createESLintConfig(),
  // eslint-plugin-react can't detect a version under ESLint 10, and this repo has no React.
  { settings: { react: { version: "19.3" } } },
  { files: ["**/*.test.ts"], rules: { "unicorn/no-await-expression-member": "off" } },
  {
    rules: {
      "unicorn/filename-case": ["error", { cases: { camelCase: true, kebabCase: true } }],
      // Prettier strips the parentheses this rule asks for, so the two can never both pass.
      "unicorn/no-nested-ternary": "off",
      // GraphQL models a missing value as null, and the generated types say so.
      "unicorn/no-null": "off",
      "unicorn/prevent-abbreviations": [
        "error",
        {
          allowList: {
            env: true,
            ImportMetaEnv: true,
            Props: true,
            props: true,
            ref: true,
            Ref: true,
          },
        },
      ],
    },
  },
];
