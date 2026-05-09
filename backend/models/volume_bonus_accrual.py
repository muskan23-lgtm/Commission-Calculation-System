from datetime import date, datetime
from sqlalchemy import Integer, Float, String, Date, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from core.db import Base


class VolumeBonusAccrual(Base):
    """
    Tracks running sales volume and bonuses paid for an agent within a period.
    """

    __tablename__ = "volume_bonus_accruals"
    __table_args__ = (
        UniqueConstraint(
            "agent_id", "period_type", "period_start", name="uq_volume_bonus_period"
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    agent_id: Mapped[int] = mapped_column(ForeignKey("agents.id"), nullable=False)

    period_type: Mapped[str] = mapped_column(String(12), nullable=False)  # monthly|quarterly|annual
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)

    total_volume: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    bonus_rate: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    bonus_paid: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
