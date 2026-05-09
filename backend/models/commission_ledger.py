from datetime import datetime, date
from sqlalchemy import Integer, Float, String, Date, DateTime, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column
from core.db import Base

# entry_type: 'FYC' | 'OVERRIDE' | 'VOLUME_BONUS' | 'CLAWBACK'
class CommissionLedger(Base):
    __tablename__ = "commission_ledger"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    agent_id: Mapped[int] = mapped_column(ForeignKey("agents.id"), nullable=False)
    sale_id: Mapped[int | None] = mapped_column(ForeignKey("sales.id"), nullable=True)
    policy_id: Mapped[int | None] = mapped_column(ForeignKey("policies.id"), nullable=True)

    entry_type: Mapped[str] = mapped_column(String(32), nullable=False)
    amount: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    date: Mapped[date] = mapped_column(Date, nullable=False, default=date.today)

    # JSON-as-text for SQLite audit/meta (optional)
    meta: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
