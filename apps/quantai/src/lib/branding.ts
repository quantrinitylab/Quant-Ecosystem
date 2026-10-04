// ============================================================================
// Host-aware product branding.
// Root cause of the quanty/quantai brand mix-up: quanty.quantrinity.in and
// quantai.quantrinity.in are served by the SAME Next.js deployment
// (infra/k8s/staging-quantchat-quantai.yaml routes both hosts to the
// quant-quantai service), so the visible brand cannot be hardcoded — it must
// be derived from the request host at render time.
//   quanty.*  -> "Quanty"
//   anything else (incl. quantai.quantrinity.in) -> "QuantAI"
// ============================================================================

export type BrandName = 'Quanty' | 'QuantAI';

export function isQuantyHost(host: string | null | undefined): boolean {
  if (!host) return false;
  // Strip any port (e.g. "quanty.quantrinity.in:3020") before matching.
  const h = host.toLowerCase().split(':')[0].trim();
  return h === 'quanty' || h.startsWith('quanty.');
}

export function brandNameForHost(host: string | null | undefined): BrandName {
  return isQuantyHost(host) ? 'Quanty' : 'QuantAI';
}
