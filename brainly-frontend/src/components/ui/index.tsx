import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { ArrowUpRight, BookOpen, FileText, Globe, LoaderCircle, MessageSquare, Play, SearchX, X } from 'lucide-react';
export function Button({ children, variant = 'primary', busy = false, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; busy?: boolean }) {
  return <button type="button" className={`button ${variant} ${className}`} {...props} disabled={props.disabled || busy}>{busy && <LoaderCircle size={16} className="spin" />}{children}</button>;
}
export function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null); const titleId = useId();
  useEffect(() => { const previous = document.activeElement; ref.current?.showModal(); return () => { if (previous instanceof HTMLElement) previous.focus(); }; }, []);
  return <dialog ref={ref} aria-labelledby={titleId} className={`modal ${wide ? 'wide' : ''}`} onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) { const box = e.currentTarget.getBoundingClientRect(); if (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom) onClose(); } }}><div className="modal-heading"><h2 id={titleId}>{title}</h2><Button variant="ghost" aria-label="Close dialog" onClick={onClose}><X size={20}/></Button></div>{children}</dialog>;
}
export function Empty({ title, text, action, icon = <BookOpen size={26}/> }: { title: string; text: string; action?: ReactNode; icon?: ReactNode }) { return <div className="empty"><span className="empty-icon">{icon}</span><h3>{title}</h3><p>{text}</p>{action}</div>; }
export function ErrorState({ error, retry }: { error: Error | null; retry?: () => void }) { return <div className="error-state" role="alert"><SearchX size={22}/><div><strong>Something needs your attention</strong><p>{error?.message || 'Unable to load this page.'}</p></div>{retry && <Button variant="secondary" onClick={retry}>Try again</Button>}</div>; }
export function Skeleton({ cards = 3 }: { cards?: number }) { return <div className="card-grid" aria-label="Loading content" aria-busy="true">{Array.from({ length: cards }, (_, i) => <div key={i} className="skeleton-card"><div className="skeleton-line short"/><div className="skeleton-line"/><div className="skeleton-line"/><div className="skeleton-line short"/></div>)}</div>; }
export function TypeIcon({ type, size = 18 }: { type: string; size?: number }) { const Icon = type === 'video' || type === 'youtube' ? Play : type === 'note' ? FileText : type === 'tweet' || type === 'twitter' ? MessageSquare : type === 'article' ? BookOpen : Globe; return <Icon size={size}/>; }
export function ExternalLink({ href, children = 'Open source' }: { href: string; children?: ReactNode }) { if (!/^https?:\/\//i.test(href)) return null; return <a className="button secondary" href={href} target="_blank" rel="noopener noreferrer">{children}<ArrowUpRight size={15}/></a>; }
export function PageTitle({ eyebrow, title, text, action }: { eyebrow: string; title: string; text: string; action?: ReactNode }) { return <header className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{text}</p></div>{action}</header>; }
// oxlint-disable-next-line react/only-export-components -- clipboard utility shared by UI actions
export async function copyText(value: string) { await navigator.clipboard.writeText(value); }
