// Navigation + shell icon set: 20px grid, 1.5px strokes, squared terminals.
// Deliberately technical/instrument-like to match the mission-control shell.
type P = { size?: number; className?: string }
const base = (size: number) => ({
  width: size, height: size, viewBox: '0 0 20 20', fill: 'none',
  stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'square' as const,
  'aria-hidden': true,
})

export const HomeIcon = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}><path d="M3.5 8.5 10 3l6.5 5.5V17h-4.5v-4.5h-4V17H3.5V8.5Z"/></svg>
)
export const ResearchIcon = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}><circle cx="9" cy="9" r="5.5"/><path d="M13.2 13.2 17 17M9 6.5v5M6.5 9h5"/></svg>
)
export const PortfolioIcon = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}><path d="M3 14.5 7 9l3.5 3L17 4.5"/><path d="M3 17h14M13.5 4.5H17V8"/></svg>
)
export const ReportIcon = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}><path d="M5 2.5h7L16 6.5V17.5H5V2.5Z"/><path d="M12 2.5V6.5h4M7.5 10h5M7.5 13h5"/></svg>
)
export const SignalIcon = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}><path d="M2 11h3l2-5 3 8 2.5-6 1.5 3h4"/></svg>
)
export const BellIcon = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}><path d="M10 3a5 5 0 0 1 5 5v3l1.5 2.5h-13L5 11V8a5 5 0 0 1 5-5ZM8 16.5a2 2 0 0 0 4 0"/></svg>
)
export const UserIcon = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}><circle cx="10" cy="6.5" r="3.5"/><path d="M3.5 17c.8-3 3.4-4.5 6.5-4.5s5.7 1.5 6.5 4.5"/></svg>
)
export const SignOutIcon = ({ size = 16, className }: P) => (
  <svg {...base(size)} className={className}><path d="M12.5 6.5V3.5h-9v13h9v-3M8 10h9M14.5 7.5 17 10l-2.5 2.5"/></svg>
)
export const MenuIcon = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}><path d="M3 5.5h14M3 10h14M3 14.5h14"/></svg>
)
export const LogoMark = ({ size = 22, className }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    <path d="M3 3h4M3 3v4M21 3h-4M21 3v4M3 21h4M3 21v-4M21 21h-4M21 21v-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square"/>
    <path d="M6.5 14.5 10 10l2.8 2.4 4.7-5.4" stroke="var(--accent, currentColor)" strokeWidth="1.8" strokeLinecap="square"/>
  </svg>
)
