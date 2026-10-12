import {createQualityPicker} from './quality-picker.js';
import {downloadFilename} from './filename.js';
const $=id=>document.getElementById(id);
const qualityPicker=createQualityPicker($('quality'));
let currentInput='',currentCookie='',currentData;
const settings=$('settings');
function safeLink(raw){if(!raw)return '';try{const u=new URL(raw,location.origin);return u.protocol==='https:'||u.origin===location.origin?u.href:'';}catch{return '';}}
function updateCookie(){$('settings-summary').textContent=$('cookie').value.trim()?'登录信息 · 已填写':'登录信息 · 可选';}
$('cookie').addEventListener('input',updateCookie);
$('clear-cookie').addEventListener('click',()=>{$('cookie').value='';currentCookie='';updateCookie();});
function detect(){const text=$('url').value;$('detected-platform').textContent=/bilibili\.com|b23\.tv/.test(text)?'哔哩哔哩':/douyin\.com/.test(text)?'抖音':'';}
$('url').addEventListener('input',detect);
$('paste').addEventListener('click',async()=>{try{$('url').value=(await navigator.clipboard.readText()).slice(0,4096);detect();$('url').focus();}catch{$('status').textContent='请在输入框中按 Ctrl+V 粘贴链接。';$('url').focus();}});
$('clear-link').addEventListener('click',()=>{$('url').value='';currentInput='';currentData=undefined;$('result').hidden=true;$('status').textContent='';detect();$('url').focus();});
function qualityLabel(s){return s.label.split(' · ')[0]+(s.codec==='hevc'?' · HEVC':s.codec==='avc'?' · H.264':'')+(s.size?' · '+(s.size/1048576).toFixed(1)+'MB':'')+(s.kind==='video'?' · 自动合并声音':'');}
function choices(){if(!currentData)return [];const audio=currentData.streams.find(s=>s.kind==='audio'&&s.download);const available=currentData.streams.filter(s=>s.kind==='combined'||s.kind==='video'&&s.download&&audio);return currentData.platform==='bilibili'?available.sort((a,b)=>(b.quality||0)-(a.quality||0)):available;}
function selection(){return choices()[Number($('quality').value)||0];}
function updateChoice(){const s=selection();$('download-button').disabled=!s;$('download-button').textContent=s?.download?'↓ 下载完整视频':'打开视频下载 ↗';$('download-hint').textContent=s?.kind==='video'?'自动合并画面与声音，保存为完整 MP4。较大文件建议使用电脑下载。':s?.codec==='hevc'?'此版本使用 HEVC 编码，部分浏览器无法显示画面，建议选择 H.264。':s?.download?'完整视频，包含画面和声音。':'此站点未启用代理下载，直链可能打开播放器或被平台拦截。';}
function render(data){
 currentData=data;$('title').textContent=data.title;$('platform').textContent=data.platform==='bilibili'?'哔哩哔哩':'抖音';
 $('details').textContent=[data.author,data.duration?Math.floor(data.duration/60)+':'+String(data.duration%60).padStart(2,'0'):''].filter(Boolean).join(' · ');
 const cover=safeLink(data.cover?.replace(/^http:/,'https:'));$('cover').hidden=true;$('cover').onload=()=>{$('cover').hidden=false;};$('cover').onerror=()=>{$('cover').hidden=true;};if(cover)$('cover').src=cover;else $('cover').removeAttribute('src');$('source').href=safeLink(data.source);
 $('pages').replaceChildren(...data.pages.map(p=>{const o=document.createElement('option');o.value=p.page;o.textContent='P'+p.page+' · '+p.title;o.selected=p.page===data.page;return o;}));$('page-label').hidden=data.pages.length<2;
 $('quality').replaceChildren(...choices().map((s,index)=>{const o=document.createElement('option');o.value=index;o.textContent=qualityLabel(s);return o;}));
 qualityPicker.refresh();
 $('downloads').replaceChildren();
 for(const s of data.streams){const row=document.createElement('div');row.className='advanced-row';const label=document.createElement('span');label.textContent=s.label;row.append(label);if(s.download){const a=document.createElement('a');a.textContent=s.kind==='video'?'下载画面':s.kind==='audio'?'下载音频':'单独下载';a.href=safeLink(s.download);row.append(a);}const link=document.createElement('a');link.textContent='视频直链 ↗';link.href=safeLink(s.url);link.target='_blank';link.rel='noopener noreferrer';row.append(link);$('downloads').append(row);}
 $('notices').textContent=(data.notices||[]).join(' ');$('more-downloads').open=false;$('progress-panel').hidden=true;updateChoice();$('result').hidden=false;
}
function progress(text,detail={}){
 $('progress-panel').hidden=false;$('download-status').className='';$('download-status').textContent=text;
 const stages=['video','audio','merge','save'];const index=stages.indexOf(detail.stage);
 for(const e of document.querySelectorAll('[data-step]')){const n=stages.indexOf(e.dataset.step);e.classList.toggle('active',n===index);e.classList.toggle('done',n<index);}
 if(detail.total>0&&detail.loaded!==undefined){$('download-progress').value=Math.min(100,detail.loaded/detail.total*100);$('download-status').textContent=text+' · '+Math.round(detail.loaded/detail.total*100)+'%';}else $('download-progress').removeAttribute('value');
}
$('quality').addEventListener('change',updateChoice);
$('download-button').addEventListener('click',async()=>{
 const s=selection();if(!s)return;
 if(s.kind!=='video'){const a=document.createElement('a');a.href=safeLink(s.download||s.url);if(!s.download){a.target='_blank';a.rel='noopener noreferrer';}a.click();$('progress-panel').hidden=false;$('download-status').className='';$('download-status').textContent=s.download?'已开始下载，请在浏览器下载列表查看进度。':'已打开视频链接，可在播放器菜单中保存。';document.querySelector('.progress-steps').hidden=true;$('download-progress').hidden=true;return;}
 const audio=currentData.streams.find(s=>s.kind==='audio'&&s.download);const filename=s.fullFilename||downloadFilename(currentData,s,{complete:true});
 const controls=[...$('form').querySelectorAll('button,input,textarea'),$('pages'),$('quality'),$('download-button')];controls.forEach(c=>c.disabled=true);$('download-button').setAttribute('aria-busy','true');$('download-button').textContent='正在下载…';document.querySelector('.progress-steps').hidden=false;$('download-progress').hidden=false;
 try{progress('正在准备高清下载…',{stage:'video'});const {mergeDownloads}=await import('/remux.js');const blob=await mergeDownloads(s.download,audio.download,progress);progress('正在保存完整 MP4…',{stage:'save'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);$('download-progress').value=100;$('download-status').textContent='合并完成，已交给浏览器保存。';document.querySelectorAll('[data-step]').forEach(e=>{e.classList.remove('active');e.classList.add('done');});}
 catch(error){$('download-status').className='error';$('download-status').textContent=error.message||'下载失败，请重新解析或展开更多下载方式。';$('download-progress').hidden=true;}
 finally{controls.forEach(c=>c.disabled=false);$('download-button').removeAttribute('aria-busy');updateChoice();}
});
async function parse(page=1){
 $('submit').disabled=true;$('pages').disabled=true;$('submit').textContent='正在解析…';$('status').className='';$('status').textContent='正在获取视频信息…';$('result').hidden=true;
 try{const r=await fetch('/api/parse',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:currentInput,page,cookie:currentCookie}),signal:AbortSignal.timeout(60000)});const data=await r.json();if(!r.ok)throw new Error(data.error||'解析失败。');render(data);$('status').textContent='解析完成，选择清晰度即可下载。';if(currentCookie)settings.open=false;}
 catch(e){$('status').className='error';$('status').textContent=e.name==='TimeoutError'?'解析超时，请稍后重试。':e.message;if(currentInput.includes('douyin'))settings.open=true;}
 finally{$('submit').disabled=false;$('pages').disabled=false;$('submit').textContent='解析视频 →';}
}
$('form').addEventListener('submit',e=>{e.preventDefault();currentInput=$('url').value.trim();currentCookie=$('cookie').value.trim();let page=1;try{page=Number(new URL(currentInput.match(/https?:\/\/[^\s]+/)?.[0]).searchParams.get('p'))||1;}catch{}parse(page);});
$('pages').addEventListener('change',()=>parse(Number($('pages').value)));
