import { lazy, Suspense, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, BookOpen, ChevronLeft, Command, FolderOpen, Home, Layers, LogOut, Menu, Moon, Network, Plus, Search, Settings, Share2, Sparkles, Sun } from 'lucide-react';
import { useWorkspace } from '../../app/Workspace';
import { useContent } from '../../hooks/data';
import { filterContent, titleOf } from '../../lib/knowledge';
import { post } from '../../lib/api';
import { Button, Modal, TypeIcon } from '../ui';
const Capture = lazy(() => import('../../features/library/Capture'));
const Detail = lazy(() => import('../../features/library/Detail'));
import type { User } from '../../types';
const navigation = [
  { to: '/', label: 'Home', icon: Home }, { to: '/library', label: 'My Library', icon: BookOpen },
  { to: '/collections', label: 'Collections', icon: FolderOpen }, { to: '/graph', label: 'Knowledge Graph', icon: Network },
  { to: '/ask', label: 'Ask My Brain', icon: Sparkles }, { to: '/recall', label: 'Recall Studio', icon: Layers },
  { to: '/sharing', label: 'Shared Brain', icon: Share2 },
];
export default function Shell({ user }: { user: User }) {
  const [collapsed, setCollapsed] = useState(false); const [mobile, setMobile] = useState(false); const [command, setCommand] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('commonplace-theme') || 'light');
  const { capture, setCapture, detailId, setDetailId, toast } = useWorkspace(); const { data: items = [] } = useContent();
  const location = useLocation(); const query = useQueryClient();
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('commonplace-theme', theme); }, [theme]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setCommand(current => !current); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'j') { event.preventDefault(); setCapture(true); }
      if (event.key === 'Escape') setMobile(false);
    }; window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler);
  }, [setCapture]);
  async function logout() { try { await post('/logout', {}); query.setQueryData(['me'], { user: null }); query.removeQueries({ predicate: q => q.queryKey[0] !== 'me' }); } catch (error) { toast((error as Error).message); } }
  const page = [...navigation, { to: '/settings', label: 'Settings' }].find(n => n.to === location.pathname)?.label || 'Workspace';
  return <div className={`app-shell ${collapsed ? 'collapsed' : ''}`}>
    {mobile && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobile(false)}/>}
    <aside className={`sidebar ${mobile ? 'mobile-open' : ''}`} aria-label="Main navigation"><NavLink to="/" className="brand"><span className="brand-mark"><Layers size={23}/></span><span className="sidebar-label">commonplace<span className="brand-period">.</span></span></NavLink>
      <button className="workspace-switch" onClick={() => setCommand(true)}><span className="avatar small">{user.username[0]?.toUpperCase()}</span><span className="sidebar-label"><strong>{user.username}’s space</strong><small>Personal workspace</small></span><Command className="sidebar-label" size={14}/></button>
      <button className="sidebar-search" onClick={() => setCommand(true)} title="Search (Ctrl+K)"><Search size={17}/><span className="sidebar-label">Find anything</span><kbd className="sidebar-label">⌘ K</kbd></button>
      <div className="nav-caption sidebar-label">WORKSPACE</div><nav onClick={() => setMobile(false)}>{navigation.map(({ to, label, icon: Icon }, i) => <NavLink key={to} to={to} end className={({ isActive }) => `nav-item ${isActive ? 'active' : ''} ${i === 4 ? 'nav-ai' : ''}`} title={label}><Icon size={18}/><span className="sidebar-label">{label}</span>{to === '/library' && <span className="nav-count sidebar-label">{items.length}</span>}{to === '/ask' && <span className="tiny-pill sidebar-label">AI</span>}</NavLink>)}</nav>
      <div className="sidebar-bottom"><div className="sidebar-note sidebar-label"><span className="little-star">✳</span><strong>A second home<br/>for your first thoughts.</strong><p>Your curiosity belongs here.</p><button onClick={() => setCapture(true)}>Save something good <ArrowUpRight size={14}/></button></div><NavLink to="/settings" className="nav-item" title="Settings"><Settings size={18}/><span className="sidebar-label">Settings</span></NavLink><div className="account-row"><span className="avatar">{user.username.slice(0, 2).toUpperCase()}</span><div className="sidebar-label"><strong>{user.username}</strong><small>Personal account</small></div><Button variant="ghost" aria-label="Sign out on all devices" title="Sign out on all devices" onClick={logout}><LogOut size={16}/></Button></div><button className="collapse-button" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}><ChevronLeft size={16} className={collapsed ? 'rotated' : ''}/><span className="sidebar-label">Collapse sidebar</span></button></div>
    </aside><div className="main-area"><header className="topbar"><div className="breadcrumb"><Button variant="ghost" className="mobile-menu" aria-label="Open navigation" onClick={() => setMobile(true)}><Menu size={20}/></Button><span className="breadcrumb-space">Workspace</span><span className="breadcrumb-space">/</span><strong>{page}</strong></div><div className="topbar-actions"><button className="icon-button" aria-label="Search your knowledge" onClick={() => setCommand(true)}><Search size={19}/></button><button className="icon-button" aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>{theme === 'light' ? <Moon size={18}/> : <Sun size={18}/>}</button><span className="topbar-divider"/><Button onClick={() => setCapture(true)}><Plus size={16}/> <span>Save something</span><kbd>⌘ J</kbd></Button></div></header><main className={`page-content ${location.pathname === '/ask' ? 'chat-page' : ''}`}><Outlet/></main><footer className="workspace-footer"><span><span className="status-dot"/>A little more connected.</span><span>COMMONPLACE — A SPACE FOR YOUR MIND</span></footer></div>
    {command && <CommandPalette onClose={() => setCommand(false)}/>}<Suspense fallback={<span className="toast" role="status">Opening your resource?</span>}>{capture && <Capture onClose={() => setCapture(false)}/>}{detailId && <Detail key={detailId} id={detailId} onClose={() => setDetailId(null)}/>}</Suspense>
  </div>;
}
function CommandPalette({ onClose }: { onClose: () => void }) {
  const [term, setTerm] = useState(''); const [active, setActive] = useState(0); const navigate = useNavigate(); const { setDetailId, setCapture } = useWorkspace(); const { data = [] } = useContent();
  const results = filterContent(data, term).slice(0, 8);
  const options = term ? results.map(item => ({ label: titleOf(item), icon: <TypeIcon type={item.type}/>, action: () => setDetailId(item._id) })) : [{ label: 'Save something new', icon: <Plus size={18}/>, action: () => setCapture(true) }, ...navigation.map(n => ({ label: `Go to ${n.label}`, icon: <n.icon size={18}/>, action: () => navigate(n.to) }))];
  function choose(index: number) { options[index]?.action(); onClose(); }
  return <Modal title="Find a thought" onClose={onClose}><div className="command-input"><Search size={21}/><input autoFocus value={term} onChange={e => { setTerm(e.target.value); setActive(0); }} placeholder="Search your knowledge or jump to a page…" onKeyDown={e => { if (e.key === 'ArrowDown') { e.preventDefault(); setActive((active + 1) % Math.max(options.length, 1)); } if (e.key === 'ArrowUp') { e.preventDefault(); setActive((active - 1 + options.length) % Math.max(options.length, 1)); } if (e.key === 'Enter') { e.preventDefault(); choose(active); } }} aria-label="Search knowledge and commands" aria-controls="command-results" aria-activedescendant={options.length ? `command-${active}` : undefined} role="combobox" aria-expanded="true"/></div><div className="command-results" role="listbox" id="command-results">{options.map((option, index) => <button id={`command-${index}`} role="option" aria-selected={index === active} className={index === active ? 'selected' : ''} key={option.label + index} onMouseEnter={() => setActive(index)} onClick={() => choose(index)}>{option.icon}<span>{option.label}</span><ArrowDownLeft size={14}/></button>)}{!options.length && <p className="muted">No matching items. Try another word.</p>}</div><div className="command-footer"><span>↑ ↓ to navigate</span><span>↵ to open · Esc to close</span></div></Modal>;
}
