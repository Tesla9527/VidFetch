export function createQualityPicker(select) {
  const wrapper=document.createElement('div');wrapper.className='quality-picker';
  const trigger=document.createElement('button');trigger.type='button';trigger.id='quality-trigger';trigger.className='quality-trigger';
  trigger.setAttribute('role','combobox');trigger.setAttribute('aria-label','视频清晰度');trigger.setAttribute('aria-haspopup','listbox');trigger.setAttribute('aria-expanded','false');trigger.setAttribute('aria-controls','quality-list');
  const caption=document.createElement('span');caption.className='quality-caption';
  const arrow=document.createElementNS('http://www.w3.org/2000/svg','svg');arrow.classList.add('quality-arrow');arrow.setAttribute('viewBox','0 0 24 24');arrow.setAttribute('aria-hidden','true');arrow.setAttribute('focusable','false');
  const chevron=document.createElementNS('http://www.w3.org/2000/svg','path');chevron.setAttribute('d','M6 9l6 6 6-6');chevron.setAttribute('fill','none');chevron.setAttribute('stroke','currentColor');chevron.setAttribute('stroke-width','1.8');chevron.setAttribute('stroke-linecap','round');chevron.setAttribute('stroke-linejoin','round');arrow.append(chevron);
  trigger.append(caption,arrow);
  const list=document.createElement('div');list.id='quality-list';list.className='quality-list';list.setAttribute('role','listbox');list.setAttribute('aria-label','视频清晰度');list.hidden=true;
  wrapper.append(trigger,list);select.after(wrapper);select.hidden=true;select.setAttribute('aria-hidden','true');select.tabIndex=-1;
  document.querySelector('label[for="quality"]').htmlFor=trigger.id;
  let active=0;
  const close=()=>{list.hidden=true;trigger.setAttribute('aria-expanded','false');trigger.removeAttribute('aria-activedescendant');};
  const highlight=()=>{[...list.children].forEach((item,index)=>item.classList.toggle('is-active',index===active));trigger.setAttribute('aria-activedescendant','quality-option-'+active);list.children[active]?.scrollIntoView({block:'nearest'});};
  const open=()=>{if(trigger.disabled||!select.options.length)return;active=select.selectedIndex;list.hidden=false;trigger.setAttribute('aria-expanded','true');highlight();};
  const choose=index=>{select.selectedIndex=index;select.dispatchEvent(new Event('change',{bubbles:true}));close();trigger.focus();};
  const sync=()=>{caption.textContent=select.selectedOptions[0]?.textContent||'选择清晰度';trigger.disabled=select.disabled||!select.options.length;[...list.children].forEach((item,index)=>{const selected=index===select.selectedIndex;item.setAttribute('aria-selected',String(selected));item.classList.toggle('is-selected',selected);});if(trigger.disabled)close();};
  const refresh=()=>{
    close();list.replaceChildren();
    [...select.options].forEach((option,index)=>{
      const item=document.createElement('button');item.type='button';item.tabIndex=-1;item.id='quality-option-'+index;item.className='quality-option';item.setAttribute('role','option');
      const text=document.createElement('span');text.className='quality-option-text';
      const parts=option.textContent.split(' · ');const title=document.createElement('strong');title.textContent=parts.shift();const detail=document.createElement('small');detail.textContent=parts.join(' · ')||'完整视频，包含声音';
      text.append(title,detail);const check=document.createElement('span');check.className='quality-check';check.textContent='✓';check.setAttribute('aria-hidden','true');item.append(text,check);
      item.addEventListener('click',()=>choose(index));item.addEventListener('pointermove',()=>{active=index;highlight();});list.append(item);
    });sync();
  };
  trigger.addEventListener('click',()=>list.hidden?open():close());
  trigger.addEventListener('keydown',event=>{
    if(event.key==='Escape'){close();return;}
    if(event.key==='Tab'){close();return;}
    if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
      event.preventDefault();if(list.hidden){open();if(event.key==='ArrowDown'||event.key==='ArrowUp')return;}
      active=event.key==='Home'?0:event.key==='End'?select.options.length-1:Math.max(0,Math.min(select.options.length-1,active+(event.key==='ArrowDown'?1:-1)));highlight();
    }else if(event.key==='Enter'||event.key===' '){event.preventDefault();list.hidden?open():choose(active);}
  });
  document.addEventListener('pointerdown',event=>{if(!wrapper.contains(event.target))close();});
  wrapper.addEventListener('focusout',event=>{if(!wrapper.contains(event.relatedTarget))close();});
  select.addEventListener('change',sync);
  new MutationObserver(sync).observe(select,{attributes:true,attributeFilter:['disabled']});
  refresh();return {refresh,sync,close};
}
