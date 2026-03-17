const path = require("path");

const getVersionRcConfig = () => {
  try {
    return require(path.resolve(".versionrc.cjs"));
  } catch {
    return {};
  }
};

const getExampleIssueRefs = () => {
  const { issuePrefixes = [] } = getVersionRcConfig();

  if (issuePrefixes.length === 0) return "";

  const exampleNumber = 123;

  return issuePrefixes
    .map((prefix, i) => `${prefix}${exampleNumber + i}`)
    .join(", ");
};

module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      [
        "build",
        "chore",
        "ci",
        "docs",
        "feat",
        "fix",
        "improvement",
        "perf",
        "refactor",
        "revert",
        "style",
        "test",
      ],
    ],
  },
  prompt: {
    messages: {
      ...(() => {
        const { issuePrefixes = [] } = getVersionRcConfig();
        return issuePrefixes.length > 0
          ? {
              footer: `List any ISSUES AFFECTED by this change. E.g.: ${getExampleIssueRefs()}`,
            }
          : {};
      })(),
    },
    types: [
      { value: "feat", name: "✨ feat: A new feature" },
      { value: "fix", name: "🐞 fix: A bug fix" },
      { value: "docs", name: "📝 docs: Documentation only changes" },
      { value: "style", name: "💅 style: Code style / formatting only" },
      {
        value: "refactor",
        name: "♻️ refactor: Code change that isn't a fix or a feature",
      },
      { value: "perf", name: "⚡ perf: Performance improvement" },
      { value: "test", name: "✅ test: Adding or correcting tests" },
      { value: "build", name: "📦 build: Build system changes" },
      { value: "ci", name: "🔧 ci: CI configuration changes" },
      {
        value: "chore",
        name: "🧹 chore: Build process or auxiliary tool changes",
      },
      { value: "revert", name: "⏪ revert: Revert a previous commit" },
      { value: "improvement", name: "🚀 improvement: An improvement" },
    ],
    skipQuestions: ["scope", "footerPrefix", "confirmCommit"],
    allowBreakingChanges: ["feat", "fix"],
    useEmoji: false,
    maxHeaderLength: 100,
    maxSubjectLength: 100,
    skipEmptyScopes: true,
    enableMultipleScopes: false,
  },
};
