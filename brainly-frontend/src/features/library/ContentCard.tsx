import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, Star } from 'lucide-react';
import { useWorkspace } from '../../app/Workspace';
import { patch } from '../../lib/api';
import { dateOf, sourceOf, titleOf } from '../../lib/knowledge';
import { TypeIcon } from '../../components/ui';
import type { Content } from '../../types';
export default function ContentCard({ item, list = false, selected, onSelect, highlight = '' }: { item: Content; list?: boolean; selected?: boolean; onSelect?: () => void; highlight?: string }) {
  const { setDetailId, toast } = useWorkspace(); const query = useQueryClient();
  const favorite = useMutation({ mutationFn: () => patch(`/content/${item._id}`, { favorite: !item.favorite }), onSuccess: () => query.invalidateQueries({ queryKey: ['content'] }), onError: error => toast(error.message) });
  return <article className={`content-card ${list ? 'list-card' : ''} ${selected ? 'is-selected' : ''}`}><div className="card-source"><span className={`type-icon type-${item.type}`}><TypeIcon type={item.type}/></span><span>{sourceOf(item)}</span>{onSelect && <input type="checkbox" aria-label={`Select ${titleOf(item)}`} checked={Boolean(selected)} onChange={onSelect}/>}<button className={`favorite-button ${item.favorite ? 'is-favorite' : ''}`} disabled={favorite.isPending} aria-label={`${item.favorite ? 'Unpin' : 'Pin'} ${titleOf(item)}`} onClick={() => favorite.mutate()}><Star size={16} fill={item.favorite ? 'currentColor' : 'none'}/></button></div><button className="card-main" onClick={() => setDetailId(item._id)}><h3><Highlight value={titleOf(item)} search={highlight}/><ArrowUpRight size={17}/></h3><p><Highlight value={item.description || item.text || 'A saved resource. Open it to add your notes and make it your own.'} search={highlight}/></p></button><div className="card-tags">{item.tags.slice(0, 3).map(tag => <span key={tag}>#{tag}</span>)}</div><div className="card-footer"><span className="type-label">{item.type}</span><time>{dateOf(item.createdAt)}</time></div></article>;
}
function Highlight({ value, search }: { value: string; search: string }) {
  const term = search.trim().split(/\s+/)[0] || ''; const index = term ? value.toLowerCase().indexOf(term.toLowerCase()) : -1;
  return index < 0 ? <>{value}</> : <>{value.slice(0, index)}<mark>{value.slice(index, index + term.length)}</mark>{value.slice(index + term.length)}</>;
}
