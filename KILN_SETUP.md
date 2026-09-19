# Kiln API Setup Guide

This guide explains how to obtain and configure a Kiln API key for the gpt-oss-120b model.

## Why Kiln API?

Furiosa Challenge B emphasizes NPU-based AI inference. Kiln API provides:

- **NPU Hardware**: Optimized for Korean semiconductor technology
- **gpt-oss-120b Model**: 120B parameter open-source model
- **Low Latency**: ~100-200ms inference (vs 500ms+ on CPU)
- **High Throughput**: 50+ requests/sec per instance
- **Cost Efficiency**: ~10x cheaper than cloud GPU

## Obtaining API Key

### Option 1: Official Kiln Platform (Recommended)

1. **Visit**: https://kilnapi.com/
2. **Sign Up**: Create an account with email
3. **Verify**: Complete email verification
4. **Dashboard**: Navigate to API Keys section
5. **Generate**: Create new API key for "KillSwitch Wallet"
6. **Copy**: Save the key securely (shown only once)

### Option 2: GWDC 2026 Challenge Credits

If participating in Furiosa Challenge B:

1. **Check Challenge Portal**: https://gwdc2026.kr/furiosa-b
2. **Request Credits**: Use challenge registration email
3. **Receive API Key**: Via challenge dashboard or email
4. **Note Quota**: Challenge keys may have request limits

### Option 3: Use Mock Mode (Development)

For local development without API key:

```bash
# Leave KILN_API_KEY as 'your_key_here' in .env
# Agent will automatically enter mock mode
KILN_API_KEY=your_key_here
```

Mock mode:
- ✓ Generates synthetic proposals
- ✓ All demos work
- ✓ Contract enforcement still active
- ✗ No real LLM reasoning

## Configuration

### 1. Update .env File

```bash
cd killswitch-wallet
cp .env.example .env
```

Edit `.env`:

```bash
# Real Kiln API
KILN_API_KEY=klnk_1234567890abcdef...
KILN_API_BASE_URL=https://api.kilnapi.com/v1

# Or mock mode
KILN_API_KEY=your_key_here
KILN_API_BASE_URL=https://api.kilnapi.com/v1
```

### 2. Verify Configuration

```bash
# Test API connection
cd agent
npm run build
node -e "
import { initializeAgent } from './dist/index.js';
initializeAgent().then(({ kilnClient }) => {
  console.log('Kiln client initialized successfully');
  console.log('Mock mode:', kilnClient.mockMode);
});
"
```

Expected output:
```
Kiln client initialized successfully
Mock mode: false  # or true if using mock
```

## API Usage Limits

### Typical Quotas

| Plan | Requests/Day | Tokens/Day | Cost |
|------|--------------|-----------|------|
| Free | 100 | 50,000 | $0 |
| Challenge | 1,000 | 500,000 | $0 (limited time) |
| Paid | Unlimited | Unlimited | $0.01/1k tokens |

### KillSwitch Wallet Usage

Per payment transaction:
- **proposePayment()**: ~500 tokens
- **explainReceipt()**: ~300 tokens
- **Total**: ~800 tokens/transaction

Expected daily usage:
- **10 transactions**: 8,000 tokens
- **100 transactions**: 80,000 tokens
- **1,000 transactions**: 800,000 tokens

### Optimization Tips

1. **Cache proposals**: Store LLM responses for similar intents
2. **Batch requests**: Group multiple proposals (future feature)
3. **Adjust temperature**: Lower = more deterministic, fewer tokens
4. **Skip explanations**: Only generate when user requests

## Model Details: gpt-oss-120b

### Architecture

- **Parameters**: 120 billion
- **Context**: 8,192 tokens
- **Training**: Open-source corpus + Korean language data
- **Quantization**: INT8 for NPU efficiency

### Performance

| Metric | Value |
|--------|-------|
| Latency (P50) | 150ms |
| Latency (P95) | 250ms |
| Throughput | 50 req/sec |
| Token generation | ~100 tokens/sec |

### Capabilities

✓ Payment reasoning  
✓ Merchant selection  
✓ Budget awareness  
✓ Receipt explanation  
✓ Korean/English support  

✗ Direct payment execution (security by design)  
✗ Policy override  

## Testing API Connection

### Test Script

Create `test-kiln.js`:

```javascript
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

async function testKiln() {
  try {
    const response = await axios.post(
      `${process.env.KILN_API_BASE_URL}/chat/completions`,
      {
        model: 'gpt-oss-120b',
        messages: [
          { role: 'user', content: 'Hello, test connection' }
        ],
        max_tokens: 50
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.KILN_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('✓ Connection successful');
    console.log('Response:', response.data.choices[0].message.content);
    console.log('Tokens used:', response.data.usage.total_tokens);
  } catch (error) {
    console.error('✗ Connection failed:', error.response?.data || error.message);
  }
}

testKiln();
```

Run:

```bash
cd agent
node test-kiln.js
```

## Troubleshooting

### Error: Invalid API Key

```
Error: Kiln API error: Invalid authentication token
```

**Fix**:
1. Check `.env` has correct `KILN_API_KEY`
2. Verify key hasn't expired
3. Regenerate key from dashboard

### Error: Rate Limit Exceeded

```
Error: Kiln API error: Rate limit exceeded
```

**Fix**:
1. Check quota in dashboard
2. Implement request throttling
3. Upgrade plan or wait for reset

### Error: Model Not Available

```
Error: Kiln API error: Model gpt-oss-120b not found
```

**Fix**:
1. Verify `KILN_API_BASE_URL` is correct
2. Check model name spelling
3. Confirm model access in your plan

### Connection Timeout

```
Error: timeout of 30000ms exceeded
```

**Fix**:
1. Check network connectivity
2. Increase timeout in `kiln-client.ts`
3. Try different network/VPN

## Alternative: Self-Hosted NPU

For production or high-volume use:

### Requirements

- **Hardware**: NPU with 120B model support (e.g., Furiosa Warboy)
- **RAM**: 128GB+ for model weights
- **Storage**: 250GB+ for checkpoints

### Setup

```bash
# 1. Install Furiosa SDK
curl -fsSL https://repo.furiosa.ai/setup.sh | bash

# 2. Download gpt-oss-120b weights
furiosa-model-download gpt-oss-120b

# 3. Start inference server
furiosa-serve --model gpt-oss-120b --port 8000

# 4. Update .env
KILN_API_BASE_URL=http://localhost:8000
KILN_API_KEY=local-key
```

### Benefits

- ✓ No API quotas
- ✓ Lower latency (local network)
- ✓ Data privacy
- ✗ Hardware cost
- ✗ Maintenance overhead

## Best Practices

### Security

1. **Never commit API keys** to git
2. **Use environment variables** only
3. **Rotate keys** periodically
4. **Monitor usage** for anomalies

### Efficiency

1. **Minimize calls**: Use LLM only for proposal, not enforcement
2. **Cache results**: Store proposals for common intents
3. **Optimize prompts**: Shorter prompts = fewer tokens
4. **Batch where possible**: Future enhancement

### Reliability

1. **Handle failures**: Fallback to mock mode on API error
2. **Implement retries**: With exponential backoff
3. **Monitor latency**: Alert on slow responses
4. **Set timeouts**: Fail fast on hang

## Support

### Kiln API Support

- **Email**: support@kilnapi.com
- **Docs**: https://kilnapi.com/docs
- **Discord**: https://discord.gg/kiln (if available)

### Challenge Support

- **GWDC 2026**: https://gwdc2026.kr/support
- **Furiosa Forum**: https://forum.furiosa.ai/

### KillSwitch Wallet

- **GitHub Issues**: https://github.com/rectinajh/killswitch-wallet/issues
- **Documentation**: See [ARCHITECTURE.md](ARCHITECTURE.md)

---

**Note**: Kiln API URLs and setup process are illustrative for this hackathon prototype. Actual API provider and endpoints may vary based on Furiosa Challenge B specifications.
