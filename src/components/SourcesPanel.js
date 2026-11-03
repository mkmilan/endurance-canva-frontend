import { catalog } from '../lib/lessons.js';
import Icon from './Icon.js';

export default function SourcesPanel({ content, reviewed, onReview }) {
  const sources = catalog.sources.filter(source=>content.sourceIds.includes(source.id));
  return <section className="sources-panel">
    <div className="panel-heading"><span className="eyebrow">UNDERSTAND THE EXAMPLE</span><h2>Clear assumptions. Traceable sources.</h2><p>The diagram explains supplied boundaries. It does not estimate a real athlete’s thresholds.</p></div>
    <h3>What this example assumes</h3><ul className="assumption-list">{content.assumptions.map((text,i)=><li key={i}><span>{String(i+1).padStart(2,'0')}</span>{text}</li>)}</ul>
    <h3>Research context</h3>{sources.length ? sources.map(source=><article className="source-item" key={source.id}><span className="source-year">{source.year}</span><h4>{source.title}</h4><p>{source.authors}</p><div className="source-scope"><strong>What it supports</strong><p>{source.supports}</p><strong>Where it stops</strong><p>{source.limitations}</p></div><a href={source.url} target="_blank" rel="noopener noreferrer">Read the source<Icon name="arrowRight" size={15}/></a></article>) : <p className="form-note">No research source is attached to this draft. Add evidence before using scientific claims.</p>}
    <div className="review-card"><Icon name={reviewed?'check':'book'} size={22}/><div><strong>{reviewed?'You reviewed this revision':'Your review matters'}</strong><p>{reviewed?'Editing the lesson will return it to a draft. This is a local author check, not independent scientific verification.':'Check that the wording matches the evidence and that the assumptions are clear before sharing.'}</p></div><button className="button secondary" onClick={onReview} disabled={reviewed}>{reviewed?'Reviewed':'Mark as reviewed'}</button></div>
  </section>;
}
