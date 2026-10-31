(() => {
 'use strict';
 const data=window.NEUQUEN_DEPARTMENTS,root=document.getElementById('well-data');
 if(!root||!data)return;
 const $=id=>document.getElementById(id),fmt=new Intl.NumberFormat('es-AR');
 const state=$('dept-state'),list=$('dept-list');
 const groups={
  active:{label:'Activos',color:'#34d399',states:['Extracción Efectiva','En Inyección Efectiva','Mantenimiento de Presión','Otras Situación Activo']},
  temporary:{label:'Transitorios',color:'#f1c56a',states:['Parado Transitoriamente','Abandono Temporario']},
  abandoned:{label:'Abandonados',color:'#bb96eb',states:['Abandonado']},
  pending:{label:'A abandonar',color:'#f08a74',states:['A Abandonar']},
  other:{label:'Otros estados / sin dato',color:'#91a3b2',states:[]}
 };
 const keys=Object.keys(groups),departmentName=id=>id===-1?'Sin asignar':data.departments[id];
 const groupOf=row=>keys.find(key=>groups[key].states.includes(data.states[row[4]]))||'other';
 const pointGroup=new Map(data.wells.map(row=>[row[0],groupOf(row)]));
 function node(tag,text,className){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;}
 function svg(tag,attributes){const el=document.createElementNS('http://www.w3.org/2000/svg',tag);Object.entries(attributes||{}).forEach(([key,value])=>el.setAttribute(key,String(value)));return el;}
 function project([lon,lat]){return {x:lon*Math.PI/180,y:-Math.log(Math.tan(Math.PI/4+lat*Math.PI/360))};}
 function bounds(points){return points.reduce((b,p)=>({minX:Math.min(b.minX,p.x),maxX:Math.max(b.maxX,p.x),minY:Math.min(b.minY,p.y),maxY:Math.max(b.maxY,p.y)}),{minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity});}
 const regions=data.geojson.features.map(feature=>{
  const geometry=feature.geometry,polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;
  const rings=polygons.flatMap(polygon=>polygon.map(ring=>ring.map(project)));
  return {id:data.departments.indexOf(feature.properties.departamento),rings,bounds:bounds(rings.flat())};
 });
 const provinceBounds=bounds(regions.flatMap(region=>region.rings.flat()));
 const positions=new Map(data.wells.filter(row=>row[3]).map(row=>[row[0],{...project(row[3]),row}]));
 let selected='ALL',map=null,latest=[],initialized=false;

 class ProvinceMap{
  constructor(container){
   this.container=container;this.width=500;this.height=600;this.center={x:0,y:0};this.scale=1;this.frame=null;this.drag=null;this.items=[];this.regionNodes=new Map();
   this.svg=svg('svg',{class:'native-map-svg',viewBox:'0 0 500 600',tabindex:'0',role:'group','aria-label':'Mapa de Neuquén. Flechas para desplazar, más y menos para acercar o alejar, Inicio para recentrar.'});
   this.land=svg('g');this.dots=svg('g');this.svg.append(this.land,this.dots);
   regions.forEach(region=>{
    const path=svg('path',{d:region.rings.map(ring=>'M'+ring.map(p=>p.x.toFixed(9)+','+p.y.toFixed(9)).join('L')+'Z').join(''),class:'native-department','fill-rule':'evenodd','vector-effect':'non-scaling-stroke','data-department':region.id,role:'button',tabindex:'0'});
    const title=svg('title');path.append(title);
    path.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();selectDepartment(String(region.id),true);}});
    this.regionNodes.set(region.id,{path,title});this.land.append(path);
   });
   this.controls=node('div',undefined,'native-map-controls');
   const makeButton=(text,label,fn)=>{const button=node('button',text);button.type='button';button.title=label;button.setAttribute('aria-label',label);button.addEventListener('click',fn);this.controls.append(button);};
   makeButton('+','Acercar el mapa',()=>this.zoomAt(this.width/2,this.height/2,1.7));
   makeButton('−','Alejar el mapa',()=>this.zoomAt(this.width/2,this.height/2,1/1.7));
   makeButton('↺','Recentrar la selección',()=>this.fitSelection());
   this.scaleBar=node('div',undefined,'native-map-scale');this.scaleLine=node('span');this.scaleLabel=node('span');this.scaleBar.append(this.scaleLine,this.scaleLabel);
   this.help=node('div','Arrastrá para mover · + y − para acercar', 'native-map-help');
   this.popup=node('div',undefined,'native-map-popup');this.popup.hidden=true;this.popup.setAttribute('role','dialog');this.popup.setAttribute('aria-label','Ficha del pozo');
   this.popup.addEventListener('keydown',event=>{if(event.key==='Escape'){this.closePopup();this.svg.focus({preventScroll:true});}});
   container.replaceChildren(this.svg,this.controls,this.scaleBar,this.help,this.popup);
   this.svg.addEventListener('pointerdown',event=>{
    if(event.button!==0&&event.pointerType!=='touch')return;
    const target=event.target.closest('[data-cluster],[data-department]');
    this.drag={id:event.pointerId,startX:event.clientX,startY:event.clientY,center:{...this.center},target,moved:false};
    this.svg.setPointerCapture(event.pointerId);event.preventDefault();
   });
   this.svg.addEventListener('pointermove',event=>{
    const drag=this.drag;if(!drag||event.pointerId!==drag.id)return;
    const dx=event.clientX-drag.startX,dy=event.clientY-drag.startY;
    if(!drag.moved&&Math.hypot(dx,dy)<4)return;
    drag.moved=true;this.center={x:drag.center.x-dx/this.scale,y:drag.center.y-dy/this.scale};this.closePopup();this.requestRender();
   });
   this.svg.addEventListener('pointerup',event=>{
    const drag=this.drag;if(!drag||drag.id!==event.pointerId)return;this.drag=null;
    if(this.svg.hasPointerCapture(event.pointerId))this.svg.releasePointerCapture(event.pointerId);
    if(!drag.moved){const target=drag.target;if(target?.hasAttribute('data-cluster'))this.activate(Number(target.getAttribute('data-cluster')));else if(target?.hasAttribute('data-department'))selectDepartment(target.getAttribute('data-department'),true);else this.closePopup();}
   });
   const cancel=()=>{this.drag=null;};this.svg.addEventListener('pointercancel',cancel);this.svg.addEventListener('lostpointercapture',cancel);
   this.svg.addEventListener('dblclick',event=>{event.preventDefault();const rect=this.svg.getBoundingClientRect();this.zoomAt(event.clientX-rect.left,event.clientY-rect.top,2);});
   this.svg.addEventListener('keydown',event=>{
    const pan={ArrowLeft:[-45,0],ArrowRight:[45,0],ArrowUp:[0,-45],ArrowDown:[0,45]};
    if(pan[event.key]){event.preventDefault();this.center.x+=pan[event.key][0]/this.scale;this.center.y+=pan[event.key][1]/this.scale;this.closePopup();this.requestRender();this.svg.focus({preventScroll:true});}
    else if(['+','=','-','−'].includes(event.key)){event.preventDefault();this.zoomAt(this.width/2,this.height/2,event.key==='-'||event.key==='−'?1/1.7:1.7);this.svg.focus({preventScroll:true});}
    else if(event.key==='Home'){event.preventDefault();this.fitSelection();}
    else if(event.key==='Escape')this.closePopup();
   });
   this.measure(true);
   if('ResizeObserver' in window)new ResizeObserver(()=>this.measure()).observe(container);else window.addEventListener('resize',()=>this.measure());
  }
  measure(first=false){
   const width=this.container.clientWidth||500,height=this.container.clientHeight||600;if(!first&&width===this.width&&height===this.height)return;
   const ratio=this.baseScale?this.scale/this.baseScale:1;this.width=width;this.height=height;this.svg.setAttribute('viewBox','0 0 '+width+' '+height);
   this.baseScale=Math.min((width-48)/(provinceBounds.maxX-provinceBounds.minX),(height-48)/(provinceBounds.maxY-provinceBounds.minY));
   if(first){this.fit(provinceBounds);}else{this.scale=this.baseScale*ratio;this.requestRender();}
  }
  fit(box){
   if(!Number.isFinite(box.minX))box=provinceBounds;
   this.center={x:(box.minX+box.maxX)/2,y:(box.minY+box.maxY)/2};
   this.scale=Math.min(this.baseScale*4096,Math.max(this.baseScale*.7,Math.min((this.width-64)/Math.max(1e-8,box.maxX-box.minX),(this.height-64)/Math.max(1e-8,box.maxY-box.minY))));
   this.closePopup();this.requestRender();
  }
  fitSelection(){
   if(selected==='ALL')this.fit(provinceBounds);
   else if(selected==='-1')this.fit(bounds(this.items));
   else this.fit(regions.find(region=>region.id===Number(selected)).bounds);
  }
  zoomAt(x,y,factor){
   const before={x:this.center.x+(x-this.width/2)/this.scale,y:this.center.y+(y-this.height/2)/this.scale};
   this.scale=Math.min(this.baseScale*4096,Math.max(this.baseScale*.7,this.scale*factor));
   this.center={x:before.x-(x-this.width/2)/this.scale,y:before.y-(y-this.height/2)/this.scale};this.closePopup();this.requestRender();
  }
  update(rows,stats){
   this.items=rows.filter(row=>row[3]).map(row=>positions.get(row[0]));
   this.regionNodes.forEach(({path,title},id)=>{
    const active=selected===String(id),count=stats.find(stat=>stat.id===id)?.total||0;
    path.setAttribute('fill',active?'#a87d40':'#255568');path.setAttribute('fill-opacity',active?'.66':'.45');
    path.setAttribute('stroke',active?'#f0c37e':'#7cafbe');path.setAttribute('stroke-width',active?'2.5':'1.3');
    path.setAttribute('aria-pressed',String(active));path.setAttribute('aria-label',data.departments[id]+', '+fmt.format(count)+' pozos');title.textContent=data.departments[id]+' · '+fmt.format(count)+' pozos';
   });this.closePopup();this.requestRender();
  }
  requestRender(){if(this.frame!==null)return;this.frame=requestAnimationFrame(()=>{this.frame=null;this.render();});}
  render(){
   const tx=this.width/2-this.center.x*this.scale,ty=this.height/2-this.center.y*this.scale;
   this.land.setAttribute('transform','matrix('+this.scale+' 0 0 '+this.scale+' '+tx+' '+ty+')');
   const cells=new Map(),cellSize=38;
   this.items.forEach(point=>{
    const x=point.x*this.scale+tx,y=point.y*this.scale+ty;if(x< -24||x>this.width+24||y< -24||y>this.height+24)return;
    const key=Math.floor(x/cellSize)+':'+Math.floor(y/cellSize);
    if(!cells.has(key))cells.set(key,{x:0,y:0,points:[]});const cell=cells.get(key);cell.x+=x;cell.y+=y;cell.points.push(point);
   });
   this.clusters=[...cells.values()];
   this.clusters.forEach(cluster=>{cluster.x/=cluster.points.length;cluster.y/=cluster.points.length;});
   let merged=true;
   while(merged){
    merged=false;
    outer:for(let i=0;i<this.clusters.length;i++)for(let j=i+1;j<this.clusters.length;j++){
     const a=this.clusters[i],b=this.clusters[j],radiusA=a.points.length>1?20:6,radiusB=b.points.length>1?20:6;
     if(Math.hypot(a.x-b.x,a.y-b.y)>=radiusA+radiusB+5)continue;
     const total=a.points.length+b.points.length;a.x=(a.x*a.points.length+b.x*b.points.length)/total;a.y=(a.y*a.points.length+b.y*b.points.length)/total;
     a.points.push(...b.points);this.clusters.splice(j,1);merged=true;break outer;
    }
   }
   const fragment=document.createDocumentFragment();
   this.clusters.forEach((cluster,index)=>{
    const count=cluster.points.length;
    const glyph=svg('g',{transform:'translate('+cluster.x.toFixed(2)+' '+cluster.y.toFixed(2)+')','data-cluster':index,tabindex:'0',role:'button',class:'native-map-point','aria-label':count===1?(cluster.points[0].row[1]||'Pozo '+cluster.points[0].row[0])+': '+data.states[cluster.points[0].row[4]]:fmt.format(count)+' pozos. Acercar este grupo.'});
    if(count===1)glyph.append(svg('circle',{r:5,fill:groups[pointGroup.get(cluster.points[0].row[0])].color,stroke:'#f0f4ef','stroke-width':1}));
    else{
     glyph.append(svg('circle',{r:19,fill:'#102631',stroke:'#ffffff25','stroke-width':1}));
     const counts={active:0,temporary:0,abandoned:0,pending:0,other:0};cluster.points.forEach(point=>counts[pointGroup.get(point.row[0])]++);
     let offset=0;const circumference=2*Math.PI*18;
     keys.forEach(key=>{if(!counts[key])return;const length=counts[key]/count*circumference;glyph.append(svg('circle',{r:18,fill:'none',stroke:groups[key].color,'stroke-width':3,'stroke-dasharray':length+' '+(circumference-length),'stroke-dashoffset':-offset,transform:'rotate(-90)'}));offset+=length;});
     const text=svg('text',{'text-anchor':'middle',dy:'.35em'});text.textContent=fmt.format(count);glyph.append(text);
    }
    glyph.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();this.activate(index,true);}});
    fragment.append(glyph);
   });this.dots.replaceChildren(fragment);
   const latitude=2*Math.atan(Math.exp(-this.center.y))-Math.PI/2,metersPerPixel=6371008.8*Math.cos(latitude)/this.scale;
   const target=90*metersPerPixel,magnitude=10**Math.floor(Math.log10(target)),distance=[5,2,1].map(n=>n*magnitude).find(n=>n<=target)||magnitude/2;
   this.scaleLine.style.width=(distance/metersPerPixel)+'px';this.scaleLabel.textContent=distance>=1000?fmt.format(distance/1000)+' km':fmt.format(distance)+' m';
  }
  activate(index,focus=false){
   const cluster=this.clusters[index];if(!cluster)return;
   if(cluster.points.length===1){this.showPopup(cluster.points,focus);return;}
   const box=bounds(cluster.points),samePosition=Math.max(box.maxX-box.minX,box.maxY-box.minY)<1e-9;
   if(samePosition||this.scale>=this.baseScale*4095)this.showPopup(cluster.points,focus);
   else{this.zoomAt(cluster.x,cluster.y,2);if(focus)this.svg.focus({preventScroll:true});}
  }
  showPopup(points,focus){
   this.popup.replaceChildren();const close=node('button','×','native-popup-close');close.type='button';close.setAttribute('aria-label','Cerrar ficha');close.addEventListener('click',()=>{this.closePopup();this.svg.focus();});this.popup.append(close);
   if(points.length>1){
    const label=node('label',fmt.format(points.length)+' pozos en esta ubicación','native-popup-picker'),select=node('select');
    points.forEach(point=>{const opt=node('option',point.row[1]||'Pozo '+point.row[0]);opt.value=point.row[0];select.append(opt);});label.append(select);this.popup.append(label);
    select.addEventListener('change',()=>fill(points.find(point=>point.row[0]===select.value).row));
   }
   const body=node('div',undefined,'native-popup-body');this.popup.append(body);
   const fill=row=>{
    body.replaceChildren(node('h4',row[1]||'Pozo '+row[0]));
    [['Departamento',departmentName(row[2])],['Empresa',data.companies[row[5]]],['Yacimiento',data.fields[row[6]]],['Formación',data.formations[row[7]]],['Recurso',data.resources[row[8]]],['Tipo',data.types[row[9]]],['Estado',data.states[row[4]]],['Profundidad',row[10]===null?'No informada':fmt.format(row[10])+' m']].forEach(([label,value])=>{const line=node('div');line.append(node('strong',label+': '),node('span',value));body.append(line);});
   };fill(points[0].row);this.popup.hidden=false;if(focus)close.focus();
  }
  closePopup(){this.popup.hidden=true;}
 }

 const groupedOptions=node('optgroup');groupedOptions.label='Grupos de estados';keys.forEach(key=>{const opt=node('option',groups[key].label);opt.value='group:'+key;groupedOptions.append(opt);});state.append(groupedOptions);
 const originalOptions=node('optgroup');originalOptions.label='Estados del archivo';data.states.forEach((name,index)=>{const opt=node('option',name);opt.value=String(index);originalOptions.append(opt);});state.append(originalOptions);
 function matchesState(row){return state.value===''||(state.value.startsWith('group:')?pointGroup.get(row[0])===state.value.slice(6):row[4]===Number(state.value));}
 function statistics(rows){
  const stats=Array.from({length:data.departments.length+1},(_,i)=>({id:i===data.departments.length?-1:i,total:0,active:0,temporary:0,abandoned:0,pending:0,other:0}));
  rows.forEach(row=>{const stat=stats[row[2]===-1?data.departments.length:row[2]];stat.total++;stat[pointGroup.get(row[0])]++;});return stats;
 }
 function renderList(stats){
  const scrollTop=list.scrollTop,max=Math.max(1,...stats.map(stat=>stat.total));list.replaceChildren();
  [...stats].sort((a,b)=>b.total-a.total||departmentName(a.id).localeCompare(departmentName(b.id),'es')).forEach(stat=>{
   if(stat.id===-1&&stat.total===0)return;
   const card=node('button',undefined,'dept-card');card.type='button';card.dataset.department=String(stat.id);card.setAttribute('aria-pressed',String(selected===String(stat.id)));
   const heading=node('span',undefined,'dept-card-heading');heading.append(node('strong',departmentName(stat.id)),node('b',fmt.format(stat.total)+' pozos'));
   const details=node('span',undefined,'dept-card-stats');['active','temporary','abandoned','pending'].forEach(key=>{const item=node('span',groups[key].label+': '+fmt.format(stat[key]));item.style.color=groups[key].color;details.append(item);});if(stat.other)details.append(node('span','Otros: '+fmt.format(stat.other)));
   const track=node('span',undefined,'dept-card-track'),bar=node('i');bar.style.width=(stat.total/max*100)+'%';track.append(bar);track.setAttribute('aria-hidden','true');
   card.append(heading,details,track);card.addEventListener('click',()=>{selectDepartment(String(stat.id),true);list.querySelector('[data-department="'+stat.id+'"]').focus({preventScroll:true});});list.append(card);
  });list.scrollTop=scrollTop;
 }
 function renderOperators(rows){
  const container=$('operator-chart-bars');if(!container)return;
  const companies=new Map();
  rows.forEach(row=>{if(!companies.has(row[5]))companies.set(row[5],{id:row[5],total:0,active:0,temporary:0,abandoned:0,pending:0,other:0});const company=companies.get(row[5]);company.total++;company[pointGroup.get(row[0])]++;});
  const top=[...companies.values()].sort((a,b)=>b.total-a.total||data.companies[a.id].localeCompare(data.companies[b.id],'es')).slice(0,10);
  const max=top[0]?.total||1;container.replaceChildren();
  $('operator-chart-context').textContent=(selected==='ALL'?'Todo Neuquén':departmentName(Number(selected)))+' · '+(state.value===''?'Todos los estados':state.value.startsWith('group:')?groups[state.value.slice(6)].label:data.states[Number(state.value)]);
  $('operator-chart-axis').hidden=top.length===0;
  const ticks=$('operator-chart-ticks');ticks.replaceChildren();
  for(let i=0;i<=4;i++)ticks.append(node('span',fmt.format(Math.round(max*i/4))));
  top.forEach(company=>{
   const name=data.companies[company.id]==='No informado'?'Sin empresa informada':data.companies[company.id];
   const row=node('div',undefined,'operator-chart-row');row.setAttribute('role','listitem');row.dataset.company=String(company.id);
   const label=node('span',name,'operator-chart-company'),track=node('div',undefined,'operator-chart-track'),bar=node('div',undefined,'operator-chart-bar'),total=node('strong',fmt.format(company.total),'operator-chart-total');
   label.title=name;bar.style.width=(company.total/max*100)+'%';
   const descriptions=[];
   keys.forEach(key=>{if(!company[key])return;const segment=node('span');segment.style.width=(company[key]/company.total*100)+'%';segment.style.background=groups[key].color;segment.title=groups[key].label+': '+fmt.format(company[key]);segment.setAttribute('aria-hidden','true');bar.append(segment);descriptions.push(groups[key].label+': '+fmt.format(company[key]));});
   track.append(bar);track.setAttribute('role','img');track.setAttribute('aria-label',fmt.format(company.total)+' pozos. '+descriptions.join('. '));row.append(label,track,total);container.append(row);
  });
  if(!top.length)container.append(node('p','No hay pozos para esta selección.','operator-chart-empty'));
 }
 function update(){
  const rows=data.wells.filter(matchesState),stats=statistics(rows);latest=rows.filter(row=>selected==='ALL'||row[2]===Number(selected));const located=latest.filter(row=>row[3]).length;
  $('dept-map-status').textContent=(selected==='ALL'?'Todo Neuquén':departmentName(Number(selected)))+' · '+fmt.format(latest.length)+' pozos'+(located!==latest.length?' ('+fmt.format(located)+' en el mapa)':'');
  $('dept-filter-note').textContent=state.value===''?'Todos los estados':state.value.startsWith('group:')?groups[state.value.slice(6)].label:data.states[Number(state.value)];renderList(stats);renderOperators(latest);if(map)map.update(latest,stats);
 }
 function selectDepartment(id,move){selected=id;update();if(map&&move)map.fitSelection();}
 function initialize(){if(initialized)return;initialized=true;map=new ProvinceMap($('dept-map'));update();map.fitSelection();}
 state.addEventListener('change',update);$('dept-reset').addEventListener('click',()=>{state.value='';selectDepartment('ALL',true);});update();
 if('IntersectionObserver' in window){const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){observer.disconnect();initialize();}},{rootMargin:'250px'});observer.observe(root);}else initialize();
})();
