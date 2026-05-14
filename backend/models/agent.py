from sqlalchemy import Integer, String, ForeignKey, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import Optional
from core.db import Base

class Agent(Base):
    __tablename__ = "agents"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(120), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(256), nullable=False)

    level: Mapped[int] = mapped_column(Integer, nullable=False, default=1)  # 1..4
    parent_id: Mapped[Optional[int]] = mapped_column(ForeignKey("agents.id"), nullable=True)

    external_id: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    avatar_url: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    parent: Mapped["Agent"] = relationship("Agent", remote_side=[id], backref="children")
