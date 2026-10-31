 'use strict';
(() => {
 const section=document.querySelector('#consecuencias');
 if(!section)return;
 const buttons=[...section.querySelectorAll('[data-rehab-view]')];
 const plants=[...section.querySelectorAll('.rehab-growth')];
 const tracks=[...section.querySelectorAll('.rehab-tracks')];
 function showView(restored){
  plants.forEach(plant=>{plant.style.opacity=restored?'1':'0';plant.style.transform=restored?'scale(1)':'scale(.05)';});
  section.querySelector('#rehab-furrows').setAttribute('opacity',restored?'.7':'0');
  section.querySelector('#rehab-roots').setAttribute('opacity',restored?'.75':'0');
  tracks.forEach(track=>track.style.opacity=restored?'.06':'.25');
  buttons.forEach(button=>button.setAttribute('aria-pressed',String((button.dataset.rehabView==='with')===restored)));
  section.querySelector('#rehab-scene-title').textContent=restored?'Con remediación: surcos, arbustos y flores en el mismo terreno':'Sin remediación: terreno compactado y vegetación escasa';
  section.querySelector('#rehab-view-status').textContent=restored?'Con remediación':'Sin remediación';
 }
 buttons.forEach(button=>button.addEventListener('click',()=>showView(button.dataset.rehabView==='with')));
 showView(false);
})();
