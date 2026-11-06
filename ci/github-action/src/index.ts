import fs from "fs";
import path from "path";
import { evaluatePullRequest, parseRuleConfig, type PullRequestPayload } from "./evaluator";

function getInput(name: string, fallback = ""): string {
  const envKey = `INPUT_${name.replace(/ /g, "_").toUpperCase()}`;
  return process.env[envKey] ?? fallback;
}

function setOutput(name: string, value: string | number | boolean) {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) {
    fs.appendFileSync(outputFile, `${name}=${value}\n`, "utf8");
  } else {
    console.log(`[OUTPUT] ${name}=${value}`);
  }
}

export async function run(): Promise<void> {
  try {
    const eventPath = process.env.GITHUB_EVENT_PATH;
    if (!eventPath || !fs.existsSync(eventPath)) {
      throw new Error(`GITHUB_EVENT_PATH not found or invalid: ${eventPath}`);
    }

    const eventData = JSON.parse(fs.readFileSync(eventPath, "utf8"));
    const prRaw = eventData.pull_request;
    if (!prRaw) {
      console.log("No pull_request found in GitHub event payload. Exiting.");
      setOutput("matched", false);
      return;
    }

    const prPayload: PullRequestPayload = {
      number: prRaw.number,
      title: prRaw.title ?? "",
      url: prRaw.html_url ?? "",
      author: prRaw.user?.login ?? "unknown",
      merged: Boolean(prRaw.merged),
      mergedAt: prRaw.merged_at,
      labels: Array.isArray(prRaw.labels) ? prRaw.labels.map((l: { name: string }) => l.name) : [],
      body: prRaw.body ?? "",
    };

    const configPath = getInput("config-path", ".flowpulse.yml");
    const dryRun = getInput("dry-run", "true").toLowerCase() === "true";

    console.log(`Evaluating PR #${prPayload.number}: "${prPayload.title}" (merged: ${prPayload.merged})`);
    console.log(`Reading rules from: ${configPath}`);

    let configContent = "";
    if (fs.existsSync(configPath)) {
      configContent = fs.readFileSync(configPath, "utf8");
    } else {
      console.warn(`Configuration file ${configPath} not found. Using default bounty rule.`);
      configContent = `
rules:
  - name: Default Bounty
    label: bounty-approved
    amount: 50
    duration_hours: 48
`;
    }

    const config = parseRuleConfig(configContent);
    const result = evaluatePullRequest(config, prPayload);

    console.log(`Evaluation result: matched=${result.matched}, reason: ${result.reason}`);

    setOutput("matched", result.matched);
    if (result.matched) {
      setOutput("rule-name", result.ruleName ?? "");
      setOutput("recipient", result.recipientAddress ?? "");
      setOutput("amount", result.amount ?? "");
      setOutput("token", result.token ?? "XLM");
      setOutput("duration-hours", result.durationHours ?? 24);

      if (dryRun) {
        console.log(`[DRY RUN] Would open stream of ${result.amount} ${result.token} to ${result.recipientAddress} over ${result.durationHours}h.`);
        setOutput("status", "dry_run_success");
      } else {
        console.log(`[LIVE EXECUTION] Opening stream of ${result.amount} ${result.token} to ${result.recipientAddress}...`);
        setOutput("status", "submitted");
      }
    } else {
      setOutput("status", "not_matched");
      setOutput("reason", result.reason ?? "");
    }
  } catch (error) {
    const msg = (error as Error).message ?? String(error);
    console.error(`Action failed: ${msg}`);
    setOutput("matched", false);
    setOutput("status", "error");
    setOutput("error", msg);
    process.exitCode = 1;
  }
}

if (process.env.NODE_ENV !== "test") {
  run();
}
