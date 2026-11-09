# FlowPulse Architecture Specification

This document details the core architectural mechanisms, mathematical invariants, and smart contract flows of **FlowPulse** on Stellar Soroban:
1. **StreamRouter**: Continuous per-second linear token streaming, accrual formulas, and dry-gap checkpointing.
2. **CascadeSplitter**: Recursive dependency split routing, rounding dust conservation, and cycle termination.
3. **Audit Receipts & Client Security**: Cryptographic verification under RFC-8785 (JCS) and Ed25519.

---

## 1. System Overview

FlowPulse consists of two core Soroban smart contracts written in Rust (`contracts/`), an audit receipt engine, and a web application (`frontend/`).

```mermaid
flowchart TD
    subgraph Users ["Actors & Ecosystem"]
        Sponsor["Sponsor / Donor"]
        Maintainer["Maintainer (Root Project)"]
        Dependency["Upstream Dependencies (Transitive)"]
    end

    subgraph Contracts ["Soroban Smart Contracts (Testnet)"]
        SR["StreamRouter Contract<br/><code>contracts/stream_router</code>"]
        CS["CascadeSplitter Contract<br/><code>contracts/cascade_splitter</code>"]
    end

    subgraph Client ["Client Layer (React / Vite)"]
        UI["Drafting Standard Interface"]
        ReceiptEngine["RFC-8785 Audit Engine<br/><code>frontend/src/lib/receipts.ts</code>"]
    end

    Sponsor -->|"create_stream(deposit, rate)"| SR
    Maintainer -->|"withdraw() / withdraw_all()"| SR
    Maintainer -->|"set_splits(splits[])"| CS
    Sponsor -->|"distribute(owner, token, amount)"| CS
    CS -->|"Recursive cascade payouts (depth <= 3)"| Dependency
    SR -.->|"Ledger Events"| ReceiptEngine
    CS -.->|"Ledger Events"| ReceiptEngine
    ReceiptEngine -->|"Canonical Digest + Signature"| UI
```

---

## 2. StreamRouter Architecture & Accrual Mechanics

The `StreamRouter` contract allows any account to escrow tokens and stream them to a recipient second-by-second based strictly on Stellar ledger close times (`env.ledger().timestamp()`). No keepers, cron jobs, or off-chain oracles are required.

### 2.1 Mathematical Accrual Formula

At any timestamp $t$, the cumulative amount streamed to the recipient $\text{streamed}(t)$ is governed by:

$$\text{effective\_time}(t) = \begin{cases} \text{cancelled\_at} & \text{if } \text{cancelled\_at} \ne 0 \\ t & \text{otherwise} \end{cases}$$

$$\Delta t = \max(0, \text{effective\_time}(t) - \text{checkpoint\_time})$$

$$\text{accrued}(t) = \text{checkpoint\_amount} + (\Delta t \times \text{rate\_per\_sec})$$

$$\text{streamed}(t) = \min(\text{accrued}(t), \text{deposit})$$

The withdrawable balance available to the recipient at timestamp $t$ is:

$$\text{withdrawable}(t) = \text{streamed}(t) - \text{withdrawn}$$

### 2.2 Accrual Timeline & Dry-Run Checkpointing

When a stream's deposit is exhausted, it enters a "dry" state. If the sender subsequently calls `top_up(amount)`, the recipient must **not** be credited for the idle gap while the stream had zero remaining runway.

To handle this cleanly in $O(1)$ without loop state updates:
1. `checkpoint_amount` is set to `deposit`.
2. `checkpoint_time` is updated to current ledger time `now`.
3. `deposit` is incremented by `amount`.
4. Linear accrual resumes strictly from `checkpoint_time`.

```mermaid
flowchart LR
    A["T0: Opened<br/>deposit = 1000<br/>rate = 10/s"] -->|"Accruing (100s)"| B["T100: Stream Dry<br/>streamed = 1000<br/>runway exhausted"]
    B -->|"Idle Gap (30s)<br/>No accrual credited"| C["T130: top_up(500)<br/>checkpoint_amount = 1000<br/>checkpoint_time = 130<br/>deposit = 1500"]
    C -->|"Accrual Resumes (50s)"| D["T180: Stream Active<br/>streamed = 1500<br/>runway exhausted"]
```

### 2.3 Stream Lifecycle Sequence

```mermaid
sequenceDiagram
    autonumber
    actor Sender as Stream Sender
    participant SR as StreamRouter Contract
    participant Token as Stellar SAC Token
    actor Recipient as Stream Recipient

    Sender->>Token: Approve / Balance check
    Sender->>SR: create_stream(recipient, token, rate, deposit)
    SR->>Token: transfer(sender -> contract, deposit)
    Note over SR: Stream initialized with<br/>checkpoint_amount=0, checkpoint_time=now

    loop Continuous Linear Accrual
        Note over SR,Recipient: Time advances via ledger close time
    end

    Recipient->>SR: withdraw(stream_id)
    Note over SR: amount = streamed_at(now) - withdrawn
    SR->>Token: transfer(contract -> recipient, amount)
    SR-->>Recipient: Withdrawn event emitted

    alt Top Up Stream
        Sender->>SR: top_up(stream_id, top_up_amount)
        Note over SR: If dry: checkpoint_time = now
        SR->>Token: transfer(sender -> contract, top_up_amount)
    else Cancel Stream
        Sender->>SR: cancel(stream_id)
        Note over SR: owed = streamed_at(now) - withdrawn<br/>refund = deposit - streamed_at(now)
        SR->>Token: transfer(contract -> recipient, owed)
        SR->>Token: transfer(contract -> sender, refund)
        SR-->>Sender: Cancelled event emitted
    end
```

---

## 3. CascadeSplitter Architecture & Recursive Dependency Routing

The `CascadeSplitter` contract implements automated recursive revenue sharing for open-source dependency trees. Maintainers publish split tables specifying upstream dependencies in basis points (`1 bps = 0.01%`, `TOTAL_BPS = 10_000`).

### 3.1 Data Model
- `Split`: `{ recipient: Address, bps: u32, label: String }`
- `Payout`: `{ recipient: Address, amount: i128, depth: u32 }`
- Constraints per table:
  - `splits.len() <= MAX_SPLITS` (32)
  - `bps > 0` (zero weight prohibited)
  - `recipient != owner` (self-splits prohibited)
  - Recipients are strictly deduplicated
  - $\sum \text{bps} \le 10\_000$ (unallocated basis points form the owner's reserve)

### 3.2 Recursive `route` Algorithm

When funds arrive via `distribute(from, owner, token, amount)` or `preview(owner, amount)`, `CascadeSplitter` evaluates splits recursively:

```mermaid
flowchart TD
    Start(["route(owner, amount, depth)"]) --> CheckDepth{"depth < MAX_DEPTH<br/>(depth < 3)?"}
    
    CheckDepth -- Yes --> ReadSplits["Read owner's split table from persistent storage"]
    CheckDepth -- No --> LeafHalt["splits = empty vector<br/>(Halt recursion at depth 3)"]
    
    ReadSplits --> SplitLoop{"For each split in table"}
    LeafHalt --> CreditOwner
    
    SplitLoop --> CalcShare["share = amount * bps / 10,000"]
    CalcShare --> ShareZero{"share == 0?"}
    ShareZero -- Yes --> NextSplit["Skip (Dust share)"]
    ShareZero -- No --> SubRoute["remaining = remaining - share<br/>route(split.recipient, share, depth + 1)"]
    SubRoute --> NextSplit
    NextSplit --> SplitLoop
    
    SplitLoop -- Finished all splits --> CreditOwner["remaining > 0?"]
    CreditOwner -- Yes --> Credit["credit(owner, remaining, depth)<br/>Credited to owner at current depth"]
    CreditOwner -- No --> Done(["Return accumulated payouts"])
    Credit --> Done
```

### 3.3 Core Invariants & Proofs

#### Invariant 1: Conservation of Funds ($\sum \text{payouts} = \text{amount}$)
At each recursion level:
$$\text{remaining} = \text{amount} - \sum_{i} \left\lfloor \frac{\text{amount} \times \text{bps}_i}{10,000} \right\rfloor$$
Because integer truncation rounds down, $\sum \text{shares} \le \text{amount}$ and $\text{remaining} \ge 0$.
The `remaining` balance (unallocated basis points reserve + rounding truncation dust) is explicitly credited to `owner` at the current `depth`. Hence, no tokens can ever leak or be created:
$$\sum_{p \in \text{payouts}} p.\text{amount} \equiv \text{amount}$$

#### Invariant 2: Bounded Depth ($\le 3$) and Cycle Termination
The recursion parameter `depth` increments by $1$ on each child hop (`depth + 1`).
When `depth == MAX_DEPTH` ($3$), `read_splits` is bypassed and the full incoming sub-share is credited to `owner` with $0$ outgoing recursive calls.
Consequently:
1. Every payout in the resulting vector satisfies $p.\text{depth} \le 3$.
2. Mutual cycles (e.g. $A \leftrightarrow B$) or circular rings ($A \to B \to C \to A$) terminate deterministically within at most $3$ hops without stack overflow or infinite loops.

```mermaid
flowchart TD
    subgraph CyclicGraph ["Example: Mutual Dependency Cycle"]
        NodeA["Maintainer A<br/>splits 100% to B"]
        NodeB["Dependency B<br/>splits 100% to A"]
        NodeA <--> NodeB
    end

    subgraph CascadeExecution ["Execution Trace (Amount = 1000)"]
        Hop0["Depth 0: route(A, 1000)<br/>routes 100% to B"]
        Hop1["Depth 1: route(B, 1000)<br/>routes 100% to A"]
        Hop2["Depth 2: route(A, 1000)<br/>routes 100% to B"]
        Hop3["Depth 3: route(B, 1000)<br/>depth == MAX_DEPTH -> Terminate!"]
        
        Hop0 --> Hop1 --> Hop2 --> Hop3
        Hop3 --> Result["Payout settles: B receives 1000 at depth 3"]
    end
```

---

## 4. Cryptographic Audit Receipts

Every user transaction produces an offline-verifiable audit receipt conforming to **RFC-8785 (JSON Canonicalization Scheme)**.

```mermaid
sequenceDiagram
    participant User as Client Browser
    participant Horizon as Stellar Horizon / RPC
    participant Contract as Soroban Contract
    participant Receipt as Receipt Verifier

    User->>Contract: Invoke contract function (e.g. withdraw_all)
    Contract-->>Horizon: Transaction committed to ledger block
    Horizon-->>User: Horizon Response (envelope_xdr, result_xdr, ledger)
    
    Note over User: Form receipt payload<br/>{schema, contract_id, function, tx_hash, ledger, envelope_xdr}
    User->>Receipt: RFC-8785 Canonicalize & SHA-256 Digest
    User->>User: Store receipt + digest in local storage / export
    
    Note over Receipt: Offline Independent Verification:
    Receipt->>Receipt: 1. Verify SHA-256 matches canonical JCS string
    Receipt->>Receipt: 2. Parse envelope_xdr and verify Ed25519 signature
    Receipt->>Horizon: 3. Verify transaction exists in ledger block
```

---

## 5. Summary Matrix of Invariants

| Component | Invariant | Enforcement Mechanism |
|---|---|---|
| **StreamRouter** | Linear accrual per second | Pure arithmetic against `ledger().timestamp()` |
| **StreamRouter** | Dry-gap fairness | Checkpointing `checkpoint_amount` & `checkpoint_time` on top-up |
| **StreamRouter** | Payer solvency | Escrow locked on contract creation |
| **CascadeSplitter** | Strict fund conservation | Rounding dust and reserve credited to current owner |
| **CascadeSplitter** | Cycle termination | Hard cutoff at `MAX_DEPTH = 3` |
| **CascadeSplitter** | Zero weight prevention | Rejection on `bps == 0` or duplicate recipients |
| **Receipts** | Tamper detection | RFC-8785 canonical serialization + cryptographic SHA-256 digest |
