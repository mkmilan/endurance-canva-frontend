import { classifyPower } from '../generated/contracts/validation.js';
import { downloadBlob, filename } from './lessons.js';

function wrap(ctx, text, x, y, width, lineHeight, maxLines = Infinity) {
  const words = text.split(/\s+/).flatMap(word => {
    if(ctx.measureText(word).width <= width)return [word];
    const pieces=[];let piece='';
    for(const character of word){if(piece && ctx.measureText(piece+character).width>width){pieces.push(piece);piece=character;}else piece+=character;}
    if(piece)pieces.push(piece);return pieces;
  }); const lines = []; let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > width && line) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  const limited = lines.slice(0, maxLines);
  if (lines.length > maxLines) limited[limited.length - 1] = limited.at(-1).replace(/\s+\S*$/, '') + '…';
  for (const value of limited) { ctx.fillText(value, x, y); y += lineHeight; }
  return y;
}

export async function exportPng(content, power) {
  const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = 1350;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Image export is not available in this browser.');
  const roundRect = (x,y,w,h,r,fill) => { ctx.fillStyle=fill; ctx.beginPath(); ctx.roundRect(x,y,w,h,r); ctx.fill(); };
  ctx.fillStyle='#f5f6ef'; ctx.fillRect(0,0,1080,1350);
  roundRect(48,48,984,1254,28,'#ffffff');
  ctx.fillStyle='#547266';ctx.font='600 17px Arial';ctx.fillText('ENDURANCE CANVAS  /  THE INTENSITY EXPLORER',96,109);
  ctx.fillStyle='#183e34';ctx.font='48px Georgia';
  let y = wrap(ctx,content.title,96,189,888,57,3);
  ctx.fillStyle='#596c61';ctx.font='22px Arial';y=wrap(ctx,content.blocks[0].text,96,y+24,888,33,Math.max(1,Math.min(4,Math.floor((450-y-24)/33)+1)));
  const top = 480;
  roundRect(88,top,904,420,18,'#f8faf5');
  const {lt1,lt2,domain}=content.visual;
  const scale=v=>122+(v/domain.max)*836; const x1=scale(lt1),x2=scale(lt2),xp=scale(power);
  ctx.fillStyle='#567065';ctx.font='600 15px Arial';ctx.fillText('CYCLING POWER · FICTIONAL EXAMPLE',122,top+42);
  roundRect(122,top+112,x1-122,133,7,'#dbece2');
  roundRect(x1,top+112,x2-x1,133,0,'#f2e6c7');
  roundRect(x2,top+112,958-x2,133,7,'#f0dacf');
  ctx.fillStyle='#284c3f';ctx.font='600 20px Arial';ctx.textAlign='center';
  [[122,x1,'ZONE 1','Below LT1'],[x1,x2,'ZONE 2','LT1 – LT2'],[x2,958,'ZONE 3','Above LT2']].forEach(([start,end,title,description])=>{
    if(end-start<100)return;
    ctx.font='600 20px Arial';ctx.fillText(title,(start+end)/2,top+181);
    ctx.font='17px Arial';ctx.fillText(description,(start+end)/2,top+210);
  });
  let label1=Math.max(160,Math.min(x1,820)),label2=Math.max(260,Math.min(x2,920));
  if(label2-label1<100){const mid=(label1+label2)/2;label1=mid-50;label2=mid+50;}
  ctx.strokeStyle='#93a189';ctx.lineWidth=1.5;
  [[x1,label1],[x2,label2]].forEach(([x,label])=>{ctx.beginPath();ctx.moveTo(x,top+249);ctx.lineTo(x,top+257);ctx.lineTo(label,top+267);ctx.stroke();});
  ctx.font='600 18px Arial';ctx.fillText('LT1',label1,top+285);ctx.fillText('LT2',label2,top+285);
  ctx.font='18px Arial';ctx.fillText(`${lt1} W`,label1,top+313);ctx.fillText(`${lt2} W`,label2,top+313);
  ctx.font='15px Arial';ctx.fillText('Zone 1: below LT1   ·   Zone 2: LT1 to LT2   ·   Zone 3: above LT2',540,top+343);
  ctx.strokeStyle='#214b3c';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(xp,top+99);ctx.lineTo(xp,top+253);ctx.stroke();
  const labelX=Math.max(166,Math.min(xp,914));roundRect(labelX-45,top+54,90,38,19,'#214b3c');
  ctx.fillStyle='white';ctx.font='600 19px Arial';ctx.fillText(`${power} W`,labelX,top+80);
  ctx.fillStyle='#345345';ctx.font='22px Arial';const state=classifyPower(power,lt1,lt2);ctx.fillText(`${power} watts · ${state.label}${state.boundary?' · '+state.boundary:''}`,540,top+374);
  ctx.textAlign='left';ctx.fillStyle='#334f42';ctx.font='600 21px Arial';ctx.fillText('A model for understanding, with visible assumptions.',96,963);
  ctx.fillStyle='#68786d';ctx.font='19px Arial';
  wrap(ctx,'The threshold values are supplied teaching inputs. Moving them changes the illustration; it does not predict an athlete’s physiology or adaptation.',96,1006,888,28,3);
  ctx.strokeStyle='#e4e9df';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(96,1122);ctx.lineTo(984,1122);ctx.stroke();
  ctx.font='16px Arial';ctx.fillStyle='#677769';wrap(ctx,content.sourceIds.includes('seiler-kjerland-2006')?'Research context: Seiler & Kjerland (2006). Their study used ventilatory thresholds; it does not validate these fictional LT1/LT2 wattages.':'Illustrative draft. No research source is attached to this lesson. Review the explanation before sharing.',96,1159,888,24,3);
  ctx.font='600 17px Arial';ctx.fillStyle='#254d3e';ctx.fillText('Explore. Understand. Explain.',96,1256);ctx.font='15px Arial';ctx.textAlign='right';ctx.fillText('Visual summary · endurance-canvas',984,1256);
  const blob = await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  if (!blob) throw new Error('Could not export this image. Try JSON export instead.');
  downloadBlob(blob,filename(content.title,'png'));
}
