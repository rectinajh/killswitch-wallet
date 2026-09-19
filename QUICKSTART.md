# KillSwitch Wallet - Quick Start Guide

Get KillSwitch Wallet running locally in 5 minutes.

## Prerequisites

Install these tools before starting:

```bash
# 1. Node.js 18+ and npm
node --version  # Should be v18 or higher
npm --version

# 2. Foundry (forge, anvil, cast)
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Verify installation
forge --version
anvil --version
cast --version
```

## Setup (5 Minutes)

### Step 1: Clone and Configure

```bash
cd killswitch-wallet

# Copy environment template
cp .env.example .env

# Edit .env if needed (default Anvil values work out of the box)
# For production, add your Kiln API key: KILN_API_KEY=your_actual_key
```

### Step 2: Start Local Blockchain

Open a new terminal and run:

```bash
anvil
```

Leave this running. You'll see output like:

```
Available Accounts
==================
(0) 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 (10000 ETH)
...
```

### Step 3: Deploy and Setup

In your original terminal:

```bash
./demos/setup.sh
```

This will:
- Deploy SessionPolicy contract
- Create an initial session with 1 ETH budget
- Build the agent module
- Save contract address to `.env`

Expected output:
```
✓ Contract deployed at: 0x5FbDB2315678afecb367f032d93F642f64180aa3
✓ Session created: 0x...
✓ Agent built
```

## Run Demos

### Demo 1: Successful Payment ✓

```bash
./demos/01-success-payment.sh
```

**What happens**:
- Agent proposes 0.05 ETH payment for coffee
- Merchant is on allowlist
- Amount is within budget
- Contract executes payment
- Event: `PaymentExecuted`

**Expected output**:
```
✓ Payment EXECUTED successfully!
Budget spent: 51000000000000000 wei (0.051 ETH including 2% fee)
```

### Demo 2: Budget Exceeded ✗

```bash
./demos/02-budget-exceeded.sh
```

**What happens**:
- New session created with 0.1 ETH budget
- Agent proposes 0.099 ETH payment
- With 2% fee: 0.10098 ETH > 0.1 ETH budget
- Contract denies payment
- Event: `PaymentDenied(reason: "Insufficient budget")`

**Expected output**:
```
✓ Payment DENIED as expected!
Denial reason: Insufficient budget
Budget spent after denial: 0 wei (no funds transferred)
```

### Demo 3: Merchant Not Allowed ✗

```bash
./demos/03-merchant-denied.sh
```

**What happens**:
- Agent proposes payment to `0xBAD...`
- Merchant not on allowlist
- Contract denies payment
- Event: `PaymentDenied(reason: "Merchant not allowed")`

**Expected output**:
```
✓ Payment DENIED as expected!
Denial reason: Merchant not allowed
Unauthorized merchant balance: 0 (no funds transferred)
```

## Verify On-Chain Evidence

### Query All Events

```bash
source .env
cast logs --address $CONTRACT_ADDRESS --from-block 0 --rpc-url $RPC_URL
```

### Check Session State

```bash
cast call $CONTRACT_ADDRESS "getSessionPolicy(uint256)(address,uint256,uint256,uint256,address[],bool,bool)" 0 --rpc-url $RPC_URL
```

Output:
```
0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266  # owner
1000000000000000000                         # budget (1 ETH)
51000000000000000                           # spent (0.051 ETH)
...
```

### Query Payment History

```bash
cast logs --address $CONTRACT_ADDRESS \
  --event "PaymentExecuted(uint256,address,uint256,uint256,bytes32)" \
  --rpc-url $RPC_URL
```

## Manual Testing

### Create Your Own Session

```bash
source .env

# Grant session with custom parameters
cast send $CONTRACT_ADDRESS \
  "grantSession(uint256,uint256,address[])(uint256)" \
  500000000000000000 \                                    # 0.5 ETH budget
  7200 \                                                   # 2 hours duration
  "[0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266]" \       # Single merchant
  --value 0.5ether \
  --private-key $PRIVATE_KEY \
  --rpc-url $RPC_URL
```

### Propose Payment as Agent

```bash
SESSION_ID=1 USER_INTENT="Buy lunch for 0.02 ETH" node agent/dist/index.js
```

### Freeze Session (Emergency Stop)

```bash
cast send $CONTRACT_ADDRESS "freeze(uint256)" 0 \
  --private-key $PRIVATE_KEY \
  --rpc-url $RPC_URL
```

### Close Session and Refund

```bash
cast send $CONTRACT_ADDRESS "closeSession(uint256)" 0 \
  --private-key $PRIVATE_KEY \
  --rpc-url $RPC_URL
```

## Using Real Kiln API

### Get API Key

1. Visit https://kilnapi.com/
2. Sign up and get your API key
3. Update `.env`:

```bash
KILN_API_KEY=your_actual_api_key_here
```

### Run with Real LLM

```bash
# Agent will now use gpt-oss-120b on NPU
SESSION_ID=0 USER_INTENT="Buy premium coffee for 0.08 ETH" node agent/dist/index.js
```

**Expected behavior**:
- Real LLM reasoning for merchant selection
- Token usage reported (~500 tokens)
- Structured JSON proposal

## Troubleshooting

### Anvil Not Running

```bash
Error: Anvil not running. Start with: anvil
```

**Fix**: Open a separate terminal and run `anvil`

### Contract Not Deployed

```bash
Error: CONTRACT_ADDRESS environment variable required
```

**Fix**: Run `./demos/setup.sh` to deploy contract

### Forge Not Found

```bash
forge: command not found
```

**Fix**: Install Foundry:
```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

### Agent Build Errors

```bash
Error: Cannot find module 'ethers'
```

**Fix**: Install dependencies:
```bash
cd agent
npm install
npm run build
```

## Next Steps

- **Read Architecture**: See [ARCHITECTURE.md](ARCHITECTURE.md) for deep dive
- **Run Tests**: `cd contracts && forge test`
- **Modify Policy**: Edit `SessionPolicy.sol` for custom rules
- **Extend Agent**: Add tools in `agent/src/`
- **Deploy to Testnet**: Use Sepolia RPC in `.env`

## Development Workflow

```bash
# Terminal 1: Blockchain
anvil

# Terminal 2: Watch agent changes
cd agent
npm run dev

# Terminal 3: Test contract changes
cd contracts
forge test --watch

# Terminal 4: Run demos
./demos/01-success-payment.sh
```

## Deployment to Sepolia Testnet

```bash
# 1. Get Sepolia ETH from faucet
#    https://sepoliafaucet.com/

# 2. Update .env
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
PRIVATE_KEY=your_sepolia_private_key

# 3. Deploy
cd contracts
forge create src/SessionPolicy.sol:SessionPolicy \
  --rpc-url $SEPOLIA_RPC_URL \
  --private-key $PRIVATE_KEY \
  --verify \
  --etherscan-api-key $ETHERSCAN_API_KEY

# 4. Update CONTRACT_ADDRESS in .env

# 5. Run demos with Sepolia RPC
RPC_URL=$SEPOLIA_RPC_URL ./demos/01-success-payment.sh
```

## Resources

- **Foundry Docs**: https://book.getfoundry.sh/
- **Ethers.js Docs**: https://docs.ethers.org/v6/
- **Kiln API**: https://kilnapi.com/docs
- **Architecture Guide**: [ARCHITECTURE.md](ARCHITECTURE.md)
- **Challenge Details**: Furiosa Challenge B (GWDC 2026 Korea)

---

**Questions?** Open an issue or check the architecture documentation for detailed explanations of design decisions.
