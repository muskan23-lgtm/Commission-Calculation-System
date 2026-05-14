from sqlalchemy import Integer, Float, ForeignKey, Date, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import date
from typing import Optional
from core.db import Base

class Sale(Base):
    __tablename__ = "sales"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    policy_id: Mapped[int] = mapped_column(ForeignKey("policies.id"))
    seller_id: Mapped[int] = mapped_column(ForeignKey("agents.id"))

    # core
    premium: Mapped[float] = mapped_column(Float, nullable=False)
    sale_date: Mapped[date] = mapped_column(Date, default=date.today)

    # NEW fields for your UI
    customer_name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    product: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    mobile: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    gender: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)  # Male/Female/Other
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    hierarchy_snapshot: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    policy = relationship("Policy")
