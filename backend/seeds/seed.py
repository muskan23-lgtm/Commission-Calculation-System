import os, sys
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from core.db import SessionLocal, init_db
from core.security import hash_password
from models.agent import Agent

def run():
    init_db()
    db = SessionLocal()
    if db.query(Agent).count() > 0:
        print("Agents already exist.")
        return

    director = Agent(name="Sarah Wilson", email="sarah@co.com", password_hash=hash_password("pass"),
                     level=4, external_id="D-1001", active=True)
    manager = Agent(name="Michael Brown", email="michael@co.com", password_hash=hash_password("pass"),
                    level=3, parent=director, external_id="M-2001", active=True)
    lead = Agent(name="Jane Smith", email="jane@co.com", password_hash=hash_password("pass"),
                 level=2, parent=manager, external_id="L-3001", active=True)
    agent1 = Agent(name="John Doe", email="john@co.com", password_hash=hash_password("pass"),
                   level=1, parent=lead, external_id="A-4001", active=True)
    agent2 = Agent(name="David Lee", email="david@co.com", password_hash=hash_password("pass"),
                   level=1, parent=lead, external_id="A-4002", active=True)

    db.add_all([director, manager, lead, agent1, agent2])
    db.commit()
    print("Seeded agents & hierarchy.")

if __name__ == "__main__":
    run()
