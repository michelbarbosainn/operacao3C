import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.49.8';
const $=id=>document.getElementById(id);let db,tab='import',drivers=[],rows=[],pages={routes:0,sac:0,occurrences:0},totals={routes:0,sac:0,occurrences:0},pending=[],checks=[],nfPending=[],modalSave=()=>{};
const cfg=window.INNOVA_PCD_CONFIG||{};
function message(s,err=false){$('message').textContent=s;$('message').className='msg'+(err?' error':'');}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function norm(s){return String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');}
function today(){return new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});}
function table(head,data){return '<table><thead><tr>'+head.map(x=>`<th>${esc(x)}</th>`).join('')+'</tr></thead><tbody>'+data.map(r=>'<tr>'+r.map(v=>`<td>${esc(v)}</td>`).join('')+'</tr>').join('')+'</tbody></table>';}
async function rpc(fn,args={}){const {data,error}=await db.rpc(fn,args);if(error)throw Error(error.message);return data;}
async function init(){try{if(!cfg.supabaseUrl?.startsWith('https://')||!cfg.supabasePublishableKey||cfg.supabasePublishableKey.includes('SUBSTITUIR'))throw Error('Mantenha o config.js já configurado na V4. A chave pública não está preenchida.');db=createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true}});const {data}=await db.auth.getSession();if(data.session)await enter(data.session.user);else message('Acesse com seu Google corporativo. O acesso por senha permanece temporariamente durante a migração.');}catch(e){message(e.message,true);}}
async function enter(user){if(!String(user.email||'').toLowerCase().endsWith('@innovasl.com.br')){await db.auth.signOut();throw Error('Acesso restrito a contas corporativas @innovasl.com.br.');}await rpc('pcd_dashboard');$('who').textContent=user.email;$('login-panel').classList.add('hidden');$('main').classList.remove('hidden');$('logout').classList.remove('hidden');await refreshMetrics();await showTab('routes');await refreshHealth();$('message').classList.add('hidden');}
$('login').onclick=async()=>{try{$('login').disabled=true;const {data,error}=await db.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});if(error)throw error;await enter(data.user);}catch(e){message('Não foi possível entrar: '+e.message,true);}finally{$('login').disabled=false;}};
$('google-login').onclick=async()=>{try{if(!db)throw Error('Supabase não configurado.');const {error}=await db.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+location.pathname,queryParams:{hd:'innovasl.com.br',prompt:'select_account'}}});if(error)throw error;}catch(e){message('Falha ao iniciar Google: '+e.message,true);}};
$('logout').onclick=async()=>{await db.auth.signOut();location.reload();};

async function refreshMetrics(){const a=await rpc('pcd_dashboard');$('metric-routes').textContent=a.total_routes;const day=$('availability-date').value||today();drivers=await rpc('pcd_v8_drivers',{p_date:day});$('metric-drivers').textContent=drivers.length;$('metric-available').textContent=drivers.filter(d=>d.day_status==='DISPONIVEL').length;$('metric-assigned').textContent=drivers.filter(d=>d.day_status==='PROGRAMADO').length;}
async function showTab(t){tab=t;document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===t));document.querySelectorAll('[data-go]').forEach(b=>b.classList.toggle('active',b.dataset.go===t));for(const x of ['import','routes','billing','availability','sac','occurrences','recipients','reasons'])$('panel-'+x).classList.toggle('hidden',x!==t);try{if(t==='billing')await loadBilling();if(t==='availability')await loadAvailability();if(t==='routes'||t==='sac')await loadRoutes(t);if(t==='occurrences')await loadOccurrences();if(t==='recipients')await loadRecipients();if(t==='reasons')await loadReasons();}catch(e){message(e.message,true);}}
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>showTab(b.dataset.tab));
document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>showTab(b.dataset.go));
$('availability-date').value=today();
async function loadAvailability(){
 drivers=await rpc('pcd_v8_drivers',{p_date:$('availability-date').value});
 const cat=$('availability-category').value,profile=$('availability-profile').value,status=$('availability-status').value,query=norm($('availability-search').value);
 const shown=drivers.filter(d=>(!cat||d.category===cat)&&(!profile||norm(d.profile)===norm(profile))&&(!status||d.day_status===status)&&(!query||norm(d.name).includes(query)||norm(d.plate).includes(query)));
 const key=availabilitySort.key,dir=availabilitySort.dir;
 shown.sort((a,b)=>{const av=key==='routes_count'?Number(a.routes_count):String(a[key]??'').toLocaleUpperCase('pt-BR');const bv=key==='routes_count'?Number(b.routes_count):String(b[key]??'').toLocaleUpperCase('pt-BR');const v=typeof av==='number'?av-bv:String(av).localeCompare(String(bv),'pt-BR',{numeric:true});return (v||a.name.localeCompare(b.name,'pt-BR'))*dir;});
 $('availability-table').innerHTML=table(['Motorista','Placa','Perfil','Categoria','Status','Rotas na data','Disponibilidade'],shown.map(d=>[d.name,d.plate,d.profile,d.category,'',d.routes_count,'']));
 const columns=['name','plate','profile','category','day_status','routes_count'];
 $('availability-table').querySelectorAll('thead th').forEach((th,i)=>{if(i>=columns.length)return;th.style.cursor='pointer';th.title='Clique para ordenar';th.textContent+=(availabilitySort.key===columns[i]?(availabilitySort.dir===1?' ▲':' ▼'):' ↕');th.onclick=()=>{availabilitySort.dir=availabilitySort.key===columns[i]?-availabilitySort.dir:(columns[i]==='routes_count'?-1:1);availabilitySort.key=columns[i];loadAvailability().catch(e=>message(e.message,true));};});
 $('availability-table').querySelectorAll('tbody tr').forEach((tr,i)=>{
  const d=shown[i],statusCell=tr.children[4],cell=tr.lastElementChild;
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
const availabilitySort={key:'routes_count',dir:-1};$('availability-search').addEventListener('input',()=>loadAvailability().catch(e=>message(e.message,true)));$('refresh-availability').onclick=loadAvailability;$('availability-date').onchange=async()=>{await loadAvailability();await refreshMetrics();};$('availability-category').onchange=loadAvailability;$('availability-profile').onchange=loadAvailability;$('availability-status').onchange=loadAvailability;
async function loadRoutes(which){const search=$(which==='sac'?'sac-search':'route-search').value.trim(),date=$(which==='sac'?'sac-date':'route-date').value||null;const a=await rpc('pcd_v8_routes',{p_search:search,p_date:date,p_limit:50,p_offset:pages[which]*50});totals[which]=a.total;const data=a.rows||[];const headers=['Plano','Complemento','Solicitação','Data rota','Cidade','Destino','Perfil','Peso','Entregas','Valor NF','Motorista','Placa','Status rota','GreenMile','Tipo','Ação'];const target=$(which==='sac'?'sac-table':'route-table');target.innerHTML=table(headers,data.map(r=>[r.plan_number,r.complement,r.request_date,r.route_date,r.city,r.destination,r.vehicle_profile,r.gross_weight,r.delivery_count,r.merchandise_value,r.driver_name,r.plate,r.route_status,r.gm_status,r.is_active?r.duplicate_kind:'INATIVA','']));target.querySelectorAll('tbody tr').forEach((tr,i)=>{const r=data[i];tr.children[9].textContent=r.merchandise_value==null?'—':Number(r.merchandise_value).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});const count=Number(r.delivery_count)||0;tr.children[8].innerHTML='';const badge=document.createElement('span');badge.className='complexity '+(count===1?'low':count<=10?'mid':'high');badge.textContent=count+' '+(count===1?'●':count<=10?'◆':'▲');badge.title=count===1?'Entrega única':count<=10?'Complexidade intermediária':'Alta complexidade';tr.children[8].append(badge);if(which==='sac'){const plan=document.createElement('button');plan.className='plan-link';plan.textContent=r.plan_number;plan.onclick=()=>openPlanInvoices(r);tr.children[0].textContent='';tr.children[0].append(plan);}const cell=tr.lastElementChild,b=document.createElement('button');b.className='small';b.textContent=which==='sac'?'Atualizar SAC':'Programar';b.disabled=!data[i].is_active;b.onclick=()=>which==='sac'?openSAC(data[i]):openAssign(data[i]);cell.append(b);if(which==='routes'){const driverCell=tr.children[10];const edit=document.createElement('button');edit.className='driver-inline';edit.textContent=data[i].driver_name||'Selecionar motorista';edit.title='Clique para editar motorista na própria tabela';edit.onclick=()=>inlineAssign(data[i],driverCell);driverCell.textContent='';driverCell.append(edit);}});$(which==='sac'?'sac-page':'route-page').textContent=`${a.total} rotas · página ${pages[which]+1}`;$(which==='sac'?'sac-prev':'route-prev').disabled=pages[which]===0;$(which==='sac'?'sac-next':'route-next').disabled=(pages[which]+1)*50>=a.total;}
for(const which of ['routes','sac']){const prefix=which==='sac'?'sac':'route';$(prefix+'-filter').onclick=()=>{pages[which]=0;loadRoutes(which).catch(e=>message(e.message,true));};$(prefix+'-prev').onclick=()=>{pages[which]--;loadRoutes(which).catch(e=>message(e.message,true));};$(prefix+'-next').onclick=()=>{pages[which]++;loadRoutes(which).catch(e=>message(e.message,true));};$('refresh-'+which).onclick=()=>loadRoutes(which).catch(e=>message(e.message,true));}
function modal(title,summary,body,fn){$('modal-save').classList.remove('hidden');$('modal-save').textContent='Salvar';$('modal-save').disabled=false;$('modal-title').textContent=title;$('modal-summary').textContent=summary;$('modal-body').innerHTML=body;modalSave=fn;$('modalbg').classList.remove('hidden');}
$('modal-close').onclick=()=>{$('modalbg').classList.add('hidden');};$('modal-save').onclick=async()=>{try{$('modal-save').disabled=true;await modalSave();$('modalbg').classList.add('hidden');await refreshMetrics();if(tab==='recipients')await loadRecipients();else await loadRoutes(tab==='sac'?'sac':'routes');message('Alteração salva com sucesso.');}catch(e){message(e.message,true);}finally{$('modal-save').disabled=false;}};
async function openAssign(r){const all=await rpc('pcd_v8_drivers',{p_date:r.route_date||r.loading_on});const eligible=all.filter(d=>d.base_status!=='INATIVO'&&norm(d.profile)===norm(r.vehicle_profile)&&(d.day_status==='DISPONIVEL'||(d.day_status==='PROGRAMADO'&&Number(d.routes_count)>0)));const options=eligible.map(d=>`<option value="${d.id}">${esc(d.name)} · ${esc(d.plate)} · ${esc(d.day_status)}${Number(d.routes_count)?' ('+d.routes_count+' rota(s))':''}</option>`).join('');modal('Escalar motorista',`Plano ${r.plan_number} · ${r.route_date||r.loading_on} · ${r.city} · ${r.vehicle_profile}`,`<label>Motorista disponível ou já programado</label><select id="pick-driver"><option value="">Selecione...</option>${options}</select><p class="muted" id="pick-plate">A placa será preenchida automaticamente.</p><p class="note">Segunda rota na mesma data exige confirmação. Motoristas INDISPONÍVEIS e INATIVOS não aparecem.</p>`,async()=>{const id=Number($('pick-driver').value);if(!id)throw Error('Selecione o motorista.');let result=await rpc('pcd_v8_assign',{p_route_id:r.id,p_driver_id:id,p_confirm_second:false});if(result.requires_confirmation){if(!confirm(`Motorista já possui ${result.existing_routes} rota(s) em ${r.route_date||r.loading_on}. Deseja confirmar outra escala?`))throw Error('Escala adicional cancelada.');result=await rpc('pcd_v8_assign',{p_route_id:r.id,p_driver_id:id,p_confirm_second:true});}return result;});$('pick-driver').onchange=()=>{const d=eligible.find(x=>x.id===Number($('pick-driver').value));$('pick-plate').textContent=d?`Placa automática: ${d.plate} · ${d.profile}`:'Selecione um motorista';};}
function openSAC(r){modal('Acompanhamento SAC',`Plano ${r.plan_number} · ${r.route_date||r.loading_on} · Motorista: ${r.driver_name||'Não escalado'} · Placa: ${r.plate||'—'}`,`<div class="two"><div><label>Status da rota</label><select id="sac-route-status"><option>PROGRAMAR</option><option>EM ROTA</option><option>CONCLUÍDO</option><option>NÃO EMBARCOU</option></select></div><div><label>Status GreenMile</label><select id="sac-gm-status"><option value="">Não informado</option><option>ROTA ATRIBUIDA</option><option>ENTREGANDO</option><option>FINALIZAÇÃO</option><option>GM OK</option><option>NÃO USOU GM</option></select></div></div><label style="margin-top:14px">Data da rota (remarcação pelo SAC)</label><input id="sac-route-date" type="date"/><label style="margin-top:14px">Observações</label><textarea id="sac-notes" maxlength="4000"></textarea><p class="muted">Não é possível alterar motorista ou placa nesta tela.</p>`,async()=>{await rpc('pcd_v8_sac',{p_route_id:r.id,p_status:$('sac-route-status').value,p_gm:$('sac-gm-status').value||null,p_notes:$('sac-notes').value,p_route_date:$('sac-route-date').value});});$('sac-route-date').value=r.route_date||r.loading_on;$('sac-route-status').value=r.route_status||'PROGRAMAR';$('sac-gm-status').value=r.gm_status||'';$('sac-notes').value=r.sac_notes||'';}
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
function convert(obj){const get=n=>{const key=Object.keys(obj).find(k=>norm(k)===norm(n));return String(obj[key]??'').trim();};const plan=get('PLANO');if(!plan)return null;const loading_on=dateBR(get('DATA CAR'));if(!loading_on)throw Error('Plano '+plan+': DATA CAR obrigatória');return {plan_number:plan,complement:get('COMPLEMENTO'),transport:get('TRANS.'),destination:get('DESTINO'),city:get('CIDADE'),neighborhood:get('BAIRRO'),vehicle_profile:get('PERFIL'),gross_weight:num(get('PESO')),delivery_count:num(get('QTD ENTREGA')),invoiced_on:dateBR(get('DATA FATURADO')),operation_type:get('TIPO DE OPERAÇÃO'),merchandise_value:num(get('R$')),loading_on,loading_time:get('HOR. CAR'),driver_name:get('MOTORISTA'),plate:get('PLACA')};}
$('preview').onclick=async()=>{try{const raw=$('paste').value.trim();if(!raw)throw Error('Cole as rotas com o cabeçalho.');const sep=raw.split(/\r?\n/)[0].includes('\t')?'\t':',';const m=parseDelimited(raw,sep),head=m.shift().map(x=>x.trim());if(!head.some(x=>norm(x)==='PLANO')||!head.some(x=>norm(x)==='DATACAR'))throw Error('Inclua o cabeçalho PLANO e DATA CAR.');pending=m.filter(r=>r.some(v=>v.trim())).map((r,i)=>{try{return convert(Object.fromEntries(head.map((h,j)=>[h,r[j]||''])));}catch(e){throw Error(`Linha ${i+2}: ${e.message}`);}}).filter(Boolean);if(!pending.length||pending.length>1000)throw Error('Envie entre 1 e 1000 rotas.');checks=await rpc('pcd_v5_check_import',{p_rows:pending});const tbody=pending.map((r,i)=>[r.plan_number,r.loading_on,r.city,r.vehicle_profile,r.driver_name,checks[i].duplicate?'DUPLICADA':'NOVA','']);$('import-preview').innerHTML=table(['Plano','Data','Cidade','Perfil','Motorista','Análise','Decisão'],tbody);$('import-preview').querySelectorAll('tbody tr').forEach((tr,i)=>{const cell=tr.lastElementChild;if(checks[i].duplicate){const select=document.createElement('select');select.dataset.index=i;select.innerHTML='<option value="">Escolha...</option><option value="REENTREGA">Reentrega</option><option value="DUPLICADA_INATIVA">Duplicada — inativa</option>';select.onchange=validateImport;cell.append(select);}else cell.textContent='Nova rota';});$('import-count').textContent=`${pending.length} rota(s) · ${checks.filter(x=>x.duplicate).length} duplicada(s)`;validateImport();message('Confira a análise. Duplicidades exigem decisão antes de salvar.');}catch(e){pending=[];checks=[];$('import-save').disabled=true;message(e.message,true);}};
function validateImport(){$('import-save').disabled=!pending.length||[...$('import-preview').querySelectorAll('select[data-index]')].some(s=>!s.value);}
$('paste').oninput=()=>{$('import-save').disabled=true;pending=[];};
$('import-save').onclick=async()=>{try{const decisions=Object.fromEntries([...$('import-preview').querySelectorAll('select[data-index]')].map(s=>[Number(s.dataset.index),s.value]));const payload=pending.map((r,i)=>({...r,decision:decisions[i]||'NOVO'}));if(!confirm(`Confirmar importação de ${payload.length} rotas?`))return;$('import-save').disabled=true;const a=await rpc('pcd_v8_import',{p_rows:payload});$('paste').value='';$('import-preview').innerHTML='';pending=[];await refreshMetrics();message(`Importação salva. Novas: ${a.new} · Reentregas: ${a.redeliveries} · Duplicadas inativas: ${a.inactive_duplicates}.`);await refreshHealth();}catch(e){message(e.message,true);}finally{$('import-save').disabled=!pending.length;}};
// V8: seleção na própria linha, com confirmação para rota adicional
async function inlineAssign(r,cell){try{const all=await rpc('pcd_v8_drivers',{p_date:r.route_date||r.loading_on});const eligible=all.filter(d=>d.base_status!=='INATIVO'&&norm(d.profile)===norm(r.vehicle_profile)&&(d.day_status==='DISPONIVEL'||(d.day_status==='PROGRAMADO'&&Number(d.routes_count)>0)));const select=document.createElement('select');select.className='driver-inline-select';select.innerHTML='<option value="">Selecione...</option>';for(const d of eligible){const opt=document.createElement('option');opt.value=d.id;opt.textContent=`${d.name} · ${d.plate}${Number(d.routes_count)?' · '+d.routes_count+' rota(s)':''}`;select.append(opt);}cell.textContent='';cell.append(select);select.focus();select.onchange=async()=>{try{const id=Number(select.value);if(!id)return;let a=await rpc('pcd_v8_assign',{p_route_id:r.id,p_driver_id:id,p_confirm_second:false});if(a.requires_confirmation){if(!confirm(`Motorista com ${a.existing_routes} rota(s) nesta data. Confirmar outra?`))return;await rpc('pcd_v8_assign',{p_route_id:r.id,p_driver_id:id,p_confirm_second:true});}await loadRoutes('routes');await refreshMetrics();message('Motorista escalado. Placa atualizada automaticamente.');}catch(e){message(e.message,true);}};}catch(e){message(e.message,true);}}
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
  <h3>Envio de ocorrência</h3><label>Complemento (se houver)</label><textarea id="occ-complement" rows="2" placeholder="Informações adicionais para o e-mail complementar"></textarea>
  <button id="occ-send-v92" class="small">${hasInitial?'Enviar e-mail complementar':'Enviar ocorrência inicial de teste'}</button><p class="muted">Selecione os anexos que devem acompanhar este envio. Novos anexos podem ser incluídos posteriormente.</p>
  <h3>Histórico de envios</h3>${rows||'<p class="muted">Nenhum envio nesta versão.</p>'}
  <h3>Encerramento</h3><label>Resultado final</label><select id="occ-close-result"><option value="">Selecione...</option><option>ENTREGUE</option><option>ENTREGUE PARCIAL</option><option>DEVOLUÇÃO TOTAL</option></select><label>Senha de autorização 3 Corações</label><input id="occ-close-code" placeholder="Obrigatória para parcial ou devolução"><label>Observação de encerramento</label><textarea id="occ-close-note" rows="2"></textarea><button id="occ-close-btn" class="small" ${history.status==='ENCERRADA'?'disabled':''}>Encerrar ocorrência</button>${history.closing_result?`<p class="note">Encerrada: ${esc(history.closing_result)}</p>`:''}</div>`;
  modal('Gestão da ocorrência',`OC-${String(occId).padStart(6,'0')} · Plano ${route.plan_number}`,html,async()=>{});
  $('modal-save').classList.add('hidden');
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
async function loadRecipients(){
 const term=$('recipient-search').value.trim();const items=await rpc('pcd_oc_list_recipients',{p_search:term});
 $('recipient-table').innerHTML=table(['Nome','E-mail','Status','Alterado em','Ação'],items.map(x=>[x.display_name,x.email,'',new Date(x.updated_at).toLocaleString('pt-BR'),'']));
 $('recipient-table').querySelectorAll('tbody tr').forEach((tr,i)=>{
  const x=items[i];const cell=tr.children[2];const badge=document.createElement('span');badge.className='badge '+(x.active?'oc-open':'oc-cancelled');badge.textContent=x.active?'ATIVO':'INATIVO';cell.append(badge);
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
function billingCityDetails(plan,items){const modal=$('billing-cities-modal'),body=$('billing-cities-body');$('billing-cities-plan').textContent='Plano '+plan;body.textContent='';for(const item of items){const tr=document.createElement('tr');for(const val of [item.city,item.distance==null?'—':Number(item.distance).toLocaleString('pt-BR')+' km',item.band==null?'Sem faixa':'Faixa '+item.band]){const td=document.createElement('td');td.textContent=val;tr.append(td);}body.append(tr);}modal.classList.remove('hidden');}
$('billing-cities-close').onclick=()=>$('billing-cities-modal').classList.add('hidden');$('billing-cities-modal').addEventListener('click',e=>{if(e.target.id==='billing-cities-modal')e.currentTarget.classList.add('hidden');});
function billingTollMultiplier(profile){const x=billingNorm(profile).replace(/[^A-Z0-9]/g,'');return x==='34'||x==='3/4'.replace(/[^A-Z0-9]/g,'')||x==='TRESQUARTOS'?2:1;}
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
async function loadBilling(){
 const search=$('billing-search').value.trim(),date=billingDateISO($('billing-date').value);
 const a=await rpc('pcd_v8_routes',{p_search:search,p_date:date,p_limit:50,p_offset:billingPage*50});
 billingTotal=a.total||0;const data=a.rows||[];$('billing-total').textContent=billingTotal;
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
 const supplier=$('billing-supplier').value.trim();if(supplier){const {data:ee,error}=await db.from('pcd_billing_supplier_rates').select('supplier_name,vehicle_profile,band,amount,effective_from,effective_until').eq('supplier_name',supplier).limit(500);if(error)throw error;exceptions.push(...(ee||[]));}
 $('billing-rates-status').textContent=cityRates.length?'Disponível':'Sem correspondência';$('billing-tolls-status').textContent=tollRates.length?'Disponível':'Sem correspondência';
 const grouped=new Map();for(const r of data){const key=String(r.plan_number)+'|'+String(r.route_date||r.loading_on||'')+'|'+String(r.vehicle_profile||'');if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(r);}
 const result=[],metadata=[];for(const group of grouped.values()){
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
  const revenue=decisive?.revenue_reference==null?null:Number(decisive.revenue_reference);
  const id=String(r.id||plan+'|'+dateKey),comp=billingComplements.get(id)||{amount:0,reason:''};
  const note=!noteCities.length?'Sem notas vinculadas — cidade operacional':matched.length!==cityList.length?'Cidade/perfil sem tabela':!decisive?'Cidade/perfil sem tabela':cityTolls.length>1&&new Set(cityTolls.map(x=>Number(x.amount))).size>1?'Pedágios divergentes':!cityTolls.length?'Pedágio sem referência':override?'Exceção fornecedor':'Tabela padrão';
  const details=cityList.map(city=>{const candidates=matched.filter(x=>x.routeCity===city).sort((a,b)=>Number(b.band)-Number(a.band)||Number(b.distance_km||0)-Number(a.distance_km||0));return {city,band:candidates[0]?.band??null,distance:candidates[0]?.distance_km??null};}).sort((a,b)=>Number(b.band||0)-Number(a.band||0)||Number(b.distance||0)-Number(a.distance||0));
  const weight=group.reduce((sum,x)=>sum+(Number(x.gross_weight)||0),0);
  const deliveries=group.reduce((sum,x)=>sum+(Number(x.delivery_count)||0),0);
  const advance=freight==null||toll==null?null:(freight+Number(comp.amount||0))*0.5+toll;
  const total=freight==null||toll==null?null:freight+toll+Number(comp.amount||0);
  result.push([plan,billingBR(dateKey),cityList.length,decisive?.routeCity||'—',decisive?.band??'—',billingKg(weight),billingMoney(invoiceValues.get(plan)?.sum??null),deliveries,r.driver_name||'—',r.plate||'—',embarkedProfile||'Não identificado',billingMoney(freight),toll==null?'Cadastrar pedágio':billingMoney(toll),billingMoney(comp.amount),billingMoney(advance),billingMoney(total),billingMoney(revenue),revenue==null?'—':billingMoney(revenue*0.12)]);
  metadata.push({id,freight,toll,plan,city:decisive?.routeCity||'',details,contractedProfile,embarkedProfile});
 }
 $('billing-table').innerHTML=table(['Plano','Data rota','Qtd. cidades','Cidade determinante','Faixa','Peso','Valor mercadoria','Qtd. entregas','Motorista','Placa','Perfil embarcado','Frete a pagar','Pedágio','Complemento','Total adiantamento','Total a pagar','Receita bruta','ICMS 12%'],result);
 $('billing-table').querySelectorAll('tbody tr').forEach((tr,i)=>{const meta=metadata[i],c=billingComplements.get(meta.id)||{amount:0,reason:''};
  const amount=document.createElement('input');amount.type='number';amount.min='0';amount.step='0.01';amount.className='billing-comp-input';amount.value=c.amount||'';amount.placeholder='0,00';amount.title='Complemento simulado; ainda não gravado no banco';
  const reason=document.createElement('select');reason.className='billing-reason-input';for(const [value,label] of [['','Selecione o motivo'],...billingReasonOptions.map(x=>[x,x])]){const option=document.createElement('option');option.value=value;option.textContent=label;reason.append(option);}reason.value=billingReasonOptions.includes(c.reason)?c.reason:'';reason.title='Motivo do complemento';reason.disabled=!(Number(c.amount)>0);
  const update=()=>{const val=Number(amount.value);if(!Number.isFinite(val)||val<0){amount.setCustomValidity('Informe valor válido');return;}amount.setCustomValidity('');reason.disabled=val<=0;if(val<=0)reason.value='';reason.required=val>0;reason.classList.toggle('billing-reason-required',val>0&&!reason.value);billingComplements.set(meta.id,{amount:val,reason:reason.value.trim()});tr.children[14].textContent=meta.freight==null||meta.toll==null?'Pendente':billingMoney((meta.freight+val)*0.5+meta.toll);tr.children[15].textContent=meta.freight==null||meta.toll==null?'Pendente':billingMoney(meta.freight+meta.toll+val);};
  amount.addEventListener('input',update);reason.addEventListener('change',update);
  tr.children[13].textContent='';const compInline=document.createElement('div');compInline.className='billing-comp-inline';compInline.append(amount,reason);tr.children[13].append(compInline);
  if(meta.city){const cell=tr.children[3];cell.textContent='';const cityButton=document.createElement('button');cityButton.type='button';cityButton.className='billing-city-link';cityButton.textContent=meta.city;cityButton.title='Consultar cidades, distâncias e faixas do plano';cityButton.onclick=()=>billingCityDetails(meta.plan,meta.details);cell.append(cityButton);}
  if(meta.toll==null&&meta.city){const td=tr.children[12];td.textContent='';const btn=document.createElement('button');btn.type='button';btn.className='billing-register-toll';btn.textContent='+ Cadastrar pedágio';btn.onclick=()=>billingOpenToll(meta.city,meta.plan);td.append(btn);}
  const profileCell=tr.children[10];profileCell.title='Perfil contratado: '+meta.contractedProfile+' · Perfil embarcado: '+(meta.embarkedProfile||'não identificado');

 });
 $('billing-page').textContent=`${billingTotal} registros operacionais · página ${billingPage+1}`;
 $('billing-prev').disabled=billingPage===0;$('billing-next').disabled=(billingPage+1)*50>=billingTotal;
}
$('billing-filter').onclick=()=>{billingPage=0;loadBilling().catch(e=>message(e.message,true));};
$('billing-refresh').onclick=()=>loadBilling().catch(e=>message(e.message,true));
$('billing-prev').onclick=()=>{billingPage=Math.max(0,billingPage-1);loadBilling().catch(e=>message(e.message,true));};
$('billing-next').onclick=()=>{billingPage++;loadBilling().catch(e=>message(e.message,true));};
