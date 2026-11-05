# Contributing to FlowPulse

Thanks for helping. This guide gets you from clone to merged PR.

## Ground rules

- **Comment on an issue before you start**, so work doesn't get duplicated. A maintainer will assign it to you.
- **Keep PRs small and focused.** One issue per PR. Link it with `Closes #123`.
- **Tests are required** for contract changes and for anything in `frontend/src/lib/`.
- **Testnet only.** Never commit secret keys, `.env.local`, or mainnet contract IDs.
- Be kind. See the [Code of Conduct](CODE_OF_CONDUCT.md).

## Setup

```bash
git clone <your fork>
cd flowpulse

# Contracts
rustup target add wasm32v1-none
cd contracts && cargo test

# Frontend
cd ../frontend
pnpm install
pnpm dev
```

Install [Freighter](https://freighter.app), switch it to **Testnet**, then fund your account from the wallet menu in the app (Friendbot).

To test contract changes end to end, deploy your own copy with `./scripts/deploy-testnet.sh` and put the printed IDs in `frontend/.env.local`.

## Before you open a PR

Run the same checks CI runs:

```bash
# contracts/
cargo fmt --all -- --check
cargo clippy --all-targets -- -D warnings
cargo test

# frontend/
pnpm typecheck
pnpm test
pnpm build
```

## Conventions

- **Contracts:** use `panic_with_error!` with a named `Error` variant, never bare `panic!`. Extend TTL on every persistent write. Emit an event for every state change. Add a test for each new error path.
- **Frontend:** follow the design tokens in `src/index.css` (Architectural Drafting Standard): 1px hairline borders, no blur shadows, JetBrains Mono for numbers and IDs. Every network call must handle failure, because the public testnet RPC is flaky.
- **Amounts** are `bigint` base units (stroops) everywhere. Convert with `toUnits` / `fromUnits` in `lib/format.ts`, and never use floating point for amounts sent on-chain.
- **Commits:** imperative mood, e.g. `cascade: reject zero-weight splits`.

## Getting paid through Drips Wave

FlowPulse takes part in [Drips Wave](https://www.drips.network/wave). Issues labeled for the current Wave earn points when your PR is merged during the Wave window. Point values follow issue complexity (Trivial / Medium / High). Read the [Wave terms](https://docs.drips.network/wave/terms-and-rules) before you start.

## Reporting security issues

Do not open a public issue. See [SECURITY.md](SECURITY.md).
