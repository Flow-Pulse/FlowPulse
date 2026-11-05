//! # FlowPulse CascadeSplitter
//!
//! Recursive revenue splits for open-source dependency trees.
//!
//! Every account (a maintainer, a project treasury, a DAO) can publish a split
//! table: a list of upstream recipients with weights in basis points. Any
//! basis points not allocated stay with the owner (the "reserve").
//!
//! `distribute` pulls `amount` from a payer and routes it through the owner's
//! table. If a recipient has published its own table, its share keeps flowing
//! upstream ("cascades") up to `MAX_DEPTH` levels, so funding a top-level
//! project automatically funds the dependencies it relies on.
#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error, token,
    Address, Env, String, Vec,
};

pub const TOTAL_BPS: u32 = 10_000;
pub const MAX_SPLITS: u32 = 32;
pub const MAX_DEPTH: u32 = 3;

const DAY_IN_LEDGERS: u32 = 17_280;
const BUMP_AMOUNT: u32 = 30 * DAY_IN_LEDGERS;
const LIFETIME_THRESHOLD: u32 = BUMP_AMOUNT - DAY_IN_LEDGERS;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    InvalidAmount = 1,
    TooManySplits = 2,
    BpsOverflow = 3,
    ZeroWeight = 4,
    SelfSplit = 5,
    DuplicateRecipient = 6,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Split {
    pub recipient: Address,
    /// Weight in basis points (1/100 of a percent).
    pub bps: u32,
    /// Human label, e.g. a crate or npm package name.
    pub label: String,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Payout {
    pub recipient: Address,
    pub amount: i128,
    /// Cascade depth at which this payout settled (0 = direct).
    pub depth: u32,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Splits(Address),
}

#[contractevent(topics = ["splits_set"])]
pub struct SplitsSet {
    #[topic]
    pub owner: Address,
    pub count: u32,
    pub allocated_bps: u32,
}

#[contractevent(topics = ["distributed"])]
pub struct Distributed {
    #[topic]
    pub owner: Address,
    #[topic]
    pub from: Address,
    pub token: Address,
    pub amount: i128,
    pub payouts: u32,
}

#[contract]
pub struct CascadeSplitter;

fn read_splits(env: &Env, owner: &Address) -> Vec<Split> {
    let key = DataKey::Splits(owner.clone());
    match env.storage().persistent().get::<_, Vec<Split>>(&key) {
        Some(v) => {
            env.storage()
                .persistent()
                .extend_ttl(&key, LIFETIME_THRESHOLD, BUMP_AMOUNT);
            v
        }
        None => Vec::new(env),
    }
}

#[contractimpl]
impl CascadeSplitter {
    /// Publish (or replace) the caller's split table.
    pub fn set_splits(env: Env, owner: Address, splits: Vec<Split>) {
        owner.require_auth();
        if splits.len() > MAX_SPLITS {
            panic_with_error!(&env, Error::TooManySplits);
        }
        let mut total: u32 = 0;
        for (i, s) in splits.iter().enumerate() {
            if s.bps == 0 {
                panic_with_error!(&env, Error::ZeroWeight);
            }
            if s.recipient == owner {
                panic_with_error!(&env, Error::SelfSplit);
            }
            for prev in splits.iter().take(i) {
                if prev.recipient == s.recipient {
                    panic_with_error!(&env, Error::DuplicateRecipient);
                }
            }
            total = total.saturating_add(s.bps);
        }
        if total > TOTAL_BPS {
            panic_with_error!(&env, Error::BpsOverflow);
        }

        let key = DataKey::Splits(owner.clone());
        env.storage().persistent().set(&key, &splits);
        env.storage()
            .persistent()
            .extend_ttl(&key, LIFETIME_THRESHOLD, BUMP_AMOUNT);
        SplitsSet {
            owner,
            count: splits.len(),
            allocated_bps: total,
        }
        .publish(&env);
    }

    pub fn get_splits(env: Env, owner: Address) -> Vec<Split> {
        read_splits(&env, &owner)
    }

    /// Dry-run: compute where `amount` would land without moving funds.
    pub fn preview(env: Env, owner: Address, amount: i128) -> Vec<Payout> {
        if amount <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }
        let mut out = Vec::new(&env);
        Self::route(&env, &owner, amount, 0, &mut out);
        out
    }

    /// Pull `amount` of `token` from `from` and cascade it through `owner`'s
    /// split table. Returns the settled payouts.
    pub fn distribute(
        env: Env,
        from: Address,
        owner: Address,
        token: Address,
        amount: i128,
    ) -> Vec<Payout> {
        from.require_auth();
        if amount <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }
        let mut payouts = Vec::new(&env);
        Self::route(&env, &owner, amount, 0, &mut payouts);

        let client = token::TokenClient::new(&env, &token);
        for p in payouts.iter() {
            if p.amount > 0 {
                client.transfer(&from, &p.recipient, &p.amount);
            }
        }
        Distributed {
            owner,
            from,
            token,
            amount,
            payouts: payouts.len(),
        }
        .publish(&env);
        payouts
    }
}

impl CascadeSplitter {
    /// Recursively compute payouts. Rounding dust and unallocated bps settle
    /// with the owner at each level, so the sum always equals `amount`.
    fn route(env: &Env, owner: &Address, amount: i128, depth: u32, out: &mut Vec<Payout>) {
        let splits = if depth < MAX_DEPTH {
            read_splits(env, owner)
        } else {
            Vec::new(env)
        };
        let mut remaining = amount;
        for s in splits.iter() {
            let share = amount * (s.bps as i128) / (TOTAL_BPS as i128);
            if share == 0 {
                continue;
            }
            remaining -= share;
            Self::route(env, &s.recipient, share, depth + 1, out);
        }
        if remaining > 0 {
            Self::credit(out, owner, remaining, depth);
        }
    }

    fn credit(out: &mut Vec<Payout>, who: &Address, amount: i128, depth: u32) {
        for i in 0..out.len() {
            let mut p = out.get_unchecked(i);
            if p.recipient == *who {
                p.amount += amount;
                if depth < p.depth {
                    p.depth = depth;
                }
                out.set(i, p);
                return;
            }
        }
        out.push_back(Payout {
            recipient: who.clone(),
            amount,
            depth,
        });
    }
}

#[cfg(test)]
mod test;
