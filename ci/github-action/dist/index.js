const fs = require("fs");
const path = require("path");

function extractStellarAddress(text) {
  if (!text) return null;
  const tagged = text.match(/stellar\s*(?:address)?\s*[:=]\s*`?(G[A-Z2-7]{55})`?/i);
  const any = tagged ? tagged[1] : (text.match(/\b(G[A-Z2-7]{55})\b/) ? text.match(/\b(G[A-Z2-7]{55})\b/)[1] : null);
  if (!any) return null;
  return /^G[A-Z2-7]{55}$/.test(any) ? any : null;
}

function parseRuleConfig(content) {
  const lines = content.split(/\r?\n/);
  const rules = [];
  let currentRule = null;
  let inRules = false;

  for (const raw of lines) {
    const line = raw.replace(/\s+#.*$/, "").trimEnd();
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    if (trimmed.startsWith("rules:")) {
      inRules = true;
      continue;
    }

    if (inRules) {
      if (trimmed.startsWith("- ")) {
        if (currentRule && currentRule.name && currentRule.amount) {
          rules.push(currentRule);
        }
        currentRule = {};
        const rest = trimmed.slice(2).trim();
        if (rest) {
          const kv = rest.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
          if (kv) assignField(currentRule, kv[1], kv[2]);
        }
        continue;
      }

      if (currentRule) {
        const kv = trimmed.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
        if (kv) assignField(currentRule, kv[1], kv[2]);
      }
    }
  }

  if (currentRule && currentRule.name && currentRule.amount) {
    rules.push(currentRule);
  }

  return { rules };
}

function assignField(rule, key, valStr) {
  const val = valStr.replace(/^["']|["']$/g, "").trim();
  switch (key) {
    case "name":
      rule.name = val;
      break;
    case "label":
      rule.label = val;
      break;
    case "amount":
      rule.amount = val;
      break;
    case "token":
      rule.token = val;
      break;
    case "duration_hours":
      rule.duration_hours = Number(val) || 24;
      break;
    case "enabled":
      rule.enabled = val.toLowerCase() !== "false";
      break;
  }
}

function evaluatePullRequest(config, pr) {
  if (!pr.merged) {
    return {
      matched: false,
      reason: "Pull Request was closed without being merged",
    };
  }

  const recipient = pr.stellarAddress || extractStellarAddress(pr.body);

  if (config.rules.length === 0) {
    return {
      matched: false,
      reason: "No rules configured in .flowpulse.yml",
    };
  }

  for (const rule of config.rules) {
    if (rule.enabled === false) continue;

    if (rule.label) {
      const hasLabel = pr.labels.some(
        (l) => l.toLowerCase() === rule.label.toLowerCase()
      );
      if (!hasLabel) continue;
    }

    if (!recipient) {
      return {
        matched: false,
        ruleName: rule.name,
        amount: rule.amount,
        durationHours: rule.duration_hours || 24,
        recipientAddress: null,
        reason: `Matched rule '${rule.name}', but no valid Stellar address found in PR description`,
      };
    }

    return {
      matched: true,
      ruleName: rule.name,
      amount: rule.amount,
      token: rule.token || "XLM",
      durationHours: rule.duration_hours || 24,
      recipientAddress: recipient,
      reason: `Matched rule '${rule.name}' for author ${pr.author}`,
    };
  }

  return {
    matched: false,
    reason: "No rules matched the PR labels or conditions",
  };
}

function getInput(name, fallback = "") {
  const envKey = `INPUT_${name.replace(/ /g, "_").toUpperCase()}`;
  return process.env[envKey] || fallback;
}

function setOutput(name, value) {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) {
    fs.appendFileSync(outputFile, `${name}=${value}\n`, "utf8");
  } else {
    console.log(`[OUTPUT] ${name}=${value}`);
  }
}

async function run() {
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

    const prPayload = {
      number: prRaw.number,
      title: prRaw.title || "",
      url: prRaw.html_url || "",
      author: prRaw.user ? prRaw.user.login : "unknown",
      merged: Boolean(prRaw.merged),
      mergedAt: prRaw.merged_at,
      labels: Array.isArray(prRaw.labels) ? prRaw.labels.map((l) => l.name) : [],
      body: prRaw.body || "",
    };

    const configPath = getInput("config-path", ".flowpulse.yml");
    const dryRun = getInput("dry-run", "true").toLowerCase() === "true";

    console.log(`Evaluating PR #${prPayload.number}: "${prPayload.title}" (merged: ${prPayload.merged})`);

    let configContent = "";
    if (fs.existsSync(configPath)) {
      configContent = fs.readFileSync(configPath, "utf8");
    } else {
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
      setOutput("rule-name", result.ruleName || "");
      setOutput("recipient", result.recipientAddress || "");
      setOutput("amount", result.amount || "");
      setOutput("token", result.token || "XLM");
      setOutput("duration-hours", result.durationHours || 24);

      if (dryRun) {
        console.log(`[DRY RUN] Would open stream of ${result.amount} ${result.token} to ${result.recipientAddress} over ${result.durationHours}h.`);
        setOutput("status", "dry_run_success");
      } else {
        console.log(`[LIVE EXECUTION] Opening stream of ${result.amount} ${result.token} to ${result.recipientAddress}...`);
        setOutput("status", "submitted");
      }
    } else {
      setOutput("status", "not_matched");
      setOutput("reason", result.reason || "");
    }
  } catch (error) {
    const msg = error.message || String(error);
    console.error(`Action failed: ${msg}`);
    setOutput("matched", false);
    setOutput("status", "error");
    setOutput("error", msg);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  run();
}

module.exports = {
  extractStellarAddress,
  parseRuleConfig,
  evaluatePullRequest,
  run,
};
