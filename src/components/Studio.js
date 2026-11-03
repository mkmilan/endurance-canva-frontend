'use client';

import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.js';
import ZoneCanvas from './ZoneCanvas.js';
import EditPanel from './EditPanel.js';
import SourcesPanel from './SourcesPanel.js';
import { copy, createLesson, reviseLesson, undoLesson, exportLesson, importLesson, validStoredLesson, filename, downloadBlob } from '../lib/lessons.js';
import { validateLesson } from '../generated/contracts/validation.js';
import { saveLocalLesson, listLocalLessons, loadActiveLesson, deleteLocalLesson } from '../lib/storage.js';

const initialMessage = { role: 'assistant', text: 'Let’s make an idea easier to understand. Start with three training zones, then ask me to simplify the explanation, add detail, or try another example.' };
const promptSuggestions = ['Explain three training zones', 'Make it simpler', 'Show an example above LT2'];

export default function Studio() {
  const [lesson, setLesson] = useState(() => createLesson());
  const lessonRef = useRef(lesson);
  const [ready, setReady] = useState(false);
  const [power, setPower] = useState(200);
  const [messages, setMessages] = useState([initialMessage]);
  const [prompt, setPrompt] = useState('');
  const [pending, setPending] = useState(false);
  const [candidate, setCandidate] = useState(null);
  const [tab, setTab] = useState('preview');
  const [mobilePane, setMobilePane] = useState('canvas');
  const [notice, setNotice] = useState(null);
  const [saveState, setSaveState] = useState('loading');
  const [connection, setConnection] = useState({state:'connecting',mode:'demo'});
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [saved, setSaved] = useState([]);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const requestRef = useRef(null);
  const autosaveRef = useRef(null);
  const transcriptRef = useRef(null);
  const importRef = useRef(null);
  const drawerRef = useRef(null);
  const content = candidate?.content || lesson.content;
  const reviewed = !candidate && lesson.reviewedRevision === lesson.revision;

  function notify(text, kind='success') { setNotice({text,kind,id:Date.now()}); }
  function replaceLesson(next, message) {
    lessonRef.current = next; setLesson(next); setCandidate(null); setPower(next.content.visual.defaultPower);
    if (message) notify(message);
  }
  function updateMessages(next) {
    setMessages(next);
    const updated = {...lessonRef.current,conversation:next.slice(-30)};
    lessonRef.current=updated;setLesson(updated);
  }
  function appendMessage(message) { updateMessages([...(lessonRef.current.conversation?.length ? lessonRef.current.conversation : [initialMessage]),message]); }
  async function checkConnection() {
    setConnection({state:'connecting',mode:'demo'});
    try {
      const response=await fetch('/api/status',{signal:AbortSignal.timeout(55000)});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error?.message);
      setConnection({state:'connected',mode:result.mode});
    }catch{setConnection({state:'offline',mode:'demo'});}
  }

  useEffect(()=>{
    let mounted=true;
    loadActiveLesson().then(stored=>{
      if(!mounted)return;
      if(stored && validStoredLesson(stored)){
        lessonRef.current=stored;setLesson(stored);setPower(stored.content.visual.defaultPower);
        setMessages(stored.conversation?.length?stored.conversation:[initialMessage]);
      } else if(stored) notify('The last saved lesson could not be restored. Import a JSON backup to recover it.','error');
    }).catch(error=>mounted&&notify(error.message,'error')).finally(()=>mounted&&setReady(true));
    checkConnection();
    return()=>{mounted=false;requestRef.current?.controller.abort();};
  },[]);

  useEffect(()=>{
    if(!ready)return;
    setSaveState('saving');
    const currentId=lesson.id,currentRevision=lesson.revision;
    const timeout=setTimeout(()=>{
      saveLocalLesson(lesson).then(()=>{
        if(lessonRef.current.id===currentId && lessonRef.current.revision===currentRevision)setSaveState('saved');
      }).catch(error=>{setSaveState('error');notify(error.message,'error');});
    },500);
    autosaveRef.current=timeout;
    return()=>clearTimeout(timeout);
  },[lesson,ready]);

  useEffect(()=>{
    if(!notice || notice.kind==='error')return;
    const timer=setTimeout(()=>setNotice(null),4500);return()=>clearTimeout(timer);
  },[notice]);

  useEffect(()=>{transcriptRef.current?.scrollTo({top:transcriptRef.current.scrollHeight,behavior:'smooth'});},[messages,pending,candidate]);
  useEffect(()=>{
    function escape(event){if(event.key==='Escape'){setLibraryOpen(false);setExportOpen(false);setConfirmDelete(null);}}
    document.addEventListener('keydown',escape);return()=>document.removeEventListener('keydown',escape);
  },[]);

  useEffect(()=>{
    if(!libraryOpen)return;
    const drawer=drawerRef.current, previousFocus=document.activeElement;
    const previousOverflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    drawer?.querySelector('button')?.focus();
    function keepFocus(event){
      if(event.key!=='Tab' || !drawer)return;
      const controls=[...drawer.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled)')];
      const first=controls[0],last=controls.at(-1);
      if(event.shiftKey && document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus();}
    }
    document.addEventListener('keydown',keepFocus);
    return()=>{document.removeEventListener('keydown',keepFocus);document.body.style.overflow=previousOverflow;previousFocus?.focus?.();};
  },[libraryOpen]);

  async function generate(text=prompt) {
    const value=text.trim();if(!value || pending)return;
    if(candidate){notify('Use or dismiss the current suggestion before asking for another.','error');return;}
    const base=lessonRef.current;
    const requestId=crypto.randomUUID(),controller=new AbortController();
    requestRef.current={id:requestId,controller};setPending(true);setPrompt('');
    appendMessage({role:'user',text:value});
    try{
      const response=await fetch('/api/generate',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({requestId,mode:'refine',prompt:value,currentContent:base.content,baseRevision:base.revision}),signal:controller.signal,
      });
      const result=await response.json();
      if(requestRef.current?.id!==requestId)return;
      if(!response.ok)throw new Error(result.error?.message||'The lesson service could not complete this request.');
      if(lessonRef.current.id!==base.id || lessonRef.current.revision!==base.revision){
        appendMessage({role:'assistant',text:'You changed the canvas while this request was running, so I kept your newer version. Ask again when you are ready.'});return;
      }
      if(result.status==='unsupported'){
        appendMessage({role:'assistant',text:result.message});return;
      }
      if(result.requestId!==requestId || result.baseRevision!==base.revision)throw new Error('The response did not match this draft. Your canvas is unchanged.');
      const check=validateLesson(result.content);
      if(!check.valid)throw new Error('This suggestion did not pass the lesson checks. Your canvas is unchanged.');
      setCandidate({content:result.content,lessonId:base.id,baseRevision:base.revision});
      setPower(result.content.visual.defaultPower);setTab('preview');
      appendMessage({role:'assistant',text:result.message||'Your suggestion is ready to explore. Use this version when you are happy with it.'});
      setConnection({state:'connected',mode:result.mode||'demo'});
      setMobilePane('canvas');
    }catch(error){
      if(requestRef.current?.id!==requestId || lessonRef.current.id!==base.id)return;
      if(error.name==='AbortError')appendMessage({role:'assistant',text:'Stopped. Your current lesson is unchanged.'});
      else{appendMessage({role:'assistant',text:error.message,error:true});notify(error.message,'error');}
    }finally{if(requestRef.current?.id===requestId){setPending(false);requestRef.current=null;}}
  }

  function applyContent(next,message='Changes applied. A new draft revision is ready.'){
    try{replaceLesson(reviseLesson(lessonRef.current,next),message);setTab('preview');}
    catch(error){notify(error.message,'error');}
  }
  function acceptSuggestion(){
    if(!candidate)return lessonRef.current;
    if(candidate.lessonId!==lessonRef.current.id || candidate.baseRevision!==lessonRef.current.revision){setCandidate(null);notify('This suggestion belongs to an earlier draft. Please ask again.','error');return lessonRef.current;}
    const updated=reviseLesson(lessonRef.current,candidate.content);replaceLesson(updated,'Suggestion applied. You can undo it at any time.');return updated;
  }
  function dismissSuggestion(){setCandidate(null);setPower(lessonRef.current.content.visual.defaultPower);notify('Kept your current version.');}
  async function saveNow(){
    const current=candidate?acceptSuggestion():lessonRef.current;
    try{setSaveState('saving');await saveLocalLesson(current);setSaveState('saved');notify('Lesson saved on this device.');}
    catch(error){setSaveState('error');notify(error.message,'error');}
  }
  function cancelRequest(){
    const previous=requestRef.current;requestRef.current=null;previous?.controller.abort();setPending(false);
  }
  async function flushCurrent(){
    cancelRequest();clearTimeout(autosaveRef.current);
    const snapshot=lessonRef.current;
    try{await saveLocalLesson(snapshot);if(lessonRef.current.id!==snapshot.id || lessonRef.current.revision!==snapshot.revision){notify('Your lesson changed while saving. Please try again.','error');return false;}return true;}
    catch(error){notify(error.message,'error');return false;}
  }
  async function startNew(){
    if(!await flushCurrent())return;
    const next=createLesson();next.conversation=[initialMessage];replaceLesson(next,'New lesson started. Your previous lesson stays in My lessons.');
    setMessages([initialMessage]);setPrompt('');setTab('preview');setLibraryOpen(false);
  }
  async function openLibrary(){
    try{await saveLocalLesson(lessonRef.current);const entries=await listLocalLessons();setSaved(entries.filter(validStoredLesson));setLibraryOpen(true);setConfirmDelete(null);}
    catch(error){notify(error.message,'error');}
  }
  async function openLesson(entry){
    if(!await flushCurrent())return;
    replaceLesson(copy(entry),'Lesson opened.');setMessages(entry.conversation?.length?entry.conversation:[initialMessage]);
    setLibraryOpen(false);setTab('preview');setMobilePane('canvas');
  }
  async function duplicate(){
    const next=createLesson(content);
    if(!await flushCurrent())return;next.content.title=`${next.content.title.slice(0,111)} — copy`;
    replaceLesson(next,'Created a separate copy.');setMessages([initialMessage]);setLibraryOpen(false);setTab('preview');
  }
  async function removeLesson(id){
    try{
      if(id===lessonRef.current.id){cancelRequest();clearTimeout(autosaveRef.current);}
      await deleteLocalLesson(id);setSaved(prev=>prev.filter(entry=>entry.id!==id));setConfirmDelete(null);
      if(id===lessonRef.current.id){const next=createLesson();replaceLesson(next);setMessages([initialMessage]);setLibraryOpen(false);setTab('preview');}
      notify('Lesson deleted from this device.');
    }catch(error){notify(error.message,'error');}
  }
  function downloadJson(){
    const current=candidate?{...lesson,content:candidate.content}:lesson;
    downloadBlob(new Blob([JSON.stringify(exportLesson(current),null,2)],{type:'application/json'}),filename(content.title,'json'));
    setExportOpen(false);notify('JSON backup downloaded.');
  }
  async function downloadImage(){
    setExporting(true);
    try{const{exportPng}=await import('../lib/export-image.js');await exportPng(content,power);notify('Visual summary downloaded as PNG.');setExportOpen(false);}
    catch(error){notify(error.message,'error');}finally{setExporting(false);}
  }
  async function handleImport(event){
    const file=event.target.files?.[0];event.target.value='';if(!file)return;
    try{
      if(file.size>256000)throw new Error('This file is too large. Choose an Endurance Canvas JSON export under 256 KB.');
      const result=importLesson(JSON.parse(await file.text()));
      if(!await flushCurrent())return;
      replaceLesson(result.lesson,'Lesson imported as an unreviewed draft. Sources were checked against the local catalogue.');
      setMessages([initialMessage]);setTab('preview');setLibraryOpen(false);setMobilePane('canvas');
    }catch(error){notify(error instanceof SyntaxError?'This file is not valid JSON. Your current lesson is unchanged.':error.message,'error');}
  }
  function markReviewed(){
    if(candidate){notify('Use this suggestion before reviewing it.','error');return;}
    const updated={...lessonRef.current,reviewedRevision:lessonRef.current.revision,updatedAt:new Date().toISOString()};
    lessonRef.current=updated;setLesson(updated);notify('This revision is marked as reviewed by you.');
  }

  return <div className="studio-app">
    <header className="studio-header">
      <a className="brand" href="/" aria-label="Endurance Canvas home"><span className="brand-mark"><svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true"><path d="M7 24V13m9 11V7m9 17v-8" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/></svg></span><span>Endurance <strong>Canvas</strong></span></a>
      <span className="header-divider"/><span className="header-studio">Studio <span className="version-badge">EARLY ACCESS</span></span>
      <div className="header-actions"><span className={`save-indicator ${saveState}`}><span/>{saveState==='saved'?'Saved on this device':saveState==='saving'?'Saving…':saveState==='error'?'Not saved':'Opening studio…'}</span><button className="button ghost library-button" aria-label="My lessons" onClick={openLibrary}><Icon name="folder"/><span>My lessons</span></button><button className="button primary header-save" aria-label="Save lesson" onClick={saveNow} disabled={!ready}><Icon name="save"/><span>Save lesson</span></button></div>
    </header>
    <div className="workspace-heading"><div><span className="eyebrow">A LITTLE CURIOSITY. A CLEARER PICTURE.</span><h1>Make the science click<span>.</span></h1></div><button className="button secondary" onClick={startNew} disabled={!ready}><Icon name="plus"/>New lesson</button></div>
    <div className="mobile-pane-tabs" role="tablist" aria-label="Workspace view"><button role="tab" aria-selected={mobilePane==='conversation'} onClick={()=>setMobilePane('conversation')}><Icon name="sparkles" size={16}/>Conversation{pending&&<span className="tab-dot"/>}</button><button role="tab" aria-selected={mobilePane==='canvas'} onClick={()=>setMobilePane('canvas')}><Icon name="eye" size={16}/>Your canvas{candidate&&<span className="tab-dot"/>}</button></div>
    <main className={`workspace mobile-${mobilePane}`}>
      <aside className="conversation-panel" aria-label="Lesson conversation">
        <div className="conversation-header"><span className="small-icon"><Icon name="sparkles" size={18}/></span><div><h2>Your thinking partner</h2><p>One idea, made interactive.</p></div><span className="demo-badge">GUIDED DEMO</span></div>
        <div className="demo-note"><span className="demo-dot"/><p>This first version uses prepared explanations.<br/>Live AI will come in a later step.</p></div>
        <div className="conversation-scroll" ref={transcriptRef} aria-live="polite" aria-relevant="additions text">
          {messages.map((message,index)=><div className={`message ${message.role} ${message.error?'message-error':''}`} key={index}>{message.role==='assistant'&&<span className="message-avatar"><Icon name="sparkles" size={14}/></span>}<div><span className="message-name">{message.role==='user'?'YOU':'CANVAS'}</span><p>{message.text}</p></div></div>)}
          {pending&&<div className="message assistant"><span className="message-avatar"><Icon name="sparkles" size={14}/></span><div><span className="message-name">CANVAS</span><p className="thinking"><span/><span/><span/>Preparing your suggestion…</p></div></div>}
          {candidate&&<div className="suggestion-note"><Icon name="eye" size={17}/><span>Your suggestion is on the canvas. Explore it, then choose whether to keep it.</span></div>}
        </div>
        <div className="conversation-bottom"><div className="prompt-suggestions">{promptSuggestions.map(text=><button key={text} onClick={()=>generate(text)} disabled={pending||!ready||Boolean(candidate)}>{text}<Icon name="arrowRight" size={14}/></button>)}</div>
          <form className={`prompt-box ${pending?'is-loading':''}`} onSubmit={event=>{event.preventDefault();generate();}}><label className="sr-only" htmlFor="prompt">Describe your idea or ask for a change</label><textarea id="prompt" rows="3" placeholder="What would you like to explain?" value={prompt} maxLength="4000" onChange={event=>setPrompt(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();generate();}}}/><div className="prompt-footer"><span>Start with three training zones</span>{pending?<button className="send-button stop" type="button" aria-label="Stop generation" onClick={()=>requestRef.current?.controller.abort()}><Icon name="stop" size={17}/></button>:<button className="send-button" type="submit" aria-label="Send message" disabled={!prompt.trim()||!ready||Boolean(candidate)}><Icon name="arrowUp" size={20}/></button>}</div></form>
          <div className={`connection-status ${connection.state}`}><span/>{connection.state==='connected'?'Lesson service connected':connection.state==='connecting'?'Connecting to the lesson service…':'Lesson service unavailable'}{connection.state==='offline'&&<button onClick={checkConnection}>Retry</button>}</div>
        </div>
      </aside>
      <section className="canvas-panel" aria-label="Interactive lesson workspace">
        <div className="canvas-toolbar"><div className="canvas-tabs" role="tablist" aria-label="Canvas tools">{[{id:'preview',label:'Preview',icon:'eye'},{id:'edit',label:'Edit lesson',icon:'sliders'},{id:'sources',label:'Sources',icon:'book'}].map(item=><button key={item.id} role="tab" aria-selected={tab===item.id} onClick={()=>setTab(item.id)}><Icon name={item.icon} size={16}/>{item.label}</button>)}</div><div className="canvas-actions"><button className="icon-button" aria-label="Undo last change" title="Undo last change" disabled={!lesson.history.length||Boolean(candidate)} onClick={()=>replaceLesson(undoLesson(lessonRef.current),'Previous version restored as a draft.')}><Icon name="undo" size={18}/></button><button className="icon-button" aria-label="Duplicate lesson" title="Duplicate lesson" onClick={duplicate}><Icon name="duplicate" size={18}/></button><div className="export-wrap"><button className="button secondary export-button" aria-label="Export lesson" onClick={()=>setExportOpen(!exportOpen)} aria-expanded={exportOpen}><Icon name="download" size={16}/><span>Export</span></button>{exportOpen&&<div className="export-menu"><button onClick={downloadImage} disabled={exporting}><Icon name="image"/><span><strong>{exporting?'Preparing image…':'Export PNG'}</strong><small>1080 × 1350 visual summary</small></span></button><button onClick={downloadJson}><Icon name="download"/><span><strong>Export JSON</strong><small>Keep an editable backup</small></span></button><button onClick={()=>{importRef.current?.click();setExportOpen(false);}}><Icon name="upload"/><span><strong>Import JSON</strong><small>Open an exported lesson</small></span></button></div>}</div></div></div>
        {candidate&&<div className="candidate-banner"><div><Icon name="sparkles" size={18}/><span><strong>A new perspective, ready to try.</strong><small>Your saved version is safe until you choose this one.</small></span></div><div><button className="quiet-link" onClick={dismissSuggestion}>Keep current</button><button className="button primary" onClick={acceptSuggestion}><Icon name="check" size={16}/>Use this version</button></div></div>}
        <div className="canvas-content">{tab==='preview'?<ZoneCanvas content={content} power={power} onPowerChange={setPower} candidate={Boolean(candidate)} onSetDefault={()=>applyContent({...copy(content),visual:{...content.visual,defaultPower:power}},`Starting power set to ${power} W.`)}/>:tab==='edit'?<EditPanel key={`${lesson.id}-${lesson.revision}-${candidate?'candidate':'current'}`} content={content} onApply={applyContent}/>:<SourcesPanel content={content} reviewed={reviewed} onReview={markReviewed}/>}</div>
        <div className="canvas-footer"><span className={`review-state ${reviewed?'reviewed':''}`}><span/>{candidate?'Suggestion · not applied':reviewed?'Reviewed by you':'Draft · review before sharing'}</span><span>Revision {lesson.revision}<span className="footer-dot">·</span>Saved on this browser only</span></div>
      </section>
    </main>
    <footer className="studio-footer"><span>Built for curious minds and better explanations.</span><span>Endurance Canvas · Creator studio</span></footer>
    {notice&&<div className={`toast ${notice.kind}`} role={notice.kind==='error'?'alert':'status'}><Icon name={notice.kind==='error'?'info':'check'} size={18}/><span>{notice.text}</span><button className="icon-button" aria-label="Dismiss notification" onClick={()=>setNotice(null)}><Icon name="x" size={16}/></button></div>}
    {libraryOpen&&<div className="drawer-overlay" onClick={()=>setLibraryOpen(false)}><section ref={drawerRef} className="library-drawer" role="dialog" aria-modal="true" aria-label="My saved lessons" onClick={event=>event.stopPropagation()}><div className="drawer-header"><div><span className="eyebrow">YOUR COLLECTION</span><h2>My lessons</h2></div><button className="icon-button" aria-label="Close saved lessons" onClick={()=>setLibraryOpen(false)}><Icon name="x"/></button></div><p className="drawer-intro">Saved on this device. Export JSON to keep a backup or move a lesson to another browser.</p><div className="library-actions"><button className="button primary" onClick={startNew}><Icon name="plus"/>New lesson</button><button className="button secondary" onClick={()=>importRef.current?.click()}><Icon name="upload"/>Import JSON</button></div><div className="library-list">{saved.length?saved.map(entry=><article className="saved-lesson" key={entry.id}><div className="saved-lesson-mini"><span/><span/><span/></div><div className="saved-lesson-details"><span className="eyebrow">THREE TRAINING ZONES</span><h3><button onClick={()=>openLesson(entry)}>{entry.content.title}</button></h3><p>{new Date(entry.updatedAt).toLocaleDateString('en-GB',{day:'numeric',month:'short'})} · Revision {entry.revision}{entry.id===lesson.id?' · Current lesson':''}</p></div>{confirmDelete===entry.id?<div className="delete-confirm"><span>Delete this lesson?</span><button onClick={()=>removeLesson(entry.id)}>Delete</button><button onClick={()=>setConfirmDelete(null)}>Cancel</button></div>:<button className="icon-button" aria-label={`Delete ${entry.content.title}`} onClick={()=>setConfirmDelete(entry.id)}><Icon name="trash" size={17}/></button>}</article>):<div className="empty-library"><Icon name="book" size={32}/><h3>A place for your ideas.</h3><p>Your saved explanations will appear here.</p></div>}</div></section></div>}
    <input ref={importRef} type="file" accept=".json,application/json" className="sr-only" onChange={handleImport} aria-label="Import lesson JSON file"/>
  </div>;
}
