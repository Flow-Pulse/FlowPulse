#!/usr/bin/env bash
# Create labels and the initial scoped issue backlog on the current GitHub repo.
# Usage (from repo root, after `gh auth login` and pushing): ./scripts/seed-issues.sh
set -euo pipefail

label() { gh label create "$1" --color "$2" --description "$3" --force >/dev/null; }
label "good first issue" "7057ff" "Good for newcomers"
label "complexity: trivial" "c2e0c6" "Small, well-defined change"
label "complexity: medium"  "fbca04" "Requires some design or multiple files"
label "complexity: high"    "d93f0b" "Significant feature or contract work"
label "area: contracts" "0969da" "Soroban smart contracts"
label "area: frontend"  "1f6feb" "React app"
label "area: ci"        "5319e7" "GitHub automation"
label "area: docs"      "0e8a16" "Documentation"

issue() { # title, labels, body
  gh issue create --title "$1" --label "$2" --body "$3" >/dev/null && echo "✓ $1"
}

issue "Add USDC (testnet SAC) as a stream token" "area: frontend,area: contracts,complexity: medium" \
"Streams currently only use native XLM (\`XLM_SAC\` in \`frontend/src/lib/config.ts\`). The contract already accepts any SAC token.

**Tasks**
- Add a token selector to \`NewStreamModal\` (XLM, testnet USDC).
- Register USDC in \`TOKENS\` with correct decimals.
- Show the right code in stream cards and Earnings (Earnings currently filters to XLM only).
- Handle the trustline case: show a clear message if the recipient has no USDC trustline.

**Acceptance:** a USDC stream can be created, accrues, and withdraws on testnet; unit test for token metadata."

issue "Headless GitHub Action that evaluates bounty rules on merged PRs" "area: ci,complexity: high" \
"Today rules run in the browser (\`frontend/src/lib/ci.ts\`). Build \`ci/github-action/\`: a JavaScript Action that runs on \`pull_request: closed\`, reads a \`.flowpulse.yml\` rule file, extracts the author's \`stellar: G…\` address, and opens a bounty stream with a repo-secret signing key.

**Acceptance:** action + README + example workflow; reuses \`extractStellarAddress\`/\`evaluate\` (move them to a shared package); dry-run mode that only logs; tested against a fixture webhook payload."

issue "bounty_escrow contract: pre-funded escrow released by authorized webhook signer" "area: contracts,complexity: high" \
"Third contract from the design: maintainers pre-fund an escrow per repo; an authorized signer (the GitHub Action key) can release a fixed bounty to a contributor address, with a per-PR idempotency key so the same PR can't be paid twice.

**Acceptance:** \`fund\`, \`set_signer\`, \`release(pr_id, recipient, amount)\`, \`refund\`; events; tests for double-release, unauthorized signer, insufficient balance."

issue "Resolve maintainer Stellar addresses from FUNDING.json" "area: frontend,complexity: medium" \
"Split rows require pasting a Stellar address per dependency. Many repos publish a \`FUNDING.json\` (Drips uses it). For dependencies with a GitHub repository URL in crates.io/npm metadata, fetch \`FUNDING.json\` and prefill a Stellar address if present.

**Acceptance:** new helper in \`lib/manifest.ts\` with unit tests (mocked fetch); rows show a 'resolved from FUNDING.json' chip; failures are silent and non-blocking."

issue "Suggest split weights from download counts" "area: frontend,complexity: medium" \
"Add a 'Suggest weights' button on Cascades that fetches recent downloads (crates.io API / api.npmjs.org) and allocates the 90% pool proportionally (with a min floor per dep).

**Acceptance:** pure weighting function with tests (sums exactly to target bps); graceful fallback to equal weights on API errors."

issue "Parse Cargo.lock and package-lock.json for transitive dependencies" "area: frontend,complexity: medium" \
"\`parseManifest\` handles Cargo.toml/package.json. Add lockfile support with an option to include transitive deps, de-duplicated, capped at 32 rows (contract limit).

**Acceptance:** fixtures + tests in \`lib/__tests__/manifest.test.ts\`."

issue "Contract: emit TTL-safe pagination for streams_by_* index" "area: contracts,complexity: medium" \
"\`streams_by_sender/recipient\` return the full list (capped at 200). Add \`streams_by_recipient_page(addr, offset, limit)\` and use it in the frontend.

**Acceptance:** tests for boundaries; frontend loads incrementally."

issue "Allow cancelled/depleted streams to be pruned from the index" "area: contracts,complexity: medium" \
"Indexes only grow. Add \`prune(addr)\` that removes fully settled (cancelled or depleted + fully withdrawn) streams from the caller's index.

**Acceptance:** auth required; tests show index shrink and that active streams are untouched."

issue "Event-sourced payout history (replace localStorage-only ledger)" "area: frontend,complexity: medium" \
"The Earnings payout ledger is built from receipts in localStorage, so it's empty on a new device. Use \`rpc.getEvents\` for the contract's \`withdrawn\`/\`created\` events filtered by the connected address (fall back gracefully beyond RPC retention).

**Acceptance:** history appears on a fresh browser; events decoded in a tested helper."

issue "Dark mode for the drafting design system" "area: frontend,complexity: medium" \
"Add dark tokens to \`src/index.css\` under \`prefers-color-scheme: dark\` plus a manual toggle, keeping hairline-border/no-blur rules.

**Acceptance:** all pages legible in both themes; contrast ≥ 4.5:1 for body text."

issue "Show a receipt QR code for mobile verification" "area: frontend,complexity: trivial,good first issue" \
"In \`ReceiptModal\`, add a QR code encoding the explorer URL for the tx so it can be checked from a phone.

**Acceptance:** small dependency or inline generator; shown under the badges."

issue "Add 'copy as stellar CLI command' to the signing drawer" "area: frontend,complexity: trivial,good first issue" \
"In \`TxDrawer\`, add a button that copies the equivalent \`stellar contract invoke --id … -- <method> --arg …\` command for the pending invocation.

**Acceptance:** helper in \`lib/\` with a unit test for each contract method."

issue "Empty-state illustrations follow drafting style" "area: frontend,complexity: trivial,good first issue" \
"Replace the icon-only empty states (\`Empty\` in \`components/ui.tsx\`) with small inline-SVG blueprint-style drawings (hairline strokes, crosshair corners).

**Acceptance:** 3 SVGs (streams, cascades, receipts); no external assets."

issue "Accessibility pass: keyboard focus trap in sheets" "area: frontend,complexity: trivial,good first issue" \
"\`Sheet\` closes on Escape but doesn't trap focus or restore it on close.

**Acceptance:** focus moves into the dialog on open, tab cycles inside, focus returns to the trigger on close."

issue "Docs: architecture diagram of stream accrual and cascade routing" "area: docs,complexity: trivial,good first issue" \
"Add \`docs/architecture.md\` with diagrams (Mermaid is fine) for the accrual formula/checkpointing and the recursive \`route\` in CascadeSplitter, linked from README.

**Acceptance:** accurate to the code; rendered correctly on GitHub."

issue "Property-based tests: cascade payouts always sum to amount" "area: contracts,complexity: medium" \
"Add randomized tests (e.g. \`proptest\` in dev-deps) generating random split graphs (incl. cycles) and amounts, asserting conservation of funds and depth ≤ 3.

**Acceptance:** runs in CI under 30s."

echo "Done."
