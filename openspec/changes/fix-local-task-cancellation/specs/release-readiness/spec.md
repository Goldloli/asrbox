## ADDED Requirements

### Requirement: Bounded cold-start verification
Backend process startup tests SHALL allow a documented bounded cold-start budget on maintained CI runners while still failing on early process exit, startup timeout, or incorrect recovery state.

#### Scenario: Hosted runner imports dependencies slowly
- **WHEN** a healthy backend starts within the maintained cold-start budget
- **THEN** recovery assertions run instead of failing at an unrealistically short timing threshold
