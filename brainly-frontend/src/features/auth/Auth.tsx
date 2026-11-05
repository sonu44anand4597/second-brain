import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Eye, EyeOff, Layers } from 'lucide-react';
import { api, post } from '../../lib/api';
import { Button } from '../../components/ui';
import type { User } from '../../types';
const schema = z.object({ username: z.string().trim().min(3, 'Use at least 3 characters').max(80), password: z.string().min(1, 'Enter your password').max(256) });
export default function Auth() {
  const [signup, setSignup] = useState(false); const [visible, setVisible] = useState(false); const [error, setError] = useState('');
  const queryClient = useQueryClient();
  const { register, handleSubmit, formState: { errors, isSubmitting }, setError: formError } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  const submit = handleSubmit(async values => {
    setError('');
    if (signup && values.password.length < 8) { formError('password', { message: 'Use at least 8 characters' }); return; }
    try {
      if (signup) await post('/signup', values);
      await post('/signin', values);
      const data = await api<{ user: User }>('/me'); queryClient.removeQueries({ predicate: q => q.queryKey[0] !== 'me' }); queryClient.setQueryData(['me'], data);
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to sign in'); }
  });
  return <main className="auth-layout"><section className="auth-story"><a className="brand" href="/"><span className="brand-mark"><Layers size={24}/></span>commonplace<span className="brand-period">.</span></a><div><span className="eyebrow">A LITTLE SPACE FOR BIG IDEAS</span><h1>Good ideas deserve<br/>a place to <em>grow.</em></h1><p>Collect what moves you. Connect what you know.<br/>Make a little more room for your mind.</p><div className="auth-orbit" aria-hidden="true"><div className="orbit-circle circle-one"/><div className="orbit-circle circle-two"/><span className="orbit-note n1">a thought worth keeping</span><span className="orbit-note n2">the next connection ↗</span><span className="orbit-core"><Layers size={40}/></span><i className="orbit-dot d1"/><i className="orbit-dot d2"/></div></div><small>YOUR KNOWLEDGE, IN GOOD COMPANY.</small></section><section className="auth-form"><div className="auth-form-inner"><span className="eyebrow">YOUR PERSONAL KNOWLEDGE WORKSPACE</span><h2>{signup ? 'Begin your collection.' : 'Welcome back.'}</h2><p>{signup ? 'A home for everything you want to remember.' : 'Your ideas have been waiting for you.'}</p><form onSubmit={submit}><label>Username<input autoComplete="username" placeholder="Your username" {...register('username')}/>{errors.username && <span className="field-error">{errors.username.message}</span>}</label><label>Password<div className="password-field"><input type={visible ? 'text' : 'password'} autoComplete={signup ? 'new-password' : 'current-password'} placeholder={signup ? 'At least 8 characters' : 'Enter your password'} {...register('password')}/><button type="button" aria-label={visible ? 'Hide password' : 'Show password'} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div>{errors.password && <span className="field-error">{errors.password.message}</span>}</label>{error && <p className="inline-error" role="alert">{error}</p>}<Button type="submit" busy={isSubmitting}>{signup ? 'Create your workspace' : 'Sign in to your workspace'}<ArrowRight size={17}/></Button></form><p className="auth-switch">{signup ? 'Already have a workspace?' : 'New to Commonplace?'} <button onClick={() => { setSignup(!signup); setError(''); }}>{signup ? 'Sign in' : 'Make yourself at home'}</button></p><div className="privacy-note"><span className="status-dot"/>Private by default. Yours to share.</div></div></section></main>;
}
