# FlowPulse GitHub Action

Headless CI/CD action that automatically evaluates merged Pull Requests against `.flowpulse.yml` rules, extracts the author's Stellar address, and provisions continuous per-second micro-streams on Soroban.

## Features
- **Deterministic Rule Evaluation**: Matches merged PRs by labels, authors, or base branches.
- **Stellar Address Extraction**: Automatically parses contributor Ed25519 public keys (`stellar: G...` or bare addresses) from PR descriptions.
- **Zero-Friction Dry Run Mode**: Verifies matching logic and logs planned stream parameters without moving funds.
- **Per-Second Streaming**: Provisions micro-streams via FlowPulse `StreamRouter` rather than lump-sum transfers.

---

## Configuration (`.flowpulse.yml`)

Place `.flowpulse.yml` in the root of your repository:

```yaml
version: 1
rules:
  - name: Core feature bounty
    label: bounty-approved
    amount: 150
    token: XLM
    duration_hours: 48

  - name: Documentation bounty
    label: area: docs
    amount: 50
    token: XLM
    duration_hours: 24
```

---

## Example Workflow (`.github/workflows/bounty.yml`)

```yaml
name: FlowPulse Bounty Stream

on:
  pull_request:
    types: [closed]

jobs:
  bounty:
    if: github.event.pull_request.merged == true
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Evaluate FlowPulse Bounty
        uses: ./ci/github-action
        with:
          config-path: ".flowpulse.yml"
          dry-run: "false"
          stellar-secret-key: ${{ secrets.STELLAR_SPONSOR_KEY }}
```

---

## Inputs

| Name | Description | Default | Required |
|---|---|---|---|
| `config-path` | Path to `.flowpulse.yml` | `.flowpulse.yml` | No |
| `dry-run` | Evaluate rules without submitting on-chain txs | `true` | No |
| `stellar-secret-key` | Ed25519 secret key (`S...`) of the funding account | - | Only in live mode |
| `network` | Stellar network (`testnet` or `mainnet`) | `testnet` | No |

## Outputs

| Name | Description |
|---|---|
| `matched` | `true` if PR satisfied bounty conditions |
| `rule-name` | Name of the matched rule |
| `recipient` | Extracted Stellar address (`G...`) |
| `amount` | Bounty token amount |
| `token` | Token symbol (`XLM` / `USDC`) |
| `duration-hours` | Stream runway in hours |
| `status` | `dry_run_success`, `submitted`, `not_matched`, `error` |
