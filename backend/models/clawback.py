from datetime import datetime, date
from typing import Optional
from sqlalchemy import Integer, String, Date, DateTime, ForeignKey, Float, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.db import Base

class Clawback(Base):
    __tablename__ = "clawbacks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    policy_id: Mapped[int] = mapped_column(ForeignKey("policies.id"), nullable=False)
    cancellation_date: Mapped[date] = mapped_column(Date, nullable=False)
    reason: Mapped[str] = mapped_column(String(80), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="PENDING")  # PENDING|APPROVED|DENIED
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    items: Mapped[list["ClawbackItem"]] = relationship("ClawbackItem", back_populates="clawback", cascade="all, delete-orphan")

class ClawbackItem(Base):
    __tablename__ = "clawback_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    clawback_id: Mapped[int] = mapped_column(ForeignKey("clawbacks.id"), nullable=False)
    agent_id: Mapped[int] = mapped_column(ForeignKey("agents.id"), nullable=False)
    entry_type: Mapped[str] = mapped_column(String(32), nullable=False)  # FYC/OVERRIDE/…
    original_amount: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    clawback_amount: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    meta: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    clawback: Mapped["Clawback"] = relationship("Clawback", back_populates="items")
