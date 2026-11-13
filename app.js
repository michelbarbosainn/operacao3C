
import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.49.8';
const $=id=>document.getElementById(id);
let db=null, pending=[], currentTab='importacao', currentRows=[], selected=null, page=0, totalRows=0;
const columns=['PLANO','COMPLEMENTO','TRANS.','DESTINO','CIDADE','BAIRRO','PERFIL','PESO','QTD ENTREGA','DATA FATURADO','TIPO DE OPERAÇÃO','R$','DATA CAR','HOR. CAR','MOTORISTA','PLACA'];
function msg(s,error=false){$('message').textContent=s;$('message').className='status'+(error?' error':'');}
function clean(s){return String(s??'').trim().replace(/\s+/g,' ');}
function norm(s){return clean(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');}
function parseDelimited(text,sep){let rows=[],row=[],cell='',quote=false;
 for(let i=0;i<text.length;i++){const c=text[i];
 if(c==='"'){if(quote&&text[i+1]==='"'){cell+='"';i++;}else quote=!quote;}
 else if(c===sep&&!quote){row.push(cell);cell='';}
 else if((c==='\n'||c==='\r')&&!quote){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell='';}
 else cell+=c;
 }row.push(cell);if(row.some(v=>v.trim()))rows.push(row);return rows;
}
function dateBR(s){s=clean(s);if(!s||s==='#N/A')return null;
 const m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
 if(m){const iso=`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
 const d=new Date(iso+'T12:00:00Z');if(Number.isNaN(+d)||d.toISOString().slice(0,10)!==iso)throw Error('Data inválida: '+s);return iso;}
 if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;
 throw Error('Data não reconhecida: '+s);
}
function numberBR(s){s=clean(s).replace(/[R$\s]/g,'');if(!s)return null;
 if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');
 else if(/^\d{1,3}(\.\d{3})+$/.test(s))s=s.replace(/\./g,'');
 const n=Number(s);if(!Number.isFinite(n))throw Error('Número inválido: '+s);return n;
}
function get(obj,name){const wanted=norm(name);const key=Object.keys(obj).find(k=>norm(k)===wanted);return key?clean(obj[key]):'';}
function convert(o){const plan=get(o,'PLANO');if(!plan||plan==='#N/A')return null;
 const x={
 plan_number:plan,complement:get(o,'COMPLEMENTO'),transport:get(o,'TRANS.'),
 destination:get(o,'DESTINO'),city:get(o,'CIDADE'),neighborhood:get(o,'BAIRRO'),
 vehicle_profile:get(o,'PERFIL'),gross_weight:numberBR(get(o,'PESO')),
 delivery_count:numberBR(get(o,'QTD ENTREGA')),invoiced_on:dateBR(get(o,'DATA FATURADO')),
 operation_type:get(o,'TIPO DE OPERAÇÃO'),merchandise_value:numberBR(get(o,'R$')),
 loading_on:dateBR(get(o,'DATA CAR')),loading_time:get(o,'HOR. CAR'),
 driver_name:get(o,'MOTORISTA'),plate:get(o,'PLACA')
 };
 if(!x.loading_on)throw Error(`Plano ${plan}: DATA CAR obrigatória`);
 return x;
}
function html(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function table(headers,rows){return `<table><thead><tr>${headers.map(h=>`<th>${html(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${html(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;}
async function dashboard(){const {data,error}=await db.rpc('pcd_dashboard');if(error)throw error;
 $('total').textContent=data.total_routes;
 const batches=data.recent_batches||[];$('last').textContent=batches.length?new Date(batches[0].created_at).toLocaleString('pt-BR'):'Nenhuma';
 $('routes').innerHTML=table(['Plano','Carregamento','Cidade','Perfil','Motorista','Placa','SAC'],
 (data.recent_routes||[]).map(x=>[x.plan_number,x.loading_on,x.city,x.vehicle_profile,x.driver_name||'Não escalado',x.plate,x.sac_status]));
 $('batches').innerHTML=table(['Tipo','Data','Recebidas','Novas','Repetidas','Alteradas','Inválidas'],
 batches.map(x=>[x.import_type,new Date(x.created_at).toLocaleString('pt-BR'),x.received,x.inserted,x.repeated,x.conflicts,x.invalid]));
}
async function submit(type,rows){if(!db)throw Error('Conecte-se primeiro');
 const {data,error}=await db.rpc('pcd_import_programming',{p_type:type,p_rows:rows});
 if(error)throw error;
 await dashboard();msg(`Importação concluída!\nRecebidas: ${data.received} | Novas: ${data.inserted} | Repetidas: ${data.repeated} | Alteradas (para revisão): ${data.conflicts} | Inválidas: ${data.invalid}`);
 return data;
}
const config=window.INNOVA_PCD_CONFIG || {};
async function startApp(){
 const url=config.supabaseUrl,key=config.supabasePublishableKey;
 if(!url?.startsWith('https://') || !key || key.includes('SUBSTITUIR')){
  msg('Configuração pendente: preencha a chave pública em config.js antes de publicar.',true);
  $('login').disabled=true;return;
 }
 db=createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
 const {data,error}=await db.auth.getSession();
 if(error){msg('Erro ao recuperar sessão: '+error.message,true);return;}
 if(data.session) await enterApp(data.session.user);
 else msg('Entre com seu e-mail e senha. Sua sessão ficará salva neste navegador.');
}
async function enterApp(user){
 try{
  const {error}=await db.rpc('pcd_dashboard');if(error)throw error;
  $('who').textContent=user.email;$('setup').classList.add('hidden');$('app').classList.remove('hidden');$('logout').classList.remove('hidden');
  await dashboard();msg('Conectado ao banco operacao3C.');
 }catch(e){
  await db.auth.signOut();
  $('setup').classList.remove('hidden');$('app').classList.add('hidden');$('logout').classList.add('hidden');
  msg('Acesso não autorizado ou banco indisponível: '+e.message,true);
 }
}
$('login').onclick=async()=>{
 $('login').disabled=true;
 try{
  if(!db)throw Error('Conexão não configurada.');
  const {data,error}=await db.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});
  if(error)throw error;
  $('password').value='';
  await enterApp(data.user);
 }catch(e){msg(e.message,true);}
 finally{$('login').disabled=false;}
};
$('logout').onclick=async()=>{await db?.auth.signOut();location.reload();};
startApp();
$('preview').onclick=()=>{
 try{const raw=$('paste').value.trim();if(!raw)throw Error('Cole a programação.');
 const sep=raw.split(/\r?\n/)[0].includes('\t')?'\t':',';
 const matrix=parseDelimited(raw,sep);const head=matrix.shift().map(clean);
 if(!head.some(h=>norm(h)==='PLANO')||!head.some(h=>norm(h)==='DATACAR'))throw Error('Inclua o cabeçalho original com PLANO e DATA CAR.');
 let rejected=0;pending=[];
 for(const [i,r] of matrix.entries()){
   if(!r.some(c=>clean(c)))continue;
   const obj=Object.fromEntries(head.map((h,j)=>[h,r[j]??'']));
   try{const x=convert(obj);if(x)pending.push(x);else rejected++;}
   catch(e){throw Error(`Linha ${i+2}: ${e.message}`);}
 }
 if(!pending.length)throw Error('Nenhuma rota válida encontrada.');
 if(pending.length>2000)throw Error('Máximo de 2000 rotas por importação.');
 $('count').textContent=`${pending.length} rotas prontas · ${rejected} linhas vazias/inválidas ignoradas`;
 $('previewBox').innerHTML=table(['Plano','Complemento','Destino','Cidade','Perfil','Peso (kg)','Entregas','Valor mercadoria','Carregamento','Motorista','Placa'],
 pending.slice(0,100).map(x=>[x.plan_number,x.complement,x.destination,x.city,x.vehicle_profile,x.gross_weight,x.delivery_count,x.merchandise_value,x.loading_on,x.driver_name,x.plate]));
 $('import').disabled=false;msg('Prévia pronta. Confira os dados antes de confirmar.');
 }catch(e){pending=[];$('import').disabled=true;msg(e.message,true);}
};
$('paste').addEventListener('input',()=>{$('import').disabled=true;pending=[];});
$('import').onclick=async()=>{if(!pending.length)return;
 if(!confirm(`Gravar ${pending.length} rotas no banco? Registros existentes não serão sobrescritos.`))return;
 $('import').disabled=true;try{await submit('DIARIO',pending);$('paste').value='';$('previewBox').innerHTML='';$('count').textContent='';pending=[];}catch(e){msg(e.message,true);}finally{$('import').disabled=!pending.length;}
};


// TELAS V3 — programação, SAC, consulta e histórico.
const statusLabel={AGUARDANDO:'Aguardando',EM_ROTA:'Em rota',ENTREGUE:'Entregue',
 OCORRENCIA:'Ocorrência',DEVOLUCAO:'Devolução',NAO_CONCLUIDA:'Não concluída'};
function setTab(tab){
 currentTab=tab;
 document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
 const imp=tab==='importacao';
 for(const id of ['tab-importacao','tab-recentes','tab-lotes'])$(id).classList.toggle('hidden',!imp);
 $('tab-workspace').classList.toggle('hidden',imp);
 if(!imp){
  $('workspace-title').textContent=tab==='programacao'?'Mesa de programação':tab==='sac'?'Acompanhamento SAC':'Consulta de rotas';
  $('workspace-subtitle').textContent=tab==='programacao'?'Atribua motoristas e placas sem alterar os dados do cliente.':tab==='sac'?'Atualize a situação das entregas e registre ocorrências.':'Consulte as rotas já gravadas no banco.';
  if(tab==='programacao')$('filter-status').value='SEM_MOTORISTA';
  else if(tab==='sac')$('filter-status').value='AGUARDANDO';
  else $('filter-status').value='';
  page=0;loadRoutes();
 }
}
document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>setTab(b.dataset.tab)));
async function loadRoutes(){
 if(!db)return;
 $('workspace-table').textContent='Carregando rotas...';
 const {data,error}=await db.rpc('pcd_list_routes',{
  p_search:$('filter-search').value.trim(),p_from:$('filter-from').value||null,
  p_to:$('filter-to').value||null,p_status:$('filter-status').value,
  p_limit:50,p_offset:page*50
 });
 if(error){msg('Erro ao consultar: '+error.message,true);$('workspace-table').textContent='Erro na consulta';return;}
 currentRows=data.rows||[];totalRows=Number(data.total)||0;
 $('result-info').textContent=`${totalRows} rota(s) encontrada(s)`;
 $('page-label').textContent=`Página ${page+1} de ${Math.max(1,Math.ceil(totalRows/50))}`;
 $('prev-page').disabled=page===0;$('next-page').disabled=(page+1)*50>=totalRows;
 const head=['Plano','Carregamento','Cidade','Perfil','Peso','Entregas','Motorista','Placa','SAC','Ação'];
 const rows=currentRows.map(r=>[r.plan_number,r.loading_on,r.city,r.vehicle_profile,
 r.gross_weight??'',r.delivery_count??'',r.driver_name||'Não escalado',r.plate||'',
 statusLabel[r.sac_status]||r.sac_status,'EDIT']);
 $('workspace-table').innerHTML=rows.length?table(head,rows):'<p class="muted">Nenhuma rota encontrada para os filtros.</p>';
 $('workspace-table').querySelectorAll('tbody tr').forEach((tr,i)=>{
  const cell=tr.lastElementChild;cell.textContent='';
  const b=document.createElement('button');b.className='editbtn';b.textContent=currentTab==='consulta'?'Detalhes':'Editar';
  b.onclick=()=>openEditor(currentRows[i]);cell.appendChild(b);
 });
}
$('filter-apply').onclick=()=>{page=0;loadRoutes();};
$('refresh').onclick=loadRoutes;
$('filter-clear').onclick=()=>{$('filter-search').value='';$('filter-from').value='';$('filter-to').value='';$('filter-status').value='';page=0;loadRoutes();};
$('prev-page').onclick=()=>{if(page>0){page--;loadRoutes();}};
$('next-page').onclick=()=>{if((page+1)*50<totalRows){page++;loadRoutes();}};
function openEditor(r){
 selected=r;
 $('editor-title').textContent=`Plano ${r.plan_number}`;
 $('editor-summary').textContent=`${r.loading_on||''} · ${r.city||''} · ${r.vehicle_profile||''} · Complemento: ${r.complement||'—'} · Destino: ${r.destination||'—'} · Peso: ${r.gross_weight??'—'} · Entregas: ${r.delivery_count??'—'} · Valor mercadoria: ${r.merchandise_value??'—'}`;
 $('edit-driver').value=r.driver_name||'';$('edit-plate').value=r.plate||'';
 $('edit-status').value=r.sac_status||'AGUARDANDO';$('edit-notes').value=r.sac_notes||'';
 $('history-content').textContent='';$('editor-backdrop').classList.remove('hidden');
}
$('close-editor').onclick=()=>{$('editor-backdrop').classList.add('hidden');selected=null;};
$('save-edit').onclick=async()=>{
 if(!selected)return;
 const status=$('edit-status').value,notes=$('edit-notes').value.trim();
 if(['OCORRENCIA','DEVOLUCAO','NAO_CONCLUIDA'].includes(status)&&!notes){msg('Informe a observação da ocorrência.',true);return;}
 if(!confirm(`Salvar alterações da rota ${selected.plan_number}?`))return;
 $('save-edit').disabled=true;
 try{
  const {error}=await db.rpc('pcd_update_route',{
   p_id:selected.id,p_driver:$('edit-driver').value,p_plate:$('edit-plate').value,
   p_status:status,p_notes:notes,p_expected_updated_at:selected.updated_at
  });
  if(error)throw error;
  $('editor-backdrop').classList.add('hidden');selected=null;
  await loadRoutes();await dashboard();msg('Rota atualizada com sucesso. Alteração registrada no histórico.');
 }catch(e){msg('Não foi possível salvar: '+e.message,true);}
 finally{$('save-edit').disabled=false;}
};
$('show-history').onclick=async()=>{
 if(!selected)return;
 $('history-content').textContent='Carregando histórico...';
 const {data,error}=await db.rpc('pcd_route_history',{p_id:selected.id});
 if(error){$('history-content').textContent=error.message;return;}
 $('history-content').innerHTML=(data||[]).length?
 table(['Data','Usuário','Antes','Depois'],data.map(x=>[
 new Date(x.created_at).toLocaleString('pt-BR'),x.actor_email||'—',
 JSON.stringify(x.before_data),JSON.stringify(x.after_data)])):'Nenhuma alteração operacional registrada.';
};
