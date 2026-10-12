const encoder=new TextEncoder();
function clean(value){
  return String(value||'').normalize('NFC').replace(/[\u0000-\u001f\u007f<>:"/\\|?*\u202a-\u202e\u2066-\u2069]/g,'_').replace(/\s+/g,' ').trim().replace(/[. ]+$/,'');
}
function truncate(value,budget){
  let result='';let used=0;
  for(const char of value){const size=encoder.encode(char).length;if(used+size>budget)break;result+=char;used+=size;}
  return result.replace(/[. ]+$/,'');
}
export function downloadFilename(data,stream,{complete=false}={}){
  let title=clean(data.title)||'VidFetch';
  if(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(title))title='_'+title;
  const part=data.platform==='bilibili'&&data.pages?.length>1?data.pages.find(p=>p.page===data.page):undefined;
  if(part)title+='_P'+data.page+'_'+clean(part.title);
  const quality=stream.kind==='audio'?'':(stream.label?.match(/(\d{3,4}P|\dK|HDR|杜比视界)/i)?.[1]|| (stream.height?stream.height+'P':''));
  const suffix=(quality?'_'+quality:'')+(stream.fragment?'_片段'+stream.fragment:'')+(stream.kind==='audio'?'_音频':stream.kind==='video'&&!complete?'_仅画面':'');
  const ext=complete?'mp4':['mp4','m4a','flv'].includes(stream.extension)?stream.extension:'mp4';
  return (truncate(title,220-encoder.encode(suffix+'.'+ext).length)||'VidFetch')+suffix+'.'+ext;
}
