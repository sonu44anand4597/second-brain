import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, FileText, Link2, WandSparkles } from 'lucide-react';
import { APIError, patch, post } from '../../lib/api';
import { useCollections } from '../../hooks/data';
import { useWorkspace } from '../../app/Workspace';
import { Button, Modal } from '../../components/ui';
import type { Content } from '../../types';
import Markdown from '../../components/ui/Markdown';
interface Metadata { title: string; description: string; text: string; type: string; textOrigin: Content['textOrigin']; notice: string }
export default function Capture({ onClose, item }: { onClose: () => void; item?: Content }) {
  const [note, setNote] = useState(item?.type === 'note'); const [link, setLink] = useState(item?.link || '');
  const [title, setTitle] = useState(item?.title || ''); const [text, setText] = useState(item?.text || '');
  const [description, setDescription] = useState(item?.description || ''); const [type, setType] = useState(item?.type || 'article');
  const [tags, setTags] = useState(item?.tags.join(', ') || ''); const [collectionIds, setCollectionIds] = useState(item?.collectionIds || []);
  const [textOrigin, setTextOrigin] = useState<Content['textOrigin']>(item?.textOrigin || 'manual'); const [notice, setNotice] = useState('');
  const [preview, setPreview] = useState(false);
  const { data: collections = [], error: collectionError } = useCollections(); const query = useQueryClient(); const { toast, setDetailId } = useWorkspace();
  const metadata = useMutation({ mutationFn: () => post<Metadata>('/metadata', { link }), onSuccess: data => { setTitle(data.title); setText(data.text); setDescription(data.description); setType(data.type); setTextOrigin(data.textOrigin); setNotice(data.notice); } });
  const save = useMutation({ mutationFn: () => {
    const body = { link: note ? '' : link, title, text, description, type: note ? 'note' : type, tags: tags.split(',').map(t => t.trim()).filter(Boolean), collectionIds, textOrigin: text ? textOrigin : 'none' };
    return item ? patch(`/content/${item._id}`, body) : post('/content', body);
  }, onSuccess: async () => { await query.invalidateQueries({ queryKey: ['content'] }); toast(item ? 'Changes saved.' : 'A good idea, safely kept.'); onClose(); } });
  function submit(event: FormEvent) { event.preventDefault(); if (!metadata.isPending) save.mutate(); }
  return <Modal title={item ? 'Refine your resource' : 'Save a little inspiration'} onClose={onClose} wide>
    <p className="modal-intro">A link, a passage, a thought. Give it a home.</p><div className="segmented"><button className={!note ? 'selected' : ''} onClick={() => setNote(false)}><Link2 size={16}/>Web resource</button><button className={note ? 'selected' : ''} onClick={() => setNote(true)}><FileText size={16}/>Personal note</button></div>
    <form className="capture-form" onSubmit={submit}>{!note && <label>Source URL<div className="input-action"><input type="url" required maxLength={2048} placeholder="https://something-worth-keeping.com" value={link} onChange={e => setLink(e.target.value)}/><Button variant="secondary" busy={metadata.isPending} disabled={!link || save.isPending} onClick={() => metadata.mutate()}><WandSparkles size={15}/>Fetch</Button></div><span className="field-hint">Fetch retrieves available metadata and readable page text. Video transcripts are not imported.</span></label>}
      {metadata.error && <div className="inline-error" role="alert">{metadata.error.message} You can fill in the details below.</div>}{notice && <div className="info-banner">{notice}</div>}
      <div className="form-grid"><label>Title<input placeholder={note ? 'What’s on your mind?' : 'A name you’ll remember'} maxLength={240} value={title} onChange={e => setTitle(e.target.value)}/></label>{!note && <label>Resource type<select value={type} onChange={e => setType(e.target.value)}>{[...new Set(['article', 'video', 'tweet', 'link', ...(item ? [item.type] : [])])].map(value => <option key={value} value={value}>{value}</option>)}</select></label>}</div>
      {!note && <label>Description<textarea rows={2} maxLength={1500} placeholder="A short description of this resource…" value={description} onChange={e => setDescription(e.target.value)}/></label>}
      {note && <div className="editor-toolbar"><span>MARKDOWN NOTE</span><button type="button" aria-pressed={preview} onClick={() => setPreview(!preview)}>{preview ? 'Keep writing' : 'Preview note'}</button></div>}{preview && note ? <div className="note-preview"><Markdown text={text || '*Your preview will appear here.*'}/></div> : <label>{note ? 'Your note' : 'Source text'}<textarea className="note-editor" rows={note ? 9 : 5} maxLength={30000} required={note} placeholder={note ? 'Write freely. Markdown notation is welcome…' : 'Paste relevant passages, or use Fetch to retrieve readable article text. AI can only use text that is actually saved.'} value={text} onChange={e => { setText(e.target.value); setTextOrigin('manual'); }}/><span className="field-hint">{text.length.toLocaleString()} / 30,000 characters · Plain text is rendered safely.</span></label>}
      <label>Tags<input aria-label="Tags" value={tags} maxLength={800} placeholder="design, systems, a new perspective" onChange={e => setTags(e.target.value)}/><span className="field-hint">Separate tags with commas.</span></label>
      {collectionError && <p className="inline-error">{collectionError.message}</p>}{collections.length > 0 && <fieldset className="collection-picker"><legend>Add to collections</legend>{collections.map(c => <label key={c._id} className="checkbox-label"><input type="checkbox" checked={collectionIds.includes(c._id)} onChange={e => setCollectionIds(e.target.checked ? [...collectionIds, c._id] : collectionIds.filter(id => id !== c._id))}/>{c.name}</label>)}</fieldset>}
      {save.error && <div className="inline-error" role="alert">{save.error.message}{save.error instanceof APIError && save.error.existingId && <button type="button" className="text-link" onClick={() => { setDetailId((save.error as APIError).existingId!); onClose(); }}>Open existing resource <ArrowRight size={14}/></button>}</div>}
      <div className="modal-actions"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" busy={save.isPending} disabled={metadata.isPending}>{item ? 'Save changes' : 'Save to my library'}<ArrowRight size={16}/></Button></div>
    </form></Modal>;
}
