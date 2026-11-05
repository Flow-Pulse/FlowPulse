extern crate std;

use super::*;
use soroban_sdk::{
    testutils::Address as _,
    token::{StellarAssetClient, TokenClient},
    vec, Address, Env, String,
};

fn err(e: Error) -> soroban_sdk::Error {
    soroban_sdk::Error::from_contract_error(e as u32)
}

fn split(env: &Env, to: &Address, bps: u32, label: &str) -> Split {
    Split {
        recipient: to.clone(),
        bps,
        label: String::from_str(env, label),
    }
}

struct Setup<'a> {
    env: Env,
    c: CascadeSplitterClient<'a>,
    token: TokenClient<'a>,
    payer: Address,
}

fn setup() -> Setup<'static> {
    let env = Env::default();
    env.mock_all_auths();
    let sac = env.register_stellar_asset_contract_v2(Address::generate(&env));
    let token = TokenClient::new(&env, &sac.address());
    let payer = Address::generate(&env);
    StellarAssetClient::new(&env, &sac.address()).mint(&payer, &1_000_000);
    let id = env.register(CascadeSplitter, ());
    Setup {
        c: CascadeSplitterClient::new(&env, &id),
        env,
        token,
        payer,
    }
}

#[test]
fn flat_split_with_reserve() {
    let s = setup();
    let e = &s.env;
    let (root, a, b) = (
        Address::generate(e),
        Address::generate(e),
        Address::generate(e),
    );
    s.c.set_splits(
        &root,
        &vec![
            e,
            split(e, &a, 6_000, "soroban-sdk"),
            split(e, &b, 3_000, "serde_json"),
        ],
    );
    s.c.distribute(&s.payer, &root, &s.token.address, &1_000);
    assert_eq!(s.token.balance(&a), 600);
    assert_eq!(s.token.balance(&b), 300);
    assert_eq!(s.token.balance(&root), 100); // 10% unallocated reserve
    assert_eq!(s.token.balance(&s.payer), 999_000);
}

#[test]
fn cascades_through_upstream_tables() {
    let s = setup();
    let e = &s.env;
    let root = Address::generate(e);
    let mid = Address::generate(e);
    let leaf = Address::generate(e);
    s.c.set_splits(&root, &vec![e, split(e, &mid, 5_000, "mid")]);
    s.c.set_splits(&mid, &vec![e, split(e, &leaf, 5_000, "leaf")]);

    let preview = s.c.preview(&root, &1_000);
    assert_eq!(preview.len(), 3);

    s.c.distribute(&s.payer, &root, &s.token.address, &1_000);
    assert_eq!(s.token.balance(&root), 500);
    assert_eq!(s.token.balance(&mid), 250);
    assert_eq!(s.token.balance(&leaf), 250);
}

#[test]
fn cycles_terminate_at_max_depth_and_conserve_funds() {
    let s = setup();
    let e = &s.env;
    let a = Address::generate(e);
    let b = Address::generate(e);
    s.c.set_splits(&a, &vec![e, split(e, &b, 10_000, "b")]);
    s.c.set_splits(&b, &vec![e, split(e, &a, 10_000, "a")]);
    let payouts = s.c.distribute(&s.payer, &a, &s.token.address, &999);
    let total: i128 = payouts.iter().map(|p| p.amount).sum();
    assert_eq!(total, 999);
    assert_eq!(s.token.balance(&a) + s.token.balance(&b), 999);
}

#[test]
fn rounding_dust_goes_to_owner() {
    let s = setup();
    let e = &s.env;
    let (root, a, b, c) = (
        Address::generate(e),
        Address::generate(e),
        Address::generate(e),
        Address::generate(e),
    );
    s.c.set_splits(
        &root,
        &vec![
            e,
            split(e, &a, 3_333, "a"),
            split(e, &b, 3_333, "b"),
            split(e, &c, 3_334, "c"),
        ],
    );
    s.c.distribute(&s.payer, &root, &s.token.address, &10);
    let sum =
        s.token.balance(&a) + s.token.balance(&b) + s.token.balance(&c) + s.token.balance(&root);
    assert_eq!(sum, 10);
}

#[test]
fn validates_tables() {
    let s = setup();
    let e = &s.env;
    let root = Address::generate(e);
    let a = Address::generate(e);
    assert_eq!(
        s.c.try_set_splits(&root, &vec![e, split(e, &a, 10_001, "a")]),
        Err(Ok(err(Error::BpsOverflow)))
    );
    assert_eq!(
        s.c.try_set_splits(&root, &vec![e, split(e, &a, 0, "a")]),
        Err(Ok(err(Error::ZeroWeight)))
    );
    assert_eq!(
        s.c.try_set_splits(&root, &vec![e, split(e, &root, 10, "me")]),
        Err(Ok(err(Error::SelfSplit)))
    );
    assert_eq!(
        s.c.try_set_splits(
            &root,
            &vec![e, split(e, &a, 10, "a"), split(e, &a, 10, "a2")]
        ),
        Err(Ok(err(Error::DuplicateRecipient)))
    );
}

#[test]
fn no_table_pays_owner_in_full() {
    let s = setup();
    let owner = Address::generate(&s.env);
    s.c.distribute(&s.payer, &owner, &s.token.address, &42);
    assert_eq!(s.token.balance(&owner), 42);
}
