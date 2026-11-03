import { useState } from 'react';
import { copy } from '../lib/lessons.js';
import { validateLesson } from '../generated/contracts/validation.js';
import Icon from './Icon.js';

export default function EditPanel({ content, onApply }) {
  const [draft, setDraft] = useState(() => copy(content));
  const [error, setError] = useState('');
  const setVisual = (key, value) => setDraft(prev => ({ ...prev, visual: { ...prev.visual, [key]: value } }));
  function apply(event) {
    event.preventDefault();
    const next = copy(draft);
    next.assumptions = next.assumptions.map(text => /LT1\s+\d+\s*W and LT2\s+\d+\s*W are fictional teaching inputs\./i.test(text) ? `LT1 ${next.visual.lt1} W and LT2 ${next.visual.lt2} W are fictional teaching inputs.` : text);
    const validation = validateLesson(next);
    if (!validation.valid) return setError(validation.errors[0]);
    onApply(next); setError('');
  }
  return <form className="editor-panel" onSubmit={apply}>
    <div className="panel-heading"><span className="eyebrow">MAKE IT YOURS</span><h2>A few thoughtful adjustments.</h2><p>Change the explanation and example. Your last version stays available in Undo.</p></div>
    <label className="field">Lesson title<input value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})} maxLength="120" required/></label>
    {draft.blocks.map((block,index)=><label className="field" key={index}>{index === 0 ? 'Main explanation' : `Supporting paragraph ${index}`}<textarea rows={index===0?5:3} value={block.text} maxLength="1200" required onChange={e=>setDraft(prev=>({...prev,blocks:prev.blocks.map((b,i)=>i===index?{...b,text:e.target.value,claimIds:[]}:b)}))}/></label>)}
    <div className="form-two"><label className="field">LT1 <span className="field-unit">watts</span><input type="number" min="1" max={draft.visual.lt2-1} value={draft.visual.lt1} onChange={e=>setVisual('lt1',e.target.value===''?'':Number(e.target.value))} required/></label><label className="field">LT2 <span className="field-unit">watts</span><input type="number" min={Number(draft.visual.lt1)+1} max={draft.visual.domain.max-1} value={draft.visual.lt2} onChange={e=>setVisual('lt2',e.target.value===''?'':Number(e.target.value))} required/></label></div>
    <div className="form-two"><label className="field">Starting power <span className="field-unit">watts</span><input type="number" min="0" max={draft.visual.domain.max} value={draft.visual.defaultPower} onChange={e=>setVisual('defaultPower',e.target.value===''?'':Number(e.target.value))} required/></label><label className="field">Audience<select value={draft.audience} onChange={e=>setDraft({...draft,audience:e.target.value})}><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option></select></label></div>
    <fieldset className="accent-options"><legend>Accent colour</legend>{['teal','blue','amber'].map(color=><label key={color} className={draft.presentation.accent===color?'selected':''}><input type="radio" name="accent" value={color} checked={draft.presentation.accent===color} onChange={()=>setDraft({...draft,presentation:{...draft.presentation,accent:color}})}/><span className={`color-dot ${color}`}/>{color[0].toUpperCase()+color.slice(1)}</label>)}</fieldset>
    <p className="form-note"><Icon name="info" size={16}/>These values change a fictional example. Edited text needs a fresh source review.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="button primary" type="submit"><Icon name="check"/>Apply changes</button>
  </form>;
}
