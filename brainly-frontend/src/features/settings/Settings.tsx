import { useQuery } from '@tanstack/react-query';
import { BrainCircuit, LockKeyhole, Monitor } from 'lucide-react';
import { useAIStatus } from '../../hooks/data';
import { api } from '../../lib/api';
import { ErrorState, PageTitle, Skeleton } from '../../components/ui';
import type { User } from '../../types';
import AISettings from './AISettings';
export default function Settings() {
  const query = useAIStatus(); const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => api<{ user: User }>('/me') });
  if (query.isPending) return <Skeleton cards={2}/>; if (query.error) return <ErrorState error={query.error} retry={() => void query.refetch()}/>;
  const status = query.data;
  return <><PageTitle eyebrow="MAKE YOURSELF AT HOME" title="Your space, your way." text="A few things that keep your workspace running thoughtfully."/><div className="settings-grid"><section className="panel"><h2><LockKeyhole size={20}/>Your account</h2><dl><div><dt>Username</dt><dd>{me?.user.username}</dd></div><div><dt>Session</dt><dd>Secure HttpOnly cookie · 7 days</dd></div><div><dt>Sharing</dt><dd>Private unless explicitly shared</dd></div></dl><p className="muted">Signing out revokes all existing sessions for this account.</p></section><AISettings status={status} userId={me?.user.id || ''}/><section className="panel"><h2><BrainCircuit size={20}/>How your knowledge works</h2><p>Only text you save or explicitly extract is used by AI. Retrieval stays within your account. Citations link to the source passages used for each answer.</p><p>Graph connections come from shared tags and collection membership. Study cards include verified source quotes.</p></section><section className="panel"><h2><Monitor size={20}/>Make it feel familiar</h2><p>Switch light and dark themes using the moon or sun in the top bar. Your preference stays in this browser.</p><dl><div><dt>Find anything</dt><dd><kbd>Ctrl / ⌘ K</kbd></dd></div><div><dt>Save something</dt><dd><kbd>Ctrl / ⌘ J</kbd></dd></div><div><dt>Send a question</dt><dd><kbd>Enter</kbd></dd></div><div><dt>New line in chat</dt><dd><kbd>Shift Enter</kbd></dd></div><div><dt>Close dialog</dt><dd><kbd>Esc</kbd></dd></div></dl></section></div></>;
}
