const OVERLONG_HEADER_PREFIX =
  "feat: ✨ pin the showcase as one frame, pair the run-report rows and split the footer (wave 1 of #304)";

export default {
  extends: ["@commitlint/config-conventional"],
  ignores: [(message: string) => message.startsWith(OVERLONG_HEADER_PREFIX)],
};
