# FlowPulse Architecture Specification

FlowPulse provides continuous, per-second micro-funding streams and recursive dependency split cascades on Stellar Soroban. This document details the contract architecture, state models, accrual checkpointing formulas, and recursive distribution mechanics.

---

## 1. System Overview

FlowPulse is structured into two core Soroban smart contracts alongside an RFC-8785 cryptographic receipt verification layer:

```mermaid
graph TD
    classDef contract fill:#f8fafc,stroke:#0284c7,stroke-width:2px,color:#0f172a;
    classDef client fill:#f1f5f9,stroke:#475569,stroke-width:1.5px,color:#0f172a;
    classDef storage fill:#fef3c7,stroke:#d97706,stroke-width:1.5px,color:#78350f;

    subgraph Userland ["Client Applications & Integrations"]
        UI["Web App (Vite + React)"]:::client
        CI["CI/CD Bounty Runner"]:::client
        Verifier["Client-side JCS Receipt Verifier"]:::client
    end

    subgraph Soroban ["Stellar Soroban Environment"]
        SR["StreamRouter Contract<br/><code>CA45PGMY...</code>"]:::contract
        CS["CascadeSplitter Contract<br/><code>CA4U6VUI...</code>"]:::contract
        SAC["Stellar Asset Contract (SAC)<br/>(XLM / USDC)"]:::contract
        
        SR_Store[("Stream Storage<br/>Instance & Persistent")]:::storage
        CS_Store[("Split Tables<br/>Persistent Storage")]:::storage
    end

    UI -->|Create / Withdraw / Cancel| SR
    UI -->|Set Splits / Distribute| CS
    CI -->|Trigger Bounty Stream| SR
    SR <-->|Escrow Transfer / Payout| SAC
    CS <-->|Multi-hop Route Payout| SAC
    SR --> SR_Store
    CS --> CS_Store
    UI --> Verifier
```

---

## 2. StreamRouter: Accrual & Checkpointing

### 2.1 Pure Function of Ledger Timestamp
Accrual requires no off-chain keeper, cron daemon, or external oracle. The accrued amount is a pure mathematical function of the current ledger timestamp $t = \text{ledger}().\text{timestamp}()$.

#### Accrual Mathematical Formula
Given a stream $S$ with:
- $D$: Total escrowed deposit (`deposit`)
- $W$: Total withdrawn so far (`withdrawn`)
- $R$: Accrual rate in base units per second (`rate_per_sec`)
- $t_{\text{chk}}$: Checkpoint ledger timestamp (`checkpoint_time`)
- $A_{\text{chk}}$: Checkpoint accrued amount (`checkpoint_amount`)
- $t_{\text{cancel}}$: Cancellation timestamp ($0$ if active)

The effective evaluation timestamp $t_{\text{eval}}$ is:
$$t_{\text{eval}} = \begin{cases} t_{\text{cancel}}, & \text{if } t_{\text{cancel}} \neq 0 \\ t, & \text{otherwise} \end{cases}$$

The total streamed amount at timestamp $t$ is:
$$\text{streamed}(t) = \min\left(D, A_{\text{chk}} + R \times \max(0, t_{\text{eval}} - t_{\text{chk}})\right)$$

The instantly withdrawable balance for the recipient is:
$$\text{withdrawable}(t) = \text{streamed}(t) - W$$

### 2.2 Checkpointing on Top-Up (Idle Gap Protection)
When an existing stream runs dry ($\text{streamed}(t) \ge D$) and the sender later invokes `top_up(id, amount)`:
1. Accrual is checkpointed at the moment of top-up:
   $$A_{\text{chk}} \leftarrow D$$
   $$t_{\text{chk}} \leftarrow t$$
2. The deposit is increased: $D \leftarrow D + \text{amount}$.
3. Accrual resumes linearly from $t$. The idle period between stream exhaustion and top-up is never back-paid to the recipient.

```mermaid
sequenceDiagram
    autonumber
    actor Sender
    participant SR as StreamRouter Contract
    participant SAC as Token (SAC)
    actor Recipient

    Sender->>SR: create_stream(recipient, token, rate, deposit)
    SR->>SAC: transfer(from: sender, to: contract, deposit)
    Note over SR: Init Stream:<br/>checkpoint_time = start_time<br/>checkpoint_amount = 0

    loop Time Advances (Ledgers Close)
        Note over SR: Accrual = min(deposit, rate * elapsed)
    end

    Recipient->>SR: withdraw(id)
    SR->>SR: amount = streamed_at(now) - withdrawn
    SR->>SAC: transfer(from: contract, to: recipient, amount)
    Note over SR: withdrawn += amount

    opt Stream Runs Dry & Top-Up
        Note over SR: streamed_at(now) == deposit
        Sender->>SR: top_up(id, topup_amount)
        SR->>SAC: transfer(from: sender, to: contract, topup_amount)
        Note over SR: checkpoint_amount = deposit<br/>checkpoint_time = now<br/>deposit += topup_amount
    end

    opt Stream Cancellation
        Sender->>SR: cancel(id)
        Note over SR: owed = streamed_at(now) - withdrawn<br/>refund = deposit - streamed_at(now)<br/>cancelled_at = now
        SR->>SAC: transfer(contract -> recipient, owed)
        SR->>SAC: transfer(contract -> sender, refund)
    end
```

---

## 3. CascadeSplitter: Recursive Revenue Splits

### 3.1 Split Table Specification
Maintainers and projects publish an upstream split table via `set_splits(owner, splits)`:
- **Total Basis Points:** $\text{TOTAL\_BPS} = 10{,}000$ ($100\%$).
- **Capacity:** At most $\text{MAX\_SPLITS} = 32$ entries per table.
- **Constraints:** Zero weights, self-splits, and duplicate recipients trigger immediate contract errors.
- **Reserve:** Any unallocated basis points ($10{,}000 - \sum \text{bps}_i$) remain with the table owner.

### 3.2 Recursive Routing Algorithm (`route`)
When `distribute(from, owner, token, amount)` or `preview(owner, amount)` is executed:
- The contract routes funds recursively up to $\text{MAX\_DEPTH} = 3$ levels.
- **Rounding Dust Conservation:** At every level, fractional rounding dust and unallocated shares stay with the current owner.
- **Cycle Termination:** Because split lookup halts when $\text{depth} \ge 3$, circular dependencies terminate predictably without infinite recursion or stack exhaustion.

```mermaid
flowchart TD
    classDef startNode fill:#0284c7,stroke:#0369a1,stroke-width:2px,color:#ffffff;
    classDef decisionNode fill:#f8fafc,stroke:#475569,stroke-width:2px,color:#0f172a;
    classDef actionNode fill:#f1f5f9,stroke:#64748b,stroke-width:1px,color:#0f172a;
    classDef creditNode fill:#dcfce7,stroke:#16a34a,stroke-width:2px,color:#14532d;

    Start(["route(owner, amount, depth, out)"]):::startNode --> CheckDepth{"depth < MAX_DEPTH (3)?"}:::decisionNode
    
    CheckDepth -- Yes --> LoadSplits["read_splits(env, owner)"]:::actionNode
    CheckDepth -- No --> EmptySplits["splits = []"]:::actionNode

    LoadSplits --> InitRemaining["remaining = amount"]:::actionNode
    EmptySplits --> InitRemaining

    InitRemaining --> LoopSplits{"For each Split (bps, recipient)"}:::decisionNode
    
    LoopSplits --> CalcShare["share = amount * bps / 10,000"]:::actionNode
    CalcShare --> CheckShare{"share > 0?"}:::decisionNode
    
    CheckShare -- Yes --> SubRemaining["remaining -= share"]:::actionNode
    SubRemaining --> Recurse["route(recipient, share, depth + 1, out)"]:::startNode
    Recurse --> LoopSplits
    CheckShare -- No --> LoopSplits

    LoopSplits -- Loop Complete --> CheckRemaining{"remaining > 0?"}:::decisionNode
    CheckRemaining -- Yes --> CreditOwner["credit(out, owner, remaining, depth)"]:::creditNode
    CheckRemaining -- No --> Done(["End Step"]):::startNode
    CreditOwner --> Done
```

### 3.3 Cascade Example
Consider a top-level library funding its transitive dependencies:

```mermaid
graph LR
    classDef rootNode fill:#0284c7,stroke:#0369a1,color:#fff,stroke-width:2px;
    classDef midNode fill:#38bdf8,stroke:#0284c7,color:#0f172a,stroke-width:1.5px;
    classDef leafNode fill:#bae6fd,stroke:#0284c7,color:#0f172a,stroke-width:1.5px;

    App["Payer: 1,000 XLM"] --> Root["Root Project<br/>Reserve: 10% (100 XLM)"]:::rootNode
    Root -->|60% (600 XLM)| DepA["Dependency A<br/>Reserve: 50% (300 XLM)"]:::midNode
    Root -->|30% (300 XLM)| DepB["Dependency B<br/>Leaf (300 XLM)"]:::leafNode
    DepA -->|50% (300 XLM)| SubDep["Sub-Dependency C<br/>Leaf (300 XLM)"]:::leafNode

    style App fill:#f1f5f9,stroke:#475569,stroke-width:1.5px;
```

Total settled:
- **Root:** 100 XLM (unallocated reserve)
- **Dependency A:** 300 XLM (unallocated reserve)
- **Dependency B:** 300 XLM (direct leaf)
- **Sub-Dependency C:** 300 XLM (cascaded depth 2)
- **Sum:** $100 + 300 + 300 + 300 = 1{,}000\text{ XLM}$ (Conservation invariant strictly held: $\sum \text{payouts} = \text{amount}$).

---

## 4. Cryptographic Audit Receipts

Every state-changing transaction in FlowPulse can generate a verifiable off-chain receipt:

```mermaid
flowchart LR
    classDef proc fill:#f8fafc,stroke:#475569,stroke-width:1.5px;
    classDef output fill:#f0fdf4,stroke:#16a34a,stroke-width:1.5px;

    TxData["Transaction Data<br/>(contract_id, function, ledger, envelope_xdr)"]:::proc --> JCS["RFC-8785 Canonicalization<br/>(JCS)"]:::proc
    JCS --> SHA["SHA-256 Hash"]:::proc
    SHA --> Digest["Digest Envelope<br/>alg: SHA-256"]:::output
    
    TxData --> Horizon["Horizon Ledger Query"]:::proc
    Horizon --> Anchor["Ledger Anchor & Ed25519 Signature Match"]:::output
```

1. **RFC-8785 (JSON Canonicalization Scheme):** Eliminates non-deterministic JSON serialization differences (whitespace, dictionary key order).
2. **SHA-256 Digest:** Fixed 32-byte commitment of canonical receipt fields.
3. **Horizon Ledger Anchor:** Re-verifies inclusion in the declared Stellar ledger close and validates the transaction envelope signature.
