extern crate std;

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token::{StellarAssetClient, TokenClient},
    Address, Env,
};

struct Setup<'a> {
    env: Env,
    router: StreamRouterClient<'a>,
    token: TokenClient<'a>,
    sender: Address,
    recipient: Address,
}

fn setup() -> Setup<'static> {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|l| l.timestamp = 1_000);

    let admin = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(admin);
    let token = TokenClient::new(&env, &sac.address());
    let sender = Address::generate(&env);
    let recipient = Address::generate(&env);
    StellarAssetClient::new(&env, &sac.address()).mint(&sender, &1_000_000);

    let id = env.register(StreamRouter, ());
    let router = StreamRouterClient::new(&env, &id);
    Setup {
        env,
        router,
        token,
        sender,
        recipient,
    }
}

fn err(e: Error) -> soroban_sdk::Error {
    soroban_sdk::Error::from_contract_error(e as u32)
}

fn advance(env: &Env, secs: u64) {
    env.ledger().with_mut(|l| l.timestamp += secs);
}

#[test]
fn accrues_per_second_and_withdraws() {
    let s = setup();
    let id = s
        .router
        .create_stream(&s.sender, &s.recipient, &s.token.address, &10, &1_000);
    assert_eq!(s.token.balance(&s.sender), 999_000);
    assert_eq!(s.router.withdrawable(&id), 0);

    advance(&s.env, 25);
    assert_eq!(s.router.withdrawable(&id), 250);
    assert_eq!(s.router.withdraw(&id), 250);
    assert_eq!(s.token.balance(&s.recipient), 250);
    assert_eq!(s.router.withdrawable(&id), 0);

    advance(&s.env, 10);
    assert_eq!(s.router.withdrawable(&id), 100);
}

#[test]
fn accrual_caps_at_deposit() {
    let s = setup();
    let id = s
        .router
        .create_stream(&s.sender, &s.recipient, &s.token.address, &10, &1_000);
    advance(&s.env, 10_000);
    assert_eq!(s.router.withdrawable(&id), 1_000);
    s.router.withdraw(&id);
    assert_eq!(s.token.balance(&s.recipient), 1_000);
}

#[test]
fn cancel_settles_and_refunds() {
    let s = setup();
    let id = s
        .router
        .create_stream(&s.sender, &s.recipient, &s.token.address, &10, &1_000);
    advance(&s.env, 30);
    let (paid, refund) = s.router.cancel(&id);
    assert_eq!((paid, refund), (300, 700));
    assert_eq!(s.token.balance(&s.recipient), 300);
    assert_eq!(s.token.balance(&s.sender), 999_700);

    // Nothing further accrues after cancellation.
    advance(&s.env, 100);
    assert_eq!(s.router.withdrawable(&id), 0);
}

#[test]
fn top_up_after_depletion_does_not_backpay_gap() {
    let s = setup();
    let id = s
        .router
        .create_stream(&s.sender, &s.recipient, &s.token.address, &10, &100);
    advance(&s.env, 50); // depleted after 10s, idle for 40s
    s.router.withdraw(&id);
    s.router.top_up(&id, &100);
    assert_eq!(s.router.withdrawable(&id), 0);
    advance(&s.env, 5);
    assert_eq!(s.router.withdrawable(&id), 50);
}

#[test]
fn top_up_on_active_stream_extends_runway() {
    let s = setup();
    let id = s
        .router
        .create_stream(&s.sender, &s.recipient, &s.token.address, &10, &100);
    advance(&s.env, 5);
    s.router.top_up(&id, &100);
    advance(&s.env, 10);
    assert_eq!(s.router.withdrawable(&id), 150);
}

#[test]
fn indexes_streams_by_party() {
    let s = setup();
    s.router
        .create_stream(&s.sender, &s.recipient, &s.token.address, &1, &10);
    s.router
        .create_stream(&s.sender, &s.recipient, &s.token.address, &2, &20);
    assert_eq!(s.router.streams_by_sender(&s.sender).len(), 2);
    assert_eq!(s.router.streams_by_recipient(&s.recipient).len(), 2);
    assert_eq!(s.router.stream_count(), 2);
}

#[test]
fn rejects_invalid_inputs() {
    let s = setup();
    let t = &s.token.address;
    assert_eq!(
        s.router
            .try_create_stream(&s.sender, &s.recipient, t, &1, &0),
        Err(Ok(err(Error::InvalidAmount)))
    );
    assert_eq!(
        s.router
            .try_create_stream(&s.sender, &s.recipient, t, &0, &10),
        Err(Ok(err(Error::InvalidRate)))
    );
    assert_eq!(
        s.router.try_create_stream(&s.sender, &s.sender, t, &1, &10),
        Err(Ok(err(Error::SelfStream)))
    );
    let id = s.router.create_stream(&s.sender, &s.recipient, t, &1, &10);
    assert_eq!(
        s.router.try_withdraw(&id),
        Err(Ok(err(Error::NothingToWithdraw)))
    );
    s.router.cancel(&id);
    assert_eq!(
        s.router.try_cancel(&id),
        Err(Ok(err(Error::StreamCancelled)))
    );
}

#[test]
fn withdraw_requires_recipient_auth() {
    let s = setup();
    let id = s
        .router
        .create_stream(&s.sender, &s.recipient, &s.token.address, &10, &1_000);
    advance(&s.env, 3);
    s.router.withdraw(&id);
    let auths = s.env.auths();
    assert_eq!(auths[0].0, s.recipient);
}

#[test]
fn withdraw_all_claims_every_incoming_stream() {
    let s = setup();
    let t = &s.token.address;
    let a = s
        .router
        .create_stream(&s.sender, &s.recipient, t, &10, &1_000);
    let b = s
        .router
        .create_stream(&s.sender, &s.recipient, t, &5, &1_000);
    advance(&s.env, 10);
    assert_eq!(s.router.withdraw_all(&s.recipient), 150);
    assert_eq!(s.token.balance(&s.recipient), 150);
    assert_eq!(s.router.withdrawable(&a), 0);
    assert_eq!(s.router.withdrawable(&b), 0);
    assert_eq!(
        s.router.try_withdraw_all(&s.recipient),
        Err(Ok(err(Error::NothingToWithdraw)))
    );
}
