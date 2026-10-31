(() => {
 'use strict';
 const slider=document.getElementById('history-growth');
 const buildings=document.querySelectorAll('[data-arrival]');
 function updateHistory(){
  const progress=Number(slider.value);
  buildings.forEach(building=>building.classList.toggle('visible',progress>=Number(building.dataset.arrival)));
  const stage=progress>=100?'Un pequeño barrio alrededor del pozo.':progress>=65?'Más casas, caminos y edificios.':progress>=30?'Pequeñas construcciones y campamentos.':'Paisaje árido y pozo petrolero.';
  slider.setAttribute('aria-valuetext',stage+' Evolución simbólica.');
 }
 slider.addEventListener('input',updateHistory);
 updateHistory();
})();
