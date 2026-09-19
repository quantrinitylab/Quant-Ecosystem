/** Per-app bespoke world-class vector logo SVGs for all 16 Quant ecosystem apps */

export const appLogos: Record<string, { light: string; dark: string }> = {
  quantmail: {
    light: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 40" fill="none">
  <defs>
    <linearGradient id="qm_l_g" x1="4" y1="4" x2="36" y2="36" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#2563EB"/>
      <stop offset="100%" stop-color="#06B6D4"/>
    </linearGradient>
  </defs>
  <!-- Origami dynamic mail envelope glyph -->
  <rect x="4" y="8" width="32" height="24" rx="6" fill="url(#qm_l_g)"/>
  <path d="M4 12L20 23L36 12" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M12 28L4 20M28 28L36 20" stroke="#FFFFFF" stroke-opacity="0.6" stroke-width="1.8" stroke-linecap="round"/>
  <text x="46" y="26" font-size="16" fill="#0F172A" font-family="Inter, -apple-system, sans-serif" font-weight="700" letter-spacing="-0.4px">Quant<tspan fill="#2563EB">Mail</tspan></text>
</svg>`,
    dark: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 40" fill="none">
  <defs>
    <linearGradient id="qm_d_g" x1="4" y1="4" x2="36" y2="36" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#3B82F6"/>
      <stop offset="100%" stop-color="#22D3EE"/>
    </linearGradient>
  </defs>
  <rect x="4" y="8" width="32" height="24" rx="6" fill="url(#qm_d_g)"/>
  <path d="M4 12L20 23L36 12" stroke="#0F172A" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M12 28L4 20M28 28L36 20" stroke="#0F172A" stroke-opacity="0.6" stroke-width="1.8" stroke-linecap="round"/>
  <text x="46" y="26" font-size="16" fill="#F8FAFC" font-family="Inter, -apple-system, sans-serif" font-weight="700" letter-spacing="-0.4px">Quant<tspan fill="#60A5FA">Mail</tspan></text>
</svg>`,
  },
  quantchat: {
    light: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 40" fill="none">
  <defs>
    <linearGradient id="qc_l_g" x1="4" y1="4" x2="36" y2="36" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#10B981"/>
      <stop offset="100%" stop-color="#059669"/>
    </linearGradient>
  </defs>
  <!-- Encrypted dual speech bubble glyph -->
  <rect x="4" y="6" width="24" height="20" rx="7" fill="url(#qc_l_g)"/>
  <path d="M12 26L8 31V26H12Z" fill="url(#qc_l_g)"/>
  <rect x="16" y="14" width="20" height="16" rx="6" fill="#34D399" fill-opacity="0.9"/>
  <circle cx="16" cy="16" r="2" fill="#FFFFFF"/>
  <text x="46" y="26" font-size="16" fill="#0F172A" font-family="Inter, -apple-system, sans-serif" font-weight="700" letter-spacing="-0.4px">Quant<tspan fill="#10B981">Chat</tspan></text>
</svg>`,
    dark: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 40" fill="none">
  <defs>
    <linearGradient id="qc_d_g" x1="4" y1="4" x2="36" y2="36" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#34D399"/>
      <stop offset="100%" stop-color="#10B981"/>
    </linearGradient>
  </defs>
  <rect x="4" y="6" width="24" height="20" rx="7" fill="url(#qc_d_g)"/>
  <path d="M12 26L8 31V26H12Z" fill="url(#qc_d_g)"/>
  <rect x="16" y="14" width="20" height="16" rx="6" fill="#059669" fill-opacity="0.95"/>
  <circle cx="16" cy="16" r="2" fill="#0F172A"/>
  <text x="46" y="26" font-size="16" fill="#F8FAFC" font-family="Inter, -apple-system, sans-serif" font-weight="700" letter-spacing="-0.4px">Quant<tspan fill="#34D399">Chat</tspan></text>
</svg>`,
  },
  quantai: {
    light: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 40" fill="none">
  <defs>
    <linearGradient id="qa_l_g" x1="4" y1="4" x2="36" y2="36" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#8B5CF6"/>
      <stop offset="50%" stop-color="#EC4899"/>
      <stop offset="100%" stop-color="#F59E0B"/>
    </linearGradient>
  </defs>
  <!-- Quantum neural starburst intelligence spark -->
  <rect x="4" y="4" width="32" height="32" rx="9" fill="#F3E8FF"/>
  <path d="M20 7L22.5 16L31 18L22.5 20L20 29L17.5 20L9 18L17.5 16L20 7Z" fill="url(#qa_l_g)"/>
  <circle cx="20" cy="18" r="2" fill="#FFFFFF"/>
  <text x="46" y="26" font-size="16" fill="#0F172A" font-family="Inter, -apple-system, sans-serif" font-weight="700" letter-spacing="-0.4px">Quant<tspan fill="#8B5CF6">AI</tspan></text>
</svg>`,
    dark: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 40" fill="none">
  <defs>
    <linearGradient id="qa_d_g" x1="4" y1="4" x2="36" y2="36" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#A78BFA"/>
      <stop offset="50%" stop-color="#F472B6"/>
      <stop offset="100%" stop-color="#FBBF24"/>
    </linearGradient>
  </defs>
  <rect x="4" y="4" width="32" height="32" rx="9" fill="#2E1065"/>
  <path d="M20 7L22.5 16L31 18L22.5 20L20 29L17.5 20L9 18L17.5 16L20 7Z" fill="url(#qa_d_g)"/>
  <circle cx="20" cy="18" r="2" fill="#FFFFFF"/>
  <text x="46" y="26" font-size="16" fill="#F8FAFC" font-family="Inter, -apple-system, sans-serif" font-weight="700" letter-spacing="-0.4px">Quant<tspan fill="#C084FC">AI</tspan></text>
</svg>`,
  },
  quantcalendar: {
    light: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 40" fill="none">
  <defs>
    <linearGradient id="qcal_l_g" x1="4" y1="4" x2="36" y2="36" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#F97316"/>
      <stop offset="100%" stop-color="#EF4444"/>
    </linearGradient>
  </defs>
  <!-- Precision temporal schedule calendar ring -->
  <rect x="5" y="7" width="30" height="26" rx="7" fill="url(#qcal_l_g)"/>
  <rect x="5" y="7" width="30" height="9" rx="4" fill="#C2410C"/>
  <circle cx="12" cy="6" r="2" fill="#9A3412"/>
  <circle cx="28" cy="6" r="2" fill="#9A3412"/>
  <circle cx="20" cy="23" r="3" fill="#FFFFFF"/>
  <text x="46" y="26" font-size="16" fill="#0F172A" font-family="Inter, -apple-system, sans-serif" font-weight="700" letter-spacing="-0.4px">Quant<tspan fill="#F97316">Calendar</tspan></text>
</svg>`,
    dark: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 40" fill="none">
  <defs>
    <linearGradient id="qcal_d_g" x1="4" y1="4" x2="36" y2="36" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#FB923C"/>
      <stop offset="100%" stop-color="#F87171"/>
    </linearGradient>
  </defs>
  <rect x="5" y="7" width="30" height="26" rx="7" fill="url(#qcal_d_g)"/>
  <rect x="5" y="7" width="30" height="9" rx="4" fill="#EA580C"/>
  <circle cx="12" cy="6" r="2" fill="#C2410C"/>
  <circle cx="28" cy="6" r="2" fill="#C2410C"/>
  <circle cx="20" cy="23" r="3" fill="#0F172A"/>
  <text x="46" y="26" font-size="16" fill="#F8FAFC" font-family="Inter, -apple-system, sans-serif" font-weight="700" letter-spacing="-0.4px">Quant<tspan fill="#FB923C">Calendar</tspan></text>
</svg>`,
  },
  quantdocs: {
    light: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 40" fill="none">
  <defs>
    <linearGradient id="qd_l_g" x1="4" y1="4" x2="36" y2="36" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#14B8A6"/>
      <stop offset="100%" stop-color="#0D9488"/>
    </linearGradient>
  </defs>
  <!-- Realtime collaborative crystal doc page -->
  <path d="M8 6C8 4.895 8.895 4 10 4H24L32 12V34C32 35.105 31.105 36 30 36H10C8.895 36 8 35.105 8 34V6Z" fill="url(#qd_l_g)"/>
  <path d="M24 4V12H32" fill="#0F766E"/>
  <line x1="13" y1="18" x2="27" y2="18" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round"/>
  <line x1="13" y1="23" x2="25" y2="23" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round"/>
  <line x1="13" y1="28" x2="20" y2="28" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round"/>
  <text x="46" y="26" font-size="16" fill="#0F172A" font-family="Inter, -apple-system, sans-serif" font-weight="700" letter-spacing="-0.4px">Quant<tspan fill="#14B8A6">Docs</tspan></text>
</svg>`,
    dark: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 40" fill="none">
  <defs>
    <linearGradient id="qd_d_g" x1="4" y1="4" x2="36" y2="36" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#2DD4BF"/>
      <stop offset="100%" stop-color="#14B8A6"/>
    </linearGradient>
  </defs>
  <path d="M8 6C8 4.895 8.895 4 10 4H24L32 12V34C32 35.105 31.105 36 30 36H10C8.895 36 8 35.105 8 34V6Z" fill="url(#qd_d_g)"/>
  <path d="M24 4V12H32" fill="#115E59"/>
  <line x1="13" y1="18" x2="27" y2="18" stroke="#0F172A" stroke-width="2" stroke-linecap="round"/>
  <line x1="13" y1="23" x2="25" y2="23" stroke="#0F172A" stroke-width="2" stroke-linecap="round"/>
  <line x1="13" y1="28" x2="20" y2="28" stroke="#0F172A" stroke-width="2" stroke-linecap="round"/>
  <text x="46" y="26" font-size="16" fill="#F8FAFC" font-family="Inter, -apple-system, sans-serif" font-weight="700" letter-spacing="-0.4px">Quant<tspan fill="#2DD4BF">Docs</tspan></text>
</svg>`,
  },
  quantdrive: {
    light: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 40" fill="none">
  <defs>
    <linearGradient id="qdr_l_g" x1="4" y1="4" x2="36" y2="36" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#6366F1"/>
      <stop offset="100%" stop-color="#4F46E5"/>
    </linearGradient>
  </defs>
  <!-- Isometric 3D holographic quantum storage cube -->
  <path d="M20 5L34 13V27L20 35L6 27V13L20 5Z" fill="url(#qdr_l_g)"/>
  <path d="M20 5L34 13L20 21L6 13L20 5Z" fill="#818CF8"/>
  <path d="M20 21V35L6 27V13L20 21Z" fill="#4338CA"/>
  <circle cx="20" cy="20" r="3" fill="#FFFFFF"/>
  <text x="46" y="26" font-size="16" fill="#0F172A" font-family="Inter, -apple-system, sans-serif" font-weight="700" letter-spacing="-0.4px">Quant<tspan fill="#6366F1">Drive</tspan></text>
</svg>`,
    dark: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 40" fill="none">
  <defs>
    <linearGradient id="qdr_d_g" x1="4" y1="4" x2="36" y2="36" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#818CF8"/>
      <stop offset="100%" stop-color="#6366F1"/>
    </linearGradient>
  </defs>
  <path d="M20 5L34 13V27L20 35L6 27V13L20 5Z" fill="url(#qdr_d_g)"/>
  <path d="M20 5L34 13L20 21L6 13L20 5Z" fill="#A5B4FC"/>
  <path d="M20 21V35L6 27V13L20 21Z" fill="#4F46E5"/>
  <circle cx="20" cy="20" r="3" fill="#0F172A"/>
  <text x="46" y="26" font-size="16" fill="#F8FAFC" font-family="Inter, -apple-system, sans-serif" font-weight="700" letter-spacing="-0.4px">Quant<tspan fill="#A5B4FC">Drive</tspan></text>
</svg>`,
  },
  quantmeet: {
    light: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 40" fill="none">
  <defs>
    <linearGradient id="qm_l_meet" x1="4" y1="4" x2="36" y2="36" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#EF4444"/>
      <stop offset="100%" stop-color="#DC2626"/>
    </linearGradient>
  </defs>
  <!-- Telepresence video portal camera glyph -->
  <rect x="5" y="8" width="22" height="24" rx="6" fill="url(#qm_l_meet)"/>
  <path d="M27 15L35 10V30L27 25V15Z" fill="url(#qm_l_meet)"/>
  <circle cx="16" cy="20" r="4" fill="#FFFFFF"/>
  <text x="46" y="26" font-size="16" fill="#0F172A" font-family="Inter, -apple-system, sans-serif" font-weight="700" letter-spacing="-0.4px">Quant<tspan fill="#EF4444">Meet</tspan></text>
</svg>`,
    dark: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 40" fill="none">
  <defs>
    <linearGradient id="qm_d_meet" x1="4" y1="4" x2="36" y2="36" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#F87171"/>
      <stop offset="100%" stop-color="#EF4444"/>
    </linearGradient>
  </defs>
  <rect x="5" y="8" width="22" height="24" rx="6" fill="url(#qm_d_meet)"/>
  <path d="M27 15L35 10V30L27 25V15Z" fill="url(#qm_d_meet)"/>
  <circle cx="16" cy="20" r="4" fill="#0F172A"/>
  <text x="46" y="26" font-size="16" fill="#F8FAFC" font-family="Inter, -apple-system, sans-serif" font-weight="700" letter-spacing="-0.4px">Quant<tspan fill="#F87171">Meet</tspan></text>
</svg>`,
  },
  quantneon: {
    light: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 40" fill="none">
  <defs>
    <linearGradient id="qn_l_g" x1="4" y1="4" x2="36" y2="36" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#EC4899"/>
      <stop offset="100%" stop-color="#8B5CF6"/>
    </linearGradient>
  </defs>
  <!-- Creative camera iris / Reels aperture -->
  <rect x="4" y="4" width="32" height="32" rx="10" fill="url(#qn_l_g)"/>
  <rect x="9" y="9" width="22" height="22" rx="6" stroke="#FFFFFF" stroke-width="2.5" fill="none"/>
  <circle cx="20" cy="20" r="5" stroke="#FFFFFF" stroke-width="2.5" fill="none"/>
  <circle cx="26" cy="14" r="1.5" fill="#FFFFFF"/>
  <text x="46" y="26" font-size="16" fill="#0F172A" font-family="Inter, -apple-system, sans-serif" font-weight="700" letter-spacing="-0.4px">Quant<tspan fill="#EC4899">Gram</tspan></text>
</svg>`,
    dark: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 40" fill="none">
  <defs>
    <linearGradient id="qn_d_g" x1="4" y1="4" x2="36" y2="36" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#F472B6"/>
      <stop offset="100%" stop-color="#A78BFA"/>
    </linearGradient>
  </defs>
  <rect x="4" y="4" width="32" height="32" rx="10" fill="url(#qn_d_g)"/>
  <rect x="9" y="9" width="22" height="22" rx="6" stroke="#0F172A" stroke-width="2.5" fill="none"/>
  <circle cx="20" cy="20" r="5" stroke="#0F172A" stroke-width="2.5" fill="none"/>
  <circle cx="26" cy="14" r="1.5" fill="#0F172A"/>
  <text x="46" y="26" font-size="16" fill="#F8FAFC" font-family="Inter, -apple-system, sans-serif" font-weight="700" letter-spacing="-0.4px">Quant<tspan fill="#F472B6">Gram</tspan></text>
</svg>`,
  },
  quantsync: {
    light: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 40" fill="none">
  <defs>
    <linearGradient id="qs_l_g" x1="4" y1="4" x2="36" y2="36" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#06B6D4"/>
      <stop offset="100%" stop-color="#0284C7"/>
    </linearGradient>
  </defs>
  <!-- Harmonic broadcast wave ripple glyph -->
  <circle cx="20" cy="20" r="16" fill="url(#qs_l_g)"/>
  <path d="M12 20C12 15.58 15.58 12 20 12M15 20C15 17.24 17.24 15 20 15M20 20H20.01" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round"/>
  <path d="M28 20C28 24.42 24.42 28 20 28M25 20C25 22.76 22.76 25 20 25" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round"/>
  <text x="46" y="26" font-size="16" fill="#0F172A" font-family="Inter, -apple-system, sans-serif" font-weight="700" letter-spacing="-0.4px">Quant<tspan fill="#06B6D4">Wave</tspan></text>
</svg>`,
    dark: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 40" fill="none">
  <defs>
    <linearGradient id="qs_d_g" x1="4" y1="4" x2="36" y2="36" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#22D3EE"/>
      <stop offset="100%" stop-color="#38BDF8"/>
    </linearGradient>
  </defs>
  <circle cx="20" cy="20" r="16" fill="url(#qs_d_g)"/>
  <path d="M12 20C12 15.58 15.58 12 20 12M15 20C15 17.24 17.24 15 20 15M20 20H20.01" stroke="#0F172A" stroke-width="2.5" stroke-linecap="round"/>
  <path d="M28 20C28 24.42 24.42 28 20 28M25 20C25 22.76 22.76 25 20 25" stroke="#0F172A" stroke-width="2.5" stroke-linecap="round"/>
  <text x="46" y="26" font-size="16" fill="#F8FAFC" font-family="Inter, -apple-system, sans-serif" font-weight="700" letter-spacing="-0.4px">Quant<tspan fill="#22D3EE">Wave</tspan></text>
</svg>`,
  },
  quantube: {
    light: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 40" fill="none">
  <defs>
    <linearGradient id="qt_l_g" x1="4" y1="4" x2="36" y2="36" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#F43F5E"/>
      <stop offset="100%" stop-color="#BE123C"/>
    </linearGradient>
  </defs>
  <!-- Supersonic 3D play prism button -->
  <rect x="4" y="7" width="32" height="26" rx="8" fill="url(#qt_l_g)"/>
  <path d="M16 13L26 20L16 27V13Z" fill="#FFFFFF"/>
  <text x="46" y="26" font-size="16" fill="#0F172A" font-family="Inter, -apple-system, sans-serif" font-weight="700" letter-spacing="-0.4px">Quan<tspan fill="#F43F5E">Tube</tspan></text>
</svg>`,
    dark: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 40" fill="none">
  <defs>
    <linearGradient id="qt_d_g" x1="4" y1="4" x2="36" y2="36" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#FB7185"/>
      <stop offset="100%" stop-color="#F43F5E"/>
    </linearGradient>
  </defs>
  <rect x="4" y="7" width="32" height="26" rx="8" fill="url(#qt_d_g)"/>
  <path d="M16 13L26 20L16 27V13Z" fill="#0F172A"/>
  <text x="46" y="26" font-size="16" fill="#F8FAFC" font-family="Inter, -apple-system, sans-serif" font-weight="700" letter-spacing="-0.4px">Quan<tspan fill="#FB7185">Tube</tspan></text>
</svg>`,
  },
  quantmax: {
    light: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 40" fill="none">
  <defs>
    <linearGradient id="qm_l_max" x1="4" y1="4" x2="36" y2="36" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#F59E0B"/>
      <stop offset="100%" stop-color="#EA580C"/>
    </linearGradient>
  </defs>
  <!-- Flame passion spark & velocity glyph -->
  <rect x="4" y="4" width="32" height="32" rx="9" fill="url(#qm_l_max)"/>
  <path d="M20 7C20 7 24 13 24 17C24 20 21.5 22 20 22C18.5 22 16 20 16 17C16 15 17 13 17 13C17 13 13 16 13 21C13 25.4 16.1 29 20.5 29C24.9 29 28 25.4 28 21C28 15 20 7 20 7Z" fill="#FFFFFF"/>
  <text x="46" y="26" font-size="16" fill="#0F172A" font-family="Inter, -apple-system, sans-serif" font-weight="700" letter-spacing="-0.4px">Quant<tspan fill="#F59E0B">Max</tspan></text>
</svg>`,
    dark: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 40" fill="none">
  <defs>
    <linearGradient id="qm_d_max" x1="4" y1="4" x2="36" y2="36" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#FBBF24"/>
      <stop offset="100%" stop-color="#F59E0B"/>
    </linearGradient>
  </defs>
  <rect x="4" y="4" width="32" height="32" rx="9" fill="url(#qm_d_max)"/>
  <path d="M20 7C20 7 24 13 24 17C24 20 21.5 22 20 22C18.5 22 16 20 16 17C16 15 17 13 17 13C17 13 13 16 13 21C13 25.4 16.1 29 20.5 29C24.9 29 28 25.4 28 21C28 15 20 7 20 7Z" fill="#0F172A"/>
  <text x="46" y="26" font-size="16" fill="#F8FAFC" font-family="Inter, -apple-system, sans-serif" font-weight="700" letter-spacing="-0.4px">Quant<tspan fill="#FBBF24">Max</tspan></text>
</svg>`,
  },
  quantedits: {
    light: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 40" fill="none">
  <defs>
    <linearGradient id="qe_l_g" x1="4" y1="4" x2="36" y2="36" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#7C3AED"/>
      <stop offset="100%" stop-color="#A855F7"/>
    </linearGradient>
  </defs>
  <!-- Film reel frame & generative magic wand -->
  <rect x="4" y="6" width="32" height="28" rx="6" fill="url(#qe_l_g)"/>
  <rect x="8" y="10" width="4" height="4" rx="1" fill="#FFFFFF"/>
  <rect x="28" y="10" width="4" height="4" rx="1" fill="#FFFFFF"/>
  <rect x="8" y="26" width="4" height="4" rx="1" fill="#FFFFFF"/>
  <rect x="28" y="26" width="4" height="4" rx="1" fill="#FFFFFF"/>
  <path d="M16 16L24 24M24 16L16 24" stroke="#FBBF24" stroke-width="2.5" stroke-linecap="round"/>
  <text x="46" y="26" font-size="16" fill="#0F172A" font-family="Inter, -apple-system, sans-serif" font-weight="700" letter-spacing="-0.4px">Quant<tspan fill="#7C3AED">Cooks</tspan></text>
</svg>`,
    dark: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 40" fill="none">
  <defs>
    <linearGradient id="qe_d_g" x1="4" y1="4" x2="36" y2="36" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#A855F7"/>
      <stop offset="100%" stop-color="#C084FC"/>
    </linearGradient>
  </defs>
  <rect x="4" y="6" width="32" height="28" rx="6" fill="url(#qe_d_g)"/>
  <rect x="8" y="10" width="4" height="4" rx="1" fill="#0F172A"/>
  <rect x="28" y="10" width="4" height="4" rx="1" fill="#0F172A"/>
  <rect x="8" y="26" width="4" height="4" rx="1" fill="#0F172A"/>
  <rect x="28" y="26" width="4" height="4" rx="1" fill="#0F172A"/>
  <path d="M16 16L24 24M24 16L16 24" stroke="#FDE047" stroke-width="2.5" stroke-linecap="round"/>
  <text x="46" y="26" font-size="16" fill="#F8FAFC" font-family="Inter, -apple-system, sans-serif" font-weight="700" letter-spacing="-0.4px">Quant<tspan fill="#C084FC">Cooks</tspan></text>
</svg>`,
  },
  quantads: {
    light: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 40" fill="none">
  <defs>
    <linearGradient id="qad_l_g" x1="4" y1="4" x2="36" y2="36" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#059669"/>
      <stop offset="100%" stop-color="#10B981"/>
    </linearGradient>
  </defs>
  <!-- Auction targeting radar & revenue growth vector -->
  <circle cx="20" cy="20" r="16" fill="url(#qad_l_g)"/>
  <circle cx="20" cy="20" r="8" stroke="#FFFFFF" stroke-width="1.8" fill="none"/>
  <path d="M15 25L25 15M25 15H19M25 15V21" stroke="#FDE047" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="46" y="26" font-size="16" fill="#0F172A" font-family="Inter, -apple-system, sans-serif" font-weight="700" letter-spacing="-0.4px">Quant<tspan fill="#059669">Ads</tspan></text>
</svg>`,
    dark: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 40" fill="none">
  <defs>
    <linearGradient id="qad_d_g" x1="4" y1="4" x2="36" y2="36" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#34D399"/>
      <stop offset="100%" stop-color="#059669"/>
    </linearGradient>
  </defs>
  <circle cx="20" cy="20" r="16" fill="url(#qad_d_g)"/>
  <circle cx="20" cy="20" r="8" stroke="#0F172A" stroke-width="1.8" fill="none"/>
  <path d="M15 25L25 15M25 15H19M25 15V21" stroke="#FDE047" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="46" y="26" font-size="16" fill="#F8FAFC" font-family="Inter, -apple-system, sans-serif" font-weight="700" letter-spacing="-0.4px">Quant<tspan fill="#34D399">Ads</tspan></text>
</svg>`,
  },
  marketing: {
    light: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 40" fill="none">
  <rect x="4" y="6" width="32" height="28" rx="8" fill="#64748B"/>
  <path d="M13 16H16L22 12V28L16 24H13C12.4 24 12 23.6 12 23V17C12 16.4 12.4 16 13 16Z" fill="#FFFFFF"/>
  <path d="M25 17C26 18 26.5 19 26.5 20C26.5 21 26 22 25 23" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round"/>
  <text x="46" y="26" font-size="16" fill="#0F172A" font-family="Inter, -apple-system, sans-serif" font-weight="700" letter-spacing="-0.4px">Quant<tspan fill="#64748B">Portal</tspan></text>
</svg>`,
    dark: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 40" fill="none">
  <rect x="4" y="6" width="32" height="28" rx="8" fill="#94A3B8"/>
  <path d="M13 16H16L22 12V28L16 24H13C12.4 24 12 23.6 12 23V17C12 16.4 12.4 16 13 16Z" fill="#0F172A"/>
  <path d="M25 17C26 18 26.5 19 26.5 20C26.5 21 26 22 25 23" stroke="#0F172A" stroke-width="2" stroke-linecap="round"/>
  <text x="46" y="26" font-size="16" fill="#F8FAFC" font-family="Inter, -apple-system, sans-serif" font-weight="700" letter-spacing="-0.4px">Quant<tspan fill="#94A3B8">Portal</tspan></text>
</svg>`,
  },
  quantmaps: {
    light: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 40" fill="none">
  <defs>
    <linearGradient id="qmp_l_g" x1="4" y1="4" x2="36" y2="36" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#22C55E"/>
      <stop offset="100%" stop-color="#16A34A"/>
    </linearGradient>
  </defs>
  <!-- Geolocation navigation map beacon -->
  <rect x="4" y="6" width="32" height="28" rx="8" fill="url(#qmp_l_g)"/>
  <path d="M20 11C16.7 11 14 13.7 14 17C14 21.5 20 28 20 28C20 28 26 21.5 26 17C26 13.7 23.3 11 20 11ZM20 19.5C18.6 19.5 17.5 18.4 17.5 17C17.5 15.6 18.6 14.5 20 14.5C21.4 14.5 22.5 15.6 22.5 17C22.5 18.4 21.4 19.5 20 19.5Z" fill="#FFFFFF"/>
  <text x="46" y="26" font-size="16" fill="#0F172A" font-family="Inter, -apple-system, sans-serif" font-weight="700" letter-spacing="-0.4px">Quant<tspan fill="#22C55E">Maps</tspan></text>
</svg>`,
    dark: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 40" fill="none">
  <defs>
    <linearGradient id="qmp_d_g" x1="4" y1="4" x2="36" y2="36" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#4ADE80"/>
      <stop offset="100%" stop-color="#22C55E"/>
    </linearGradient>
  </defs>
  <rect x="4" y="6" width="32" height="28" rx="8" fill="url(#qmp_d_g)"/>
  <path d="M20 11C16.7 11 14 13.7 14 17C14 21.5 20 28 20 28C20 28 26 21.5 26 17C26 13.7 23.3 11 20 11ZM20 19.5C18.6 19.5 17.5 18.4 17.5 17C17.5 15.6 18.6 14.5 20 14.5C21.4 14.5 22.5 15.6 22.5 17C22.5 18.4 21.4 19.5 20 19.5Z" fill="#0F172A"/>
  <text x="46" y="26" font-size="16" fill="#F8FAFC" font-family="Inter, -apple-system, sans-serif" font-weight="700" letter-spacing="-0.4px">Quant<tspan fill="#4ADE80">Maps</tspan></text>
</svg>`,
  },
  quantphotos: {
    light: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 40" fill="none">
  <defs>
    <linearGradient id="qph_l_g" x1="4" y1="4" x2="36" y2="36" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#A855F7"/>
      <stop offset="100%" stop-color="#7E22CE"/>
    </linearGradient>
  </defs>
  <!-- Chromatic gallery aperture flower -->
  <circle cx="20" cy="20" r="16" fill="url(#qph_l_g)"/>
  <circle cx="20" cy="14" r="5" fill="#C084FC" fill-opacity="0.8"/>
  <circle cx="25" cy="18" r="5" fill="#E879F9" fill-opacity="0.8"/>
  <circle cx="23" cy="24" r="5" fill="#F472B6" fill-opacity="0.8"/>
  <circle cx="17" cy="24" r="5" fill="#A78BFA" fill-opacity="0.8"/>
  <circle cx="15" cy="18" r="5" fill="#818CF8" fill-opacity="0.8"/>
  <circle cx="20" cy="20" r="2.5" fill="#FFFFFF"/>
  <text x="46" y="26" font-size="16" fill="#0F172A" font-family="Inter, -apple-system, sans-serif" font-weight="700" letter-spacing="-0.4px">Quant<tspan fill="#A855F7">Photos</tspan></text>
</svg>`,
    dark: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 40" fill="none">
  <defs>
    <linearGradient id="qph_d_g" x1="4" y1="4" x2="36" y2="36" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#C084FC"/>
      <stop offset="100%" stop-color="#A855F7"/>
    </linearGradient>
  </defs>
  <circle cx="20" cy="20" r="16" fill="url(#qph_d_g)"/>
  <circle cx="20" cy="14" r="5" fill="#E879F9" fill-opacity="0.8"/>
  <circle cx="25" cy="18" r="5" fill="#F472B6" fill-opacity="0.8"/>
  <circle cx="23" cy="24" r="5" fill="#A78BFA" fill-opacity="0.8"/>
  <circle cx="17" cy="24" r="5" fill="#818CF8" fill-opacity="0.8"/>
  <circle cx="15" cy="18" r="5" fill="#C084FC" fill-opacity="0.8"/>
  <circle cx="20" cy="20" r="2.5" fill="#0F172A"/>
  <text x="46" y="26" font-size="16" fill="#F8FAFC" font-family="Inter, -apple-system, sans-serif" font-weight="700" letter-spacing="-0.4px">Quant<tspan fill="#C084FC">Photos</tspan></text>
</svg>`,
  },
};
