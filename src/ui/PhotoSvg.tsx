/** «Фото платёжки»: баран на фоне Арарата. */
export function PhotoSvg() {
  return (
    <svg viewBox="0 0 220 150" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Платёжка (баран на фоне Арарата)">
      <rect width="220" height="150" fill="#9fd3f5" />
      <polygon points="0,110 70,35 125,110" fill="#8b7aa8" /><polygon points="55,51 70,35 86,52 75,49 66,55" fill="#fff" />
      <polygon points="90,110 160,20 220,110" fill="#7a6a98" /><polygon points="143,42 160,20 178,43 166,39 155,46" fill="#fff" />
      <rect y="108" width="220" height="42" fill="#8cc265" />
      <g transform="translate(70,82)">
        <rect x="12" y="30" width="5" height="16" fill="#333" /><rect x="40" y="30" width="5" height="16" fill="#333" />
        <circle cx="15" cy="22" r="12" fill="#fff" /><circle cx="30" cy="16" r="14" fill="#fff" /><circle cx="44" cy="22" r="12" fill="#fff" />
        <circle cx="28" cy="28" r="12" fill="#fff" />
        <ellipse cx="58" cy="14" rx="9" ry="11" fill="#333" /><circle cx="61" cy="11" r="1.6" fill="#fff" />
        <path d="M51 7 q-8 -2 -6 7" stroke="#b58b4c" strokeWidth="3" fill="none" />
      </g>
      <text x="110" y="143" fontSize="11" textAnchor="middle" fill="#2d4a1e" fontFamily="sans-serif">ОПЛАЧЕНО ✅ (честно)</text>
    </svg>
  )
}
