from sqlalchemy import Integer, String, Float
from sqlalchemy.orm import Mapped, mapped_column
from core.db import Base

class Policy(Base):
    __tablename__ = "policies"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    policy_number: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    product: Mapped[str] = mapped_column(String(64), default="Life")
    fyc_rate: Mapped[float] = mapped_column(Float, default=0.5)
