import { useEffect, useRef, useState } from 'react';
import { classifyPower } from '../generated/contracts/validation.js';
import Icon from './Icon.js';

const descriptions = {
  1: ['Below the first threshold', 'The selected power sits below LT1 in this teaching example.'],
  2: ['Between the thresholds', 'The selected power sits between the two supplied boundaries.'],
  3: ['Above the second threshold', 'The selected power sits above LT2 in this teaching example.'],
};

export default function ZoneCanvas({ content, power, onPowerChange, onSetDefault, candidate }) {
  const chartRef = useRef(null);
  const [chartWidth, setChartWidth] = useState(500);
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setChartWidth(entry.contentRect.width);
    });
    observer.observe(chart);
    return () => observer.disconnect();
  }, []);
  const { lt1, lt2, domain, defaultPower } = content.visual;
  const state = classifyPower(power, lt1, lt2);
  const padding = chartWidth < 360 ? 14 : 25;
  const plotEnd = chartWidth - padding;
  const plotWidth = chartWidth - padding * 2;
  const scale = (v) => padding + ((v - domain.min) / (domain.max - domain.min)) * plotWidth;
  const position = scale(power);
  const l1 = scale(lt1), l2 = scale(lt2);
  let label1 = Math.max(28, Math.min(l1, chartWidth - 88));
  let label2 = Math.max(88, Math.min(l2, chartWidth - 28));
  if (label2 - label1 < 60) {
    const midpoint = (label1 + label2) / 2;
    label1 = midpoint - 30; label2 = midpoint + 30;
  }
  const badgeX = Math.max(0, Math.min(position - 39, chartWidth - 78));
  const pointColor = state.zone === 1 ? '#4b8e7b' : state.zone === 2 ? '#bf913b' : '#bd735d';
  const statusTitle = state.boundary || descriptions[state.zone][0];
  return <section className={`lesson-card accent-${content.presentation.accent}`} aria-labelledby="lesson-title">
    <div className="lesson-eyebrow"><span className="lesson-number">01</span><span>THE INTENSITY EXPLORER</span><span className="example-chip">Fictional example</span></div>
    <h2 id="lesson-title">{content.title}</h2>
    <p className="lesson-intro">{content.blocks[0]?.text}</p>
    <div className="visual-frame">
      <div className="visual-heading"><span>Three zones. One continuous scale.</span><span className="unit-label">POWER · WATTS</span></div>
      <svg ref={chartRef} className="zone-chart" viewBox={`0 0 ${chartWidth} 230`} role="img" aria-label={`Power ${power} watts, ${state.label}${state.boundary ? `, ${state.boundary}` : ''}. LT1 ${lt1} watts, LT2 ${lt2} watts.`}>
        <rect x={padding} y="58" width={l1 - padding} height="84" rx="6" fill="#dbece2"/>
        <rect x={l1} y="58" width={l2 - l1} height="84" fill="#f2e6c7"/>
        <rect x={l2} y="58" width={plotEnd - l2} height="84" rx="6" fill="#f0dacf"/>
        <path d={`M${l1} 58V142M${l2} 58V142`} stroke="#fff" strokeWidth="2"/>
        {[{start:padding,end:l1,label:'Z1'},{start:l1,end:l2,label:'Z2'},{start:l2,end:plotEnd,label:'Z3'}].map(zone => zone.end - zone.start >= 27 && <text key={zone.label} x={(zone.start + zone.end) / 2} y="96" textAnchor="middle" className="svg-zone-title">{zone.label}</text>)}
        {[{x:l1,labelX:label1,label:'LT1',value:lt1},{x:l2,labelX:label2,label:'LT2',value:lt2}].map(({x,labelX,label,value}) => <g key={label}><path d={`M${x} 147V157L${labelX} 169`} fill="none" stroke="#839481"/><text x={labelX} y="184" textAnchor="middle" className="svg-threshold">{label}</text><text x={labelX} y="202" textAnchor="middle" className="svg-tick">{value} W</text></g>)}
        <text x={padding} y="225" className="svg-tick">{domain.min} W</text><text x={plotEnd} y="225" textAnchor="end" className="svg-tick">{domain.max} W</text>
        <line x1={position} y1="44" x2={position} y2="148" stroke={pointColor} strokeWidth="2"/>
        <circle cx={position} cy="128" r="6" fill={pointColor} stroke="white" strokeWidth="2.5"/>
        <rect x={badgeX} y="8" width="78" height="30" rx="15" fill="#183f36"/>
        <text x={badgeX + 39} y="28" textAnchor="middle" className="svg-selected">{power} W</text>
      </svg>
      <div className="zone-key" aria-label="Zone definitions"><div><span className="zone-key-dot one"/><strong>Zone 1</strong><span>Below LT1</span></div><div><span className="zone-key-dot two"/><strong>Zone 2</strong><span>LT1 to LT2</span></div><div><span className="zone-key-dot three"/><strong>Zone 3</strong><span>Above LT2</span></div></div>
      <div className="power-control">
        <div className="control-label"><label htmlFor="power-slider">Explore the intensity</label><span><strong>{power}</strong> W</span></div>
        <input id="power-slider" type="range" min={domain.min} max={domain.max} step="1" value={power} onChange={(event) => onPowerChange(Number(event.target.value))} style={{'--range-progress': `${(power / domain.max) * 100}%`}} aria-valuetext={`${power} watts, ${state.label}${state.boundary ? ', '+state.boundary : ''}`}/>
        <div className="slider-caption"><span>Move the slider and watch the zones.</span><button className="quiet-link" onClick={() => onPowerChange(defaultPower)} disabled={power === defaultPower}>Reset to {defaultPower} W</button></div>
      </div>
      <div className={`zone-result zone-${state.zone}`} aria-live="polite" aria-atomic="true"><span className="zone-result-number">{state.zone}</span><div><strong>{statusTitle}</strong><p>{state.boundary ? 'An exact boundary is included in Zone 2 for this display.' : descriptions[state.zone][1]}</p></div><span className="zone-result-unit">{power} <small>W</small></span></div>
      {power !== defaultPower && !candidate && <button className="set-default quiet-link" onClick={onSetDefault}><Icon name="check" size={14}/>Use {power} W as the starting value</button>}
    </div>
    <div className="lesson-followup">{content.blocks.slice(1).map((block, i) => <p key={i}>{block.text}</p>)}</div>
    <div className="teaching-note"><Icon name="info" size={16}/><span>These are fictional thresholds for learning. They are not your personal training zones.</span></div>
    <div className="lesson-signature"><span>ENDURANCE CANVAS</span><span>Explore. Understand. Explain.</span></div>
  </section>;
}
