import type { IconProps } from './index';
export function PlusIcon({ size = 'md' }: IconProps) { const pixels = { sm: 16, md: 20, lg: 24 }[size]; return <svg width={pixels} height={pixels} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>; }
