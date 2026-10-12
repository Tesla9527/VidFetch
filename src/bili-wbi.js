import {md5} from '@noble/hashes/legacy.js';
const order=[46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13,37,48,7,16,24,55,40,61,26,17,0,1,60,51,30,4,22,25,54,21,56,59,6,63,57,62,11,36,20,34,44,52];
export function mixinKey(images){
  if(!images.img_url||!images.sub_url)throw new Error('B 站未返回接口签名配置，请稍后重试。');
  const raw=[images.img_url,images.sub_url].map(url=>new URL(url).pathname.split('/').pop().split('.')[0]).join('');
  if(raw.length!==64||!/^[a-f0-9]+$/i.test(raw))throw new Error('B 站签名配置暂时不可用。');
  return order.map(index=>raw[index]).join('').slice(0,32);
}
export function signWbi(params,key,timestamp=Math.floor(Date.now()/1000)){
  const sorted={...params,wts:String(timestamp)};delete sorted.w_rid;
  const query=new URLSearchParams();
  for(const name of Object.keys(sorted).sort())query.set(name,String(sorted[name]).replace(/[!'()*]/g,''));
  const encoded=query.toString().replace(/%7E/gi,'~');
  const digest=md5(new TextEncoder().encode(encoded+key));
  return encoded+'&w_rid='+Array.from(digest,b=>b.toString(16).padStart(2,'0')).join('');
}
export function embeddedJson(html,marker){
  const at=html.indexOf(marker);if(at<0)return;
  const start=html.indexOf('{',at+marker.length);if(start<0)return;
  let depth=0,string=false,escaped=false;
  for(let i=start;i<html.length;i++){
    const c=html[i];if(escaped){escaped=false;continue;}if(string&&c==='\\'){escaped=true;continue;}
    if(c==='"'){string=!string;continue;}if(string)continue;
    if(c==='{')depth++;else if(c==='}'&&--depth===0){try{return JSON.parse(html.slice(start,i+1));}catch{return;}}
  }
}
