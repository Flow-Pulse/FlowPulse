//! # FlowPulse StreamRouter
//!
//! Continuous, per-second token streams on Soroban.
//!
//! A sender escrows a deposit of any Stellar Asset Contract (SAC) token and
//! the recipient accrues `rate_per_sec` units every second, measured against
//! ledger close time, until the deposit is exhausted. The recipient can
//! `withdraw` the accrued amount at any moment; the sender can `top_up` or
//! `cancel` (which settles the recipient first and refunds the remainder).
//!
//! No keeper or cron is required: accrual is a pure function of
//! `ledger().timestamp()`.
#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error, token,
    Address, Env, Vec,
};

/// TTL management for persistent entries (~30 days at 5s ledgers).
const DAY_IN_LEDGERS: u32 = 17_280;
const BUMP_AMOUNT: u32 = 30 * DAY_IN_LEDGERS;
const LIFETIME_THRESHOLD: u32 = BUMP_AMOUNT - DAY_IN_LEDGERS;

/// Upper bound on streams tracked per account index, to bound read costs.
const MAX_INDEXED_STREAMS: u32 = 200;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    InvalidAmount = 1,
    InvalidRate = 2,
    StreamNotFound = 3,
    NotAuthorized = 4,
    StreamCancelled = 5,
    NothingToWithdraw = 6,
    SelfStream = 7,
    IndexFull = 8,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Stream {
    pub id: u64,
    pub sender: Address,
    pub recipient: Address,
    pub token: Address,
    /// Token base units accrued per second.
    pub rate_per_sec: i128,
    /// Total escrowed so far (initial deposit + top-ups).
    pub deposit: i128,
    /// Total already paid out to the recipient.
    pub withdrawn: i128,
    /// Ledger timestamp when the stream was opened.
    pub start_time: u64,
    /// Accrual checkpoint: amount accrued as of `checkpoint_time`.
    pub checkpoint_amount: i128,
    /// Accrual checkpoint timestamp; accrual continues linearly from here.
    pub checkpoint_time: u64,
    /// Ledger timestamp when the stream was cancelled (0 = active).
    pub cancelled_at: u64,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    NextId,
    Stream(u64),
    BySender(Address),
    ByRecipient(Address),
}

#[contractevent(topics = ["created"])]
pub struct StreamCreated {
    #[topic]
    pub id: u64,
    #[topic]
    pub sender: Address,
    #[topic]
    pub recipient: Address,
    pub token: Address,
    pub rate_per_sec: i128,
    pub deposit: i128,
}

#[contractevent(topics = ["withdrawn"])]
pub struct Withdrawn {
    #[topic]
    pub id: u64,
    #[topic]
    pub recipient: Address,
    pub amount: i128,
}

#[contractevent(topics = ["topped_up"])]
pub struct ToppedUp {
    #[topic]
    pub id: u64,
    pub amount: i128,
}

#[contractevent(topics = ["cancelled"])]
pub struct Cancelled {
    #[topic]
    pub id: u64,
    pub paid_to_recipient: i128,
    pub refunded_to_sender: i128,
}

#[contract]
pub struct StreamRouter;

fn load(env: &Env, id: u64) -> Stream {
    let key = DataKey::Stream(id);
    let s: Stream = env
        .storage()
        .persistent()
        .get(&key)
        .unwrap_or_else(|| panic_with_error!(env, Error::StreamNotFound));
    env.storage()
        .persistent()
        .extend_ttl(&key, LIFETIME_THRESHOLD, BUMP_AMOUNT);
    s
}

fn save(env: &Env, s: &Stream) {
    let key = DataKey::Stream(s.id);
    env.storage().persistent().set(&key, s);
    env.storage()
        .persistent()
        .extend_ttl(&key, LIFETIME_THRESHOLD, BUMP_AMOUNT);
}

fn push_index(env: &Env, key: DataKey, id: u64) {
    let mut ids: Vec<u64> = env
        .storage()
        .persistent()
        .get(&key)
        .unwrap_or_else(|| Vec::new(env));
    if ids.len() >= MAX_INDEXED_STREAMS {
        panic_with_error!(env, Error::IndexFull);
    }
    ids.push_back(id);
    env.storage().persistent().set(&key, &ids);
    env.storage()
        .persistent()
        .extend_ttl(&key, LIFETIME_THRESHOLD, BUMP_AMOUNT);
}

fn index(env: &Env, key: DataKey) -> Vec<u64> {
    env.storage()
        .persistent()
        .get(&key)
        .unwrap_or_else(|| Vec::new(env))
}

/// Total amount accrued to the recipient at time `now` (capped by deposit).
fn streamed_at(s: &Stream, now: u64) -> i128 {
    let end = if s.cancelled_at != 0 {
        s.cancelled_at
    } else {
        now
    };
    let elapsed = end.saturating_sub(s.checkpoint_time) as i128;
    let accrued = elapsed
        .checked_mul(s.rate_per_sec)
        .and_then(|a| a.checked_add(s.checkpoint_amount))
        .unwrap_or(i128::MAX);
    if accrued > s.deposit {
        s.deposit
    } else {
        accrued
    }
}

#[contractimpl]
impl StreamRouter {
    /// Open a stream. Transfers `deposit` of `token` from `sender` into escrow.
    pub fn create_stream(
        env: Env,
        sender: Address,
        recipient: Address,
        token: Address,
        rate_per_sec: i128,
        deposit: i128,
    ) -> u64 {
        sender.require_auth();
        if deposit <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }
        if rate_per_sec <= 0 || rate_per_sec > deposit {
            panic_with_error!(&env, Error::InvalidRate);
        }
        if sender == recipient {
            panic_with_error!(&env, Error::SelfStream);
        }

        token::TokenClient::new(&env, &token).transfer(
            &sender,
            env.current_contract_address(),
            &deposit,
        );

        let id: u64 = env.storage().instance().get(&DataKey::NextId).unwrap_or(0);
        env.storage().instance().set(&DataKey::NextId, &(id + 1));
        env.storage()
            .instance()
            .extend_ttl(LIFETIME_THRESHOLD, BUMP_AMOUNT);

        let s = Stream {
            id,
            sender: sender.clone(),
            recipient: recipient.clone(),
            token: token.clone(),
            rate_per_sec,
            deposit,
            withdrawn: 0,
            start_time: env.ledger().timestamp(),
            checkpoint_amount: 0,
            checkpoint_time: env.ledger().timestamp(),
            cancelled_at: 0,
        };
        save(&env, &s);
        push_index(&env, DataKey::BySender(sender.clone()), id);
        push_index(&env, DataKey::ByRecipient(recipient.clone()), id);

        StreamCreated {
            id,
            sender,
            recipient,
            token,
            rate_per_sec,
            deposit,
        }
        .publish(&env);
        id
    }

    /// Amount the recipient can withdraw right now.
    pub fn withdrawable(env: Env, id: u64) -> i128 {
        let s = load(&env, id);
        streamed_at(&s, env.ledger().timestamp()) - s.withdrawn
    }

    /// Withdraw everything accrued so far to the recipient.
    pub fn withdraw(env: Env, id: u64) -> i128 {
        let mut s = load(&env, id);
        s.recipient.require_auth();
        let amount = streamed_at(&s, env.ledger().timestamp()) - s.withdrawn;
        if amount <= 0 {
            panic_with_error!(&env, Error::NothingToWithdraw);
        }
        s.withdrawn += amount;
        save(&env, &s);
        token::TokenClient::new(&env, &s.token).transfer(
            &env.current_contract_address(),
            &s.recipient,
            &amount,
        );
        Withdrawn {
            id,
            recipient: s.recipient.clone(),
            amount,
        }
        .publish(&env);
        amount
    }

    /// Withdraw from every stream paying `recipient` in one transaction.
    /// Returns the total amount claimed (summed across tokens; the UI only
    /// sums like tokens).
    pub fn withdraw_all(env: Env, recipient: Address) -> i128 {
        recipient.require_auth();
        let now = env.ledger().timestamp();
        let this = env.current_contract_address();
        let mut total: i128 = 0;
        for id in index(&env, DataKey::ByRecipient(recipient.clone())).iter() {
            let mut s = load(&env, id);
            let amount = streamed_at(&s, now) - s.withdrawn;
            if amount <= 0 {
                continue;
            }
            s.withdrawn += amount;
            save(&env, &s);
            token::TokenClient::new(&env, &s.token).transfer(&this, &recipient, &amount);
            Withdrawn {
                id,
                recipient: recipient.clone(),
                amount,
            }
            .publish(&env);
            total += amount;
        }
        if total == 0 {
            panic_with_error!(&env, Error::NothingToWithdraw);
        }
        total
    }

    /// Add more funds to an active stream, extending its runway.
    ///
    /// If the stream had already run dry, accrual restarts from now so the
    /// recipient isn't credited for the idle gap.
    pub fn top_up(env: Env, id: u64, amount: i128) {
        let mut s = load(&env, id);
        s.sender.require_auth();
        if s.cancelled_at != 0 {
            panic_with_error!(&env, Error::StreamCancelled);
        }
        if amount <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }
        let now = env.ledger().timestamp();
        if streamed_at(&s, now) >= s.deposit {
            // Stream had run dry: checkpoint so accrual resumes from `now`.
            s.checkpoint_amount = s.deposit;
            s.checkpoint_time = now;
        }
        token::TokenClient::new(&env, &s.token).transfer(
            &s.sender,
            env.current_contract_address(),
            &amount,
        );
        s.deposit += amount;
        save(&env, &s);
        ToppedUp { id, amount }.publish(&env);
    }

    /// Stop the stream: pay the recipient what they've earned, refund the rest.
    pub fn cancel(env: Env, id: u64) -> (i128, i128) {
        let mut s = load(&env, id);
        s.sender.require_auth();
        if s.cancelled_at != 0 {
            panic_with_error!(&env, Error::StreamCancelled);
        }
        let now = env.ledger().timestamp();
        let streamed = streamed_at(&s, now);
        let owed = streamed - s.withdrawn;
        let refund = s.deposit - streamed;
        s.cancelled_at = now;
        s.withdrawn = streamed;
        save(&env, &s);

        let client = token::TokenClient::new(&env, &s.token);
        let this = env.current_contract_address();
        if owed > 0 {
            client.transfer(&this, &s.recipient, &owed);
        }
        if refund > 0 {
            client.transfer(&this, &s.sender, &refund);
        }
        Cancelled {
            id,
            paid_to_recipient: owed,
            refunded_to_sender: refund,
        }
        .publish(&env);
        (owed, refund)
    }

    pub fn get_stream(env: Env, id: u64) -> Stream {
        load(&env, id)
    }

    pub fn streams_by_sender(env: Env, sender: Address) -> Vec<Stream> {
        Self::collect(&env, index(&env, DataKey::BySender(sender)))
    }

    pub fn streams_by_recipient(env: Env, recipient: Address) -> Vec<Stream> {
        Self::collect(&env, index(&env, DataKey::ByRecipient(recipient)))
    }

    pub fn stream_count(env: Env) -> u64 {
        env.storage().instance().get(&DataKey::NextId).unwrap_or(0)
    }
}

impl StreamRouter {
    fn collect(env: &Env, ids: Vec<u64>) -> Vec<Stream> {
        let mut out = Vec::new(env);
        for id in ids.iter() {
            out.push_back(load(env, id));
        }
        out
    }
}

#[cfg(test)]
mod test;
