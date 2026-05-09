# Database Schema ERD

The diagram below captures the core entities that power the commission calculation platform, along with the cardinality between tables.

```mermaid
erDiagram
    agents {
        int id PK
        string name
        string email
        int level
        int parent_id FK
        bool active
    }
    policies {
        int id PK
        string policy_number
        string product
        float fyc_rate
    }
    sales {
        int id PK
        int policy_id FK
        int seller_id FK
        float premium
        date sale_date
        text hierarchy_snapshot
    }
    commission_ledger {
        int id PK
        int agent_id FK
        int sale_id FK
        int policy_id FK
        string entry_type
        float amount
        date entry_date
    }
    volume_bonus_accruals {
        int id PK
        int agent_id FK
        string period_type
        date period_start
        date period_end
        float total_volume
        float bonus_paid
    }
    clawbacks {
        int id PK
        int policy_id FK
        date cancellation_date
        string status
    }
    clawback_items {
        int id PK
        int clawback_id FK
        int agent_id FK
        string entry_type
        float clawback_amount
    }

    agents ||--o{ agents : "parent_id"
    agents ||--o{ sales : "seller_id"
    agents ||--o{ commission_ledger : "agent_id"
    agents ||--o{ volume_bonus_accruals : "agent_id"
    agents ||--o{ clawback_items : "agent_id"
    policies ||--o{ sales : "policy_id"
    policies ||--o{ commission_ledger : "policy_id"
    policies ||--o{ clawbacks : "policy_id"
    sales ||--o{ commission_ledger : "sale_id"
    clawbacks ||--o{ clawback_items : "clawback_id"
```

### Notes
- `sales.hierarchy_snapshot` stores a JSON array of the hierarchy at the time of sale so historic payouts remain auditable even if reporting lines change later.
- `commission_ledger.entry_date` corresponds to the SQLAlchemy `date` column in `CommissionLedger`; renamed in the diagram to avoid clashing with the Mermaid keyword `date`.
- `volume_bonus_accruals` enforces uniqueness on `(agent_id, period_type, period_start)` to ensure one record per period window.
- `clawback_items` capture every amount reversed when a cancellation is approved, referencing both the original clawback request and the impacted agent.
