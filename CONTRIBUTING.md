# Contributing to KillSwitch Wallet

Thank you for your interest in contributing to KillSwitch Wallet!

## Development Setup

See [QUICKSTART.md](QUICKSTART.md) for initial setup instructions.

## Project Structure

```
killswitch-wallet/
├── contracts/          # Solidity smart contracts (Foundry)
│   ├── src/           # Contract source files
│   ├── test/          # Foundry tests
│   └── script/        # Deployment scripts
├── agent/             # TypeScript AI agent
│   └── src/           # Agent modules
├── demos/             # Demo scripts
├── ARCHITECTURE.md    # Technical architecture
└── README.md          # Project overview
```

## Making Changes

### Smart Contracts

1. **Write tests first**:
   ```bash
   cd contracts
   forge test
   ```

2. **Check gas usage**:
   ```bash
   forge test --gas-report
   ```

3. **Format code**:
   ```bash
   forge fmt
   ```

### Agent Module

1. **Build**:
   ```bash
   cd agent
   npm run build
   ```

2. **Type checking**:
   ```bash
   npm run lint
   ```

3. **Manual test**:
   ```bash
   SESSION_ID=0 USER_INTENT="Test payment" node dist/index.js
   ```

## Coding Standards

### Solidity

- Use Solidity 0.8.24
- Follow [Solidity Style Guide](https://docs.soliditylang.org/en/latest/style-guide.html)
- Document public functions with NatSpec
- Emit events for state changes
- Use explicit error types (not `require` strings)

### TypeScript

- Use strict TypeScript
- Prefer `async`/`await` over callbacks
- Document public APIs with JSDoc
- Handle errors explicitly

## Testing Requirements

### Smart Contracts

All contract changes must include tests:

```solidity
function testNewFeature() public {
    // Arrange
    uint256 sessionId = createSession();
    
    // Act
    vm.expectEmit(true, true, false, true);
    emit EventName(...);
    contract.newFeature(sessionId);
    
    // Assert
    assertEq(contract.getState(sessionId), expectedState);
}
```

### Agent Module

Add integration tests in demo scripts:

```bash
./demos/new-feature.sh
```

## Security Guidelines

### Critical Rules

1. **Never trust the agent**: Enforcement must be in smart contracts
2. **Gas optimization**: Avoid unbounded loops
3. **Access control**: Use modifiers for owner-only functions
4. **Event logging**: Emit events for all state changes
5. **Reentrancy**: Use checks-effects-interactions pattern

### Security Review Checklist

- [ ] Agent cannot bypass contract checks
- [ ] All boundaries enforced on-chain
- [ ] Events emitted for audit trail
- [ ] Owner-only functions protected
- [ ] No integer overflow/underflow
- [ ] Reentrancy protection if needed

## Pull Request Process

1. **Fork** the repository
2. **Create branch**: `git checkout -b feature/your-feature`
3. **Make changes** with tests
4. **Test locally**: Run all demos
5. **Commit**: Use descriptive commit messages
6. **Push**: `git push origin feature/your-feature`
7. **Open PR**: Describe changes and motivation

### PR Template

```markdown
## Description
Brief description of changes

## Motivation
Why is this change needed?

## Testing
- [ ] Contract tests pass (`forge test`)
- [ ] Agent builds (`npm run build`)
- [ ] Demos run successfully
- [ ] Gas costs reviewed (if contract change)

## Checklist
- [ ] Code follows style guidelines
- [ ] Tests added for new features
- [ ] Documentation updated
- [ ] No security vulnerabilities introduced
```

## Release Process

1. **Version bump**: Update version in `package.json`
2. **Changelog**: Document changes in `CHANGELOG.md`
3. **Tag release**: `git tag v1.0.0`
4. **Deploy contracts**: To testnet/mainnet
5. **Publish**: NPM package (if applicable)

## Questions?

- Open an issue for bugs or feature requests
- Join discussions for design questions
- Review [ARCHITECTURE.md](ARCHITECTURE.md) for technical details

## Code of Conduct

- Be respectful and inclusive
- Focus on constructive feedback
- Welcome newcomers
- Prioritize security and correctness

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
