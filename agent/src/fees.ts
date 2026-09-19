/**
 * Fee helpers mirroring SessionPolicy.sol proposeOrPay:
 *   fee = (amount * 2) / 100   // 2%
 * Budget check uses amount + fee (totalCost).
 */
export const FEE_BPS = 200n; // 2% = 200 basis points of 10_000
export const FEE_DENOMINATOR = 10_000n;
export const FEE_PERCENT = 2;

/** On-chain fee in wei: (amount * 2) / 100 */
export function feeWei(amountWei: bigint): bigint {
  return (amountWei * 2n) / 100n;
}

/** Total cost charged against session budget: amount + 2% fee */
export function totalCostWei(amountWei: bigint): bigint {
  return amountWei + feeWei(amountWei);
}

/** Human-readable fee percent label */
export function feePercentLabel(): string {
  return `${FEE_PERCENT}%`;
}
