import { loadLocalEnvironment, configurationProblems } from "./environment.mjs";
try {
  loadLocalEnvironment();
  const mode = process.argv[2] ?? "sandbox";
  const problems = configurationProblems(process.env, mode);
  if (problems.length) {
    console.error(`Configuration incomplete (${mode}):\n${problems.map(problem => `- ${problem}`).join("\n")}`);
    process.exitCode = 1;
  } else console.log(`Configuration looks valid (${mode}). Values were not printed; no services were contacted.`);
} catch {
  console.error("Could not load configuration. Use Node.js 22+ and a readable .env.local if present.");
  process.exitCode = 1;
}
