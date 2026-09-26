import { ImageResponse } from 'next/og'

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#05070d', borderRadius: 6 }}>
        <svg width="20" height="24" viewBox="0 0 20 24">
          <line x1="10" y1="0" x2="10" y2="5" stroke="#00c805" strokeWidth="2" />
          <rect x="3" y="5" width="14" height="14" rx="1.5" fill="#00c805" />
          <line x1="10" y1="19" x2="10" y2="24" stroke="#00c805" strokeWidth="2" />
        </svg>
      </div>
    ),
    { ...size }
  )
}
