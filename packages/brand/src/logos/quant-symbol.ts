/** Quant symbol/monogram SVG - high-precision geometric Q Mobius quantum knot with radiant gradients */

export const quantSymbolLight = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none">
  <defs>
    <linearGradient id="q_sym_light_grad" x1="4" y1="4" x2="44" y2="44" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#4F46E5"/>
      <stop offset="50%" stop-color="#6366F1"/>
      <stop offset="100%" stop-color="#06B6D4"/>
    </linearGradient>
    <linearGradient id="q_sym_tail_light" x1="26" y1="26" x2="44" y2="44" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#6366F1"/>
      <stop offset="100%" stop-color="#3B82F6"/>
    </linearGradient>
  </defs>
  <path d="M24 6C14.059 6 6 14.059 6 24C6 33.941 14.059 42 24 42C28.243 42 32.136 40.528 35.19 38.071L30.938 33.819C28.989 35.185 26.591 36 24 36C17.373 36 12 30.627 12 24C12 17.373 17.373 12 24 12C30.627 12 36 17.373 36 24C36 26.241 35.385 28.339 34.316 30.134L39.047 34.865C41.053 31.761 42 28.026 42 24C42 14.059 33.941 6 24 6Z" fill="url(#q_sym_light_grad)"/>
  <path d="M27 27L42 42M42 36V42H36" stroke="url(#q_sym_tail_light)" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="24" cy="24" r="3.5" fill="#4F46E5" fill-opacity="0.85"/>
</svg>`;

export const quantSymbolDark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none">
  <defs>
    <linearGradient id="q_sym_dark_grad" x1="4" y1="4" x2="44" y2="44" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#818CF8"/>
      <stop offset="50%" stop-color="#A5B4FC"/>
      <stop offset="100%" stop-color="#22D3EE"/>
    </linearGradient>
    <linearGradient id="q_sym_tail_dark" x1="26" y1="26" x2="44" y2="44" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#A5B4FC"/>
      <stop offset="100%" stop-color="#60A5FA"/>
    </linearGradient>
  </defs>
  <path d="M24 6C14.059 6 6 14.059 6 24C6 33.941 14.059 42 24 42C28.243 42 32.136 40.528 35.19 38.071L30.938 33.819C28.989 35.185 26.591 36 24 36C17.373 36 12 30.627 12 24C12 17.373 17.373 12 24 12C30.627 12 36 17.373 36 24C36 26.241 35.385 28.339 34.316 30.134L39.047 34.865C41.053 31.761 42 28.026 42 24C42 14.059 33.941 6 24 6Z" fill="url(#q_sym_dark_grad)"/>
  <path d="M27 27L42 42M42 36V42H36" stroke="url(#q_sym_tail_dark)" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="24" cy="24" r="3.5" fill="#22D3EE" fill-opacity="0.95"/>
</svg>`;
