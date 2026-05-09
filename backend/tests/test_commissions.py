from datetime import date, timedelta

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker

from core.security import hash_password
from models import Agent, Policy, CommissionLedger, VolumeBonusAccrual
from services.engine import record_sale_and_pay
from services.clawback import build_clawback_preview, create_clawback, approve_clawback
from core.db import Base


@pytest.fixture()
def db_session() -> Session:
    engine = create_engine("sqlite:///:memory:", future=True)
    Base.metadata.create_all(bind=engine)
    TestingSession = sessionmaker(bind=engine, future=True)
    with TestingSession() as session:
        yield session


def _make_hierarchy(session: Session) -> Agent:
    director = Agent(name="Director D", email="director@example.com", password_hash=hash_password("pass"), level=4)
    manager = Agent(name="Manager M", email="manager@example.com", password_hash=hash_password("pass"), level=3, parent=director)
    lead = Agent(name="Lead L", email="lead@example.com", password_hash=hash_password("pass"), level=2, parent=manager)
    agent = Agent(name="Agent A", email="agent@example.com", password_hash=hash_password("pass"), level=1, parent=lead)
    session.add_all([director, manager, lead, agent])
    session.commit()
    return agent


def test_record_sale_creates_ledger_and_volume_bonuses(db_session: Session):
    seller = _make_hierarchy(db_session)
    policy = Policy(policy_number="POL-CASE-1", product="Life", fyc_rate=0.5)
    db_session.add(policy)
    db_session.commit()

    sale_date = date(2024, 1, 15)
    record_sale_and_pay(
        db_session,
        policy=policy,
        seller=seller,
        premium=120_000.0,
        fyc_rate=0.5,
        sale_date=sale_date,
        extra_fields={"customer_name": "John Smith"},
    )
    db_session.commit()

    # Seller FYC + three overrides + 4*3 volume bonuses (seller + uplines)
    ledger_entries = db_session.execute(select(CommissionLedger)).scalars().all()
    assert any(e.entry_type == "FYC" and e.agent_id == seller.id for e in ledger_entries)
    override_agents = {e.agent_id for e in ledger_entries if e.entry_type == "OVERRIDE"}
    assert len(override_agents) == 3  # Lead, Manager, Director

    # Seller accruals across monthly/quarterly/annual
    accruals = db_session.execute(
        select(VolumeBonusAccrual).where(VolumeBonusAccrual.agent_id == seller.id)
    ).scalars().all()
    assert {acc.period_type for acc in accruals} == {"monthly", "quarterly", "annual"}
    assert all(acc.total_volume == pytest.approx(120_000.0) for acc in accruals)
    monthly_accrual = next(acc for acc in accruals if acc.period_type == "monthly")
    assert monthly_accrual.bonus_paid > 0  # volume bonus posted


def test_clawback_preview_and_approval_adjusts_volume(db_session: Session):
    seller = _make_hierarchy(db_session)
    policy = Policy(policy_number="POL-CASE-2", product="Life", fyc_rate=0.5)
    db_session.add(policy)
    db_session.commit()

    sale_date = date(2024, 2, 10)
    cancellation_date = sale_date + timedelta(days=30)  # within 90 days
    record_sale_and_pay(
        db_session,
        policy=policy,
        seller=seller,
        premium=80_000.0,
        fyc_rate=0.5,
        sale_date=sale_date,
        extra_fields={},
    )
    db_session.commit()

    preview = build_clawback_preview(db_session, policy.policy_number, cancellation_date)
    assert preview["exists"] is True
    entry_types = {item["entry_type"] for item in preview["items"]}
    assert {"FYC", "OVERRIDE", "VOLUME_BONUS"} <= entry_types

    cb = create_clawback(
        db_session,
        policy_id=policy.id,
        cancellation_date=cancellation_date,
        reason="Customer request",
        notes=None,
        preview=preview,
    )
    approve_clawback(db_session, cb.id, approve=True)
    db_session.commit()

    monthly_accrual = db_session.execute(
        select(VolumeBonusAccrual).where(
            VolumeBonusAccrual.agent_id == seller.id,
            VolumeBonusAccrual.period_type == "monthly",
        )
    ).scalar_one()
    assert monthly_accrual.total_volume < 80_000.0  # volume reduced
    assert monthly_accrual.bonus_paid < 80_000.0 * 0.05  # paid bonus adjusted downward
