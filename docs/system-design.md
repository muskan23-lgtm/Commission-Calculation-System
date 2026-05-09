# System Design

## 1. Requirements

### Functional Requirements
- Support secure agent and administrator authentication with JWT-based sessions.
- Maintain a multi-level agent hierarchy, including onboarding, profile updates, and activation state changes.
- Capture insurance policies and associated sales, including customer metadata and the agent hierarchy snapshot at the time of sale.
- Calculate and persist first-year commissions, overrides, and volume bonuses in a unified ledger for every sale event.
- Provide dashboards and reports that summarise production, commissions, bonuses, and clawbacks with period filtering and CSV export.
- Manage clawback workflows from cancellation intake through approval, reversing the appropriate ledger entries and notifying affected agents.
- Expose RESTful APIs consumed by the React frontend, enforcing authorization and validation at the service layer.

### Non-Functional Requirements
- Ensure data integrity with transactional writes and idempotent service operations.
- Protect sensitive information via salted password hashes, HTTPS termination, and secret rotation policies.
- Deliver responsive UI interactions (<250 ms API median) for typical mid-size agency datasets.
- Scale horizontally by swapping SQLite for a managed SQL database and containerising the backend/frontend.
- Preserve auditability through immutable ledger entries, timestamped status changes, and traceable metadata.
- Maintain observability with structured logging, health checks, and instrumentation hooks for future APM integration.

## 2. Objects

- **Agent**: Represents a salesperson or leader in the hierarchy; tracks identity, level, parent relationship, authentication hash, and status flags.
- **Policy**: Stores product metadata and commission rates tied to a unique policy number.
- **Sale**: Records a policy sale, the selling agent, financial details (premium, date), customer context, and the captured hierarchy snapshot used for downstream calculations.
- **CommissionLedgerEntry**: Immutable log entry capturing monetary movements (`FYC`, `OVERRIDE`, `VOLUME_BONUS`, `CLAWBACK`) with references to agents, sales, and policies plus JSON metadata.
- **VolumeBonusAccrual**: Aggregates production volume and bonus payouts per agent and period, enabling tier evaluation and payout scheduling.
- **Clawback**: Represents a policy cancellation event with reason, effective date, notes, and workflow status (`PENDING`,`PROCESS`, `APPROVED`, `DENIED`).
- **ClawbackItem**: Breaks a clawback into per-agent, per-entry adjustments, referencing the original ledger amounts to reverse.
- **TierRule**: Defines thresholds and rates for volume bonus tiers; interpreted by the commission engine during payout calculations.
- **AuthToken**: Encapsulates JWT payloads (agent id, expiry) and underpins request authorization across protected routes.
- **ReportView**: Logical projection used by the reporting services to deliver aggregated metrics, charts, and exports.

## 3. UML Diagram

### Class Diagram

The class diagram captures the core domain entities, key enumerations, and how policy sales, ledger entries, bonuses, and clawbacks relate back to agents and their hierarchy snapshot.

```mermaid
classDiagram
    class Agent {
        +int id
        +string name
        +int level
        +int parentId
        +bool active
        +assignParent(parentId): void
        +activate(): void
        +deactivate(): void
    }
    class EntryType {
        <<enumeration>>
        FYC
        OVERRIDE
        VOLUME_BONUS
        CLAWBACK
    }
    class PeriodType {
        <<enumeration>>
        monthly
        quarterly
        annual
    }
    class ClawbackStatus {
        <<enumeration>>
        PENDING
        PROCESS
        APPROVED
        DENIED
    }
    class Policy {
        +int id
        +string policyNumber
        +string product
        +float fycRate
        +calculateFyc(premium): float
        +eligibleForBonus(saleDate): bool
    }
    class Sale {
        +int id
        +float premium
        +date saleDate
        +json hierarchySnapshot
        +captureHierarchy(agent): void
        +calculateCommission(): float
    }
    class CommissionLedgerEntry {
        +int id
        +EntryType entryType
        +float amount
        +json meta
        +apply(): void
        +reverse(): CommissionLedgerEntry
    }
    class VolumeBonusAccrual {
        +int id
        +PeriodType periodType
        +date periodStart
        +date periodEnd
        +float totalVolume
        +float bonusRate
        +addProduction(premium): void
        +evaluateTier(tierRule): float
    }
    class Clawback {
        +int id
        +date cancellationDate
        +ClawbackStatus status
        +string reason
        +queueReview(): void
        +approve(): void
        +deny(): void
    }
    class ClawbackItem {
        +int id
        +EntryType entryType
        +float originalAmount
        +float clawbackAmount
        +calculateAdjustment(): float
    }
    class TierRule {
        +int id
        +float threshold
        +float rate
        +string tierName
        +matches(volume): bool
        +calculateBonus(volume): float
    }
    class AuthToken {
        +int id
        +string token
        +datetime expiresAt
        +string scope
        +isExpired(): bool
        +validateScope(scope): bool
        +refresh(expiry): void
    }
    class ReportView {
        +string name
        +json definition
        +json filters
        +materialize(params): dataset
        +exportCsv(params): csv
    }

    Agent "0..1" <-- "0..*" Agent : reportsTo
    Agent "1" o-- "0..*" Sale : sells
    Agent "1" o-- "0..*" CommissionLedgerEntry : earns
    Agent "1" o-- "0..*" VolumeBonusAccrual : accumulates
    Agent "1" o-- "0..*" ClawbackItem : owes
    Policy "1" o-- "0..*" Sale : underwrites
    Policy "1" o-- "0..*" CommissionLedgerEntry : influences
    Policy "1" o-- "0..*" Clawback : mayTrigger
    Sale "1" o-- "0..*" CommissionLedgerEntry : generates
    Clawback "1" *-- "1..*" ClawbackItem : aggregates
    VolumeBonusAccrual "0..*" ..> "1" TierRule : evaluatedAgainst
    AuthToken "0..*" --> "1" Agent : authenticates
    ReportView ..> CommissionLedgerEntry : derivesMetricsFrom
    ReportView ..> VolumeBonusAccrual
    ReportView ..> Clawback
    CommissionLedgerEntry ..> EntryType
    VolumeBonusAccrual ..> PeriodType
    Clawback ..> ClawbackStatus
```
