# Changelog

All notable changes to KillSwitch Wallet will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-09-19

### Added

#### Smart Contracts
- SessionPolicy contract with policy enforcement
- Budget limits with 2% fee calculation
- Merchant allowlist verification
- Deadline expiration checks
- Emergency freeze mechanism
- Owner-controlled session closure with refund
- Immutable event logs (SessionGranted, PaymentProposed, PaymentExecuted, PaymentDenied, SessionFrozen, SessionClosed)
- Comprehensive Foundry test suite with 100% boundary coverage

#### AI Agent Module
- KilnClient: Integration with gpt-oss-120b model on NPU
- Mock mode for demos without API key
- Token usage tracking (~500 tokens/proposal, ~300 tokens/explanation)
- PolicyReader: Query on-chain session policy and payment history
- PaymentProposer: Orchestrate propose → enforce → explain workflow
- TypeScript implementation with strict typing

#### Demonstrations
- setup.sh: Automated deployment and initialization
- 01-success-payment.sh: Payment within budget and allowlist
- 02-budget-exceeded.sh: Boundary test - budget exceeded after fees
- 03-merchant-denied.sh: Boundary test - merchant not on allowlist

#### Utility Scripts
- check-session.sh: Query session status and remaining budget
- query-events.sh: Audit trail of all payment events
- freeze-session.sh: Emergency stop spending
- close-session.sh: Close session and reclaim budget

#### Documentation
- README.md: Project overview with architecture diagram
- ARCHITECTURE.md: Technical deep dive (security model, data flow, design principles)
- QUICKSTART.md: 5-minute setup guide for local development
- CONTRIBUTING.md: Development guidelines and PR process
- KILN_SETUP.md: Guide to obtaining and configuring Kiln API key
- LICENSE: MIT license

#### Infrastructure
- Foundry configuration (foundry.toml, remappings.txt)
- TypeScript project setup (tsconfig.json, package.json)
- Environment template (.env.example)
- .gitignore with Foundry, Node, and IDE exclusions

### Security
- Zero-trust model: Agent proposes, contract enforces
- All policy boundaries checked on-chain
- Denial events recorded as valid outcomes
- Complete audit trail via immutable events
- Emergency freeze capability
- Non-upgradable contracts (immutable deployment)

### Performance
- Contract deployment: ~500k gas
- grantSession(): ~150k gas
- proposeOrPay() success: ~80k gas
- proposeOrPay() denial: ~50k gas
- Kiln inference: ~150ms P50 latency
- End-to-end payment: ~2s (proposal + execution + confirmation)

## Acceptance Criteria

✅ **Declared Function**: README clearly states what agent does vs what code enforces  
✅ **Boundaries & Stopping**: Two forced denials recorded (budget exceeded, merchant denied)  
✅ **Kiln API**: gpt-oss-120b model integration with token usage reporting  
✅ **Blockchain**: On-chain transaction per demo run with event emission  
✅ **Approval & Evidence**: Human grants budget, monitors spend, can freeze, gets receipts; full reconstructability from on-chain events  

## Design Principles

1. **Agent proposes; policy contract disposes** — Stopping/deny is a correct recorded outcome
2. **Least privilege** — Session capability with budget, merchant allowlist, deadline
3. **Don't trust the model** — Enforce boundaries in code + on-chain, not in prompts
4. **Evidence** — Another person with only your records can reconstruct authorization

## Known Limitations

- Single-chain support (EVM only)
- Sequential payment processing (no batching)
- Fixed 2% fee simulation
- No ZK privacy for allowlists
- Mock Kiln API responses when no key provided

## Future Enhancements

- [ ] Multi-session support (parallel budgets)
- [ ] Fiat on/off-ramp integration (Stripe → USDC)
- [ ] ZK proofs for private merchant allowlists
- [ ] Cross-chain settlement (L2 optimistic rollups)
- [ ] Agent reputation/slashing for malicious proposals
- [ ] Batch payment proposals
- [ ] Dynamic fee calculation
- [ ] Gasless meta-transactions
- [ ] Multi-sig approval for large payments
- [ ] Rate limiting (max transactions per hour)

---

**Challenge**: Furiosa Challenge B (GWDC 2026 Korea)  
**License**: MIT  
**Repository**: https://github.com/rectinajh/killswitch-wallet
