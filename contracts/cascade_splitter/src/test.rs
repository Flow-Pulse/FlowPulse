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

mod proptests {
    use super::*;
    use proptest::{prop_assert, prop_assert_eq, proptest, test_runner::ProptestConfig};

    fn normalize_weights(raw: &[u32; 4]) -> [u32; 4] {
        let sum: u32 = raw.iter().sum();
        if sum == 0 {
            return [0; 4];
        }
        if sum <= TOTAL_BPS {
            return *raw;
        }
        let mut out = [0u32; 4];
        let mut total = 0u32;
        for k in 0..4 {
            if raw[k] > 0 {
                let scaled = ((raw[k] as u64 * TOTAL_BPS as u64) / sum as u64) as u32;
                let val = scaled.max(1);
                out[k] = val;
                total += val;
            }
        }
        while total > TOTAL_BPS {
            let mut max_idx = 0;
            for k in 1..4 {
                if out[k] > out[max_idx] {
                    max_idx = k;
                }
            }
            out[max_idx] -= 1;
            total -= 1;
        }
        out
    }

    proptest! {
        #![proptest_config(ProptestConfig::with_cases(64))]

        #[test]
        fn property_test_random_split_graphs_conserve_funds(
            raw_w in proptest::collection::vec(0u32..=10_000u32, 20),
            amount in 1i128..=1_000_000_000_000_000i128,
            root_idx in 0usize..5usize,
        ) {
            let env = Env::default();
            env.mock_all_auths();
            let sac = env.register_stellar_asset_contract_v2(Address::generate(&env));
            let token = TokenClient::new(&env, &sac.address());
            let payer = Address::generate(&env);
            StellarAssetClient::new(&env, &sac.address()).mint(&payer, &amount);

            let id = env.register(CascadeSplitter, ());
            let client = CascadeSplitterClient::new(&env, &id);

            let nodes = [
                Address::generate(&env),
                Address::generate(&env),
                Address::generate(&env),
                Address::generate(&env),
                Address::generate(&env),
            ];

            for i in 0..5 {
                let mut raw_slice = [0u32; 4];
                raw_slice.copy_from_slice(&raw_w[i * 4..(i + 1) * 4]);
                let norm = normalize_weights(&raw_slice);

                let neighbors: std::vec::Vec<Address> = (0..5)
                    .filter(|&j| j != i)
                    .map(|j| nodes[j].clone())
                    .collect();

                let mut splits_vec = soroban_sdk::Vec::new(&env);
                for (k, &bps) in norm.iter().enumerate() {
                    if bps > 0 {
                        splits_vec.push_back(split(&env, &neighbors[k], bps, "pkg"));
                    }
                }
                if !splits_vec.is_empty() {
                    client.set_splits(&nodes[i], &splits_vec);
                }
            }

            let root = &nodes[root_idx];
            let preview = client.preview(root, &amount);

            // Invariant 1: Total payouts must identically conserve funds
            let sum_preview: i128 = preview.iter().map(|p| p.amount).sum();
            prop_assert_eq!(sum_preview, amount);

            // Invariant 2: Bounded depth (<= MAX_DEPTH) and positive payouts
            for p in preview.iter() {
                prop_assert!(p.amount > 0, "non-positive payout");
                prop_assert!(p.depth <= MAX_DEPTH, "depth {} > MAX_DEPTH", p.depth);
            }

            // Invariant 3: Actual token distribution mirrors preview and conserves balance
            let payouts = client.distribute(&payer, root, &token.address, &amount);
            prop_assert_eq!(payouts, preview);

            let mut total_transferred = 0i128;
            for n in nodes.iter() {
                total_transferred += token.balance(n);
            }
            prop_assert_eq!(total_transferred, amount);
            prop_assert_eq!(token.balance(&payer), 0);
        }

        #[test]
        fn property_test_two_node_cycles_conserve_funds(
            bps_a in 1u32..=10_000u32,
            bps_b in 1u32..=10_000u32,
            amount in 1i128..=1_000_000_000_000_000i128,
        ) {
            let env = Env::default();
            env.mock_all_auths();
            let sac = env.register_stellar_asset_contract_v2(Address::generate(&env));
            let token = TokenClient::new(&env, &sac.address());
            let payer = Address::generate(&env);
            StellarAssetClient::new(&env, &sac.address()).mint(&payer, &amount);

            let id = env.register(CascadeSplitter, ());
            let client = CascadeSplitterClient::new(&env, &id);

            let a = Address::generate(&env);
            let b = Address::generate(&env);

            client.set_splits(&a, &soroban_sdk::vec![&env, split(&env, &b, bps_a, "b")]);
            client.set_splits(&b, &soroban_sdk::vec![&env, split(&env, &a, bps_b, "a")]);

            let payouts = client.distribute(&payer, &a, &token.address, &amount);
            let total: i128 = payouts.iter().map(|p| p.amount).sum();
            prop_assert_eq!(total, amount);

            for p in payouts.iter() {
                prop_assert!(p.depth <= MAX_DEPTH);
                prop_assert!(p.amount > 0);
            }

            prop_assert_eq!(token.balance(&a) + token.balance(&b), amount);
            prop_assert_eq!(token.balance(&payer), 0);
        }

        #[test]
        fn property_test_three_node_cycles_conserve_funds(
            bps_a in 1u32..=10_000u32,
            bps_b in 1u32..=10_000u32,
            bps_c in 1u32..=10_000u32,
            amount in 1i128..=1_000_000_000_000_000i128,
        ) {
            let env = Env::default();
            env.mock_all_auths();
            let sac = env.register_stellar_asset_contract_v2(Address::generate(&env));
            let token = TokenClient::new(&env, &sac.address());
            let payer = Address::generate(&env);
            StellarAssetClient::new(&env, &sac.address()).mint(&payer, &amount);

            let id = env.register(CascadeSplitter, ());
            let client = CascadeSplitterClient::new(&env, &id);

            let a = Address::generate(&env);
            let b = Address::generate(&env);
            let c = Address::generate(&env);

            client.set_splits(&a, &soroban_sdk::vec![&env, split(&env, &b, bps_a, "b")]);
            client.set_splits(&b, &soroban_sdk::vec![&env, split(&env, &c, bps_b, "c")]);
            client.set_splits(&c, &soroban_sdk::vec![&env, split(&env, &a, bps_c, "a")]);

            let payouts = client.distribute(&payer, &a, &token.address, &amount);
            let total: i128 = payouts.iter().map(|p| p.amount).sum();
            prop_assert_eq!(total, amount);

            for p in payouts.iter() {
                prop_assert!(p.depth <= MAX_DEPTH);
                prop_assert!(p.amount > 0);
            }

            prop_assert_eq!(token.balance(&a) + token.balance(&b) + token.balance(&c), amount);
            prop_assert_eq!(token.balance(&payer), 0);
        }

        #[test]
        fn property_test_depth_bound_on_deep_chain(
            amount in 1i128..=1_000_000_000_000_000i128,
        ) {
            let env = Env::default();
            env.mock_all_auths();
            let id = env.register(CascadeSplitter, ());
            let client = CascadeSplitterClient::new(&env, &id);

            let nodes: [Address; 6] = [
                Address::generate(&env),
                Address::generate(&env),
                Address::generate(&env),
                Address::generate(&env),
                Address::generate(&env),
                Address::generate(&env),
            ];

            for i in 0..5 {
                client.set_splits(&nodes[i], &soroban_sdk::vec![&env, split(&env, &nodes[i + 1], 10_000, "hop")]);
            }

            let payouts = client.preview(&nodes[0], &amount);
            let total: i128 = payouts.iter().map(|p| p.amount).sum();
            prop_assert_eq!(total, amount);

            for p in payouts.iter() {
                prop_assert!(p.depth <= MAX_DEPTH);
            }

            prop_assert_eq!(payouts.len(), 1);
            let p0 = payouts.get(0).unwrap();
            prop_assert_eq!(p0.recipient, nodes[3]);
            prop_assert_eq!(p0.amount, amount);
            prop_assert_eq!(p0.depth, 3);
        }
    }
}
