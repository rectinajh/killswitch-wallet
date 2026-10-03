import { ethers } from 'ethers';

/** Circle USDC on Arbitrum Sepolia — stand-in when Paxos USDG is unavailable on this testnet. */
export const CIRCLE_USDC_ARB_SEPOLIA = '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d';

const ERC20_ABI = [
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
];

export interface SettlementAsset {
  /** ETH or ERC-20 address (checksummed) */
  token: string;
  isErc20: boolean;
  decimals: number;
  symbol: string;
}

export function configuredPaymentLabel(): string {
  return (process.env.PAYMENT_TOKEN || 'ETH').trim().toUpperCase() || 'ETH';
}

/** Token used for *new* grants when PAYMENT_TOKEN=USDC|USDG (session may still be ETH). */
export function configuredErc20Address(): string | null {
  const label = configuredPaymentLabel();
  const usdg = process.env.USDG_TOKEN_ADDRESS?.trim();
  const usdc = process.env.USDC_TOKEN_ADDRESS?.trim();
  if (usdg) return ethers.getAddress(usdg);
  if (usdc) return ethers.getAddress(usdc);
  if (label === 'USDC') return CIRCLE_USDC_ARB_SEPOLIA;
  if (label === 'USDG' && usdg) return ethers.getAddress(usdg);
  return null;
}

export function isNativeToken(token: string | null | undefined): boolean {
  return !token || token === ethers.ZeroAddress;
}

export async function readTokenMeta(
  provider: ethers.Provider,
  token: string
): Promise<SettlementAsset> {
  if (isNativeToken(token)) {
    return { token: ethers.ZeroAddress, isErc20: false, decimals: 18, symbol: 'ETH' };
  }
  const c = new ethers.Contract(token, ERC20_ABI, provider);
  let decimals = 6;
  let symbol = configuredPaymentLabel() === 'ETH' ? 'USDC' : configuredPaymentLabel();
  try {
    decimals = Number(await c.decimals());
  } catch {
    /* Circle-style 6 */
  }
  try {
    symbol = String(await c.symbol());
  } catch {
    /* keep label */
  }
  return { token: ethers.getAddress(token), isErc20: true, decimals, symbol };
}

export function parseUnitsAmount(amount: string, decimals: number): bigint {
  return ethers.parseUnits(String(amount).replace(/[^0-9.]/g, '') || '0', decimals);
}

export function formatUnitsAmount(amount: bigint, decimals: number): string {
  return ethers.formatUnits(amount, decimals);
}

export const ERC20_MIN_ABI = ERC20_ABI;
