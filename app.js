import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.49.8';
const $=id=>document.getElementById(id);let db,tab='import',drivers=[],rows=[],pages={routes:0,sac:0,occurrences:0},totals={routes:0,sac:0,occurrences:0},pending=[],checks=[],nfPending=[],modalSave=()=>{};
const cfg=window.INNOVA_PCD_CONFIG||{};
function message(s,err=false){$('message').textContent=s;$('message').className='msg'+(err?' error':'');}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function norm(s){return String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');}
function today(){return new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});}
function table(head,data){return '<table><thead><tr>'+head.map(x=>`<th>${esc(x)}</th>`).join('')+'</tr></thead><tbody>'+data.map(r=>'<tr>'+r.map(v=>`<td>${esc(v)}</td>`).join('')+'</tr>').join('')+'</tbody></table>';}
async function rpc(fn,args={}){const {data,error}=await db.rpc(fn,args);if(error)throw Error(error.message);return data;}
// V13.18: restaura a sessão antes de carregar dados operacionais.
// Uma falha temporária de RPC não deve devolver o usuário autenticado à tela de login.
let loginTransition=false;
const FINANCE_OWNER_EMAIL='michelbarbosa@innovasl.com.br';
let financeOwner=false;
function requireFinanceOwner(){if(!financeOwner)throw Error('Faturamento restrito ao usuário autorizado.');}

async function init(){
 try{
  if(!cfg.supabaseUrl?.startsWith('https://')||!cfg.supabasePublishableKey||cfg.supabasePublishableKey.includes('SUBSTITUIR'))throw Error('Mantenha o config.js já configurado na V4. A chave pública não está preenchida.');
  db=createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storage:window.localStorage}});
  const {data,error}=await db.auth.getSession();
  if(error)throw error;
  if(data?.session?.user){await enter(data.session.user);return;}
  message('Acesse com seu Google corporativo. O acesso por senha permanece temporariamente durante a migração.');
 }catch(e){message('Não foi possível restaurar a sessão: '+e.message,true);}
}
async function enter(user){
 if(loginTransition)return;
 loginTransition=true;
 try{
  if(!String(user?.email||'').toLowerCase().endsWith('@innovasl.com.br')){
   await db.auth.signOut();throw Error('Acesso restrito a contas corporativas @innovasl.com.br.');
  }
  $('who').textContent=user.email;
  const financeAdmin=String(user.email||'').toLowerCase()===FINANCE_OWNER_EMAIL;
  financeOwner=financeAdmin;
  document.querySelectorAll('[data-tab="billing"]').forEach(el=>{el.classList.toggle('hidden',!financeOwner);el.disabled=!financeOwner;});
  $('finance-params-nav').classList.toggle('hidden',!financeAdmin);
  $('login-panel').classList.add('hidden');
  $('main').classList.remove('hidden');
  $('logout').classList.remove('hidden');
  $('message').classList.add('hidden');
  // As consultas são independentes da autenticação e não devem forçar novo login.
  try{await refreshMetrics();}catch(e){message('Sessão mantida. Falha ao atualizar indicadores: '+e.message,true);}
  try{await showTab('routes');}catch(e){message('Sessão mantida. Falha ao carregar programação: '+e.message,true);}
  try{await refreshHealth();}catch(e){console.warn('Saúde do sistema indisponível:',e);}
 }finally{loginTransition=false;}
}
$('login').onclick=async()=>{try{$('login').disabled=true;const {data,error}=await db.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});if(error)throw error;await enter(data.user);}catch(e){message('Não foi possível entrar: '+e.message,true);}finally{$('login').disabled=false;}};
$('google-login').onclick=async()=>{try{if(!db)throw Error('Supabase não configurado.');const {error}=await db.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+location.pathname,queryParams:{hd:'innovasl.com.br',prompt:'select_account'}}});if(error)throw error;}catch(e){message('Falha ao iniciar Google: '+e.message,true);}};
$('logout').onclick=async()=>{await db.auth.signOut();location.reload();};

async function refreshMetrics(){const a=await rpc('pcd_dashboard');$('metric-routes').textContent=a.total_routes;const day=$('availability-date').value||today();drivers=await rpc('pcd_v8_drivers',{p_date:day});$('metric-drivers').textContent=drivers.length;$('metric-available').textContent=drivers.filter(d=>d.day_status==='DISPONIVEL').length;$('metric-assigned').textContent=drivers.filter(d=>d.day_status==='PROGRAMADO').length;}
async function showTab(t){if(t==='billing'&&!financeOwner){message('Faturamento restrito ao usuário autorizado.',true);return;}if(t==='finance-params'&&$('finance-params-nav').classList.contains('hidden')){message('Acesso restrito ao administrador.',true);return;}tab=t;document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===t));document.querySelectorAll('[data-go]').forEach(b=>b.classList.toggle('active',b.dataset.go===t));for(const x of ['import','routes','billing','finance-params','availability','sac','occurrences','recipients','reasons','operational-summary'])$('panel-'+x).classList.toggle('hidden',x!==t);try{if(t==='operational-summary')await loadOperationalSummary();if(t==='billing')await loadBilling();if(t==='finance-params')await loadFinanceParams();if(t==='availability')await loadAvailability();if(t==='routes'||t==='sac')await loadRoutes(t);if(t==='occurrences')await loadOccurrences();if(t==='recipients')await loadRecipients();if(t==='reasons')await loadReasons();}catch(e){message(e.message,true);}}
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>showTab(b.dataset.tab));
const sideToggle=$('sidebar-toggle'),cadToggle=$('cadastros-toggle'),cadMenu=$('cadastros-submenu');
sideToggle.onclick=()=>{const collapsed=document.body.classList.toggle('sidebar-collapsed');sideToggle.title=collapsed?'Expandir menu':'Recolher menu';sideToggle.querySelector('span').textContent=collapsed?'Expandir menu':'Recolher menu';};
$('tolls-nav').onclick=()=>message('Cadastro de pedágios: módulo ainda não disponível nesta versão.');
cadToggle.onclick=()=>{if(document.body.classList.contains('sidebar-collapsed'))document.body.classList.remove('sidebar-collapsed');const isHidden=cadMenu.classList.toggle('hidden');cadToggle.setAttribute('aria-expanded',String(!isHidden));};

document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>showTab(b.dataset.go));
$('availability-date').value=today();
async function loadAvailability(){
 drivers=await rpc('pcd_v8_drivers',{p_date:$('availability-date').value});
 const cat=avSelected('availability-category'),profile=avSelected('availability-profile'),status=avSelected('availability-status'),query=norm($('availability-search').value);
 const shown=drivers.filter(d=>(!cat.length||cat.includes(d.category))&&(!profile.length||profile.some(x=>norm(x)===norm(d.profile)))&&(!status.length||status.includes(d.day_status))&&(!query||norm(d.name).includes(query)||norm(d.plate).includes(query)));
 const previous=await loadPreviousRoutes($('availability-date').value);
 const key=availabilitySort.key,dir=availabilitySort.dir;
 shown.sort((a,b)=>{const av=key==='routes_count'?Number(a.routes_count):String(a[key]??'').toLocaleUpperCase('pt-BR');const bv=key==='routes_count'?Number(b.routes_count):String(b[key]??'').toLocaleUpperCase('pt-BR');const v=typeof av==='number'?av-bv:String(av).localeCompare(String(bv),'pt-BR',{numeric:true});return (v||a.name.localeCompare(b.name,'pt-BR'))*dir;});
 $('availability-table').innerHTML=table(['Motorista','Placa','Perfil','Categoria','Status','Status rota anterior','Disponibilidade'],shown.map(d=>[d.registration_pending?d.name+' · PENDENTE':d.name,d.plate,d.profile,d.category,'','','']));
 const columns=['name','plate','profile','category','day_status',null];
 $('availability-table').querySelectorAll('thead th').forEach((th,i)=>{if(i>=columns.length||!columns[i])return;th.style.cursor='pointer';th.title='Clique para ordenar';th.textContent+=(availabilitySort.key===columns[i]?(availabilitySort.dir===1?' ▲':' ▼'):' ↕');th.onclick=()=>{availabilitySort.dir=availabilitySort.key===columns[i]?-availabilitySort.dir:(columns[i]==='routes_count'?-1:1);availabilitySort.key=columns[i];loadAvailability().catch(e=>message(e.message,true));};});
 $('availability-table').querySelectorAll('tbody tr').forEach((tr,i)=>{
  const d=shown[i],statusCell=tr.children[4],cell=tr.lastElementChild;
  if(d.registration_pending){
   const edit=document.createElement('button');edit.type='button';edit.className='av-action';edit.textContent='Completar cadastro';
   edit.style.marginLeft='6px';
   edit.onclick=()=>{
     modal('Completar cadastro do motorista',esc(d.name)+' · cadastro provisório',
       '<label>Nome</label><input id="v1323-name" value="'+esc(d.name)+'">'+
       '<label>Placa</label><input id="v1323-plate" value="'+esc(d.plate)+'">'+
       '<label>Perfil</label><input id="v1323-profile" value="'+esc(d.profile)+'">'+
       '<label>Categoria</label><select id="v1323-category"><option value="SPOT">SPOT</option><option value="AGREGADO">AGREGADO</option></select>',
       async()=>{await rpc('pcd_v1323_complete_driver',{p_driver_id:d.id,p_name:$('v1323-name').value,p_plate:$('v1323-plate').value,p_profile:$('v1323-profile').value,p_category:$('v1323-category').value});await loadAvailability();message('Cadastro complementado.');});
     $('v1323-category').value=d.category;
   };
   tr.children[0].append(edit);
  }

  const old=previous.get(String(d.id))||[];const prevCell=tr.children[5];
  if(old.length){
   const statuses=[...new Set(old.map(r=>routeDisplayStatus(r)))];
   const priority=['EM ROTA','NÃO EMBARCOU','PROGRAMADO','EMPLACAR','CONCLUÍDO'];
   const chosen=priority.find(x=>statuses.includes(x))||statuses[0];
   const btn=document.createElement('button');btn.type='button';btn.className='av-previous-status av-sac-badge '+(chosen==='PROGRAMADO'?'av-sac-programmed':chosen==='EMPLACAR'?'av-sac-toassign':chosen==='NÃO EMBARCOU'?'av-sac-notboarded':chosen==='EM ROTA'?'av-sac-inroute':chosen==='CONCLUÍDO'?'av-sac-completed':'av-sac-other');
   btn.textContent=chosen+(old.length>1?' · '+old.length+' rotas':'');btn.title='Status da rota anterior (SAC). Clique para consultar as rotas.';
   btn.onclick=()=>{modal('Status da rota anterior',d.name+' · '+brDate(old[0].route_date),'<div class="av-prev-details">'+old.map(r=>'<p><b>Plano:</b> '+esc(r.plan_number)+' · <b>Cidade:</b> '+esc(r.city||r.destination||'—')+' · <b>Carregamento:</b> '+esc(brDate(r.loading_on))+' '+esc(r.loading_time||'')+' · <b>Status SAC:</b> '+esc(routeDisplayStatus(r))+'</p>').join('')+'</div>',async()=>{});$('modal-save').classList.add('hidden');};prevCell.append(btn);
  }else prevCell.textContent='—';
  const styles={DISPONIVEL:'available',INDISPONIVEL:'unavailable',PROGRAMADO:'assigned',INATIVO:'inactive'};
  const pill=document.createElement('span');pill.className='av-status '+(styles[d.day_status]||'inactive');pill.textContent=d.day_status;statusCell.append(pill);
  const wrap=document.createElement('div');wrap.className='av-actions';
  for(const [label,next,klass] of [['Disponibilizar','DISPONIVEL','available-action'],['Não disponibilizar','INDISPONIVEL','unavailable-action']]){
   const b=document.createElement('button');b.className='av-action '+klass;b.textContent=label;
   b.disabled=d.base_status==='INATIVO'||Number(d.routes_count)>0||d.day_status===next;
   b.title=Number(d.routes_count)>0?'Motorista já escalado: alteração exige revisão da programação.':d.base_status==='INATIVO'?'Motorista inativo.':'';
   b.onclick=async()=>{try{await rpc('pcd_v8_set_availability',{p_driver_id:d.id,p_date:$('availability-date').value,p_status:next});await loadAvailability();await refreshMetrics();message('Disponibilidade atualizada.');}catch(e){message(e.message,true);}};
   wrap.append(b);
  }
  cell.append(wrap);
 });
}
const availabilitySort={key:'name',dir:1};
function avSelected(id){return [...$(id).querySelectorAll('input:checked')].map(x=>x.value);}
for(const id of ['availability-category','availability-profile','availability-status']){
 const el=$(id);const summary=el.querySelector('summary');
 const update=()=>{const selected=avSelected(id);summary.textContent=selected.length?selected.length===1?el.querySelector('input:checked').parentElement.textContent.trim():selected.length+' selecionados':'Todos';loadAvailability().catch(e=>message(e.message,true));};
 el.querySelectorAll('input').forEach(c=>c.addEventListener('change',update));
 el.querySelector('.av-multi-clear').onclick=()=>{el.querySelectorAll('input').forEach(c=>c.checked=false);update();};
}
async function loadPreviousRoutes(date){
 const result=new Map();if(!date)return result;
 const dt=new Date(date+'T12:00:00Z');dt.setUTCDate(dt.getUTCDate()-1);const prev=dt.toISOString().slice(0,10);
 try{
  const first=await rpc('pcd_v8_routes',{p_search:'',p_date:prev,p_limit:100,p_offset:0});
  const total=Number(first.total)||0;const all=[...(first.rows||[])];
  for(let offset=100;offset<total;offset+=100){const next=await rpc('pcd_v8_routes',{p_search:'',p_date:prev,p_limit:100,p_offset:offset});all.push(...(next.rows||[]));}
  for(const r of all){if(String(r.route_date||'').slice(0,10)!==prev||!r.driver_id||norm(r.route_status)==='NAOEMBARCOU')continue;const k=String(r.driver_id);if(!result.has(k))result.set(k,[]);result.get(k).push(r);}
 }catch(e){console.warn('Consulta de rota anterior indisponível:',e);message('Não foi possível consultar as rotas anteriores: '+e.message,true);}
 return result;
}
$('availability-search').addEventListener('input',()=>loadAvailability().catch(e=>message(e.message,true)));$('refresh-availability').onclick=loadAvailability;$('availability-date').onchange=async()=>{await loadAvailability();await refreshMetrics();};

// V13: percorre TODAS as páginas do RPC existente antes de filtrar e totalizar.
// Não soma somente os 50 registros visíveis; não altera o banco.
let v13Filtered=[],v13Loaded=new Set(),routeSort={index:null,dir:-1};
async function v13FetchAll(search){
 const first=await rpc('pcd_v8_routes',{p_search:search,p_date:null,p_limit:50,p_offset:0});
 const total=Number(first.total)||0,all=[...(first.rows||[])];
 for(let offset=50;offset<total;offset+=50){
  const part=await rpc('pcd_v8_routes',{p_search:search,p_date:null,p_limit:50,p_offset:offset});
  if(!part||!Array.isArray(part.rows))throw Error('Consulta incompleta: não foi possível obter todas as rotas.');
  all.push(...part.rows);
 }
 if(all.length!==total)throw Error('A consulta retornou '+all.length+' de '+total+' rotas. Atualize e tente novamente.');
 return all;
}
function v13RenderSummary(data){
 const active=data.filter(r=>routeDisplayStatus(r)!=='NÃO EMBARCOU');
 const sum=(arr,key)=>arr.reduce((n,r)=>n+(Number(r[key])||0),0);
 const opp=active.filter(r=>{const offered=PROFILE_ORDER.indexOf(norm(r.vehicle_profile));const actual=PROFILE_ORDER.indexOf(norm(r.driver_profile||r.assigned_profile||''));return offered>=0&&actual>=0&&actual<offered&&!!r.driver_name;}).length;
 const cards=[['Rotas ofertadas',data.length.toLocaleString('pt-BR')],['Peso total',sum(active,'gross_weight').toLocaleString('pt-BR',{maximumFractionDigits:2})+' kg'],['Entregas totais',sum(active,'delivery_count').toLocaleString('pt-BR')],['Valor mercadoria',sum(active,'merchandise_value').toLocaleString('pt-BR',{style:'currency',currency:'BRL'})],['Oportunidades',opp+' confirmadas'],['Não embarcaram',data.length-active.length]];
 $('route-summary').innerHTML=cards.map(([label,value])=>`<div class="v13-card"><small>${esc(label)}</small><strong>${esc(value)}</strong></div>`).join('');
 // Sem perfil do motorista retornado pela consulta, a oportunidade permanece conservadora (não presumida).
}
function selectedRouteStatuses(){return [...document.querySelectorAll('#route-status-menu input[type="checkbox"]:checked')].map(x=>x.value);}
function updateRouteStatusLabel(){const a=selectedRouteStatuses();$('route-status-label').textContent=a.length?a.join(', '):'Todos os status';}
document.querySelectorAll('#route-status-menu input[type="checkbox"]').forEach(x=>x.addEventListener('change',()=>{updateRouteStatusLabel();pages.routes=0;loadRoutes('routes').catch(e=>message(e.message,true));}));
$('route-status-clear').onclick=()=>{document.querySelectorAll('#route-status-menu input[type="checkbox"]').forEach(x=>x.checked=false);updateRouteStatusLabel();pages.routes=0;loadRoutes('routes').catch(e=>message(e.message,true));};
function selectedSACStatuses(){return [...document.querySelectorAll('#sac-status-menu input[type="checkbox"]:checked')].map(x=>x.value);}
function updateSACStatusLabel(){const a=selectedSACStatuses();$('sac-status-label').textContent=a.length?a.join(', '):'Todos os status';}
document.querySelectorAll('#sac-status-menu input[type="checkbox"]').forEach(x=>x.addEventListener('change',()=>{updateSACStatusLabel();pages.sac=0;loadRoutes('sac').catch(e=>message(e.message,true));}));
$('sac-status-clear').onclick=()=>{document.querySelectorAll('#sac-status-menu input[type="checkbox"]').forEach(x=>x.checked=false);updateSACStatusLabel();pages.sac=0;loadRoutes('sac').catch(e=>message(e.message,true));};
// Remover apenas a data ISO indevidamente concatenada ao complemento pelo backend.
// Não inferir complemento a partir da data da solicitação.
function routeComplement(r){const raw=String(r.complement??'').trim();return raw.replace(/(?:\s*[·|;,]\s*|\s+)\d{4}-\d{2}-\d{2}\s*$/,'').replace(/^\d{4}-\d{2}-\d{2}$/,'').trim()||'—';}
// V13.8: complemento completo em janela flutuante, sem ampliar a tabela.
let complementPopup=null;
function closeComplementPopup(){if(complementPopup){complementPopup.remove();complementPopup=null;}}
function openComplementPopup(anchor,plan,value){
 closeComplementPopup();
 const pop=document.createElement('div');pop.className='v138-complement-popup';pop.setAttribute('role','dialog');pop.setAttribute('aria-label','Complemento completo do plano '+plan);
 const heading=document.createElement('div');heading.className='v138-complement-heading';heading.textContent='Complemento · Plano '+(plan||'—');
 const body=document.createElement('div');body.className='v138-complement-body';body.textContent=value;
 const actions=document.createElement('div');actions.className='v138-complement-actions';
 const copy=document.createElement('button');copy.type='button';copy.textContent='Copiar';copy.onclick=async()=>{try{await navigator.clipboard.writeText(value);message('Complemento copiado.');}catch(e){const ta=document.createElement('textarea');ta.value=value;document.body.append(ta);ta.select();const ok=document.execCommand('copy');ta.remove();message(ok?'Complemento copiado.':'Não foi possível copiar.',!ok);}closeComplementPopup();};
 const close=document.createElement('button');close.type='button';close.textContent='Fechar';close.onclick=closeComplementPopup;
 actions.append(copy,close);pop.append(heading,body,actions);document.body.append(pop);complementPopup=pop;
 const rect=anchor.getBoundingClientRect();const w=pop.offsetWidth,h=pop.offsetHeight;
 pop.style.left=Math.max(8,Math.min(rect.left,window.innerWidth-w-8))+'px';
 pop.style.top=(rect.bottom+8+h<=window.innerHeight?rect.bottom+8:Math.max(8,rect.top-h-8))+'px';
 close.focus();
}
document.addEventListener('pointerdown',e=>{if(complementPopup&&!complementPopup.contains(e.target)&&!e.target.closest('.v138-complement-open'))closeComplementPopup();});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeComplementPopup();});
window.addEventListener('scroll',closeComplementPopup,true);
window.addEventListener('resize',closeComplementPopup);
const routeSortFields=[r=>r.plan_number,r=>routeComplement(r),r=>r.route_date,r=>r.loading_on,r=>r.loading_time,r=>r.city,r=>r.gross_weight,r=>r.merchandise_value,r=>r.delivery_count,r=>r.vehicle_profile,r=>r.driver_name,r=>r.plate,r=>routeDisplayStatus(r),r=>v13Loaded.has(Number(r.id))?1:0,r=>r.gm_status];
function sortRouteRows(rows){if(routeSort.index===null)return rows;const key=routeSortFields[routeSort.index];return rows.sort((a,b)=>{const x=key(a),y=key(b);const numeric=[6,7,8,13].includes(routeSort.index);const cmp=numeric?(Number(x||0)-Number(y||0)):String(x??'').localeCompare(String(y??''),'pt-BR',{numeric:true,sensitivity:'base'});return (cmp||String(a.plan_number).localeCompare(String(b.plan_number),'pt-BR',{numeric:true}))*routeSort.dir;});}
// V13.2: painel independente. Consulta global paginada; nenhuma escrita no banco.
async function loadOperationalSummary(){
 const start=$('ops-date-start').value,end=$('ops-date-end').value;
 if(start&&end&&start>end)throw Error('A data inicial não pode ser posterior à final.');
 const profile=norm($('ops-profile').value),driver=norm($('ops-driver').value);
 const info=$('ops-info');info.textContent='Consultando todas as rotas...';
 try{
  const all=await v13FetchAll('');
  const data=all.filter(r=>(!routeDate||String(r.route_date||'').slice(0,10)===routeDate)&&(!requestDate||String(r.request_date||'').slice(0,10)===requestDate)&&(!profile||norm(r.vehicle_profile)===profile)&&(!driver||norm(r.driver_name).includes(driver)));
  const active=data.filter(r=>routeDisplayStatus(r)!=='NÃO EMBARCOU');
  const sum=(arr,key)=>arr.reduce((n,r)=>n+(Number(r[key])||0),0);
  const countStatus=name=>data.filter(r=>routeDisplayStatus(r)===name).length;
  const opp=active.filter(r=>{const offered=PROFILE_ORDER.indexOf(norm(r.vehicle_profile));const actual=PROFILE_ORDER.indexOf(norm(r.driver_profile||r.assigned_profile||''));return offered>=0&&actual>=0&&actual<offered&&!!r.driver_name;}).length;
  const fmt=n=>n.toLocaleString('pt-BR');
  const cards=[['Rotas ofertadas',fmt(data.length)],['Programadas',fmt(countStatus('PROGRAMADO'))],['A emplacar',fmt(countStatus('EMPLACAR'))],['Não embarcaram',fmt(countStatus('NÃO EMBARCOU'))],['Taxa de programação',data.length?(countStatus('PROGRAMADO')/data.length*100).toLocaleString('pt-BR',{maximumFractionDigits:1})+'%':'—'],['Peso operacional',fmt(sum(active,'gross_weight'))+' kg'],['Entregas operacionais',fmt(sum(active,'delivery_count'))],['Mercadoria operacional',sum(active,'merchandise_value').toLocaleString('pt-BR',{style:'currency',currency:'BRL'})],['Oportunidades verificáveis',fmt(opp)]];
  $('ops-kpis').innerHTML=cards.map(([label,value])=>`<div class="v13-card"><small>${esc(label)}</small><strong>${esc(value)}</strong></div>`).join('');
  const statuses=new Map(),profiles=new Map(),groups=new Map();
  for(const r of data){const st=routeDisplayStatus(r),pf=r.vehicle_profile||'Sem perfil',name=r.driver_name||'Sem motorista';statuses.set(st,(statuses.get(st)||0)+1);profiles.set(pf,(profiles.get(pf)||0)+1);const g=groups.get(name)||{name,count:0,last:''};g.count++;if(String(r.route_date||'')>g.last)g.last=String(r.route_date||'');groups.set(name,g);}
  $('ops-status').innerHTML=table(['Status','Rotas'],[...statuses].sort((a,b)=>b[1]-a[1]));
  $('ops-profiles').innerHTML=table(['Perfil','Rotas'],[...profiles].sort((a,b)=>b[1]-a[1]));
  $('ops-drivers').innerHTML=table(['Motorista','Rotas','Última data'],[...groups.values()].sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,'pt-BR')).map(x=>[x.name,x.count,brDate(x.last)]));
  info.textContent=fmt(data.length)+' rotas encontradas · Consulta concluída';
 }catch(e){info.textContent='Não foi possível atualizar o resumo: '+e.message;throw e;}
}
$('ops-filter').onclick=()=>loadOperationalSummary().catch(e=>message(e.message,true));
$('ops-refresh').onclick=()=>loadOperationalSummary().catch(e=>message(e.message,true));

async function loadRoutes(which){
 const prefix=which==='sac'?'sac':'route';
 const search=$(prefix+'-search').value.trim();
 const profileFilter=$(prefix+'-profile')?.value||'';
 let a,data;
 if(which==='routes'){
  const routeDate=$('route-date').value,requestDate=$('route-request-date').value,driver=norm($('route-driver').value);
  const all=await v13FetchAll(search);
  const selectedStatuses=selectedRouteStatuses();
  const filtered=all.filter(r=>(!routeDate||String(r.route_date||'').slice(0,10)===routeDate)&&(!requestDate||String(r.request_date||'').slice(0,10)===requestDate)&&(!profileFilter||norm(r.vehicle_profile)===norm(profileFilter))&&(!selectedStatuses.length||selectedStatuses.includes(routeDisplayStatus(r)))&&(!driver||norm(r.driver_name).includes(driver)));
  totals.routes=filtered.length;v13Filtered=sortRouteRows(filtered);v13RenderSummary(filtered);
  a={total:filtered.length};data=v13Filtered.slice(pages.routes*50,(pages.routes+1)*50);
  $('route-filter-info').textContent=filtered.length.toLocaleString('pt-BR')+' rotas nos filtros';
 }else{
  // V13.25: filtrar o conjunto inteiro ANTES da paginação (evita páginas vazias e totais incorretos).
  const routeDate=$('sac-date').value,requestDate=$('sac-request-date').value,driver=norm($('sac-driver').value);
  const selectedStatuses=selectedSACStatuses();
  const all=await v13FetchAll(search);
  const filtered=all.filter(r=>(!routeDate||String(r.route_date||'').slice(0,10)===routeDate)&&(!requestDate||String(r.request_date||'').slice(0,10)===requestDate)&&(!profileFilter||norm(r.vehicle_profile)===norm(profileFilter))&&(!selectedStatuses.length||selectedStatuses.includes(routeDisplayStatus(r)))&&(!driver||norm(r.driver_name).includes(driver)));
  totals.sac=filtered.length;
  a={total:filtered.length};data=filtered.slice(pages.sac*50,(pages.sac+1)*50);
 }
 if(which==='sac'){
  const statuses=data.map(r=>routeDisplayStatus(r));
  const count=x=>statuses.filter(st=>st===x).length;
  const active=data.filter(r=>routeDisplayStatus(r)!=='NÃO EMBARCOU');
  const cards=[['Rotas acompanhadas',data.length],['Em rota',count('EM ROTA')],['Concluídas',count('CONCLUÍDO')],['A emplacar',count('EMPLACAR')],['Não embarcaram',count('NÃO EMBARCOU')],['Entregas em acompanhamento',active.reduce((n,r)=>n+(Number(r.delivery_count)||0),0)]];
  $('sac-summary').innerHTML=cards.map(([label,value])=>`<div class="v13-card"><small>${esc(label)}</small><strong>${Number(value).toLocaleString('pt-BR')}</strong></div>`).join('');
 }
 const headers=which==='routes'?['Plano','Complemento Solicitação','Data rota','Data car.','Hora car.','Cidade','Peso','Valor NF','Entregas','Perfil','Motorista','Placa','Status rota','Carregado','GreenMile']:['Plano','Complemento','Data rota','Data car.','Hora car.','Cidade','Perfil','Peso','Entregas','Valor NF','Motorista','Placa','Status rota','GreenMile'];
 const target=$(which==='sac'?'sac-table':'route-table');
 const loadingStates=which==='routes'&&data.length?await rpc('pcd_v10_loading_states',{p_route_ids:data.map(r=>Number(r.id))}):[];
 // V13.28: consulta apenas a classificação operacional, sem valores ou autorização do cliente.
 let continuityColors=new Map();
 if(data.some(r=>routeDisplayStatus(r)==='CONTINUAR ROTA')){
  try{
   const flags=await rpc('pcd_v1328_continuity_colors',{p_route_ids:data.filter(r=>routeDisplayStatus(r)==='CONTINUAR ROTA').map(r=>Number(r.id))});
   continuityColors=new Map((flags||[]).map(x=>[Number(x.route_id),x.responsibility]));
  }catch(e){console.warn('Cores de continuidade indisponíveis:',e.message);}
 }
 const loadedIds=new Set((loadingStates||[]).filter(x=>x.is_loaded).map(x=>Number(x.route_id)));
 if(which==='routes')for(const id of loadedIds)v13Loaded.add(id);
 if(which==='routes')window.innovaVisibleLoadedIds=loadedIds;
 if(which==='routes')window.innovaVisibleProgramRows=data.map(r=>({...r}));
 target.innerHTML=table(headers,data.map(r=>which==='routes'?[r.plan_number,routeComplement(r),brDate(r.route_date),brDate(r.loading_on),r.loading_time||'—',r.city,r.gross_weight,r.merchandise_value,r.delivery_count,r.vehicle_profile,r.driver_name,r.plate,routeDisplayStatus(r),'',r.gm_status]:[r.plan_number,r.complement,brDate(r.route_date),brDate(r.loading_on),r.loading_time||'—',r.city,r.vehicle_profile,r.gross_weight,r.delivery_count,r.merchandise_value,r.driver_name,r.plate,routeDisplayStatus(r),r.gm_status]));
 closeComplementPopup();
 if(which==='routes'){
  target.querySelectorAll('thead th').forEach((th,i)=>{th.classList.add('route-sortable');th.tabIndex=0;th.setAttribute('role','button');th.title='Ordenar por esta coluna';const arrow=document.createElement('span');arrow.className='route-sort-arrow';arrow.textContent=routeSort.index===i?(routeSort.dir===-1?' ▼':' ▲'):' ↕';th.append(arrow);const change=()=>{routeSort={index:i,dir:routeSort.index===i?-routeSort.dir:-1};pages.routes=0;loadRoutes('routes').catch(e=>message(e.message,true));};th.onclick=change;th.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();change();}};});
 }
 target.querySelectorAll('tbody tr').forEach((tr,i)=>{
  const r=data[i];
  const valueCell=tr.children[which==='routes'?7:9];
  valueCell.textContent=r.merchandise_value==null?'—':Number(r.merchandise_value).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const count=Number(r.delivery_count)||0;
  const deliveriesCell=tr.children[which==='routes'?8:8];deliveriesCell.textContent='';
  const badge=document.createElement('span');badge.className='complexity '+(count===1?'low':count<=10?'mid':'high');badge.textContent=count+' '+(count===1?'●':count<=10?'◆':'▲');badge.title=count===1?'Entrega única':count<=10?'Complexidade intermediária':'Alta complexidade';deliveriesCell.append(badge);
  if(which==='routes'){
   const cell=tr.children[0],wrap=document.createElement('div');wrap.className='plan-whatsapp-wrap';
   const plan=document.createElement('span');plan.textContent=r.plan_number||'—';
   const wa=document.createElement('button');wa.type='button';wa.className='whatsapp-copy';wa.textContent='◉';wa.title='Copiar confirmação de carga para WhatsApp';wa.setAttribute('aria-label','Copiar mensagem WhatsApp do plano '+r.plan_number);
   wa.onclick=async()=>{
     if(!r.driver_name||routeDisplayStatus(r)==='NÃO EMBARCOU'){message('Selecione um motorista programado antes de confirmar a carga.',true);return;}
     const text=['CARGA CONFIRMADA ✅','',`Motorista: ${r.driver_name||'Não informado'}`,`Plano: ${r.plan_number||'—'}`,`Qt Entregas: ${r.delivery_count??'—'}`,`Peso: ${Number(r.gross_weight||0).toLocaleString('pt-BR',{maximumFractionDigits:2})} kg`,`Região: ${r.city||'—'}`,`Data Embarque: ${brDate(r.loading_on||r.route_date)}`,`Hora prevista: ${r.loading_time||'—'}`].join('\n');
     try{await navigator.clipboard.writeText(text);message('Mensagem do plano '+r.plan_number+' copiada para WhatsApp.');}catch(e){const ta=document.createElement('textarea');ta.value=text;document.body.append(ta);ta.select();const ok=document.execCommand('copy');ta.remove();message(ok?'Mensagem copiada.':'Não foi possível copiar automaticamente.',!ok);}
   };
   wrap.append(plan,wa);cell.textContent='';cell.append(wrap);
  }
  if(which==='routes'){
   const complementCell=tr.children[1],full=routeComplement(r);
   complementCell.textContent='';
   if(full!=='—'){
    const btn=document.createElement('button');btn.type='button';btn.className='v138-complement-open';btn.title='Clique para visualizar o complemento completo';btn.setAttribute('aria-label','Ver complemento completo do plano '+r.plan_number);
    const label=document.createElement('span');label.className='v138-complement-text';label.textContent=full;
    const expand=document.createElement('span');expand.className='v138-complement-expand';expand.textContent='↗';expand.setAttribute('aria-hidden','true');expand.hidden=true;
    btn.append(label,expand);btn.onclick=()=>openComplementPopup(btn,r.plan_number,full);complementCell.append(btn);
    requestAnimationFrame(()=>{if(!btn.isConnected)return;expand.hidden=label.scrollWidth<=label.clientWidth+1;});
   }else complementCell.textContent='—';
  }
  if(which==='sac'){const plan=document.createElement('button');plan.className='plan-link';plan.textContent=r.plan_number;plan.onclick=()=>openPlanInvoices(r);const wrap=document.createElement('span');wrap.className='plan-whatsapp-wrap';wrap.append(plan);tr.children[0].textContent='';tr.children[0].append(wrap);}
  const dateCell=tr.children[which==='routes'?2:2],dateButton=document.createElement('button');dateButton.className='driver-inline';dateButton.textContent=brDate(r.route_date);dateButton.title='Reprogramar com justificativa';dateButton.disabled=!r.is_active;dateButton.onclick=()=>openReschedule(r);dateCell.textContent='';dateCell.append(dateButton);
  const statusCell=tr.children[which==='routes'?12:12],pill=document.createElement('span'),status=routeDisplayStatus(r);pill.className='route-pill '+(status==='PROGRAMADO'?'programmed':status==='EMPLACAR'?'toassign':status==='NÃO EMBARCOU'?'notboarded':'other');pill.textContent=status;statusCell.textContent='';statusCell.append(pill);
  if(which==='routes'){
   // V13.24: a Programação utiliza o mesmo seletor, cores e validações do SAC.
   const statuses=['EMPLACAR','PROGRAMADO','EM ROTA','CONCLUÍDO','NÃO EMBARCOU','CONTINUAR ROTA','TRANSFERIR CARRO'];
   const select=document.createElement('select');
   select.className='sac-inline-select sac-status-select';
   for(const st of statuses){const o=document.createElement('option');o.value=st;o.textContent=st;select.append(o);}
   for(const [value,label] of [['ACTION_CONTINUAR','CONTINUAR ROTA'],['ACTION_TRANSFERIR','TRANSFERIR CARRO']]){const o=document.createElement('option');o.value=value;o.textContent=label;select.append(o);}
   select.value=statuses.includes(status)?status:'EMPLACAR';
   if(status==='CONTINUAR ROTA'||status==='TRANSFERIR CARRO'){select.disabled=true;select.title='Viagem original encerrada por continuidade/transferência';}
   select.disabled=!r.is_active;
   const styleStatus=()=>{
    select.dataset.status=select.value;
    const responsibility=continuityColors.get(Number(r.id));
    select.dataset.continuityResponsibility=select.value==='CONTINUAR ROTA'?(responsibility||'NAO_CLASSIFICADA'):'';
    if(select.value==='CONTINUAR ROTA')select.title=responsibility==='TRANSPORTADORA'?'Continuidade por custo INNOVA (sem receita adicional)':responsibility==='CLIENTE_AUTORIZADO'?'Continuidade autorizada pelo cliente (com receita adicional)':'Responsabilidade financeira não identificada';
   };
   styleStatus();select.addEventListener('input',styleStatus);
   select.onchange=async()=>{
    const next=select.value,previous=status;
    if(next==='CONTINUAR ROTA'||next==='TRANSFERIR CARRO'){select.value=previous;styleStatus();return;}
    if(next==='ACTION_CONTINUAR'||next==='ACTION_TRANSFERIR'){
     select.value=previous;styleStatus();
     if(!r.is_active||status==='NÃO EMBARCOU'||status==='CONTINUAR ROTA'||status==='TRANSFERIR CARRO'||r.parent_route_id!=null){
      message('Esta rota não permite criar uma nova viagem.',true);return;
     }
     openContinuity(r,next==='ACTION_TRANSFERIR'?'TRANSFERIR':'CONTINUAR');
     return;
    }
    select.disabled=true;
    try{
     if(next==='NÃO EMBARCOU'){
      const reason=prompt('Justificativa obrigatória para NÃO EMBARCOU (ex.: motorista não compareceu):');
      if(reason===null){select.value=previous;styleStatus();return;}
      if(!reason.trim())throw Error('Informe uma justificativa para NÃO EMBARCOU.');
      if(!confirm('Confirmar NÃO EMBARCOU? A rota será preservada no histórico, sem contabilizar frete.')){select.value=previous;styleStatus();return;}
      await rpc('pcd_v9_no_board',{p_route_id:r.id,p_reason:reason.trim()});
     }else{
      await rpc('pcd_v8_sac',{p_route_id:r.id,p_status:next,p_gm:r.gm_status||null,p_notes:r.sac_notes||'',p_route_date:r.route_date||r.loading_on});
     }
     await loadRoutes('routes');message('Status da rota atualizado.');
    }catch(e){select.value=previous;styleStatus();message(e.message,true);}
    finally{select.disabled=!r.is_active;}
   };
   statusCell.textContent='';statusCell.append(select);
  }
  if(which==='routes'){
   const cityCell=tr.children[5];
   const cityLink=document.createElement('button');
   cityLink.type='button';cityLink.className='billing-city-link route-city-link';
   cityLink.textContent=r.city||'Consultar cidades';
   cityLink.title='Consultar cidades do roteiro, distâncias e faixas contratuais';
   cityLink.onclick=()=>openProgrammingCities(r);
   cityCell.textContent='';cityCell.append(cityLink);
  }
  if(which==='routes'){
   const loadedCell=tr.children[13];loadedCell.textContent='';
   const toggle=document.createElement('label');toggle.className='load-check';
   const check=document.createElement('input');check.type='checkbox';check.checked=loadedIds.has(Number(r.id));check.disabled=!r.is_active||status==='NÃO EMBARCOU';
   check.onchange=async()=>{const requested=check.checked;check.disabled=true;try{await rpc('pcd_v10_set_loaded',{p_route_id:Number(r.id),p_is_loaded:requested});if(requested)window.innovaVisibleLoadedIds.add(Number(r.id));else window.innovaVisibleLoadedIds.delete(Number(r.id));v13Loaded[requested?'add':'delete'](Number(r.id));v13RenderSummary(v13Filtered);message('Carregamento atualizado.');}catch(e){check.checked=!requested;message(e.message,true);}finally{check.disabled=!r.is_active||status==='NÃO EMBARCOU';}};
   toggle.append(check);loadedCell.append(toggle);
  }
  if(which==='routes'){
   const driverCell=tr.children[10],edit=document.createElement('button');edit.className='driver-picker-trigger';edit.textContent=(status==='NÃO EMBARCOU'?'Não embarcou':r.driver_name||'Selecionar motorista')+'  ▾';edit.disabled=!r.is_active;edit.title='Escolher motorista ou registrar não embarque';edit.onclick=()=>inlineAssign(r,driverCell);driverCell.textContent='';driverCell.append(edit);
  }else{
   const sacStatusCell=tr.children[13],gmCell=tr.children[14];
   const select=document.createElement('select');select.className='sac-inline-select sac-status-select';
   const statuses=['EMPLACAR','PROGRAMADO','EM ROTA','CONCLUÍDO','NÃO EMBARCOU','CONTINUAR ROTA','TRANSFERIR CARRO'];
   for(const st of statuses){const o=document.createElement('option');o.value=st;o.textContent=st;select.append(o);}
   select.value=statuses.includes(status)?status:'EMPLACAR';
   if(status==='CONTINUAR ROTA'||status==='TRANSFERIR CARRO'){select.disabled=true;select.title='Viagem original encerrada por continuidade/transferência';}select.disabled=!r.is_active;
   const styleStatus=()=>{
    select.dataset.status=select.value;
    const responsibility=continuityColors.get(Number(r.id));
    select.dataset.continuityResponsibility=select.value==='CONTINUAR ROTA'?(responsibility||'NAO_CLASSIFICADA'):'';
    if(select.value==='CONTINUAR ROTA')select.title=responsibility==='TRANSPORTADORA'?'Continuidade por custo INNOVA (sem receita adicional)':responsibility==='CLIENTE_AUTORIZADO'?'Continuidade autorizada pelo cliente (com receita adicional)':'Responsabilidade financeira não identificada';
   };styleStatus();select.addEventListener('input',styleStatus);
   select.onchange=async()=>{
    const next=select.value,previous=status;
    if(next==='CONTINUAR ROTA'||next==='TRANSFERIR CARRO'){select.value=previous;styleStatus();return;}
    select.disabled=true;
    try{
     if(next==='NÃO EMBARCOU'){
      const reason=prompt('Justificativa obrigatória para NÃO EMBARCOU (ex.: motorista não compareceu):');
      if(reason===null){select.value=previous;return;}
      if(!reason.trim())throw Error('Informe uma justificativa para NÃO EMBARCOU.');
      if(!confirm('Confirmar NÃO EMBARCOU? A rota será preservada no histórico, sem contabilizar frete.')){select.value=previous;return;}
      await rpc('pcd_v9_no_board',{p_route_id:r.id,p_reason:reason.trim()});
     }else{
      await rpc('pcd_v8_sac',{p_route_id:r.id,p_status:next,p_gm:r.gm_status||null,p_notes:r.sac_notes||'',p_route_date:r.route_date||r.loading_on});
     }
     await loadRoutes('sac');message('Status da rota atualizado.');
    }catch(e){select.value=previous;styleStatus();message(e.message,true);}
    finally{select.disabled=!r.is_active;}
   };
   sacStatusCell.textContent='';sacStatusCell.append(select);
   const gm=document.createElement('select');gm.className='sac-inline-select sac-gm-select';
   for(const [value,label] of [['','—'],['GM OK','GM OK'],['ROTA ATRIBUIDA','ROTA ATRIBUÍDA'],['ENTREGANDO','ENTREGANDO'],['FINALIZAÇÃO','FINALIZAÇÃO'],['NÃO USOU GM','NÃO USOU GM']]){
    const o=document.createElement('option');o.value=value;o.textContent=label;gm.append(o);
   }
   // Existing legacy value stays visible until the operator chooses one of the four supported options.
   if(r.gm_status&&!Array.from(gm.options).some(o=>o.value===r.gm_status)){
    const legacy=document.createElement('option');legacy.value=r.gm_status;legacy.textContent=r.gm_status+' (anterior)';gm.append(legacy);
   }
   gm.value=r.gm_status||'';gm.disabled=!r.is_active||status==='NÃO EMBARCOU';
   const styleGm=()=>{gm.dataset.status=gm.value;};styleGm();gm.addEventListener('input',styleGm);
   gm.onchange=async()=>{
    const next=gm.value,previous=r.gm_status||'';gm.disabled=true;
    try{
     await rpc('pcd_v8_sac',{p_route_id:r.id,p_status:status==='EMPLACAR'?'EMPLACAR':status,p_gm:next||null,p_notes:r.sac_notes||'',p_route_date:r.route_date||r.loading_on});
     await loadRoutes('sac');message('GreenMile atualizado.');
    }catch(e){gm.value=previous;styleGm();message(e.message,true);}
    finally{gm.disabled=!r.is_active||status==='NÃO EMBARCOU';}
   };
   gmCell.textContent='';gmCell.append(gm);
  }
 });
 {
  // Indicadores carregados somente para os planos da pagina visivel; limite de concorrencia.
  const jobs=data.map((r,i)=>({r,tr:target.querySelectorAll('tbody tr')[i]}));
  let cursor=0;
  const worker=async()=>{
   while(cursor<jobs.length){
    const {r,tr}=jobs[cursor++];
    if(!tr||!r.plan_number)continue;
    try{
     const occurrences=await rpc('pcd_v9_list_occurrences',{p_plan:r.plan_number});
     if(!tr.isConnected||!Array.isArray(occurrences)||!occurrences.length)continue;
     const cell=tr.children[0],wrap=cell.querySelector('.plan-whatsapp-wrap')||cell;
     const indicator=document.createElement('button');indicator.type='button';
     const open=occurrences.filter(o=>o.status!=='ENCERRADA'&&o.status!=='CANCELADA').length;
     indicator.className='v1321-occ-chip '+(open?'v1321-occ-pending':'v1321-occ-closed');
     const icon=document.createElement('span');icon.className='v1321-occ-icon';icon.setAttribute('aria-hidden','true');
     icon.innerHTML=open
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m10.29 3.86-8.47 14.14A2 2 0 0 0 3.53 21h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-6"/></svg>';
     const count=document.createElement('span');count.className='v1321-occ-count';count.textContent=String(occurrences.length);
     indicator.append(icon,count);
     indicator.title=occurrences.length+' ocorrência(s) neste plano ('+open+' pendente(s)). Clique para consultar.';
     indicator.setAttribute('aria-label','Abrir '+occurrences.length+' ocorrências do plano '+r.plan_number);
     indicator.onclick=()=>openPlanInvoices(r);
     wrap.append(indicator);
    }catch(e){/* Nao bloquear a Programacao se a consulta de ocorrencias falhar. */}
   }
  };
  void Promise.all(Array.from({length:Math.min(4,jobs.length)},()=>worker()));
 }
 $(prefix+'-page').textContent=`${a.total} rotas · página ${pages[which]+1}`;
 $(prefix+'-prev').disabled=pages[which]===0;$(prefix+'-next').disabled=(pages[which]+1)*50>=a.total;
}
function routeDisplayStatus(r){const st=norm(r.route_status);if(st==='NAOEMBARCOU')return 'NÃO EMBARCOU';if(st==='CONTINUARROTA')return 'CONTINUAR ROTA';if(st==='TRANSFERIRCARRO')return 'TRANSFERIR CARRO';if(st==='PROGRAMAR'||st==='EMPLACAR')return (r.driver_name||r.driver_id)?'PROGRAMADO':'EMPLACAR';if(st==='PROGRAMADO')return (r.driver_name||r.driver_id)?'PROGRAMADO':'EMPLACAR';return r.route_status||((r.driver_name||r.driver_id)?'PROGRAMADO':'EMPLACAR');}

for(const which of ['routes','sac']){const prefix=which==='sac'?'sac':'route';$(prefix+'-filter').onclick=()=>{pages[which]=0;loadRoutes(which).catch(e=>message(e.message,true));};$(prefix+'-prev').onclick=()=>{pages[which]--;loadRoutes(which).catch(e=>message(e.message,true));};$(prefix+'-next').onclick=()=>{pages[which]++;loadRoutes(which).catch(e=>message(e.message,true));};$('refresh-'+which).onclick=()=>loadRoutes(which).catch(e=>message(e.message,true));}
function modal(title,summary,body,fn){$('modal-save').classList.remove('hidden');$('modal-save').textContent='Salvar';$('modal-save').disabled=false;$('modal-title').textContent=title;$('modal-summary').textContent=summary;$('modal-body').innerHTML=body;modalSave=fn;$('modalbg').classList.remove('hidden');}
$('modal-close').onclick=()=>{$('modalbg').classList.add('hidden');};$('modal-save').onclick=async()=>{try{$('modal-save').disabled=true;await modalSave();$('modalbg').classList.add('hidden');await refreshMetrics();if(tab==='recipients')await loadRecipients();else await loadRoutes(tab==='sac'?'sac':'routes');message('Alteração salva com sucesso.');}catch(e){message(e.message,true);}finally{$('modal-save').disabled=false;}};
const PROFILE_ORDER=['FIORINO','VAN','VUC','MEDIO'];
function brDate(s){if(!s)return '—';const m=String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);return m?`${m[3]}/${m[2]}/${m[1]}`:String(s);}
function isoDateBR(s){const m=String(s||'').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);if(!m)throw Error('Informe a data em DD/MM/AAAA');const iso=`${m[3]}-${m[2]}-${m[1]}`;const d=new Date(iso+'T12:00:00Z');if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==iso)throw Error('Data inválida');return iso;}
function driverPriority(d,r){const want=PROFILE_ORDER.indexOf(norm(r.vehicle_profile)),got=PROFILE_ORDER.indexOf(norm(d.profile));const available=d.day_status==='DISPONIVEL';return (available?0:10)+(got===want?0:got>want?1:2);}
async function assignDriver(r,id){const d=(await rpc('pcd_v8_drivers',{p_date:r.route_date||r.loading_on})).find(x=>Number(x.id)===Number(id));if(!d)throw Error('Motorista não encontrado');const desired=PROFILE_ORDER.indexOf(norm(r.vehicle_profile)),actual=PROFILE_ORDER.indexOf(norm(d.profile));if(actual<desired&&!confirm('O perfil do motorista é inferior ao solicitado. Confirmar negociação excepcional?'))return false;let result=await rpc('pcd_v8_assign',{p_route_id:r.id,p_driver_id:Number(id),p_confirm_second:false});if(result.requires_confirmation){if(!confirm(result.message||'Motorista indisponível ou com outra rota. Confirma a escala negociada?'))return false;result=await rpc('pcd_v8_assign',{p_route_id:r.id,p_driver_id:Number(id),p_confirm_second:true});}return true;}
async function openAssign(r){const all=await rpc('pcd_v8_drivers',{p_date:r.route_date||r.loading_on});const eligible=all.filter(d=>d.base_status!=='INATIVO').sort((a,b)=>driverPriority(a,r)-driverPriority(b,r)||a.name.localeCompare(b.name,'pt-BR'));const options=eligible.map(d=>`<option value="${d.id}">${esc(d.name)} · ${esc(d.profile)} · ${esc(d.plate)} · ${esc(d.day_status)}${Number(d.routes_count)?' ('+d.routes_count+' rota(s))':''}</option>`).join('');modal('Escalar motorista',`Plano ${r.plan_number} · ${brDate(r.route_date||r.loading_on)} · ${r.city} · ${r.vehicle_profile}`,`<label>Motoristas (compatíveis disponíveis primeiro)</label><select id="pick-driver"><option value="">Selecione...</option>${options}</select><p class="muted" id="pick-plate">A placa será preenchida automaticamente.</p><p class="note">Motoristas de perfil inferior, já programados ou indisponíveis exigem confirmação. Hierarquia: FIORINO &lt; VAN &lt; VUC &lt; MEDIO.</p>`,async()=>{const id=Number($('pick-driver').value);if(!id)throw Error('Selecione o motorista');if(!await assignDriver(r,id))throw Error('Escala cancelada');});$('pick-driver').onchange=()=>{const d=eligible.find(x=>x.id===Number($('pick-driver').value));$('pick-plate').textContent=d?`Placa: ${d.plate} · ${d.profile}`:'Selecione um motorista';};}
function openContinuity(r,action="CONTINUAR"){
 const d=r.route_date||r.loading_on||'';
 modal(action==='TRANSFERIR'?'Transferir carro':'Continuar rota',`Plano ${r.plan_number} · ${brDate(d)} · ${r.city||''}`,
 `<p class="note">${action==='TRANSFERIR'?'Transferência do atendimento para outro veículo/motorista, mantendo vínculo com a viagem original.':'Segunda viagem para concluir entregas pendentes.'}</p><label>Data da segunda viagem</label><input type="date" id="continuity-date" value="${esc(d)}" required>
 <label>Motorista responsável</label><select id="continuity-driver"><option value="">Selecione...</option></select>
 <label>Quantidade de entregas pendentes</label><input type="number" id="continuity-deliveries" min="1" max="${Number(r.delivery_count)||9999}" step="1" placeholder="Entregas ainda pendentes">
 <label>Responsabilidade financeira</label><select id="continuity-responsibility"><option value="TRANSPORTADORA">Continuidade por responsabilidade da transportadora</option><option value="CLIENTE_AUTORIZADO">Frete adicional autorizado pelo cliente</option></select>
 <label>Justificativa</label><textarea id="continuity-reason" maxlength="2000" placeholder="Descreva o motivo da continuidade"></textarea>
 <label>Referência da autorização do cliente (se aplicável)</label><input id="continuity-authorization" maxlength="250" placeholder="E-mail, chamado ou responsável">
 <p class="note">Valores financeiros são calculados e consultados somente no Faturamento. Esta tela não apresenta tarifas ou custos.</p>`,
 async()=>{
  const date=$('continuity-date').value;
  const driverId=Number($('continuity-driver').value);
  const deliveries=Number($('continuity-deliveries').value);
  const responsibility=$('continuity-responsibility').value;
  const reason=$('continuity-reason').value.trim();
  const authorization=$('continuity-authorization').value.trim();
  if(!date||!driverId||!Number.isInteger(deliveries)||deliveries<1||deliveries>Number(r.delivery_count||9999))throw Error('Informe data, motorista e quantidade válida de entregas pendentes.');
  if(reason.length<10)throw Error('Informe justificativa com pelo menos 10 caracteres.');
  if(responsibility==='CLIENTE_AUTORIZADO'&&!authorization)throw Error('Informe a referência da autorização do cliente.');

  await rpc('pcd_v1326_create_continuity',{p_parent_route_id:Number(r.id),p_route_date:date,p_driver_id:driverId,p_delivery_count:deliveries,p_responsibility:responsibility,p_reason:reason,p_authorization:authorization||null,p_action:action});
 });

 rpc('pcd_v8_drivers',{p_date:d}).then(drivers=>{
  const sel=$('continuity-driver');if(!sel)return;
  for(const x of drivers.filter(x=>x.base_status!=='INATIVO')){const opt=document.createElement('option');opt.value=x.id;opt.textContent=`${x.name} · ${x.profile} · ${x.plate}`;sel.append(opt);}
 }).catch(e=>message(e.message,true));
}
function openReschedule(r){modal('Reprogramar data',`Plano ${r.plan_number} · data atual ${brDate(r.route_date||r.loading_on)}`,`<label>Nova data (DD/MM/AAAA)</label><input id="new-route-date" placeholder="17/11/2026" value="${brDate(r.route_date||r.loading_on)}"/><label>Justificativa obrigatória</label><textarea id="new-route-reason" maxlength="2000" placeholder="Ex.: atraso na separação da 3 Corações; carregamento concluído às 09:00."></textarea><p class="note">Mesma rota e mesmo frete: nenhuma nova receita ou despesa será criada.</p>`,async()=>{await rpc('pcd_v9_reschedule',{p_route_id:r.id,p_new_date:isoDateBR($('new-route-date').value),p_reason:$('new-route-reason').value});});}
function openNoBoard(r){modal('Registrar NÃO EMBARCOU',`Plano ${r.plan_number} · ${brDate(r.route_date||r.loading_on)}`,`<label>Justificativa obrigatória</label><textarea id="no-board-reason" maxlength="2000" placeholder="Explique por que a rota ofertada não foi atendida."></textarea><p class="note">A rota ficará no relatório, sem gerar novo frete.</p>`,async()=>{if(!confirm('Confirmar NÃO EMBARCOU para esta rota?'))throw Error('Cancelado');await rpc('pcd_v9_no_board',{p_route_id:r.id,p_reason:$('no-board-reason').value});});}
function openSAC(r){modal('Acompanhamento SAC',`Plano ${r.plan_number} · ${brDate(r.route_date||r.loading_on)} · Motorista: ${r.driver_name||'Não escalado'}`,`<div class="two"><div><label>Status da rota</label><select id="sac-route-status"><option>EMPLACAR</option><option>PROGRAMADO</option><option>EM ROTA</option><option>CONCLUÍDO</option></select></div><div><label>Status GreenMile</label><select id="sac-gm-status"><option value="">Não informado</option><option>ROTA ATRIBUIDA</option><option>ENTREGANDO</option><option>FINALIZAÇÃO</option><option>GM OK</option><option>NÃO USOU GM</option></select></div></div><label style="margin-top:14px">Observações</label><textarea id="sac-notes" maxlength="4000"></textarea><p class="muted">Para alterar a data, clique na data da rota. Para NÃO EMBARCOU, utilize a ação específica.</p>`,async()=>{await rpc('pcd_v8_sac',{p_route_id:r.id,p_status:$('sac-route-status').value,p_gm:$('sac-gm-status').value||null,p_notes:$('sac-notes').value,p_route_date:r.route_date||r.loading_on});});$('sac-route-status').value=r.route_status==='PROGRAMAR'?'EMPLACAR':r.route_status||'EMPLACAR';$('sac-gm-status').value=r.gm_status||'';$('sac-notes').value=r.sac_notes||'';}
function parseDelimited(text,sep){let rows=[],row=[],cell='',quote=false;for(let i=0;i<text.length;i++){let c=text[i];if(c==='"'){if(quote&&text[i+1]==='"'){cell+='"';i++;}else quote=!quote;}else if(c===sep&&!quote){row.push(cell);cell='';}else if((c==='\n'||c==='\r')&&!quote){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell='';}else cell+=c;}row.push(cell);if(row.some(v=>v.trim()))rows.push(row);return rows;}
function dateBR(s){s=String(s??'').trim();if(!s)return null;s=s.replace(/\./g,'/');let m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);if(m){let x=`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;if(new Date(x+'T12:00:00Z').toISOString().slice(0,10)!==x)throw Error('Data inválida '+s);return x;}if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;throw Error('Data inválida '+s);}
function num(s){
  // Planilhas XLSX exportam valores decimais com ponto (83.032 = 83,032 kg).
  // Aceita kg e R$ sem perder a precisão. Para milhar, prefira separador explícito (1.234,56).
  const original=String(s??'').trim();
  let value=original.replace(/\s/g,'').replace(/^R\$/i,'').replace(/kg$/i,'').trim();
  if(!value)return null;
  if(value.includes(',')&&value.includes('.')){
    value=value.lastIndexOf(',')>value.lastIndexOf('.')?value.replace(/\./g,'').replace(',','.'):value.replace(/,/g,'');
  }else if(value.includes(',')){
    value=value.replace(',','.');
  }
  if(!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(value))throw Error('Número inválido '+original);
  const n=Number(value);
  if(!Number.isFinite(n))throw Error('Número inválido '+original);
  return n;
}
function moneyImport(s){
 const raw=String(s??'').replace(/^R\$/i,'').replace(/\s/g,'').trim();
 if(!raw)return null;
 // O campo R$ da planilha usa ponto como separador de milhares quando há 3 dígitos finais.
 if(/^[-+]?\d{1,3}(?:\.\d{3})+$/.test(raw))return Number(raw.replace(/\./g,''));
 return num(s);
}
function convert(obj){const get=n=>{const key=Object.keys(obj).find(k=>norm(k)===norm(n));return String(obj[key]??'').trim();};const plan=get('PLANO');if(!plan)return null;const loading_on=dateBR(get('DATA CAR'));if(!loading_on)throw Error('Plano '+plan+': DATA CAR obrigatória');return {plan_number:plan,complement:get('COMPLEMENTO'),transport:get('TRANS.'),destination:get('DESTINO'),city:get('CIDADE'),neighborhood:get('BAIRRO'),vehicle_profile:get('PERFIL'),gross_weight:num(get('PESO')),delivery_count:num(get('QTD ENTREGA')),invoiced_on:dateBR(get('DATA FATURADO')),operation_type:get('TIPO DE OPERAÇÃO'),merchandise_value:moneyImport(get('R$')),loading_on,loading_time:get('HOR. CAR'),driver_name:get('MOTORISTA'),plate:get('PLACA')};}
$('preview').onclick=async()=>{try{const raw=$('paste').value.trim();if(!raw)throw Error('Cole as rotas com o cabeçalho.');const sep=raw.split(/\r?\n/)[0].includes('\t')?'\t':',';const m=parseDelimited(raw,sep),head=m.shift().map(x=>x.trim());if(!head.some(x=>norm(x)==='PLANO')||!head.some(x=>norm(x)==='DATACAR'))throw Error('Inclua o cabeçalho PLANO e DATA CAR.');pending=m.filter(r=>r.some(v=>v.trim())).map((r,i)=>{try{return convert(Object.fromEntries(head.map((h,j)=>[h,r[j]||''])));}catch(e){throw Error(`Linha ${i+2}: ${e.message}`);}}).filter(Boolean);if(!pending.length||pending.length>1000)throw Error('Envie entre 1 e 1000 rotas.');checks=await rpc('pcd_v5_check_import',{p_rows:pending});const tbody=pending.map((r,i)=>[r.plan_number,r.loading_on,r.city,r.vehicle_profile,r.driver_name,checks[i].duplicate?'DUPLICADA':'NOVA','']);$('import-preview').innerHTML=table(['Plano','Data','Cidade','Perfil','Motorista','Análise','Decisão'],tbody);$('import-preview').querySelectorAll('tbody tr').forEach((tr,i)=>{const cell=tr.lastElementChild;if(checks[i].duplicate){const select=document.createElement('select');select.dataset.index=i;select.innerHTML='<option value="">Escolha...</option><option value="REENTREGA">Reentrega</option><option value="DUPLICADA_INATIVA">Duplicada — inativa</option><option value="NAO_EMBARCOU_REPROGRAMAR">Não embarcou — reprogramar</option>';select.onchange=()=>{let note=cell.querySelector('.v1322-reason');if(select.value==='NAO_EMBARCOU_REPROGRAMAR'){if(!note){note=document.createElement('textarea');note.className='v1322-reason';note.placeholder='Justificativa obrigatória (ex.: veículo quebrado na rota anterior)';note.maxLength=1000;note.rows=2;note.oninput=validateImport;cell.append(note);}}else if(note){note.remove();}validateImport();};cell.append(select);}else cell.textContent='Nova rota';});$('import-count').textContent=`${pending.length} rota(s) · ${checks.filter(x=>x.duplicate).length} duplicada(s)`;validateImport();message('Confira a análise. Duplicidades exigem decisão antes de salvar.');}catch(e){pending=[];checks=[];$('import-save').disabled=true;message(e.message,true);}};
function validateImport(){$('import-save').disabled=!pending.length||[...$('import-preview').querySelectorAll('select[data-index]')].some(s=>!s.value||(s.value==='NAO_EMBARCOU_REPROGRAMAR'&&!s.parentElement.querySelector('.v1322-reason')?.value.trim()));}
$('paste').oninput=()=>{$('import-save').disabled=true;pending=[];};
$('import-save').onclick=async()=>{try{const decisions=Object.fromEntries([...$('import-preview').querySelectorAll('select[data-index]')].map(s=>[Number(s.dataset.index),s.value]));const payload=pending.map((r,i)=>({...r,decision:decisions[i]||'NOVO',reprogram_reason:decisions[i]==='NAO_EMBARCOU_REPROGRAMAR'?($('import-preview').querySelector(`select[data-index=\"${i}\"]`)?.parentElement.querySelector('.v1322-reason')?.value.trim()||''):undefined}));if(!confirm(`Confirmar importação de ${payload.length} rotas?`))return;$('import-save').disabled=true;const a=await rpc('pcd_v8_import',{p_rows:payload});$('paste').value='';$('import-preview').innerHTML='';pending=[];await refreshMetrics();message(`Importação salva. Novas: ${a.new} · Reentregas: ${a.redeliveries} · Não embarcou/reprogramado: ${a.no_board_reprogrammed||0} · Duplicadas inativas: ${a.inactive_duplicates}.`);await refreshHealth();}catch(e){message(e.message,true);}finally{$('import-save').disabled=!pending.length;}};
// V8: seleção na própria linha, com confirmação para rota adicional
async function inlineAssign(r,cell){
 try{
  const all=await rpc('pcd_v8_drivers',{p_date:r.route_date||r.loading_on});
  const eligible=all.filter(d=>d.base_status!=='INATIVO').sort((a,b)=>driverPriority(a,r)-driverPriority(b,r)||a.name.localeCompare(b.name,'pt-BR'));
  const overlay=document.createElement('div');overlay.className='driver-picker-overlay';
  const panel=document.createElement('div');panel.className='driver-picker-panel';
  panel.innerHTML='<div class="picker-heading">Selecionar motorista <button type="button" class="picker-close" aria-label="Fechar">×</button></div><input class="picker-search" placeholder="Buscar nome, placa ou perfil..." aria-label="Buscar motorista"><div class="picker-list"></div>';
  overlay.append(panel);document.body.append(overlay);
  const close=()=>overlay.remove();overlay.onclick=e=>{if(e.target===overlay)close();};panel.querySelector('.picker-close').onclick=close;
  const list=panel.querySelector('.picker-list');
  function render(){
   list.replaceChildren();
   const q=norm(panel.querySelector('.picker-search').value);
   const no=document.createElement('button');no.className='picker-no-board';no.innerHTML='<strong>Não embarcou</strong><small>Rota ofertada, mas não atendida · exige justificativa</small>';
   no.onclick=()=>{close();openNoBoard(r);};list.append(no);
   let last=-1;
   for(const d of eligible){if(q&&!norm(d.name+' '+d.plate+' '+d.profile).includes(q))continue;
    const priority=driverPriority(d,r);const group=priority>=10?3:priority===0?0:priority===1?1:2;
    if(group!==last){const h=document.createElement('div');h.className='picker-group';h.textContent=['Disponíveis · mesmo perfil','Disponíveis · perfil superior','Outros disponíveis','Programados ou indisponíveis'][group];list.append(h);last=group;}
    const btn=document.createElement('button');btn.className='picker-option';
    const name=document.createElement('span');name.className='picker-driver-name';name.textContent=d.name;
    const detail=document.createElement('small');detail.textContent=`${d.profile} · ${d.plate||'Sem placa'} · ${d.day_status}${Number(d.routes_count)?' · '+d.routes_count+' rota(s)':''}`;
    const marker=document.createElement('span');marker.className='picker-dot '+(d.day_status==='DISPONIVEL'?'yes':'no');
    const body=document.createElement('span');body.className='picker-driver-text';body.append(name,detail);btn.append(marker,body);
    btn.onclick=async()=>{btn.disabled=true;try{if(await assignDriver(r,d.id)){close();await loadRoutes('routes');await refreshMetrics();message('Motorista escalado com sucesso.');}}catch(e){message(e.message,true);}finally{btn.disabled=false;}};
    list.append(btn);
   }
  }
  panel.querySelector('.picker-search').oninput=render;render();panel.querySelector('.picker-search').focus();
 }catch(e){message(e.message,true);}
}
function invoiceDate(s){s=String(s??'').trim();if(!s)return null;if($('nf-date-format').value==='US'&&/^\d{1,2}[\/.]\d{1,2}[\/.]\d{4}$/.test(s)){const [month,day,year]=s.split(/[\/.]/);return dateBR(`${day}/${month}/${year}`);}return dateBR(s);}
function getNF(o,name){const k=Object.keys(o).find(k=>norm(k)===norm(name));return String(o[k]??'').trim();}
function parseNFs(raw){const sep=raw.split(/\r?\n/)[0].includes('\t')?'\t':raw.split(/\r?\n/)[0].includes(';')?';':',';const grid=parseDelimited(raw,sep);const head=grid.shift().map(x=>x.trim());const required=['Nº Nota fiscal','Dt. Faturamento','Cliente','Descrição Cliente','Ordem de Frete','Cidade','Peso Bruto','Valor da NFe'];for(const col of required)if(!head.some(h=>norm(h)===norm(col)))throw Error('Coluna obrigatória ausente: '+col);return grid.filter(r=>r.some(x=>x.trim())).map((r,i)=>{const o=Object.fromEntries(head.map((h,j)=>[h,r[j]||'']));const x={invoice_number:getNF(o,required[0]),invoiced_on:invoiceDate(getNF(o,required[1])),customer_code:getNF(o,required[2]),customer_name:getNF(o,required[3]),plan_number:getNF(o,required[4]),city:getNF(o,required[5]),gross_weight:num(getNF(o,required[6])),invoice_value:num(getNF(o,required[7]))};if(!x.invoice_number||!x.customer_code||!x.plan_number)throw Error('Linha '+(i+2)+': NF, cliente e ordem de frete são necessários para identificar a nota. Os demais campos podem ficar vazios.');return x;});}
$('nf-file').onchange=async()=>{try{const f=$('nf-file').files[0];if(!f)return;if(f.name.toLowerCase().endsWith('.xlsx')){const XLSX=await import('https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs');const data=await f.arrayBuffer();const wb=XLSX.read(data,{type:'array',cellDates:true,cellText:true});const ws=wb.Sheets[wb.SheetNames[0]];const grid=XLSX.utils.sheet_to_json(ws,{header:1,raw:false,defval:'',dateNF:'dd/mm/yyyy'});$('nf-date-format').value='BR';// Datas do XLSX já foram formatadas em dd/mm/aaaa.
$('nf-paste').value=grid.map(row=>row.map(v=>String(v??'').replace(/[\t\r\n]/g,' ')).join('\t')).join('\n');}else $('nf-paste').value=await f.text();message('Arquivo carregado. Clique em Conferir notas.');}catch(e){message(e.message,true);}};
$('nf-preview').onclick=()=>{try{nfPending=parseNFs($('nf-paste').value.trim());if(!nfPending.length||nfPending.length>1000)throw Error('Envie entre 1 e 1000 notas por lote.');$('nf-preview-table').innerHTML=table(['NF','Faturamento','Cliente','Destinatário','Plano','Cidade','Peso (kg)','Valor'],nfPending.map(x=>[x.invoice_number,x.invoiced_on,x.customer_code,x.customer_name,x.plan_number,x.city,(x.gross_weight==null?'':Number(x.gross_weight).toLocaleString('pt-BR')+' kg'),(x.invoice_value==null?'':Number(x.invoice_value).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}))]));$('nf-count').textContent=nfPending.length+' nota(s) conferidas';$('nf-save').disabled=false;}catch(e){nfPending=[];$('nf-save').disabled=true;message(e.message,true);}};
$('nf-paste').oninput=()=>{$('nf-save').disabled=true;nfPending=[];};
$('nf-save').onclick=async()=>{try{if(!nfPending.length)throw Error('Confira as notas primeiro.');if(!confirm('Salvar '+nfPending.length+' notas fiscais no banco?'))return;$('nf-save').disabled=true;const a=await rpc('pcd_v8_import_invoices',{p_rows:nfPending});message(`Notas processadas: ${a.total}. Inseridas: ${a.inserted}. Atualizadas: ${a.updated}.`);nfPending=[];$('nf-paste').value='';$('nf-preview-table').innerHTML='';$('nf-count').textContent='';await rpc('pcd_v91_log_import',{p_kind:'NOTAS',p_source:'MANUAL',p_source_id:'notas-'+Date.now(),p_total:a.inserted||a.total||0,p_status:'SUCESSO',p_details:null});await refreshHealth();}catch(e){message(e.message,true);}};
async function openPlanInvoices(r){
 try{
  const [invoices,reasons,existing]=await Promise.all([
   rpc('pcd_v8_plan_invoices',{p_plan:r.plan_number}),
   rpc('pcd_v9_reasons'),
   rpc('pcd_v9_list_occurrences',{p_plan:r.plan_number})
  ]);
  const groups=new Map();
  for(const nf of invoices){const key=String(nf.customer_code||'')+'|'+String(nf.customer_name||'');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(nf);}
  const brMoney=n=>n==null?'—':Number(n).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const brWeight=n=>n==null?'—':Number(n).toLocaleString('pt-BR',{maximumFractionDigits:3})+' kg';
  let html=`<div class="occ-stats"><span><b>${invoices.length}</b> NFs</span><span><b>${groups.size}</b> destinatários</span><span><b>${existing.length}</b> ocorrências registradas</span></div>`;
  if(!invoices.length)html+='<p class="note">Nenhuma nota vinculada ao plano. Importe as NFs e confira Ordem de Frete = PLANO.</p>';
  for(const [key,notes] of groups){
   const [code,name]=key.split('|');const city=notes[0].city||'—';const customerOcc=existing.filter(o=>String(o.customer_code)===code);const marker=customerOcc.length?(customerOcc.some(o=>o.status!=='ENCERRADA')?'🔴 ':'🟢 '):'';
   html+=`<details class="occ-customer"><summary><strong>${marker}${esc(name||'Cliente não informado')}</strong><small>${esc(code)} · ${esc(city)} · ${notes.length} NF(s) · ${brWeight(notes.reduce((sum,x)=>sum+Number(x.gross_weight||0),0))}</small></summary><div class="scroll"><table class="occ-table"><thead><tr><th><input type="checkbox" class="occ-select-all" aria-label="Selecionar notas do destinatário"></th><th>NF</th><th>Cliente</th><th>Cidade</th><th>Peso</th><th>Valor</th></tr></thead><tbody>`;
   for(const nf of notes)html+=`<tr><td><input type="checkbox" class="occ-nf" data-id="${Number(nf.id)}" data-customer="${esc(code)}"></td><td>${esc(nf.invoice_number)}</td><td>${esc(nf.customer_name)}</td><td>${esc(nf.city)}</td><td>${brWeight(nf.gross_weight)}</td><td>${brMoney(nf.invoice_value)}</td></tr>`;
   html+='</tbody></table></div></details>';
  }
  if(invoices.length){
   html+=`<div class="occ-form"><div class="occ-two"><div><label>Motivo da ocorrência</label><select id="occ-reason"><option value="">Selecione...</option>${reasons.map(x=>`<option value="${Number(x.id)}">${esc(x.name)}</option>`).join('')}</select></div><div><label>Notas selecionadas</label><div id="occ-selected" class="occ-count">0 NF(s)</div></div></div><label>Descrição da ocorrência</label><textarea id="occ-description" maxlength="2000" placeholder="Descreva objetivamente o ocorrido e o apoio solicitado."></textarea><div class="occ-first-upload"><label for="occ-initial-files">Evidências (opcional)</label><input id="occ-initial-files" type="file" accept=".pdf,.jpg,.jpeg,.png" multiple><small>PDF, JPG ou PNG; até 10 MB por arquivo. Novos anexos podem ser adicionados depois.</small></div><button type="button" id="occ-create-send" class="occ-primary-send">Registrar e enviar ocorrência</button><p class="muted">Produção: o envio é direcionado somente aos e-mails ATIVOS cadastrados. Em caso de falha, utilize o histórico para reenviar sem duplicar a ocorrência.</p></div>`;
  }
  html+='<h3 class="occ-history-title">Histórico do plano</h3>';
  if(!existing.length)html+='<p class="muted">Nenhuma ocorrência registrada neste plano.</p>';
  for(const o of existing){
   const nfs=(o.invoices||[]).map(x=>x.number).join(', ');
   html+=`<div class="occ-history"><b>OC-${new Date(o.created_at).getFullYear()}-${String(o.id).padStart(6,'0')}</b> · <span class="occ-status">${esc(o.status)}</span><div>${esc(o.customer_name)} · ${esc(o.city)} · ${esc(o.reason)}</div><small>NF(s): ${esc(nfs)} · ${new Date(o.created_at).toLocaleString('pt-BR')}</small><p>${esc(o.description)}</p><div class="occ-actions"><button class="small occ-manage" data-occ-id="${Number(o.id)}">Gerenciar / Anexos / Envio / Encerramento</button></div></div>`;
  }
  modal('Notas fiscais e ocorrências',`Plano ${r.plan_number} · ${r.city||'—'} · ${r.driver_name||'Motorista não escalado'}`,html,async()=>{});
  $('modal-save').classList.add('hidden');
  const body=$('modal-body');
  const createButton=$('occ-create-send');
  if(createButton)createButton.onclick=async()=>{
   let createdId=null;
   try{
    const marked=[...body.querySelectorAll('.occ-nf:checked')];
    if(!marked.length)throw Error('Selecione ao menos uma nota fiscal.');
    if(new Set(marked.map(x=>x.dataset.customer)).size!==1)throw Error('Registre uma ocorrência por destinatário.');
    const reason=Number($('occ-reason').value),description=$('occ-description').value.trim();
    if(!reason||!description)throw Error('Informe o motivo e a descrição.');
    const files=[...$('occ-initial-files').files];
    if(files.some(f=>!['application/pdf','image/jpeg','image/png'].includes(f.type)||f.size<1||f.size>10485760))throw Error('Anexo inválido. Utilize PDF/JPG/PNG de até 10 MB.');
    if(files.reduce((n,f)=>n+f.size,0)>12*1024*1024)throw Error('O total de anexos excede 12 MB.');
    createButton.disabled=true;createButton.textContent='Registrando ocorrência...';
    const created=await rpc('pcd_v9_create_occurrence',{p_plan:r.plan_number,p_invoice_ids:marked.map(x=>Number(x.dataset.id)),p_reason_id:reason,p_description:description});
    createdId=Number(created.id||created.occurrence_id);
    if(!Number.isSafeInteger(createdId)||createdId<1)throw Error('Ocorrência criada, mas o identificador não foi retornado. Verifique o histórico antes de repetir.');
    const ids=[];
    for(const f of files){
     createButton.textContent='Anexando evidências...';
     const {data:{user},error:authError}=await db.auth.getUser();if(authError||!user)throw Error('Sessão expirada');
     const path=`${user.id}/${createdId}/${crypto.randomUUID()}-${f.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
     const {error:uploadError}=await db.storage.from('pcd-occurrences').upload(path,f,{contentType:f.type,upsert:false});if(uploadError)throw uploadError;
     ids.push(await rpc('pcd_v92_add_attachment',{p_occurrence_id:createdId,p_path:path,p_name:f.name,p_mime:f.type,p_size:f.size}));
    }
    createButton.textContent='Solicitando envio...';
    const queued=await rpc('pcd_v92_queue_email',{p_occurrence_id:createdId,p_kind:'INICIAL',p_note:'',p_attachment_ids:ids.map(Number)});
    const {data,error}=await db.functions.invoke('pcd-occurrence-send',{body:{queue_id:queued.id}});
    if(error){let detail=error.message;try{const payload=await error.context?.json?.();detail=payload?.error||payload?.message||detail;}catch{}throw Error('Fila #'+queued.id+': '+detail);}
    if(!data?.ok)throw Error('Fila #'+queued.id+': '+(data?.error||'Envio não confirmado'));
    message('Ocorrência registrada e aceita pelo Resend. Confira o e-mail de homologação.');
    await openPlanInvoices(r);
   }catch(e){
    message((createdId?'Ocorrência #'+createdId+' registrada, mas o envio não foi confirmado. Não registre novamente. Abra o histórico para verificar ou complementar. ':'Não foi possível registrar: ')+e.message,true);
    createButton.disabled=Boolean(createdId);
    createButton.textContent=createdId?'Ocorrência registrada — confira o histórico':'Registrar e enviar ocorrência';
   }finally{if(!createdId)createButton.disabled=false;}
  };
  body.querySelectorAll('.occ-manage').forEach(b=>b.onclick=()=>manageOccurrence(Number(b.dataset.occId),r));
  const update=()=>{const n=body.querySelectorAll('.occ-nf:checked').length;const el=$('occ-selected');if(el)el.textContent=n+' NF(s)';};
  body.querySelectorAll('.occ-select-all').forEach(all=>all.onchange=()=>{all.closest('table').querySelectorAll('.occ-nf').forEach(c=>c.checked=all.checked);update();});
  body.querySelectorAll('.occ-nf').forEach(c=>c.onchange=update);
 }catch(e){message(e.message,true);}
}
async function manageOccurrence(occId,route){
 try{
  const [history,files]=await Promise.all([rpc('pcd_v92_history',{p_occurrence_id:occId}),rpc('pcd_v92_attachments_for_occurrence',{p_occurrence_id:occId})]);
  const hasInitial=(history.emails||[]).some(x=>x.kind==='INICIAL');
  const initialSent=(history.emails||[]).some(x=>x.kind==='INICIAL'&&x.status==='ENVIADO');
  const pendingInitial=(history.emails||[]).find(x=>x.kind==='INICIAL'&&['PENDENTE','ERRO'].includes(x.status));
  const rows=(history.emails||[]).map(x=>`<div class="occ-history">${esc(x.kind)} · <b>${esc(x.status)}</b> · ${new Date(x.requested_at).toLocaleString('pt-BR')}${x.error?`<p class="error">${esc(x.error)}</p>`:''}</div>`).join('');
  const fileRows=files.map(f=>`<label class="occ-file"><input type="checkbox" class="occ-attach-select" value="${Number(f.id)}"> ${esc(f.name)} <small>(${Math.ceil(f.size/1024)} KB)</small></label>`).join('');
  const html=`<div class="occ-v92"><div class="note">Produção: envio somente aos destinatários <b>ATIVOS</b>. A lista é validada pelo Supabase antes do envio.</div>
  <h3>Evidências e anexos</h3><input id="occ-upload" type="file" accept=".pdf,.jpg,.jpeg,.png" multiple><button class="small" id="occ-upload-btn">Adicionar anexos</button><p class="muted">Até 10 MB por arquivo; PDF, JPG ou PNG. Para nota parcial/comprovante de encerramento, envie PDF.</p><div class="occ-files">${fileRows||'<small>Nenhum anexo cadastrado</small>'}</div>
  ${pendingInitial?`<div class="occ-retry-box"><b>Envio inicial pendente — fila #${Number(pendingInitial.id)}</b><p>Reprocesse a solicitação existente, sem criar outra ocorrência.</p><button id="occ-retry-initial" type="button">Processar envio pendente</button></div>`:''}
  ${initialSent?'<div class="occ-retry-box"><b>Reenviar ocorrência já comunicada</b><p>Gera novo envio aos destinatários ATIVOS atuais, sem criar outra ocorrência. O envio anterior permanece no histórico.</p><button type="button" id="occ-resend-original">Reenviar ocorrência</button></div>':''}
  <h3>Envio de ocorrência</h3><label>Complemento (se houver)</label><textarea id="occ-complement" rows="2" placeholder="Informações adicionais para o e-mail complementar"></textarea>
  <button id="occ-send-v92" class="small">${hasInitial?'Enviar e-mail complementar':'Enviar ocorrência inicial de teste'}</button><p class="muted">Selecione os anexos que devem acompanhar este envio. Novos anexos podem ser incluídos posteriormente.</p>
  <h3>Histórico de envios</h3>${rows||'<p class="muted">Nenhum envio nesta versão.</p>'}
  <h3>Encerramento</h3><label>Resultado final</label><select id="occ-close-result"><option value="">Selecione...</option><option>ENTREGUE</option><option>ENTREGUE PARCIAL</option><option>DEVOLUÇÃO TOTAL</option><option>REENTREGA</option><option>DEVOLUÇÃO PARCIAL</option></select><label>Senha de autorização 3 Corações</label><input id="occ-close-code" placeholder="Obrigatória para parcial ou devolução"><label>Observação de encerramento</label><textarea id="occ-close-note" rows="2"></textarea><button id="occ-close-btn" class="small" ${history.status==='ENCERRADA'?'disabled':''}>Encerrar ocorrência</button>${history.closing_result?`<p class="note">Encerrada: ${esc(history.closing_result)}</p>`:''}<div class="occ-modal-footer"><button type="button" class="secondary" id="occ-footer-close">Fechar</button></div></div>`;
  modal('Gestão da ocorrência',`OC-${String(occId).padStart(6,'0')} · Plano ${route.plan_number}`,html,async()=>{});
  $('modal-save').classList.add('hidden');
  $('occ-footer-close').onclick=()=>{$('modalbg').classList.add('hidden');};
  const selected=()=>[...document.querySelectorAll('.occ-attach-select:checked')].map(e=>Number(e.value));
  $('occ-upload-btn').onclick=async()=>{
   try{const arr=[...$('occ-upload').files];if(!arr.length)throw Error('Selecione arquivos.');
    for(const f of arr){if(!['application/pdf','image/jpeg','image/png'].includes(f.type)||f.size>10485760||!f.size)throw Error('Arquivo inválido: '+f.name);
     const {data:{user}}=await db.auth.getUser();const safe=f.name.replace(/[^a-zA-Z0-9._-]/g,'_');const path=`${user.id}/${occId}/${crypto.randomUUID()}-${safe}`;
     const {error}=await db.storage.from('pcd-occurrences').upload(path,f,{contentType:f.type,upsert:false});if(error)throw error;
     await rpc('pcd_v92_add_attachment',{p_occurrence_id:occId,p_path:path,p_name:f.name,p_mime:f.type,p_size:f.size});
    }message('Anexos salvos.');await manageOccurrence(occId,route);
   }catch(e){message('Falha no anexo: '+e.message,true);}
  };
  if(pendingInitial){$('occ-retry-initial').onclick=async()=>{const b=$('occ-retry-initial');b.disabled=true;try{await processExistingQueue(Number(pendingInitial.id));await manageOccurrence(occId,route);}catch(e){message('Envio não confirmado: '+e.message,true);b.disabled=false;}};}
  if(initialSent){$('occ-resend-original').onclick=async()=>{
   const btn=$('occ-resend-original');
   if(!confirm('Reenviar esta ocorrência aos destinatários ATIVOS atualmente cadastrados? O histórico anterior será preservado.'))return;
   btn.disabled=true;
   try{
    // O marcador interno instrui a Edge Function a reenviar o corpo original.
    // A fila usa COMPLEMENTO para não criar um segundo envio inicial.
    const queued=await rpc('pcd_v92_queue_email',{p_occurrence_id:occId,p_kind:'COMPLEMENTO',p_note:'[INNOVA_REENVIO_ORIGINAL]',p_attachment_ids:files.map(f=>Number(f.id))});
    const {data,error}=await db.functions.invoke('pcd-occurrence-send',{body:{queue_id:queued.id}});
    if(error){let detail=error.message;try{const p=await error.context?.json?.();detail=p?.error||p?.message||detail;}catch{}throw Error('Fila #'+queued.id+': '+detail);}
    if(!data?.ok)throw Error('Fila #'+queued.id+': '+(data?.error||'Envio não confirmado'));
    message('Reenvio aceito pelo Resend. Fila #'+queued.id+'.');await manageOccurrence(occId,route);
   }catch(e){message('Reenvio não confirmado: '+e.message,true);btn.disabled=false;}
  };}
  $('occ-send-v92').onclick=async()=>{
   const btn=$('occ-send-v92');try{
    if(hasInitial&&!initialSent)throw Error('O envio inicial ainda não foi confirmado. Consulte o histórico.');
    if(!confirm('Enviar aos destinatários ATIVOS cadastrados no sistema?'))return;
    btn.disabled=true;const kind=hasInitial?'COMPLEMENTO':'INICIAL';
    const queued=await rpc('pcd_v92_queue_email',{p_occurrence_id:occId,p_kind:kind,p_note:$('occ-complement').value.trim(),p_attachment_ids:selected()});
    message('Solicitação '+queued.id+' registrada. Enviando pelo Resend...');
    const {data,error}=await db.functions.invoke('pcd-occurrence-send',{body:{queue_id:queued.id}});
    if(error){
     let detail=error.message;
     try{if(error.context && typeof error.context.json==='function'){const payload=await error.context.json();detail=payload.error||payload.message||detail;}}catch{}
     throw Error('Fila #'+queued.id+': '+detail+'. Consulte o histórico antes de tentar novamente.');
    }
    if(!data?.ok)throw Error('Fila #'+queued.id+': '+(data?.error||'Envio não confirmado'));
    message('Solicitação #'+queued.id+' aceita pelo Resend (ID '+(data.provider_id||'não informado')+'). Confira a caixa de entrada.');
    await manageOccurrence(occId,route);
   }catch(e){message('Envio não confirmado: '+e.message,true);btn.disabled=false;}
  };
  $('occ-close-btn').onclick=async()=>{
   try{const result=$('occ-close-result').value,code=$('occ-close-code').value.trim();if(!result)throw Error('Selecione o resultado.');
    if(!confirm('Confirmar encerramento da ocorrência?'))return;
    await rpc('pcd_v92_close_occurrence',{p_occurrence_id:occId,p_result:result,p_code:code,p_notes:$('occ-close-note').value.trim()});
    message('Ocorrência encerrada.');await manageOccurrence(occId,route);
   }catch(e){message(e.message,true);}
  };
 }catch(e){message(e.message,true);}
}
function switchImport(kind){$('import-routes-area').classList.toggle('hidden',kind!=='routes');$('panel-invoices').classList.toggle('hidden',kind!=='invoices');$('switch-routes').classList.toggle('active',kind==='routes');$('switch-invoices').classList.toggle('active',kind==='invoices');}
$('switch-routes').onclick=()=>switchImport('routes');$('switch-invoices').onclick=()=>switchImport('invoices');
function localStamp(v){return v?new Date(v).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'Sem registro';}
// Rodape compacto: os horarios de notas/rotas sao os ultimos eventos informados pelo RPC.
// Para o banco, o horario corresponde a verificacao de conectividade, nao a ultima gravacao.
function healthLine(id,label,date,kind='event'){
 const el=$(id);if(!el)return;
 const valid=date && !Number.isNaN(new Date(date).getTime());
 el.textContent=`${label} ${valid?'✓':'—'} ${valid?localStamp(date):'Sem registro'}`;
 el.classList.toggle('health-ok',Boolean(valid));
 el.title=kind==='check'?'Ultima verificacao bem-sucedida da conexao':valid?'Ultimo registro conhecido':'Nenhum registro disponivel';
}
async function refreshGmailHealth(){
 const el=$('health-gmail');if(!el)return;
 try{
  const r=await gmailAdmin('HISTORICO');
  const items=Array.isArray(r.items)?r.items:[];
  const latest=items.filter(x=>x.imported_at && !Number.isNaN(new Date(x.imported_at).getTime()))
   .sort((a,b)=>new Date(b.imported_at)-new Date(a.imported_at))[0];
  healthLine('health-gmail','IMPORTAÇÃO DE NOTAS',latest?.imported_at);
 }catch(e){
  el.textContent='IMPORTAÇÃO DE NOTAS — Indisponível';el.classList.remove('health-ok');
  el.title='Histórico Gmail indisponível para esta sessão';
 }
}
async function refreshHealth(){
 try{
  const h=await rpc('pcd_v91_health');
  healthLine('health-db','BANCO DE DADOS',new Date().toISOString(),'check');
  healthLine('health-routes','IMPORTAÇÃO DE ROTAS',h.last_routes);
 }catch(e){
  $('health-db').textContent='BANCO DE DADOS ✕ Falha';$('health-db').classList.remove('health-ok');
  $('health-routes').textContent='IMPORTAÇÃO DE ROTAS — Indisponível';
  console.warn('Monitoramento:',e.message);
 }
 await refreshGmailHealth();
}
// Atualizacao discreta enquanto o painel esta aberto.
setInterval(()=>{if(db && !$('main').classList.contains('hidden') && !document.hidden)refreshHealth().catch(console.warn);},60000);

// V9.4 — dashboard de ocorrências. RPC usa autenticação e paginação no servidor.
async function processExistingQueue(id){
 if(!Number.isSafeInteger(id)||id<1)throw Error('Fila inválida');
 await rpc('pcd_v94_prepare_retry',{p_queue_id:id});
 message('Processando fila #'+id+' pelo Resend...');
 const {data,error}=await db.functions.invoke('pcd-occurrence-send',{body:{queue_id:id}});
 if(error){let detail=error.message;try{const p=await error.context?.json?.();detail=p?.error||p?.message||detail;}catch{}throw Error('Fila #'+id+': '+detail);}
 if(!data?.ok)throw Error('Fila #'+id+': '+(data?.error||'Envio não confirmado'));
 message('Fila #'+id+' aceita pelo Resend. ID: '+(data.provider_id||'não informado'));
}
async function loadOccurrences(){
 const view=$('occ-view').value,search=$('occ-search').value.trim(),date=$('occ-date').value||null;
 const data=await rpc('pcd_v94_list_occurrences',{p_view:view,p_date:date,p_search:search,p_limit:30,p_offset:pages.occurrences*30});
 totals.occurrences=data.total||0;
 const m=data.metrics||{};$('occ-metric-open').textContent=m.open??'—';$('occ-metric-closed').textContent=m.closed??'—';$('occ-metric-email').textContent=m.email_attention??'—';
 const items=data.rows||[];
 $('occ-list').innerHTML=table(['Ocorrência','Abertura','Plano','Cliente','Cidade','Motivo','Situação','E-mail','Ação'],items.map(o=>['OC-'+String(o.id).padStart(6,'0'),new Date(o.created_at).toLocaleString('pt-BR'),o.plan_number,o.customer_name,o.city,o.reason,o.status,o.email_status||'SEM ENVIO','']));
 $('occ-list').querySelectorAll('tbody tr').forEach((tr,i)=>{
  const o=items[i],s=tr.children[6],e=tr.children[7];s.textContent='';e.textContent='';
  const b=document.createElement('span');b.className='badge '+(o.status==='ENCERRADA'?'oc-closed':o.status==='ABERTA'?'oc-open':o.status==='CANCELADA'?'oc-cancelled':'oc-draft');b.textContent=o.status;s.append(b);
  const email=document.createElement('span');email.className='badge '+(o.email_status==='ENVIADO'?'ok':o.email_status==='ERRO'?'bad':'warn');email.textContent=o.email_status||'SEM ENVIO';e.append(email);
  const actions=tr.lastElementChild,manage=document.createElement('button');manage.className='small';manage.textContent='Gerenciar';manage.onclick=()=>manageOccurrence(Number(o.id),{plan_number:o.plan_number,city:o.city});actions.append(manage);
  if(['PENDENTE','ERRO'].includes(o.email_status)&&o.pending_queue_id){const retry=document.createElement('button');retry.className='small secondary';retry.style.marginLeft='6px';retry.textContent='Processar envio pendente';retry.onclick=async()=>{retry.disabled=true;try{await processExistingQueue(Number(o.pending_queue_id));await loadOccurrences();}catch(err){message(err.message,true);retry.disabled=false;}};actions.append(retry);}
 });
 $('occ-page').textContent=(data.total||0)+' ocorrência(s) · página '+(pages.occurrences+1);
 $('occ-prev').disabled=pages.occurrences===0;$('occ-next').disabled=(pages.occurrences+1)*30>=data.total;
}
$('occ-refresh').onclick=()=>loadOccurrences().catch(e=>message(e.message,true));
$('occ-filter').onclick=()=>{pages.occurrences=0;loadOccurrences().catch(e=>message(e.message,true));};
$('occ-view').onchange=$('occ-date').onchange=()=>{pages.occurrences=0;loadOccurrences().catch(e=>message(e.message,true));};
$('occ-search').onkeydown=e=>{if(e.key==='Enter')$('occ-filter').click();};
$('occ-prev').onclick=()=>{pages.occurrences=Math.max(0,pages.occurrences-1);loadOccurrences().catch(e=>message(e.message,true));};
$('occ-next').onclick=()=>{pages.occurrences++;loadOccurrences().catch(e=>message(e.message,true));};

init().catch(e=>{console.error('Falha na inicialização do INNOVA PCD:',e);message('Falha na inicialização: '+(e?.message||String(e)),true);});

// V9.7 - Cadastro de destinatários. A permissão efetiva é validada nas RPCs.
// V13.34 - Alteração em lote exclusiva do administrador, validada também na RPC.
async function bulkRecipients(active){
 requireFinanceOwner();
 const action=active?'ATIVAR':'INATIVAR';
 if(!confirm(action+' TODOS os destinatários cadastrados? A alteração afetará os PRÓXIMOS envios, sem reenviar ocorrências antigas.'))return;
 const buttons=[$('recipient-bulk-activate'),$('recipient-bulk-deactivate')];
 buttons.forEach(b=>b.disabled=true);
 try{
  const result=await rpc('pcd_oc_set_all_recipients_active',{p_active:active});
  await loadRecipients();
  message((active?'Ativação':'Inativação')+' concluída: '+(result?.changed??0)+' destinatário(s) alterado(s).');
 }catch(e){message('Não foi possível alterar destinatários: '+e.message,true);}
 finally{buttons.forEach(b=>b.disabled=false);}
}
$('recipient-bulk-activate').onclick=()=>bulkRecipients(true);
$('recipient-bulk-deactivate').onclick=()=>bulkRecipients(false);
async function loadRecipients(){
 const term=$('recipient-search').value.trim();const items=await rpc('pcd_oc_list_recipients',{p_search:term});
 $('recipient-bulk-controls').classList.toggle('hidden',!financeOwner);
 $('recipient-bulk-counts').textContent=term?'Contagem dos resultados filtrados: '+items.filter(x=>x.active).length+' ativos / '+items.length+' exibidos':'Ativos: '+items.filter(x=>x.active).length+' · Inativos: '+items.filter(x=>!x.active).length;
 $('recipient-table').innerHTML=table(['Nome','E-mail','Status','Alterado em','Ação'],items.map(x=>[x.display_name,x.email,'',new Date(x.updated_at).toLocaleString('pt-BR'),'']));
 $('recipient-table').querySelectorAll('tbody tr').forEach((tr,i)=>{
  const x=items[i];const cell=tr.children[2];
  const toggle=document.createElement('button');toggle.type='button';toggle.className='small recipient-inline-toggle '+(x.active?'is-active':'is-inactive');toggle.textContent=x.active?'ATIVO':'INATIVO';toggle.title=x.active?'Clique para inativar este destinatário':'Clique para ativar este destinatário';toggle.setAttribute('aria-label',(x.active?'Inativar ':'Ativar ')+x.email);cell.append(toggle);
  toggle.onclick=async()=>{
   const next=!x.active;
   toggle.disabled=true;
   try{
    await rpc('pcd_oc_save_recipient',{p_email:x.email,p_name:x.display_name||'',p_active:next});
    x.active=next;toggle.textContent=next?'ATIVO':'INATIVO';toggle.className='small recipient-inline-toggle '+(next?'is-active':'is-inactive');toggle.title=next?'Clique para inativar este destinatário':'Clique para ativar este destinatário';toggle.setAttribute('aria-label',(next?'Inativar ':'Ativar ')+x.email);
    $('recipient-bulk-counts').textContent=term?'Contagem dos resultados filtrados: '+items.filter(y=>y.active).length+' ativos / '+items.length+' exibidos':'Ativos: '+items.filter(y=>y.active).length+' · Inativos: '+items.filter(y=>!y.active).length;
    message('Destinatário '+(next?'ativado':'inativado')+': '+x.email+'.');
   }catch(e){message('Não foi possível alterar '+x.email+': '+e.message,true);}
   finally{toggle.disabled=false;}
  };
  const b=document.createElement('button');b.className='small secondary';b.textContent='Editar';b.onclick=()=>editRecipient(x);tr.lastElementChild.append(b);
 });
}
function editRecipient(item){
 const editing=Boolean(item);
 $('modal-title').textContent=editing?'Editar destinatário':'Novo destinatário';
 $('modal-summary').textContent='A alteração fica registrada no banco. Somente endereços ativos podem receber e-mails.';
 $('modal-body').innerHTML=`<label>Nome</label><input id="rec-name" maxlength="120" value="${esc(item?.display_name||'')}"><label style="margin-top:12px">E-mail</label><input id="rec-email" type="email" maxlength="254" value="${esc(item?.email||'')}" ${editing?'readonly':''}><label style="margin-top:12px;display:flex;align-items:center;gap:8px"><input type="checkbox" id="rec-active" ${item?.active?'checked':''} style="width:auto"> Destinatário ATIVO</label>`;
 $('modalbg').classList.remove('hidden');$('modal-save').classList.remove('hidden');
 modalSave=async()=>{
  const email=$('rec-email').value.trim(),name=$('rec-name').value.trim(),active=$('rec-active').checked;
  if(active&&!item?.active&&!confirm('Ativar '+email+' para receber ocorrências reais?'))return;
  await rpc('pcd_oc_save_recipient',{p_email:email,p_name:name,p_active:active});$('modalbg').classList.add('hidden');await loadRecipients();message('Destinatário atualizado.');
 };
}
$('recipient-refresh').onclick=()=>loadRecipients().catch(e=>message(e.message,true));
$('recipient-search').oninput=()=>loadRecipients().catch(e=>message(e.message,true));
$('recipient-add').onclick=()=>editRecipient(null);

// V9.8 - Motivos e ranking. Alteracoes autorizadas exclusivamente pelo Supabase.
async function loadReasons(){
 const items=await rpc('pcd_oc_list_reasons',{p_search:$('reason-search').value.trim(),p_include_inactive:true});
 const status=$('reason-status').value;
 const filtered=items.filter(x=>status==='TODOS'||(status==='ATIVOS'&&x.active)||(status==='INATIVOS'&&!x.active));
 $('reason-table').innerHTML=table(['Motivo','Grupo','Utilizações','Status','Observação','Ação'],filtered.map(x=>[x.name,x.reason_group||'',String(x.usage_count),'',x.notes||'','']));
 $('reason-table').querySelectorAll('tbody tr').forEach((tr,i)=>{
  const x=filtered[i],badge=document.createElement('span');badge.className='badge '+(x.active?'oc-open':'oc-cancelled');badge.textContent=x.active?'ATIVO':'INATIVO';tr.children[3].append(badge);
  const btn=document.createElement('button');btn.className='small secondary';btn.textContent='Editar';btn.onclick=()=>editReason(x);tr.lastElementChild.append(btn);
 });
}
function editReason(item){
 $('modal-title').textContent=item?'Editar motivo':'Novo motivo';
 $('modal-summary').textContent=item&&Number(item.usage_count)>0?'Motivo já utilizado: para preservar o histórico, não é permitido renomeá-lo.':'Somente motivos ATIVOS aparecem no seletor do SAC.';
 $('modal-body').innerHTML=`<label>Motivo</label><input id="reason-name" maxlength="120" value="${esc(item?.name||'')}" ${item&&Number(item.usage_count)>0?'readonly':''}><label style="margin-top:12px">Grupo</label><input id="reason-group" maxlength="80" value="${esc(item?.reason_group||'')}"><label style="margin-top:12px">Observação</label><textarea id="reason-notes" maxlength="500">${esc(item?.notes||'')}</textarea><label style="margin-top:12px;display:flex;align-items:center;gap:8px"><input id="reason-active" type="checkbox" style="width:auto" ${item?.active?'checked':''}> Motivo ATIVO</label>`;
 $('modalbg').classList.remove('hidden');$('modal-save').classList.remove('hidden');
 modalSave=async()=>{
  await rpc('pcd_oc_save_reason',{p_id:item?.id||null,p_name:$('reason-name').value,p_active:$('reason-active').checked,p_group:$('reason-group').value,p_notes:$('reason-notes').value});
  $('modalbg').classList.add('hidden');await loadReasons();message('Motivo atualizado. O ranking sera recalculado ao abrir a proxima ocorrencia.');
 };
}
$('reason-refresh').onclick=()=>loadReasons().catch(e=>message(e.message,true));
$('reason-search').oninput=()=>loadReasons().catch(e=>message(e.message,true));
$('reason-status').onchange=()=>loadReasons().catch(e=>message(e.message,true));
$('reason-add').onclick=()=>editReason(null);


// Central Gmail: somente a sessao Supabase e enviada ao gateway.
// O secret de execucao nunca sai do servidor.
let gmailPreviewReady=false,gmailBusy=false;
async function gmailAdmin(action){
 const {data:{session},error}=await db.auth.getSession();
 if(error||!session?.access_token)throw Error('Sessão expirada. Entre novamente.');
 const response=await fetch(`${cfg.supabaseUrl}/functions/v1/pcd-gmail-admin`,{
  method:'POST',headers:{'Authorization':`Bearer ${session.access_token}`,'apikey':cfg.supabasePublishableKey,'Content-Type':'application/json'},
  body:JSON.stringify({action})
 });
 const payload=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(payload.error||`Erro HTTP ${response.status}`);
 return payload;
}
function gmailBusySet(v){gmailBusy=v;for(const id of ['gmail-simulate','gmail-history'])$(id).disabled=v;$('gmail-apply').disabled=v||!gmailPreviewReady;}
function gmailStatus(t){$('gmail-operation-status').textContent=t;}
function gmailRenderPreview(r){
 $('gmail-new').textContent=r.new_rows??'—';$('gmail-existing').textContent=r.existing_rows??'—';$('gmail-files').textContent=r.files_matched??'—';$('gmail-issues').textContent=r.issues?.length??'—';
 const rows=(r.files||[]).map(x=>[x.filename,x.rows]);
 $('gmail-operation-results').innerHTML=table(['Anexo','Notas'],rows);
 if(r.issues?.length){const p=document.createElement('p');p.className='note';p.textContent='Inconsistências: '+r.issues.join(' | ');$('gmail-operation-results').prepend(p);}
 gmailPreviewReady=Boolean(r.mode==='SIMULACAO_SEM_GRAVACAO'&&!r.issues?.length&&r.files_matched>0);
 gmailStatus(`Simulação: ${r.new_rows??0} novas, ${r.existing_rows??0} existentes, ${r.duplicate_rows_in_files??0} repetidas. ${gmailPreviewReady?'Pronto para confirmar.':'Importação bloqueada.'}`);
}
$('gmail-simulate').onclick=async()=>{try{gmailBusySet(true);gmailPreviewReady=false;gmailStatus('Consultando Gmail e comparando notas...');const r=await gmailAdmin('SIMULAR');gmailRenderPreview(r);}catch(e){gmailStatus('Erro: '+e.message);message(e.message,true);}finally{gmailBusySet(false);}};
$('gmail-apply').onclick=async()=>{
 if(!gmailPreviewReady||gmailBusy)return;
 if(!confirm('IMPORTAÇÃO REAL: inserir notas novas e atualizar dados fiscais das existentes? Confirme que possui backup e não há outra importação em andamento.'))return;
 try{gmailBusySet(true);gmailPreviewReady=false;gmailStatus('Importando notas... Não feche a tela até receber o resultado.');
  const r=await gmailAdmin('APLICAR');
  $('gmail-operation-results').innerHTML=table(['Indicador','Quantidade'],[['Arquivos processados',r.files_processed??0],['Arquivos ignorados',r.files_skipped??0],['Notas inseridas',r.inserted??0],['Notas atualizadas',r.updated??0],['Sem alteração',r.unchanged??0],['Erros',(r.errors||[]).join('; ')||'Nenhum']]);
  gmailStatus(r.errors?.length?'Importação parcialmente concluída. Confira histórico e não repita sem analisar.':'Importação concluída. Consulte o histórico.');
  await refreshHealth();
 }catch(e){gmailStatus('Erro: '+e.message+' — confira histórico antes de repetir.');message(e.message,true);}finally{gmailBusySet(false);}
};
$('gmail-history').onclick=async()=>{try{gmailBusySet(true);gmailStatus('Consultando histórico...');const r=await gmailAdmin('HISTORICO');$('gmail-operation-results').innerHTML=table(['Importado em','Arquivo','Linhas','Inseridas','Atualizadas','Sem alteração'],(r.items||[]).map(x=>[new Date(x.imported_at).toLocaleString('pt-BR'),x.filename,x.row_count,x.inserted_count,x.updated_count,x.unchanged_count]));gmailStatus(`${r.items?.length||0} anexo(s) no histórico. Nenhum dado foi alterado.`);}catch(e){gmailStatus('Erro: '+e.message);message(e.message,true);}finally{gmailBusySet(false);}};


// INNOVA OC Faturamento V1.1 — consulta notas fiscais de TODOS os destinos por plano.
// Complementos são simulações locais, sem persistência ou aprovação financeira.
let billingPage=0,billingTotal=0;
const billingMoney=n=>n==null?'—':Number(n).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
function billingNorm(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();}
function billingBR(v){if(!v)return '—';const m=String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);return m?`${m[3]}/${m[2]}/${m[1]}`:String(v);}
function billingDateISO(v){const x=String(v||'').trim();if(!x)return null;const m=x.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);if(!m)throw Error('Informe a data no formato DD/MM/AAAA.');const iso=`${m[3]}-${m[2]}-${m[1]}`;const d=new Date(iso+'T12:00:00Z');if(isNaN(d)||d.getUTCDate()!==Number(m[1])||d.getUTCMonth()+1!==Number(m[2]))throw Error('Data inválida.');return iso;}
const billingComplements=new Map();
const billingNumber=n=>n==null||n===''?null:Number(n);
const billingKg=n=>n==null||n===''?'—':Number(n).toLocaleString('pt-BR',{maximumFractionDigits:2})+' kg';
async function billingDriverProfiles(date){try{const list=await rpc('pcd_v8_drivers',{p_date:date||new Date().toISOString().slice(0,10)});return Array.isArray(list)?list:[];}catch(e){console.warn('Perfil embarcado não disponível:',e);return [];}}
const billingReasonOptions=['DISTÂNCIA DA ROTA','COMPLEXIDADE DA ROTA','ESPERA','BONIFICAÇÃO'];
// Consulta operacional de cidades: usa as mesmas notas e tabela de faixas do Faturamento.
// Não modifica rotas, valores nem tabelas financeiras.
async function openProgrammingCities(r){
 const plan=String(r.plan_number||'');
 const dialog=$('billing-cities-modal'),body=$('billing-cities-body');
 const summary=$('programming-city-summary');
 dialog.classList.remove('hidden');
 $('billing-cities-plan').textContent='Plano '+plan+' · Consultando cidades...';
 body.replaceChildren();summary.textContent='Consultando notas fiscais e faixas contratuais...';
 try{
  const notes=await billingInvoices([plan]);
  const noteCities=[...new Set(notes.map(n=>billingNorm(n.city)).filter(Boolean))];
  const routeCity=billingNorm(r.city);
  const cities=noteCities.length?noteCities:(routeCity?[routeCity]:[]);
  if(!cities.length){summary.textContent='Nenhuma cidade identificada para este plano.';return;}
  // Buscar a tabela por páginas, sem presumir que os nomes estejam acentuados igualmente.
  const rates=[];let offset=0;
  while(true){
   const {data,error}=await db.from('pcd_billing_city_rates')
    .select('city,band,vehicle_profile,distance_km').range(offset,offset+999);
   if(error)throw error;
   rates.push(...(data||[]));
   if(!data||data.length<1000)break;
   offset+=1000;
   if(offset>50000)throw Error('Tabela de cidades muito extensa para consulta completa.');
  }
  const profile=billingNorm(r.vehicle_profile);
  const details=cities.map(city=>{
   const matching=rates.filter(x=>billingNorm(x.city)===city&&billingNorm(x.vehicle_profile)===profile)
    .sort((a,b)=>Number(b.band||0)-Number(a.band||0)||Number(b.distance_km||0)-Number(a.distance_km||0));
   const best=matching[0];
   return {city,band:best?.band??null,distance:best?.distance_km??null};
  }).sort((a,b)=>Number(b.band||0)-Number(a.band||0)||Number(b.distance||0)-Number(a.distance||0));
  billingCityDetails(plan,details);
  const complete=details.every(x=>x.band!=null&&x.distance!=null);
  const decisive=complete?details[0]:null;
  summary.replaceChildren();
  if(decisive){
   const heading=document.createElement('div');heading.className='programming-city-label';heading.textContent='CIDADE DETERMINANTE DO FRETE';
   const name=document.createElement('div');name.className='programming-city-name';name.textContent=decisive.city;
   const meta=document.createElement('div');meta.className='programming-city-meta';meta.textContent='Faixa '+decisive.band+' · '+Number(decisive.distance).toLocaleString('pt-BR')+' km';
   const explanation=document.createElement('p');explanation.textContent='Maior faixa contratual; em caso de empate, maior distância. Esta cidade determina a faixa utilizada na formação do preço da rota.';
   summary.append(heading,name,meta,explanation);
  }else{
   summary.textContent='Cidade determinante não confirmada: existem cidades sem faixa ou distância cadastrada para o perfil '+(r.vehicle_profile||'—')+'. Confira os dados antes de utilizar a informação para precificação.';
  }
  if(!noteCities.length){const note=document.createElement('p');note.className='programming-city-note';note.textContent='Sem notas fiscais vinculadas: exibida somente a cidade operacional da rota.';summary.append(note);}
 }catch(e){summary.textContent='Não foi possível consultar as cidades: '+e.message;body.replaceChildren();}
}
function billingCityDetails(plan,items){if(!document.querySelector('#programming-city-summary').dataset.programming){document.querySelector('#programming-city-summary').textContent='';}const modal=$('billing-cities-modal'),body=$('billing-cities-body');$('billing-cities-plan').textContent='Plano '+plan;body.textContent='';for(const item of items){const tr=document.createElement('tr');for(const val of [item.city,item.distance==null?'—':Number(item.distance).toLocaleString('pt-BR')+' km',item.band==null?'Sem faixa':'Faixa '+item.band]){const td=document.createElement('td');td.textContent=val;tr.append(td);}body.append(tr);}modal.classList.remove('hidden');}
// V13.4: o modal compartilhado não pode permanecer dentro do painel Faturamento oculto.
document.body.appendChild($('billing-cities-modal'));
$('billing-cities-close').onclick=()=>$('billing-cities-modal').classList.add('hidden');$('billing-cities-modal').addEventListener('click',e=>{if(e.target.id==='billing-cities-modal')e.currentTarget.classList.add('hidden');});
function billingTollMultiplier(profile){const x=billingNorm(profile).replace(/[^A-Z0-9]/g,'');return ['34','TRESQUARTOS','MEDIO','MEDIUM'].includes(x)?2:1;}
function billingOpenToll(city,plan){
 $('billing-toll-city').value=city;$('billing-toll-plan').textContent='Plano '+plan+' · cidade de referência '+city;
 $('billing-toll-amount').value='';$('billing-toll-modal').classList.remove('hidden');$('billing-toll-amount').focus();
}
$('billing-toll-cancel').onclick=()=>$('billing-toll-modal').classList.add('hidden');
$('billing-toll-save').onclick=async()=>{
 const city=$('billing-toll-city').value;const raw=$('billing-toll-amount').value.trim().replace(',','.');const amount=Number(raw);
 if(!raw||!Number.isFinite(amount)||amount<0){$('billing-toll-error').textContent='Informe um valor válido (zero somente quando realmente isento).';return;}
 const btn=$('billing-toll-save');btn.disabled=true;$('billing-toll-error').textContent='';
 try{await rpc('pcd_billing_register_toll',{p_city:city,p_amount:amount});$('billing-toll-modal').classList.add('hidden');await loadBilling();}
 catch(e){$('billing-toll-error').textContent=e.message;}
 finally{btn.disabled=false;}
};
async function billingInvoices(plans){
 const rows=[];const unique=[...new Set(plans.map(String).filter(Boolean))];
 // Consulta por plano, não por cidade da rota. A paginação evita truncar as notas.
 for(let i=0;i<unique.length;i+=20){const part=unique.slice(i,i+20);let offset=0;
  while(true){const {data,error}=await db.from('pcd_v8_invoices').select('plan_number,city,invoice_number,customer_code,invoice_value').in('plan_number',part).range(offset,offset+999);
   if(error)throw Error('Não foi possível consultar todas as cidades nas notas fiscais: '+error.message);
   rows.push(...(data||[]));if(!data||data.length<1000)break;offset+=1000;
  }
 }
 return rows;
}
let financeParamsCache=[];
let billingCostsCache=[];
async function billingGetCosts(){
 const records=await rpc('pcd_billing_cost_parameters_list');
 const operating=await rpc('pcd_billing_operating_parameters_list');
 billingCostsCache=[...(Array.isArray(records)?records:[]),...(Array.isArray(operating)?operating:[])];
 return billingCostsCache;
}
function billingCostRate(code,date){
 const valid=billingCostsCache.filter(x=>x.parameter_code===code&&x.effective_from<=date).sort((a,b)=>String(b.effective_from).localeCompare(String(a.effective_from)));
 return valid.length?Number(valid[0].value):null;
}

async function financeGetParams(){
 const records=await rpc('pcd_finance_parameters_list');
 financeParamsCache=Array.isArray(records)?records:[];
 return financeParamsCache;
}
function financeRate(key,routeDate){
 const valid=financeParamsCache.filter(x=>x.parameter_code===key&&x.effective_from<=routeDate).sort((a,b)=>String(b.effective_from).localeCompare(String(a.effective_from)));
 return valid.length?Number(valid[0].rate_percent):null;
}
function financePercent(v){return v==null?'Não configurado':Number(v).toLocaleString('pt-BR',{maximumFractionDigits:5})+'%';}
async function financeSaveParameter(code, rate, date){
 if(code==='DESP_OPER')return rpc('pcd_billing_operating_parameters_save',{p_value:rate,p_effective_from:date});
 if(['DESP_ADMIN','EMISSAO_CTE'].includes(code))return rpc('pcd_billing_cost_parameters_save',{p_code:code,p_value:rate,p_effective_from:date});
 return rpc('pcd_finance_parameters_save',{p_code:code,p_rate_percent:rate,p_effective_from:date});
}
function financeInlineEdit(tr,code,current){
 if(tr.nextElementSibling?.classList.contains('finance-inline-edit')){tr.nextElementSibling.remove();return;}
 document.querySelectorAll('.finance-inline-edit').forEach(el=>el.remove());
 const edit=document.createElement('tr');edit.className='finance-inline-edit';
 const cell=document.createElement('td');cell.colSpan=5;
 const panel=document.createElement('div');panel.className='finance-inline-panel';
 const title=document.createElement('span');title.textContent='Nova vigência · '+tr.firstElementChild.textContent;
 const rate=document.createElement('input');rate.type='text';rate.inputMode='decimal';rate.placeholder=code==='EMISSAO_CTE'?'Valor em R$':'Taxa em %';rate.value=current==null?'':String(current).replace('.',',');rate.setAttribute('aria-label','Novo valor');
 const date=document.createElement('input');date.type='date';date.value=today();date.min=today();date.setAttribute('aria-label','Início da vigência');
 const save=document.createElement('button');save.type='button';save.textContent='Salvar';
 const cancel=document.createElement('button');cancel.type='button';cancel.className='secondary';cancel.textContent='Cancelar';cancel.onclick=()=>edit.remove();
 const error=document.createElement('span');error.className='billing-toll-error';error.setAttribute('role','alert');
 save.onclick=async()=>{
  const raw=rate.value.trim().replace(',','.');const value=Number(raw);
  if(!raw||!Number.isFinite(value)||value<0||(code!=='EMISSAO_CTE'&&value>100)){error.textContent='Informe um valor válido.';return;}
  if(!date.value||date.value<today()){error.textContent='A vigência deve ser hoje ou uma data futura.';return;}
  if(!confirm('Registrar nova vigência de '+(code==='EMISSAO_CTE'?'R$ ':'')+rate.value+(code==='EMISSAO_CTE'?'':'%')+' em '+billingBR(date.value)+'? O histórico será preservado.'))return;
  save.disabled=true;error.textContent='';
  try{await financeSaveParameter(code,value,date.value);await loadFinanceParams();message('Nova vigência registrada com sucesso.');}
  catch(e){error.textContent=e.message;save.disabled=false;}
 };
 panel.append(title,rate,date,save,cancel,error);cell.append(panel);edit.append(cell);tr.after(edit);rate.focus();
}
async function loadFinanceParams(){
 const data=await financeGetParams();
 const costData=await billingGetCosts();
 const names={ICMS:'ICMS',AVERBACAO:'Averbação',ISS:'ISS',IRPJ:'IRPJ',CSLL:'CSLL',OUTROS_TRIBUTOS:'Demais tributos (provisão gerencial)'};
 const basis={ICMS:'Receita bruta',AVERBACAO:'Valor mercadoria',ISS:'Conforme operação',IRPJ:'A definir com contabilidade',CSLL:'A definir com contabilidade',OUTROS_TRIBUTOS:'Receita bruta · estimativa gerencial'};
 const tbody=$('finance-params-body');tbody.textContent='';
 for(const code of Object.keys(names)){
  const history=data.filter(x=>x.parameter_code===code).sort((a,b)=>String(b.effective_from).localeCompare(String(a.effective_from)));
  const active=history.find(x=>x.effective_from<=today());
  const tr=document.createElement('tr');
  for(const val of [names[code],active?financePercent(active.rate_percent):'Não configurado',basis[code],active?billingBR(active.effective_from):'—']){const td=document.createElement('td');td.textContent=val;tr.append(td);}
  const action=document.createElement('td');const editBtn=document.createElement('button');editBtn.type='button';editBtn.className='finance-edit-btn';editBtn.textContent='Editar';editBtn.onclick=()=>financeInlineEdit(tr,code,active?.rate_percent??null);action.append(editBtn);tr.append(action);
  tbody.append(tr);
 }
 for(const [code,name,base,unit] of [['DESP_ADMIN','Despesas administrativas','Receita bruta','%'],['DESP_OPER','Despesas operacionais','Receita bruta','%'],['EMISSAO_CTE','Emissão CT-e','Por nota fiscal única','R$']]){
  const history=costData.filter(x=>x.parameter_code===code).sort((a,b)=>String(b.effective_from).localeCompare(String(a.effective_from)));
  const active=history.find(x=>x.effective_from<=today());
  const tr=document.createElement('tr');
  for(const val of [name,active?(unit==='%'?financePercent(active.value):billingMoney(active.value)):'Não configurado',base,active?billingBR(active.effective_from):'—']){const td=document.createElement('td');td.textContent=val;tr.append(td);}const action=document.createElement('td');const editBtn=document.createElement('button');editBtn.type='button';editBtn.className='finance-edit-btn';editBtn.textContent='Editar';editBtn.onclick=()=>financeInlineEdit(tr,code,active?.value??null);action.append(editBtn);tr.append(action);tbody.append(tr);
 }
 const historyBody=$('finance-history-body');historyBody.textContent='';
 for(const x of data.slice().sort((a,b)=>String(b.effective_from).localeCompare(String(a.effective_from)))){
  const tr=document.createElement('tr');for(const val of [names[x.parameter_code]||x.parameter_code,financePercent(x.rate_percent),billingBR(x.effective_from),x.created_by_email||'—']){const td=document.createElement('td');td.textContent=val;  tr.append(td);}historyBody.append(tr);
 }
 for(const x of costData.slice().sort((a,b)=>String(b.effective_from).localeCompare(String(a.effective_from)))){
  const tr=document.createElement('tr');for(const val of [x.parameter_code==='DESP_ADMIN'?'Despesas administrativas':x.parameter_code==='DESP_OPER'?'Despesas operacionais':'Emissão CT-e',x.parameter_code!=='EMISSAO_CTE'?financePercent(x.value):billingMoney(x.value),billingBR(x.effective_from),x.created_by_email||'—']){const td=document.createElement('td');td.textContent=val;tr.append(td);}historyBody.append(tr);
 }
}
$('finance-effective').value=today();
$('finance-save').onclick=async()=>{
 const code=$('finance-code').value;
 const raw=$('finance-rate').value.trim().replace(',','.');const rate=Number(raw);
 const date=$('finance-effective').value;
 if(!raw||!Number.isFinite(rate)||rate<0||(code!=='EMISSAO_CTE'&&rate>100)){$('finance-error').textContent=code==='EMISSAO_CTE'?'Informe um valor em reais válido.':'Informe uma taxa válida entre 0 e 100%.';return;}
 if(!date||date<today()){$('finance-error').textContent='A vigência deve ser hoje ou uma data futura.';return;}
 if(!confirm('Cadastrar novo valor de '+rate+(code==='EMISSAO_CTE'?' R$':'%')+' para '+code+' a partir de '+billingBR(date)+'? O histórico será preservado.'))return;
 const button=$('finance-save');button.disabled=true;$('finance-error').textContent='';
 try{await financeSaveParameter(code,rate,date);await loadFinanceParams();$('finance-rate').value='';message('Parâmetro cadastrado com sucesso.');}
 catch(e){$('finance-error').textContent=e.message;}finally{button.disabled=false;}
};
function billingSummaryRender(rows){
 const root=$('billing-stats');if(!root)return;
 const fields=[
  ['Rotas','count','int'],['Entregas','deliveries','int'],['Peso transportado','weight','kg'],
  ['Valor mercadoria','goods','money'],['Frete a pagar','freight','money'],['Pedágios','toll','money'],['Complementos','comp','money'],
  ['Total a pagar','total','money'],['Desp. administrativas','adminCost','money'],['Desp. operacionais','operatingCost','money'],['Receita bruta','revenue','money'],
  ['ICMS','icms','money'],
  ['Averbação','aver','money'],['Emissão CT-e','cteCost','money'],
  ['Margem estimada','margin','money'],['Margem estimada %','marginPct','pct']
 ];
 const sum=key=>rows.reduce((n,r)=>n+(Number(r[key])||0),0);
 const money=n=>billingMoney(n);
 const fmt=(key,type)=>{
  if(key==='count')return rows.length.toLocaleString('pt-BR');
  if(key==='marginPct'){const rev=sum('revenue');return rev?((sum('margin')/rev)*100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%':'—';}
  const value=sum(key);return type==='money'?money(value):type==='kg'?value.toLocaleString('pt-BR',{maximumFractionDigits:2})+' kg':value.toLocaleString('pt-BR',{maximumFractionDigits:0});
 };
 root.textContent='';
 for(const [label,key,type] of fields){
  const card=document.createElement('div');const small=document.createElement('small');small.textContent=label;
  const strong=document.createElement('strong');strong.textContent=fmt(key,type);
  const expenseKeys=['freight','toll','comp','total','adminCost','operatingCost'];
  const deductionKeys=['icms','aver','cteCost'];
  if(expenseKeys.includes(key))card.classList.add('billing-summary-expense');
  else if(deductionKeys.includes(key))card.classList.add('billing-summary-deduction');
  else if(key==='revenue')card.classList.add('billing-summary-revenue');
  else if(key==='margin'||key==='marginPct'){
   const isNegative=sum('margin')<0;card.classList.add(isNegative?'billing-summary-expense':'billing-summary-revenue');
   card.classList.add('billing-summary-result');
  }else card.classList.add('billing-summary-neutral');
  card.append(small,strong);root.append(card);
 }
 const pending=rows.filter(r=>r.toll==null||r.freight==null||r.revenue==null||r.totalTaxes==null||r.aver==null||r.adminCost==null||r.operatingCost==null||r.cteCost==null).length;
 const warning=document.createElement('p');warning.className='billing-summary-warning';warning.textContent='Resumo de todas as rotas filtradas (não apenas da página). '+(pending?pending+' rota(s) com valores pendentes: totais financeiros parciais. ':'')+'Margem gerencial estimada. Os valores ainda não estão congelados por quitação.';
 root.append(warning);
}
function billingStyleMargin(tr,margin,revenue){
 for(const index of [25,26]){const cell=tr.children[index];if(!cell)continue;cell.classList.remove('billing-margin-positive','billing-margin-warning','billing-margin-negative');if(margin==null||!revenue)continue;cell.classList.add(margin<0?'billing-margin-negative':margin/revenue<0.15?'billing-margin-warning':'billing-margin-positive');}
}
// Gestão financeira V2.1: pagamentos registrados em banco; comprovantes em etapa posterior.
let paymentCandidates=[],paymentRecords=new Map(),paymentMode='ADVANCE';
const payCurrency=v=>billingMoney(v);
function payKey(r){return String(r.routeId);}
function payDueDate(iso){const [y,m,d]=String(iso).split('-').map(Number);if(!y||!m||!d)return '';const target=d<=15?new Date(y,m-1,16):new Date(y,m,1);if(d>15)target.setMonth(target.getMonth()+1);while([0,6].includes(target.getDay()))target.setDate(target.getDate()+1);return `${target.getFullYear()}-${String(target.getMonth()+1).padStart(2,'0')}-${String(target.getDate()).padStart(2,'0')}`;}
async function payLoadRecords(){const data=await rpc('pcd_payment_list');paymentRecords=new Map((data||[]).map(x=>[String(x.route_id),x]));}
function payRowState(r){const record=paymentRecords.get(payKey(r));const paid=Number(record?.advance_paid||0),settled=Number(record?.settlement_paid||0),due=record?.locked_total==null?r.total:Number(record.locked_total);return {paid,settled,due,balance:due==null?null:Math.max(0,Math.round((due-paid-settled)*100)/100),locked:!!record?.is_settled};}
function payStatus(r){const state=payRowState(r);if(state.locked||(state.balance!=null&&state.balance<=0))return 'settled';if(state.paid>0||state.settled>0)return 'partial';return 'pending';}
function payOpen(mode){paymentMode=mode;const modal=$('payment-modal');modal.classList.remove('hidden');$('payment-title').textContent=mode==='ADVANCE'?'Adiantamentos por motorista':'Quitação de fretes por motorista';$('payment-date').value=today();const driver=$('payment-driver');const current=$('billing-driver').value;const options=[...new Set(paymentCandidates.map(r=>r.driver).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));driver.replaceChildren();for(const name of options){const opt=document.createElement('option');opt.value=name;opt.textContent=name;driver.append(opt);}if(options.includes(current))driver.value=current;$('payment-hint').textContent=mode==='ADVANCE'?'Valor sugerido: 50% do frete e complemento + pedágio integral. É possível informar valor avulso.':'Saldo = total a pagar menos adiantamentos e quitações já registrados. A quitação congela os valores.';payRender();}
function payRender(){const driver=$('payment-driver').value,rows=paymentCandidates.filter(r=>r.driver===driver);const root=$('payment-rows');root.replaceChildren();const t=document.createElement('table');t.className='payment-table';t.innerHTML='<thead><tr><th>Selecionar</th><th>Plano</th><th>Data rota</th><th>Vencimento</th><th>Total</th><th>Adiantamento pago</th><th>Saldo</th><th>Valor a pagar (R$)</th></tr></thead>';const body=document.createElement('tbody');let eligible=0;for(const r of rows){const st=payRowState(r);if(st.locked||st.balance==null||st.balance<=0)continue;eligible++;const tr=document.createElement('tr');const check=document.createElement('input');check.type='checkbox';check.className='pay-check';check.dataset.id=payKey(r);const amount=document.createElement('input');amount.type='number';amount.min='0';amount.step='0.01';amount.className='pay-amount';amount.dataset.id=payKey(r);const suggestion=paymentMode==='ADVANCE'?Math.max(0,Math.min(st.balance,Math.round((Number(r.advance||0)-st.paid)*100)/100)):st.balance;amount.value=suggestion.toFixed(2);amount.disabled=true;check.onchange=()=>{amount.disabled=!check.checked;payTotal();};amount.oninput=payTotal;for(const val of [check,r.plan,billingBR(r.date),billingBR(payDueDate(r.date)),payCurrency(st.due),payCurrency(st.paid),payCurrency(st.balance),amount]){const td=document.createElement('td');if(val instanceof HTMLElement)td.append(val);else td.textContent=val;tr.append(td);}body.append(tr);}t.append(body);root.append(t);if(!eligible){const p=document.createElement('p');p.className='muted';p.textContent='Nenhuma rota em aberto para este motorista e filtros.';root.append(p);}payTotal();}
function payTotal(){let total=0;for(const el of document.querySelectorAll('#payment-rows .pay-check:checked')){const amount=document.querySelector(`#payment-rows .pay-amount[data-id="${el.dataset.id}"]`);total+=Number(amount?.value||0);} $('payment-total').textContent='Total selecionado: '+payCurrency(total);}
$('pay-advance-open').onclick=()=>payOpen('ADVANCE');$('pay-settle-open').onclick=()=>payOpen('SETTLEMENT');$('payment-close').onclick=()=>$('payment-modal').classList.add('hidden');$('payment-driver').onchange=payRender;
// Carregamento resiliente das bibliotecas de PDF: CDN principal + espelhos.
let paymentPdfLoading=null;
function paymentPdfScript(url){
 return new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  script.src=url;script.async=true;
  script.onload=()=>resolve();
  script.onerror=()=>{script.remove();reject(new Error('Falha ao carregar '+url));};
  document.head.appendChild(script);
 });
}
async function paymentPdfReady(){
 if(window.jspdf?.jsPDF && typeof window.jspdf.jsPDF.API.autoTable==='function')return true;
 if(paymentPdfLoading)return paymentPdfLoading;
 paymentPdfLoading=(async()=>{
  const libraries=[
   {ready:()=>!!window.jspdf?.jsPDF,urls:[
    'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js',
    'https://unpkg.com/jspdf@2.5.2/dist/jspdf.umd.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.2/jspdf.umd.min.js']},
   {ready:()=>!!window.jspdf?.jsPDF && typeof window.jspdf.jsPDF.API.autoTable==='function',urls:[
    'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js',
    'https://unpkg.com/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.4/jspdf.plugin.autotable.min.js']}
  ];
  for(const lib of libraries){
   if(lib.ready())continue;
   for(const url of lib.urls){
    try{await paymentPdfScript(url);if(lib.ready())break;}catch(e){console.warn('[INNOVA PDF]',e.message);}
   }
   if(!lib.ready())return false;
  }
  return true;
 })();
 try{return await paymentPdfLoading;}finally{paymentPdfLoading=null;}
}
$('payment-print').onclick=async()=>{
 const error=$('payment-error');error.textContent='';
 const printBtn=$('payment-print');printBtn.disabled=true;
 const originalLabel=printBtn.textContent;printBtn.textContent='Preparando PDF...';
 let ready=false;
 try{ready=await paymentPdfReady();}finally{printBtn.disabled=false;printBtn.textContent=originalLabel;}
 if(!ready){error.textContent='Não foi possível carregar as bibliotecas de PDF. Verifique a conexão ou o bloqueio de CDN e tente novamente.';return;}
 const api=window.jspdf;
 const selected=[...document.querySelectorAll('#payment-rows .pay-check:checked')];
 if(!selected.length){error.textContent='Selecione ao menos uma rota para gerar o extrato.';return;}
 const driver=$('payment-driver').value;
 const rows=selected.map(el=>paymentCandidates.find(r=>payKey(r)===el.dataset.id)).filter(Boolean);
 if(!rows.length){error.textContent='Não foram encontradas rotas selecionadas.';return;}
 const doc=new api.jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
 if(typeof doc.autoTable!=='function'){error.textContent='Módulo de tabelas PDF indisponível.';return;}
 const money=v=>payCurrency(Number(v)||0);
 const navy=[9,39,72],blue=[23,82,124],muted=[103,121,138],ink=[35,54,72],pale=[238,244,248],gold=[234,178,69];
 const selectedItems=selected.map(el=>{
  const r=paymentCandidates.find(x=>payKey(x)===el.dataset.id);
  const st=payRowState(r);
  const input=document.querySelector(`#payment-rows .pay-amount[data-id="${el.dataset.id}"]`);
  return {r,st,amount:Number(input?.value||0)};
 });
 if(selectedItems.some(x=>!Number.isFinite(x.amount)||x.amount<=0||x.amount>x.st.balance+0.001)){
  error.textContent='Revise os valores selecionados antes de emitir o extrato.';return;
 }
 const sum=fn=>selectedItems.reduce((n,x)=>n+Number(fn(x)||0),0);
 const total=sum(x=>x.st.due),paid=sum(x=>x.st.paid+ x.st.settled);
 const previousBalance=sum(x=>x.st.balance),toPay=sum(x=>x.amount),remaining=previousBalance-toPay;
 const payDate=billingBR($('payment-date').value);
 const isAdvance=paymentMode==='ADVANCE';
 const title=isAdvance?'EXTRATO DE ADIANTAMENTO':'EXTRATO DE QUITAÇÃO';
 const isoDates=rows.map(r=>String(r.date||'').slice(0,10)).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
 const periodBound=(iso,mode,end)=>{
  const d=new Date(iso+'T12:00:00');
  if(mode==='ADVANCE')d.setDate(d.getDate()+(end?6:0)-((d.getDay()+6)%7));
  else d.setDate(end?(d.getDate()<=15?15:new Date(d.getFullYear(),d.getMonth()+1,0).getDate()):(d.getDate()<=15?1:16));
  return `${String(d.getFullYear())}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
 };
 const periodFrom=isoDates.length?billingBR(periodBound(isoDates[0],paymentMode,false)):'—';
 const periodTo=isoDates.length?billingBR(periodBound(isoDates[isoDates.length-1],paymentMode,true)):'—';
 const plates=[...new Set(rows.map(r=>String(r.plate||'').trim()).filter(Boolean))];
 const plateLabel=plates.length?plates.join(' / '):'Não cadastrada';
 const cpfLabel=rows.find(r=>r.cpf)?.cpf||'Não cadastrado';
 const txt=(t,x,y,size=9,color=ink,bold=false,opts={})=>{
  doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(size);doc.setTextColor(...color);
  doc.text(String(t),x,y,opts);
 };
 const fit=(t,max)=>doc.splitTextToSize(String(t),max)[0]||'';
 const pageHeader=()=>{
  doc.setFillColor(...navy);doc.rect(0,0,297,32,'F');
  doc.setFillColor(...gold);doc.rect(0,31,297,1.2,'F');
  txt('INNOVA',13,14,17,[255,255,255],true);
  txt('| TRANSPORTES E SOLUÇÕES LOGÍSTICAS',49,14,10,[231,238,245]);
  txt(title,13,24,10,[255,255,255],true);
  
 };
 const pageFooter=()=>{
  const count=doc.internal.getNumberOfPages();
  for(let i=1;i<=count;i++){
   doc.setPage(i);doc.setDrawColor(218,227,234);doc.line(13,193,284,193);
   txt('INNOVA | TRANSPORTES E SOLUÇÕES LOGÍSTICAS',13,199,7,muted);
   
   txt(`Página ${i} de ${count}`,284,199,7,muted,false,{align:'right'});
  }
 };
 pageHeader();
 doc.setFillColor(...pale);doc.roundedRect(13,38,271,31,2,2,'F');
 const field=(label,value,x,y,w)=>{txt(label,x,y,7,muted,true);txt(fit(value,w),x,y+6,10,navy,true);};
 field('MOTORISTA',driver,18,45,90);field('PLACA',plateLabel,119,45,70);field('CPF',cpfLabel,208,45,70);
 field('PERÍODO DAS ROTAS',`${periodFrom}  a  ${periodTo}`,18,59,110);
 field('DATA INFORMADA PARA PAGAMENTO',payDate,155,59,65);
 field('ROTAS SELECIONADAS',String(rows.length),246,59,30);
 // Destaque para o valor que está sendo simulado, sem confundi-lo com pagamento confirmado.
 doc.setFillColor(...navy);doc.roundedRect(13,74,271,18,2,2,'F');
 txt('VALOR SELECIONADO PARA PAGAMENTO',19,81,8,[220,232,242],true);
 txt(money(toPay),19,88,15,[255,255,255],true);
 txt('SALDO RESTANTE APÓS ESTE PAGAMENTO',278,81,8,[220,232,242],true,{align:'right'});
 txt(money(remaining),278,88,13,[255,255,255],true,{align:'right'});
 txt('DETALHAMENTO DAS ROTAS',13,101,9,navy,true);
 const body=selectedItems.map(({r,st,amount})=>[
  billingBR(r.date),String(r.plan||'—'),String(r.city||'—'),money(r.freight),money(r.toll),
  money(r.comp),money(st.due),money(st.paid+st.settled),money(st.balance),money(amount),money(st.balance-amount)
 ]);
 doc.autoTable({
  startY:105,margin:{left:13,right:13,bottom:25,top:38},
  head:[['DATA ROTA','PLANO','CIDADE DETERMINANTE','FRETE','PEDÁGIO','COMPL.','TOTAL','JÁ PAGO','SALDO ANTES','A PAGAR','SALDO APÓS']],
  body,theme:'grid',showHead:'everyPage',
  styles:{font:'helvetica',fontSize:7.2,cellPadding:2.2,textColor:ink,overflow:'ellipsize',valign:'middle',lineColor:[226,233,239],lineWidth:.15},
  headStyles:{fillColor:blue,textColor:[255,255,255],fontStyle:'bold',fontSize:6.7},
  alternateRowStyles:{fillColor:[247,250,252]},
  columnStyles:{0:{cellWidth:21},1:{cellWidth:19},2:{cellWidth:33},3:{cellWidth:22},4:{cellWidth:21},5:{cellWidth:20},6:{cellWidth:23},7:{cellWidth:23},8:{cellWidth:29},9:{cellWidth:29},10:{cellWidth:31}},
  didParseCell:data=>{if(data.section==='body'&&data.column.index===9){data.cell.styles.fontStyle='bold';data.cell.styles.textColor=navy;data.cell.styles.fillColor=[236,244,250];}},
  didDrawPage:()=>{if(doc.internal.getCurrentPageInfo().pageNumber>1)pageHeader();}
 });
 let y=doc.lastAutoTable.finalY+8;
 if(y+45>190){doc.addPage();pageHeader();y=42;}
 txt('RESUMO FINANCEIRO',13,y,9,navy,true);y+=5;
 const metrics=[['TOTAL DAS ROTAS',total],['PAGAMENTOS ANTERIORES',paid],['SALDO DISPONÍVEL ANTES',previousBalance],['VALOR A PAGAR',toPay],['SALDO APÓS PAGAMENTO',remaining]];
 const colW=52.6,gap=2;
 metrics.forEach(([label,value],i)=>{
  const x=13+i*(colW+gap);doc.setFillColor(...(i===3?navy:pale));doc.roundedRect(x,y,colW,20,1.6,1.6,'F');
  txt(fit(label,colW-6),x+3,y+7,6.7,i===3?[226,237,247]:muted,true);
  txt(money(value),x+3,y+15,10,i===3?[255,255,255]:navy,true);
 });
 y+=25;
 
 pageFooter();
 const filename='INNOVA_'+(paymentMode==='ADVANCE'?'ADIANTAMENTO':'QUITACAO')+'_'+driver.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9]+/g,'_')+'_'+$('payment-date').value+'.pdf';
 doc.save(filename);
};
$('payment-confirm').onclick=async()=>{const selected=[...document.querySelectorAll('#payment-rows .pay-check:checked')];const date=$('payment-date').value;if(!date){$('payment-error').textContent='Informe a data do pagamento.';return;}if(!selected.length){$('payment-error').textContent='Selecione ao menos uma rota.';return;}const items=[];for(const el of selected){const r=paymentCandidates.find(x=>payKey(x)===el.dataset.id);const amount=Number(document.querySelector(`#payment-rows .pay-amount[data-id="${el.dataset.id}"]`).value);const state=payRowState(r);if(!Number.isFinite(amount)||amount<=0||amount>state.balance+0.001){$('payment-error').textContent='Valor inválido ou superior ao saldo da rota '+r.plan;return;}if(paymentMode==='SETTLEMENT'&&Math.abs(amount-state.balance)>0.009){$('payment-error').textContent='Quitação exige o pagamento integral do saldo. Para valor parcial, utilize Adiantamento.';return;}items.push({route_id:Number(r.routeId),plan:r.plan,route_date:r.date,driver:r.driver,amount,total_due:state.due,kind:paymentMode});}if(!confirm(`Confirmar ${items.length} pagamento(s) de ${paymentMode==='ADVANCE'?'adiantamento':'quitação'} em ${billingBR(date)}? Esta operação grava os pagamentos no banco.`))return;const btn=$('payment-confirm');btn.disabled=true;$('payment-error').textContent='';try{await rpc('pcd_payment_confirm',{p_items:items,p_paid_on:date});await payLoadRecords();$('payment-modal').classList.add('hidden');await loadBilling();message('Pagamentos registrados com sucesso.');}catch(e){$('payment-error').textContent=e.message;}finally{btn.disabled=false;}};
async function loadBilling(){requireFinanceOwner();
 await Promise.all([financeGetParams(),billingGetCosts()]);
 const search='',date=null; // Filtros financeiros aplicados após consolidação.
 // Consolidar o conjunto filtrado inteiro, não somente a página visível.
 const allRoutes=[];let routeOffset=0;let expected=0;
 // A RPC pcd_v8_routes limita p_limit a 50; usar 500 causa 'Paginação inválida'.
 // Buscar lotes válidos e manter o resumo independente da página visual.
 do{
  const a=await rpc('pcd_v8_routes',{p_search:search,p_date:date,p_limit:50,p_offset:routeOffset});
  expected=Number(a.total||0);const batch=a.rows||[];allRoutes.push(...batch);
  routeOffset+=batch.length;
  if(!batch.length)break;
 }while(routeOffset<expected);
 billingTotal=expected;const data=allRoutes;
 const {data:continuityRows,error:continuityError}=await db.from('pcd_route_continuities')
  .select('route_id,responsibility,action').limit(10000);
 if(continuityError)throw Error('Não foi possível consultar as regras financeiras da continuidade: '+continuityError.message);
 const continuityByRoute=new Map((continuityRows||[]).map(x=>[Number(x.route_id),x]));
 const missingContinuities=data.filter(x=>x.parent_route_id!=null&&['CONTINUIDADE','TRANSFERENCIA'].includes(String(x.duplicate_kind||'').toUpperCase())&&!continuityByRoute.has(Number(x.id)));
 if(missingContinuities.length)throw Error('Há rotas derivadas sem classificação financeira. Faturamento bloqueado para evitar duplicidade.');

 const billingTotalEl=$('billing-total');if(billingTotalEl)billingTotalEl.textContent=billingTotal;
 const notes=await billingInvoices(data.map(r=>r.plan_number));
 const invoiceValues=new Map(),invoiceKeys=new Map();
 for(const n of notes){
  const plan=String(n.plan_number||'');
  if(!invoiceKeys.has(plan))invoiceKeys.set(plan,new Set());
  const key=String(n.customer_code||'')+'|'+String(n.invoice_number||'');
  if(invoiceKeys.get(plan).has(key))continue;
  invoiceKeys.get(plan).add(key);
  const value=n.invoice_value==null?null:Number(n.invoice_value);
  if(value!==null&&Number.isFinite(value)){const previous=invoiceValues.get(plan)||{sum:0,count:0};previous.sum+=value;previous.count++;invoiceValues.set(plan,previous);}
 }
 const invoiceCities=new Map();for(const n of notes){const k=String(n.plan_number||'');if(!invoiceCities.has(k))invoiceCities.set(k,new Set());if(n.city)invoiceCities.get(k).add(billingNorm(n.city));}
 const cities=[...new Set([...notes.map(n=>billingNorm(n.city)),...data.map(r=>billingNorm(r.city))].filter(Boolean))];
 const driverProfiles=await billingDriverProfiles(date||data[0]?.route_date||data[0]?.loading_on);
 const driversByPlate=new Map(driverProfiles.filter(x=>x.plate).map(x=>[billingNorm(x.plate).replace(/[^A-Z0-9]/g,''),x]));
 const driversByName=new Map(driverProfiles.filter(x=>x.name).map(x=>[billingNorm(x.name),x]));
 const cityRates=[],tollRates=[],exceptions=[];
 // Normalização em JS: evita perder cidades com diferenças de acentuação/capitalização.
 if(cities.length){for(let i=0;i<cities.length;i+=20){const part=cities.slice(i,i+20);
  const {data:rr,error}=await db.from('pcd_billing_city_rates').select('city,band,vehicle_profile,freight_payable,revenue_reference,distance_km').in('city',part).limit(5000);if(error)throw error;cityRates.push(...(rr||[]));
  const {data:tt,error:te}=await db.from('pcd_billing_tolls').select('city,amount').in('city',part).limit(1000);if(te)throw te;tollRates.push(...(tt||[]));
 }}
 const supplier='';if(supplier){const {data:ee,error}=await db.from('pcd_billing_supplier_rates').select('supplier_name,vehicle_profile,band,amount,effective_from,effective_until').eq('supplier_name',supplier).limit(500);if(error)throw error;exceptions.push(...(ee||[]));}
 $('billing-rates-status').textContent=cityRates.length?'Disponível':'Sem correspondência';$('billing-tolls-status').textContent=tollRates.length?'Disponível':'Sem correspondência';
 const grouped=new Map();for(const r of data){const key=r.parent_route_id!=null?'CONTINUIDADE|'+String(r.id):String(r.plan_number)+'|'+String(r.route_date||r.loading_on||'')+'|'+String(r.vehicle_profile||'');if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(r);}
 const result=[],metadata=[],summaryRows=[],filterFacts=[];for(const group of grouped.values()){
  const r=group[0],plan=String(r.plan_number),noteCities=[...(invoiceCities.get(plan)||[])],cityList=noteCities.length?noteCities:[...new Set(group.map(x=>billingNorm(x.city)).filter(Boolean))];
  const contractedProfile=billingNorm(r.vehicle_profile);
  const driver=driversByPlate.get(billingNorm(r.plate).replace(/[^A-Z0-9]/g,''))||driversByName.get(billingNorm(r.driver_name));
  const embarkedProfile=driver?.profile?billingNorm(driver.profile):null;
  const prof=embarkedProfile||contractedProfile;
  const matched=cityList.flatMap(city=>cityRates.filter(x=>billingNorm(x.city)===city&&billingNorm(x.vehicle_profile)===contractedProfile).map(x=>({...x,routeCity:city})));
  const payRates=cityList.flatMap(city=>cityRates.filter(x=>billingNorm(x.city)===city&&billingNorm(x.vehicle_profile)===prof).map(x=>({...x,routeCity:city}))); 
  matched.sort((x,y)=>Number(y.band)-Number(x.band)||Number(y.distance_km||0)-Number(x.distance_km||0));const decisive=matched[0];
  const dateKey=r.route_date||r.loading_on||'';
  const payableRate=decisive?payRates.filter(x=>Number(x.band)===Number(decisive.band)).sort((a,b)=>Number(b.distance_km||0)-Number(a.distance_km||0))[0]:null;
  const override=decisive?exceptions.filter(x=>billingNorm(x.vehicle_profile)===prof&&Number(x.band)===Number(decisive.band)&&(!dateKey||x.effective_from<=dateKey)&&(!x.effective_until||x.effective_until>=dateKey)).sort((a,b)=>String(b.effective_from).localeCompare(String(a.effective_from)))[0]:null;
  const cityTolls=decisive?tollRates.filter(x=>billingNorm(x.city)===billingNorm(decisive.routeCity)):[];
  const toll=cityTolls.length?Number(cityTolls[0].amount)*billingTollMultiplier(prof):null;
  const freight=override?Number(override.amount):payableRate?Number(payableRate.freight_payable):null;
  let revenue=decisive?.revenue_reference==null?null:Number(decisive.revenue_reference);
  const continuation=continuityByRoute.get(Number(r.id));
  if(continuation?.responsibility==='TRANSPORTADORA')revenue=0;
  const id=String(r.id||plan+'|'+dateKey),comp=billingComplements.get(id)||{amount:0,reason:''};
  const note=!noteCities.length?'Sem notas vinculadas — cidade operacional':matched.length!==cityList.length?'Cidade/perfil sem tabela':!decisive?'Cidade/perfil sem tabela':cityTolls.length>1&&new Set(cityTolls.map(x=>Number(x.amount))).size>1?'Pedágios divergentes':!cityTolls.length?'Pedágio sem referência':override?'Exceção fornecedor':'Tabela padrão';
  const details=cityList.map(city=>{const candidates=matched.filter(x=>x.routeCity===city).sort((a,b)=>Number(b.band)-Number(a.band)||Number(b.distance_km||0)-Number(a.distance_km||0));return {city,band:candidates[0]?.band??null,distance:candidates[0]?.distance_km??null};}).sort((a,b)=>Number(b.band||0)-Number(a.band||0)||Number(b.distance||0)-Number(a.distance||0));
  const weight=group.reduce((sum,x)=>sum+(Number(x.gross_weight)||0),0);
  const deliveries=group.reduce((sum,x)=>sum+(Number(x.delivery_count)||0),0);
  const icmsRate=financeRate('ICMS',dateKey);
  const averRate=financeRate('AVERBACAO',dateKey);
  const otherTaxRate=financeRate('OUTROS_TRIBUTOS',dateKey);
  const adminRate=billingCostRate('DESP_ADMIN',dateKey);
  const cteUnit=billingCostRate('EMISSAO_CTE',dateKey);
  const operatingRate=billingCostRate('DESP_OPER',dateKey);
  const goods=invoiceValues.get(plan)?.sum??null;
  const icms=revenue==null||icmsRate==null?null:revenue*icmsRate/100;
  const aver=continuation?0:(goods==null||averRate==null?null:goods*averRate/100);
  const otherTaxes=revenue==null||otherTaxRate==null?null:revenue*otherTaxRate/100;
  const totalTaxes=icms==null||otherTaxes==null?null:icms+otherTaxes;
  const adminCost=revenue==null||adminRate==null?null:revenue*adminRate/100;
  const invoiceCount=invoiceKeys.get(plan)?.size??0;
  const cteCost=continuation?0:(cteUnit==null||!invoiceCount?null:cteUnit*invoiceCount);
  const operatingCost=revenue==null||operatingRate==null?null:revenue*operatingRate/100;
  const advance=freight==null||toll==null?null:(freight+Number(comp.amount||0))*0.5+toll;
  const total=freight==null||toll==null?null:freight+toll+Number(comp.amount||0);
  const margin=revenue==null||total==null||totalTaxes==null||aver==null||adminCost==null||operatingCost==null||cteCost==null?null:revenue-total-totalTaxes-aver-adminCost-operatingCost-cteCost;
  const marginPct=margin==null||revenue===0?null:margin/revenue*100;
  result.push([plan,billingBR(dateKey),cityList.length,decisive?.routeCity||'—',decisive?.band??'—',billingKg(weight),billingMoney(invoiceValues.get(plan)?.sum??null),deliveries,r.driver_name||'—',r.plate||'—',embarkedProfile||'Não identificado',billingMoney(freight),toll==null?'Cadastrar pedágio':billingMoney(toll),billingMoney(comp.amount),billingMoney(advance),billingMoney(0),billingMoney(total),billingMoney(revenue),billingMoney(icms),billingMoney(otherTaxes),billingMoney(totalTaxes),billingMoney(aver),billingMoney(operatingCost),billingMoney(adminCost),billingMoney(cteCost),billingMoney(margin),marginPct==null?'Pendente':marginPct.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%']);
  metadata.push({id,freight,toll,plan,city:decisive?.routeCity||'',details,contractedProfile,embarkedProfile,revenue,totalTaxes,aver,adminCost,operatingCost,cteCost});
  filterFacts.push({driver:String(r.driver_name||''),year:Number(String(dateKey).slice(0,4)),month:Number(String(dateKey).slice(5,7)),day:Number(String(dateKey).slice(8,10)),profile:prof,margin});
  summaryRows.push({id,plan,city:decisive?.routeCity||'',routeId:r.id,date:dateKey,driver:String(r.driver_name||''),plate:String(r.plate||''),cpf:null,cityCount:cityList.length,weight,deliveries,goods,freight,toll,comp:Number(comp.amount||0),advance,total,revenue,icms,otherTaxes,totalTaxes,aver,adminCost,operatingCost,cteCost,margin});
 }
 // Preencher opções usando todas as rotas importadas, preservando seleções.
 const updateOptions=(id,values,format)=>{const el=$(id),selected=el.value;const previous=[...el.options].slice(0,1).map(o=>({value:o.value,text:o.textContent}));el.replaceChildren();for(const o of previous){const opt=document.createElement('option');opt.value=o.value;opt.textContent=o.text;el.append(opt);}for(const v of values){const opt=document.createElement('option');opt.value=String(v);opt.textContent=format?format(v):String(v);el.append(opt);}el.value=[...el.options].some(o=>o.value===selected)?selected:'';};
 updateOptions('billing-driver',[...new Set(filterFacts.map(x=>x.driver).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR')));
 updateOptions('billing-year',[...new Set(filterFacts.map(x=>x.year).filter(Boolean))].sort((a,b)=>b-a));
 updateOptions('billing-profile',[...new Set(filterFacts.map(x=>x.profile).filter(Boolean))].sort());
 await payLoadRecords();
 const criteria={paymentStatus:$('billing-payment-status').value,driver:$('billing-driver').value,year:$('billing-year').value,month:$('billing-month').value,fortnight:$('billing-fortnight').value,profile:$('billing-profile').value,margin:$('billing-margin').value};
 const keep=filterFacts.map((x,i)=>(!criteria.paymentStatus||payStatus(summaryRows[i])===criteria.paymentStatus)&&(!criteria.driver||x.driver===criteria.driver)&&(!criteria.year||x.year===Number(criteria.year))&&(!criteria.month||x.month===Number(criteria.month))&&(!criteria.fortnight||(criteria.fortnight==='1'?x.day>=1&&x.day<=15:x.day>=16))&&(!criteria.profile||x.profile===criteria.profile)&&(!criteria.margin||(criteria.margin==='positive'?x.margin!=null&&x.margin>0:criteria.margin==='negative'?x.margin!=null&&x.margin<0:criteria.margin==='zero'?x.margin===0:x.margin==null)));
 const filteredResult=result.filter((_,i)=>keep[i]),filteredMeta=metadata.filter((_,i)=>keep[i]),filteredSummary=summaryRows.filter((_,i)=>keep[i]);
 paymentCandidates=filteredSummary.map(x=>({...x}));
 billingSummaryRender(filteredSummary);
 billingPage=Math.min(Math.max(0,billingPage),Math.max(0,Math.ceil(filteredResult.length/50)-1));
 const pageStart=billingPage*50;const visibleResult=filteredResult.slice(pageStart,pageStart+50);const visibleMetadata=filteredMeta.slice(pageStart,pageStart+50);
 for(let i=0;i<filteredResult.length;i++){filteredResult[i][15]=billingMoney(payRowState(filteredSummary[i]).paid);}
 $('billing-table').innerHTML=table(['Plano','Data rota','Qtd. cidades','Cidade determinante','Faixa','Peso','Valor mercadoria','Qtd. entregas','Motorista','Placa','Perfil embarcado','Frete a pagar','Pedágio','Complemento','Total adiantamento','Adiantamento pago','Total a pagar','Receita bruta','ICMS','Demais tributos (provisão)','Total impostos','Averbação','Desp. operacionais','Desp. administrativas','Emissão CT-e','Margem R$ (estimada)','Margem % (estimada)'],visibleResult);
 $('billing-table').querySelectorAll('tbody tr').forEach((tr,i)=>{const meta=visibleMetadata[i],c=billingComplements.get(meta.id)||{amount:0,reason:''};
  const amount=document.createElement('input');amount.type='number';amount.min='0';amount.step='0.01';amount.className='billing-comp-input';amount.value=c.amount||'';amount.placeholder='0,00';amount.title='Complemento simulado; ainda não gravado no banco';
  const reason=document.createElement('select');reason.className='billing-reason-input';for(const [value,label] of [['','Selecione o motivo'],...billingReasonOptions.map(x=>[x,x])]){const option=document.createElement('option');option.value=value;option.textContent=label;reason.append(option);}reason.value=billingReasonOptions.includes(c.reason)?c.reason:'';reason.title='Motivo do complemento';reason.disabled=!(Number(c.amount)>0);
  const update=()=>{const val=Number(amount.value);if(!Number.isFinite(val)||val<0){amount.setCustomValidity('Informe valor válido');return;}amount.setCustomValidity('');reason.disabled=val<=0;if(val<=0)reason.value='';reason.required=val>0;reason.classList.toggle('billing-reason-required',val>0&&!reason.value);billingComplements.set(meta.id,{amount:val,reason:reason.value.trim()});const sr=summaryRows.find(x=>x.id===meta.id);if(sr){sr.comp=val;sr.advance=sr.freight==null||sr.toll==null?null:(sr.freight+val)*0.5+sr.toll;sr.total=sr.freight==null||sr.toll==null?null:sr.freight+sr.toll+val;sr.margin=sr.revenue==null||sr.total==null||sr.totalTaxes==null||sr.aver==null||sr.adminCost==null||sr.operatingCost==null||sr.cteCost==null?null:sr.revenue-sr.total-sr.totalTaxes-sr.aver-sr.adminCost-sr.operatingCost-sr.cteCost;billingSummaryRender(filteredSummary);if($('billing-margin').value){billingPage=0;loadBilling().catch(e=>message(e.message,true));}}tr.children[14].textContent=meta.freight==null||meta.toll==null?'Pendente':billingMoney((meta.freight+val)*0.5+meta.toll);tr.children[16].textContent=meta.freight==null||meta.toll==null?'Pendente':billingMoney(meta.freight+meta.toll+val);
   const totalCost=meta.freight==null||meta.toll==null?null:meta.freight+meta.toll+val;
   const margin=meta.revenue==null||totalCost==null||meta.totalTaxes==null||meta.aver==null||meta.adminCost==null||meta.operatingCost==null||meta.cteCost==null?null:meta.revenue-totalCost-meta.totalTaxes-meta.aver-meta.adminCost-meta.operatingCost-meta.cteCost;
   tr.children[25].textContent=billingMoney(margin);tr.children[26].textContent=margin==null||!meta.revenue?'Pendente':(margin/meta.revenue*100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%';
   billingStyleMargin(tr,margin,meta.revenue);
  };
  amount.addEventListener('input',update);reason.addEventListener('change',update);
  tr.children[13].textContent='';const compInline=document.createElement('div');compInline.className='billing-comp-inline';compInline.append(amount,reason);tr.children[13].append(compInline);
  if(meta.city){const cell=tr.children[3];cell.textContent='';const cityButton=document.createElement('button');cityButton.type='button';cityButton.className='billing-city-link';cityButton.textContent=meta.city;cityButton.title='Consultar cidades, distâncias e faixas do plano';cityButton.onclick=()=>{document.querySelector('#programming-city-summary').textContent='';billingCityDetails(meta.plan,meta.details);};cell.append(cityButton);}
  if(meta.toll==null&&meta.city){const td=tr.children[12];td.textContent='';const btn=document.createElement('button');btn.type='button';btn.className='billing-register-toll';btn.textContent='+ Cadastrar pedágio';btn.onclick=()=>billingOpenToll(meta.city,meta.plan);td.append(btn);}
  const initialMargin=meta.revenue==null||meta.freight==null||meta.toll==null||meta.totalTaxes==null||meta.aver==null||meta.adminCost==null||meta.operatingCost==null||meta.cteCost==null?null:meta.revenue-meta.freight-meta.toll-Number(c.amount||0)-meta.totalTaxes-meta.aver-meta.adminCost-meta.operatingCost-meta.cteCost;
  billingStyleMargin(tr,initialMargin,meta.revenue);
  const profileCell=tr.children[10];profileCell.title='Perfil contratado: '+meta.contractedProfile+' · Perfil embarcado: '+(meta.embarkedProfile||'não identificado');

 });
 // Status financeiro inserido depois dos vínculos dos campos, preservando os índices internos existentes.
 const bt=$('billing-table').querySelector('table');
 if(bt){const header=bt.querySelector('thead tr');if(header){const th=document.createElement('th');th.textContent='STATUS';header.insertBefore(th,header.firstChild);}
  bt.querySelectorAll('tbody tr').forEach((tr,i)=>{const state=payStatus(filteredSummary[pageStart+i]);const td=document.createElement('td');td.className='billing-payment-status';const dot=document.createElement('span');dot.className='payment-status-dot payment-status-'+state;const label={settled:'Liquidado',partial:'Parcialmente liquidado',pending:'Pendente de pagamento'}[state];dot.title=label;dot.setAttribute('role','img');dot.setAttribute('aria-label',label);td.append(dot);tr.insertBefore(td,tr.firstChild);});
 }
 $('billing-page').textContent=`${filteredResult.length} rotas filtradas (${result.length} consolidadas no banco) · página ${billingPage+1}`;
 $('billing-prev').disabled=billingPage===0;$('billing-next').disabled=(billingPage+1)*50>=filteredResult.length;
}
$('billing-filter').onclick=()=>{billingPage=0;loadBilling().catch(e=>message(e.message,true));};
$('billing-clear').onclick=()=>{for(const id of ['billing-driver','billing-year','billing-month','billing-fortnight','billing-profile','billing-margin','billing-payment-status'])$(id).value='';billingPage=0;loadBilling().catch(e=>message(e.message,true));};
$('billing-refresh').onclick=()=>loadBilling().catch(e=>message(e.message,true));
$('billing-prev').onclick=()=>{billingPage=Math.max(0,billingPage-1);loadBilling().catch(e=>message(e.message,true));};
$('billing-next').onclick=()=>{billingPage++;loadBilling().catch(e=>message(e.message,true));};

$('finance-refresh').onclick=()=>loadFinanceParams().catch(e=>message(e.message,true));

// Plano de embarque - PDF de todas as rotas filtradas na programação.
async function exportProgramPDF(){
 const btn=$('program-pdf');const old=btn.textContent;btn.disabled=true;btn.textContent='Gerando PDF...';
 try{
  const items=[...v13Filtered];if(!items.length)throw Error('Nenhuma rota para exportar com os filtros selecionados.');
  for(let i=0;i<items.length;i+=100){const states=await rpc('pcd_v10_loading_states',{p_route_ids:items.slice(i,i+100).map(r=>Number(r.id))});for(const st of states||[])if(st.is_loaded)v13Loaded.add(Number(st.route_id));}
  if(!await paymentPdfReady())throw Error('Biblioteca PDF indisponível. Verifique sua conexão.');
  const timeKey=r=>String(r.loading_time||'99:99:99').padStart(8,'0');
  items.sort((a,b)=>String(a.loading_on||'9999-99-99').localeCompare(String(b.loading_on||'9999-99-99'))||timeKey(a).localeCompare(timeKey(b))||String(a.plan_number||'').localeCompare(String(b.plan_number||'')));
  const doc=new window.jspdf.jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
  const navy=[7,43,82],blue=[15,72,122],ink=[34,55,75],muted=[91,109,128],green=[27,112,72];
  const loaded=window.innovaVisibleLoadedIds||new Set();
  const count=items.length,weight=items.reduce((n,r)=>n+(Number(r.gross_weight)||0),0),deliveries=items.reduce((n,r)=>n+(Number(r.delivery_count)||0),0);
  const dt=new Date().toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'});
  const head=()=>{
   doc.setFillColor(...navy);doc.rect(0,0,297,27,'F');doc.setTextColor(255,255,255);doc.setFont('helvetica','bold');doc.setFontSize(15);doc.text('INNOVA  |  PLANO DE EMBARQUE',10,12);
   doc.setFont('helvetica','normal');doc.setFontSize(8);doc.text('3 Corações  ·  Sumaré/SP',10,19);doc.text('Emitido: '+dt,286,19,{align:'right'});
   doc.setTextColor(...ink);doc.setFont('helvetica','bold');doc.setFontSize(9);doc.text('VEÍCULOS  '+count,10,34);doc.text('PESO  '+weight.toLocaleString('pt-BR',{maximumFractionDigits:2})+' kg',78,34);doc.text('ENTREGAS  '+deliveries,163,34);
   doc.setFont('helvetica','normal');doc.setFontSize(7.5);doc.setTextColor(...muted);doc.text('Data: '+('Rota '+brDate($('route-date').value)+' · Solicitação '+brDate($('route-request-date').value))+'   ·   Perfil: '+($('route-profile').value||'Todos')+'   ·   Status: '+(selectedRouteStatuses().join(', ')||'Todos')+'   ·   Ordem: carregamento crescente',10,40);
  };
  head();
  const body=items.map((r,i)=>[String(i+1),brDate(r.loading_on),String(r.loading_time||'—'),String(r.plan_number||''),String(r.city||''),String(r.vehicle_profile||''),Number(r.gross_weight||0).toLocaleString('pt-BR',{maximumFractionDigits:2}),String(r.delivery_count||0),String(r.driver_name||'—'),String(r.plate||'—'),loaded.has(Number(r.id))?'CARREGADO':'PENDENTE']);
  doc.autoTable({startY:44,head:[['#','DATA CAR.','HORA','PLANO','CIDADE / REGIÃO','PERFIL','PESO (kg)','ENTREGAS','MOTORISTA','PLACA','CARREGAMENTO']],body,theme:'grid',showHead:'everyPage',
   styles:{font:'helvetica',fontSize:8,cellPadding:2.3,overflow:'linebreak',valign:'middle',textColor:ink,lineColor:[224,233,242],lineWidth:.15},
   headStyles:{fillColor:blue,textColor:[255,255,255],fontStyle:'bold',fontSize:7.2},alternateRowStyles:{fillColor:[246,249,252]},
   columnStyles:{0:{cellWidth:8},1:{cellWidth:24},2:{cellWidth:18},3:{cellWidth:25},4:{cellWidth:49},5:{cellWidth:20},6:{cellWidth:23},7:{cellWidth:18},8:{cellWidth:47},9:{cellWidth:24},10:{cellWidth:23}},
   margin:{left:9,right:9,top:44,bottom:15},
   didParseCell:data=>{if(data.section==='body'&&data.column.index===10&&data.cell.raw==='CARREGADO'){data.cell.styles.textColor=green;data.cell.styles.fontStyle='bold';data.cell.styles.fillColor=[229,246,235];}},
   didDrawPage:()=>{const page=doc.internal.getCurrentPageInfo().pageNumber;if(page>1)head();doc.setFontSize(7);doc.setTextColor(...muted);doc.text('INNOVA  ·  Plano de embarque  ·  Página '+page,287,202,{align:'right'});}
  });
  const name='INNOVA_PLANO_EMBARQUE_'+($('route-date').value||today()).replace(/\//g,'-')+'.pdf';doc.save(name);
 }catch(e){message(e.message,true);}finally{btn.disabled=false;btn.textContent=old;}
}
$('program-pdf').onclick=exportProgramPDF;
