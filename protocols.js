import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.49.8';
const $=id=>document.getElementById(id), cfg=window.INNOVA_PCD_CONFIG||window.INNOVA_CONFIG||window.APP_CONFIG||window.CONFIG;
const config=cfg||{};
const db=createClient(config.supabaseUrl||window.SUPABASE_URL,config.supabasePublishableKey||window.SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storage:window.localStorage}});
const fields=['invoice_number','invoiced_on','customer_code','customer_name','plan_number','city','gross_weight','invoice_value'];
const labels=['Nº Nota fiscal','Dt. Faturamento','Cliente','Descrição Cliente','Ordem de Frete','Cidade','Peso Bruto','Valor da NFe'];
const MAX_ITEMS=50;
const normalizeNF=v=>(String(v||'').replace(/\D/g,'').replace(/^0+/,'')||'0');
let rows=[],currentId=null, history=[], originalRows=[], isExisting=false;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const info=t=>{$('pr-feedback').textContent=t;};
const dateISO=v=>{let s=String(v??'').trim();if(!s)return null;if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;const m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);if(m)return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;return null;};
const dateBR=v=>{if(!v)return '';const m=String(v).match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?`${m[3]}/${m[2]}/${m[1]}`:v;};
const number=v=>{if(v===null||v===undefined||v==='')return null;if(typeof v==='number')return v;let s=String(v).replace(/R\$/g,'').replace(/\s/g,'');if(s.includes(',')&&s.includes('.'))s=s.replace(/\./g,'').replace(',','.');else if(s.includes(','))s=s.replace(',','.');const n=Number(s);return Number.isFinite(n)?n:null;};
function render(){
 const counts=new Map();for(const r of rows){const k=normalizeNF(r.invoice_number);if(r.invoice_number)counts.set(k,(counts.get(k)||0)+1);}
 $('pr-rows').innerHTML=rows.map((r,i)=>{
  const dup=r.invoice_number&&counts.get(normalizeNF(r.invoice_number))>1;
  const inactive=r.item_status==='INATIVO';
  const alert=(dup||r.prior_protocols?.length)?`<button type="button" class="pr-dup-alert" data-alert="${i}" title="Conferir duplicidade" aria-label="Conferir duplicidade">!</button>`:'';
  const status=inactive?'<span class="pr-status-inactive">Inativado</span>':r.added_after_close?'<span class="pr-status-added">Incluído depois</span>':'';
  const inputs=fields.map(k=>`<td>${k==='invoice_number'?alert:''}<input data-field="${k}" value="${esc(k==='invoiced_on'?dateBR(r[k]):r[k]??'')}" ${k==='invoice_number'?'inputmode="numeric"':''} ${isExisting?'readonly':''}></td>`).join('');
  const action=isExisting?(inactive?'':`<button class="pr-row-remove" data-inactivate="${i}" type="button" title="Inativar com justificativa" aria-label="Inativar registro">−</button>`):`<button class="pr-row-remove" data-remove="${i}" type="button" aria-label="Remover nota fiscal" title="Remover nota fiscal">×</button>`;
  return `<tr class="${inactive?'pr-inactive':''}" data-i="${i}"><td>${i+1}${status}</td>${inputs}<td>${action}</td></tr>`;
 }).reverse().join('');
 const active=rows.filter(r=>r.item_status!=='INATIVO').length;
 $('pr-limit').textContent=`${active}/${MAX_ITEMS} canhotos ativos`;
 $('pr-entry-counter').textContent=`${active}/${MAX_ITEMS}`;
 $('pr-current-count').textContent=`${active}/${MAX_ITEMS}`;
 $('pr-add').disabled=isExisting||active>=MAX_ITEMS;
 $('pr-add-nf').disabled=active>=MAX_ITEMS;
 $('pr-save').disabled=isExisting;
 $('pr-number').readOnly=true;
 $('pr-current').textContent=$('pr-number').value.trim()||'Novo';
 $('pr-revision').classList.toggle('hidden',!isExisting);
 info(`${rows.length} registro(s) na grade · ${active} ativo(s). ${isExisting?'Protocolo fechado: alterações somente por retificação.':'Confira antes de salvar.'}`);
}

function readGrid(){if(isExisting)return;rows=[...$('pr-rows').querySelectorAll('tr')].reverse().map((tr,i)=>({...rows[i],...Object.fromEntries([...tr.querySelectorAll('input[data-field]')].map(el=>[el.dataset.field,el.value.trim()]))}));}
function parseGrid(data){if(!data.length)throw Error('Arquivo vazio.');let header=data[0].map(v=>String(v??'').trim());const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');let indexes=labels.map(l=>header.findIndex(h=>norm(h)===norm(l)));if(indexes.some(i=>i<0))throw Error('O arquivo deve conter as oito colunas originais do relatório 3 Corações. Ausente: '+labels[indexes.indexOf(-1)]);const out=data.slice(1).filter(r=>r.some(x=>String(x??'').trim())).map(r=>Object.fromEntries(fields.map((f,i)=>[f,String(r[indexes[i]]??'').trim()])));if(!out.length)throw Error('Nenhuma nota encontrada.');return out;}
function parseDelimited(txt){const first=txt.split(/\r?\n/)[0];const sep=first.includes('\t')?'\t':first.includes(';')?';':',';const result=[];let row=[],cell='',quoted=false;for(let i=0;i<txt.length;i++){const c=txt[i];if(c==='"'){if(quoted&&txt[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===sep&&!quoted){row.push(cell);cell='';}else if((c==='\r'||c==='\n')&&!quoted){if(c==='\r'&&txt[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v.trim()))result.push(row);row=[];cell='';}else cell+=c;}row.push(cell);if(row.some(v=>v.trim()))result.push(row);return result;}
async function importFile(){try{const f=$('pr-file').files[0];let data;if(f){if(/\.xlsx$/i.test(f.name)){if(!window.XLSX)throw Error('Leitor Excel indisponível. Cole as linhas na caixa de texto.');const book=window.XLSX.read(await f.arrayBuffer(),{type:'array',cellDates:false});const sheet=book.Sheets[book.SheetNames[0]];data=window.XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:false});}else data=parseDelimited(await f.text());}else data=parseDelimited($('pr-paste').value);readGrid();rows.push(...parseGrid(data));render();}catch(e){info('Erro: '+e.message);}}
const PROTOCOL_FIRST_NUMBER=939;
async function nextProtocolNumber(){
 const {data,error}=await db.rpc('pcd_protocol_next_number');
 if(error){$('pr-number').value='';$('pr-current').textContent='Sequência indisponível';info('Não foi possível consultar a sequência. Execute INSTALAR_NUMERACAO_PROTOCOLOS.sql. '+error.message);return;}
 $('pr-number').value=data;$('pr-current').textContent=data;
}
async function newProtocol(){currentId=null;isExisting=false;rows=[];$('pr-number').value='';$('pr-date').value=new Date().toLocaleDateString('en-CA');render();await nextProtocolNumber();$('pr-invoice').focus();}
function validate(){readGrid();const num=$('pr-number').value.trim();if(!/^INNOVA[0-9]+$/i.test(num))throw Error('Informe um protocolo no padrão INNOVA944.');if(!dateISO($('pr-date').value))throw Error('Informe a data do protocolo.');if(!rows.length)throw Error('Adicione pelo menos uma nota.');if(rows.length>MAX_ITEMS)throw Error('Limite de 50 canhotos por protocolo.');return {number:num.toUpperCase(),date:$('pr-date').value,items:rows.map((r,i)=>{if(!r.invoice_number||!r.customer_code||!r.plan_number)throw Error(`Linha ${i+1}: NF, cliente e ordem de frete são obrigatórios.`);return {invoice_number:r.invoice_number,invoiced_on:dateISO(r.invoiced_on),customer_code:r.customer_code,customer_name:r.customer_name||null,plan_number:r.plan_number,city:r.city||null,gross_weight:number(r.gross_weight),invoice_value:number(r.invoice_value),line_no:i+1};})};}
async function save(){try{if(isExisting)throw Error('Protocolo fechado: utilize retificação, não o salvamento.');const v=validate();if(!confirm(`Salvar ${v.items.length} nota(s) no protocolo ${v.number}?`))return;const {data,error}=await db.rpc('pcd_protocol_save_auto',{p_date:v.date,p_items:v.items});if(error)throw error;currentId=data.id;$('pr-number').value=data.number;isExisting=true;render();info(`Protocolo ${data.number} salvo com ${v.items.length} nota(s).`);await loadHistory();}catch(e){info('Não foi possível salvar: '+e.message+' Confira se o SQL de instalação foi executado.');}}
async function loadHistory(){try{const {data,error}=await db.from('pcd_protocols').select('id,protocol_number,protocol_date,created_at,pcd_protocol_items(id,invoice_number,item_status,added_after_close)').order('created_at',{ascending:false}).limit(300);if(error)throw error;history=data||[];$('pr-total').textContent=history.length.toLocaleString('pt-BR');$('pr-items-total').textContent=history.reduce((a,r)=>a+(r.pcd_protocol_items?.filter(x=>x.item_status!=='INATIVO').length||0),0).toLocaleString('pt-BR');$('pr-revisions-total').textContent=history.reduce((a,r)=>a+(r.pcd_protocol_items?.filter(x=>x.item_status==='INATIVO'||x.added_after_close).length||0),0).toLocaleString('pt-BR');renderHistory();}catch(e){$('pr-history').textContent='Histórico indisponível: '+e.message;}}
function renderHistory(){const q=$('pr-search').value.trim().toLowerCase().replace(/^0+/,'');const found=history.filter(r=>!q||r.protocol_number.toLowerCase().includes(q)||r.pcd_protocol_items?.some(i=>String(i.invoice_number).replace(/^0+/,'').includes(q)));$('pr-history').innerHTML='<table><thead><tr><th>Protocolo</th><th>Data</th><th>Notas</th><th>Ação</th></tr></thead><tbody>'+found.map(r=>`<tr><td>${esc(r.protocol_number)}</td><td>${esc(dateBR(r.protocol_date))}</td><td>${r.pcd_protocol_items?.filter(x=>x.item_status!=='INATIVO').length||0}</td><td><button class="secondary small" data-open="${r.id}">Abrir</button></td></tr>`).join('')+'</tbody></table>'+(found.length?'':'Nenhum protocolo encontrado.');}
async function openProtocol(id){try{const {data,error}=await db.from('pcd_protocols').select('id,protocol_number,protocol_date,pcd_protocol_items(*)').eq('id',id).single();if(error)throw error;currentId=data.id;isExisting=true;$('pr-number').value=data.protocol_number;$('pr-date').value=data.protocol_date;rows=(data.pcd_protocol_items||[]).sort((a,b)=>a.line_no-b.line_no).map(r=>({...Object.fromEntries(fields.map(k=>[k,r[k]??''])),id:r.id,item_status:r.item_status,added_after_close:r.added_after_close}));await checkPriorForRows();render();await loadAudit();window.scrollTo({top:0,behavior:'smooth'});}catch(e){info('Erro ao abrir protocolo: '+e.message);}}
function report(){if(isExisting){return {number:$('pr-number').value.trim(),date:$('pr-date').value,items:rows.filter(r=>r.item_status!=='INATIVO')};}return validate();}
function pdf(){try{const v=report();const jsPDF=window.jspdf?.jsPDF;if(!jsPDF)throw Error('Biblioteca PDF não carregada.');const doc=new jsPDF({orientation:'landscape'});doc.setFontSize(16);doc.text('INNOVA | Protocolo de Canhotos'+(isExisting&&rows.some(r=>r.item_status==='INATIVO'||r.added_after_close)?' - RETIFICADO':''),14,16);doc.setFontSize(10);doc.text(`Protocolo: ${v.number}    Data: ${dateBR(v.date)}    Quantidade de notas: ${v.items.length}`,14,25);doc.autoTable({startY:32,head:[labels],body:v.items.map(r=>[r.invoice_number,dateBR(r.invoiced_on),r.customer_code,r.customer_name,r.plan_number,r.city,r.gross_weight??'',r.invoice_value??'']),styles:{fontSize:7},headStyles:{fillColor:[0,47,108]}});doc.save(v.number+'.pdf');}catch(e){info('PDF: '+e.message);}}
function csv(){try{const v=report();const data=[['Nº Protocolo INNOVA',...labels],...v.items.map(r=>[v.number,r.invoice_number,dateBR(r.invoiced_on),r.customer_code,r.customer_name,r.plan_number,r.city,r.gross_weight??'',r.invoice_value??''])];const content='\uFEFF'+data.map(r=>r.map(x=>'"'+String(x??'').replace(/"/g,'""')+'"').join(';')).join('\r\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'}));a.download=v.number+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}catch(e){info('CSV: '+e.message);}}
async function addInvoice(){
 const input=$('pr-invoice');const raw=input.value.trim();if(!/^\d+$/.test(raw)){info('Informe somente os dígitos da nota fiscal.');return;}
 readGrid();if(rows.length>=MAX_ITEMS){info('Limite de 50 canhotos por protocolo. Finalize este protocolo para iniciar outro.');input.focus();return;}const duplicateHere=rows.some(r=>r.item_status!=='INATIVO'&&normalizeNF(r.invoice_number)===normalizeNF(raw));
 const variants=[...new Set([raw,normalizeNF(raw),raw.padStart(9,'0')])];
 input.disabled=true;$('pr-add-nf').disabled=true;info('Consultando NF '+raw+' na base operacional...');
 try{
  const {data,error}=await db.from('pcd_v8_invoices').select('invoice_number,invoiced_on,customer_code,customer_name,plan_number,city,gross_weight,invoice_value').in('invoice_number',variants).limit(100);
  if(error)throw error;
  const matches=(data||[]).filter(r=>normalizeNF(r.invoice_number)===normalizeNF(raw));
  if(matches.length>1){info('A NF possui mais de um registro na base. Confira o plano e cliente na linha adicionada.');}
  const r=matches[0];const prior=await findPriorProtocols(raw);rows.push({...r?Object.fromEntries(fields.map(k=>[k,r[k]??''])):{invoice_number:raw},prior_protocols:prior});
  render();info((duplicateHere?'Atenção: NF repetida nesta grade. ':'')+(prior.length?'Já protocolada: '+prior.join(', ')+'. ':'')+(r?'NF preenchida automaticamente.':'NF não localizada; complete os campos.')); 
  input.value='';input.focus();
 }catch(e){info('Erro ao consultar NF: '+e.message);}finally{input.disabled=false;$('pr-add-nf').disabled=rows.length>=MAX_ITEMS;input.focus();}
}
async function findPriorProtocols(nf){
 const q=normalizeNF(nf);
 const {data,error}=await db.from('pcd_protocol_items').select('invoice_number,protocol_id,pcd_protocols(protocol_number)').in('invoice_number',[...new Set([nf,normalizeNF(nf),String(nf).padStart(9,'0')])]).limit(500);
 if(error){console.warn('Histórico de NF indisponível',error.message);return [];}
 return [...new Set((data||[]).filter(x=>normalizeNF(x.invoice_number)===q&&x.protocol_id!==currentId).map(x=>x.pcd_protocols?.protocol_number).filter(Boolean))];
}
async function checkPriorForRows(){
 const {data,error}=await db.from('pcd_protocol_items').select('invoice_number,protocol_id,pcd_protocols(protocol_number)').limit(1000);
 if(error)return;
 for(const r of rows)r.prior_protocols=[...new Set((data||[]).filter(x=>x.protocol_id!==currentId&&normalizeNF(x.invoice_number)===normalizeNF(r.invoice_number)).map(x=>x.pcd_protocols?.protocol_number).filter(Boolean))];
}
function protocolDialog({title,body,confirmLabel='Excluir registro'}){
 return new Promise(resolve=>{
  const overlay=$('pr-modal'),dialog=overlay.querySelector('.pr-modal-dialog');
  $('pr-modal-title').textContent=title;
  $('pr-modal-body').innerHTML=body;
  $('pr-modal-remove').textContent=confirmLabel;
  overlay.classList.remove('hidden');
  const previous=document.activeElement;
  const done=value=>{overlay.classList.add('hidden');overlay.removeEventListener('keydown',onKey);overlay.removeEventListener('click',onOutside);$('pr-modal-remove').onclick=null;$('pr-modal-keep').onclick=null;$('pr-modal-close').onclick=null;previous?.focus?.();resolve(value);};
  const onKey=e=>{if(e.key==='Escape'){e.preventDefault();done(false);}if(e.key==='Tab'){const buttons=[...dialog.querySelectorAll('button')];if(e.shiftKey&&document.activeElement===buttons[0]){e.preventDefault();buttons.at(-1).focus();}else if(!e.shiftKey&&document.activeElement===buttons.at(-1)){e.preventDefault();buttons[0].focus();}}};
  const onOutside=e=>{if(e.target===overlay)done(false);};
  $('pr-modal-remove').onclick=()=>done(true);$('pr-modal-keep').onclick=()=>done(false);$('pr-modal-close').onclick=()=>done(false);
  overlay.addEventListener('keydown',onKey);overlay.addEventListener('click',onOutside);$('pr-modal-keep').focus();
 });
}
async function showDuplicateAlert(index){
 const r=rows[index];if(!r)return;
 const dup=rows.some((x,i)=>i!==index&&x.item_status!=='INATIVO'&&normalizeNF(x.invoice_number)===normalizeNF(r.invoice_number));
 const prior=r.prior_protocols||[];
 const body=`<p class="pr-modal-nf">Nota fiscal ${esc(r.invoice_number)}</p>`+
  (dup?'<p>Este canhoto <strong>já consta neste protocolo</strong>.</p>':'')+
  (prior.length?`<p>Já registrado anteriormente em: <strong>${esc(prior.join(', '))}</strong>.</p>`:'')+
  '<p class="pr-modal-warning">Se optar pela exclusão, <strong>retire também o canhoto físico do protocolo</strong>. A decisão de manter o documento é sua.</p>';
 const remove=await protocolDialog({title:'Canhoto já registrado',body,confirmLabel:isExisting?'Inativar registro':'Excluir registro'});
 if(!remove)return;
 if(isExisting)await reviseInactivate(index);else{readGrid();rows.splice(index,1);render();}
}

async function loadAudit(){
 const el=$('pr-audit');if(!currentId){el.textContent='';return;}
 const {data,error}=await db.from('pcd_protocol_item_audit').select('action,reason,changed_at,item_id').eq('protocol_id',currentId).order('changed_at',{ascending:false});
 if(error){el.textContent='Histórico de retificações indisponível (execute a migração SQL).';return;}
 el.innerHTML=(data||[]).length?'<h3>Histórico de retificações</h3><table><thead><tr><th>Data</th><th>Ação</th><th>Justificativa</th></tr></thead><tbody>'+(data||[]).map(x=>`<tr><td>${esc(new Date(x.changed_at).toLocaleString('pt-BR'))}</td><td>${esc(x.action)}</td><td>${esc(x.reason)}</td></tr>`).join('')+'</tbody></table>':'Nenhuma retificação registrada.';
}
async function reviseInactivate(index){
 const r=rows[index];if(!r?.id||r.item_status==='INATIVO')return;
 if(!confirm(`Inativar NF ${r.invoice_number}?\nConfirme que o canhoto NÃO foi enviado fisicamente.\nO registro original permanecerá no histórico.`))return;
 const reason=prompt('Justificativa obrigatória (mínimo 10 caracteres):');if(reason===null)return;
 if(reason.trim().length<10){info('Justificativa deve conter pelo menos 10 caracteres.');return;}
 const {error}=await db.rpc('pcd_protocol_revise',{p_protocol_id:currentId,p_action:'INATIVACAO',p_reason:reason.trim(),p_item_id:r.id});
 if(error){info('Falha na retificação: '+error.message);return;}
 await openProtocol(currentId);info('Canhoto inativado; histórico preservado. Retire o documento físico, se ainda estiver no lote.');
}
async function reviseAdd(){
 if(!currentId)return;
 const raw=$('pr-revision-nf').value.trim();if(!/^\d+$/.test(raw)){info('Informe a NF para inclusão posterior.');return;}
 const reason=prompt('Por que este canhoto foi enviado fisicamente e não constou no protocolo? (mínimo 10 caracteres)');
 if(reason===null)return;if(reason.trim().length<10){info('Justificativa deve conter pelo menos 10 caracteres.');return;}
 const variants=[...new Set([raw,normalizeNF(raw),raw.padStart(9,'0')])];
 const {data,error}=await db.from('pcd_v8_invoices').select(fields.join(',')).in('invoice_number',variants).limit(100);
 if(error){info('Erro ao buscar NF: '+error.message);return;}
 const item=(data||[]).find(x=>normalizeNF(x.invoice_number)===normalizeNF(raw));
 if(!item){info('NF não localizada na base operacional. Verifique o número antes da retificação.');return;}
 if(!confirm(`Adicionar NF ${raw} ao protocolo fechado? A inclusão será auditada e exigirá nova emissão do PDF retificado.`))return;
 const {error:revError}=await db.rpc('pcd_protocol_revise',{p_protocol_id:currentId,p_action:'INCLUSAO_POSTERIOR',p_reason:reason.trim(),p_item:item});
 if(revError){info('Falha na inclusão: '+revError.message);return;}
 $('pr-revision-nf').value='';await openProtocol(currentId);info('NF incluída por retificação. Gere a versão atualizada do documento e confira o envio ao cliente.');
}
$('pr-revision-add').onclick=reviseAdd;
$('pr-add-nf').onclick=addInvoice;
// Captura o Enter antes de outros atalhos globais e mantém o foco para digitação contínua.
const protocolInvoiceInput=$('pr-invoice');
protocolInvoiceInput.addEventListener('keydown',e=>{
 if(e.key!=='Enter'||e.isComposing||e.repeat)return;
 e.preventDefault();
 e.stopPropagation();
 if(protocolInvoiceInput.disabled)return;
 addInvoice().catch(err=>{
  console.error('Falha ao adicionar NF pelo Enter',err);
  info('Falha ao adicionar NF: '+(err?.message||String(err)));
  protocolInvoiceInput.disabled=false;
  $('pr-add-nf').disabled=false;
  protocolInvoiceInput.focus();
 });
},true);
$('pr-rows').addEventListener('click',async e=>{
 const a=e.target.closest('[data-alert]');if(a){await showDuplicateAlert(Number(a.dataset.alert));return;}
 const b=e.target.closest('[data-remove]');if(b){readGrid();rows.splice(Number(b.dataset.remove),1);render();return;}
 const c=e.target.closest('[data-inactivate]');if(c){await reviseInactivate(Number(c.dataset.inactivate));}
});
$('pr-number').addEventListener('input',()=>{$('pr-current').textContent=$('pr-number').value||'Novo';});
$('pr-new').onclick=()=>newProtocol();
$('pr-add').onclick=()=>{readGrid();if(rows.length>=MAX_ITEMS){info('Limite de 50 canhotos por protocolo.');return;}rows.push(Object.fromEntries(fields.map(k=>[k,''])));render();};
$('pr-save').onclick=save;$('pr-pdf').onclick=pdf;$('pr-csv').onclick=csv;$('pr-refresh').onclick=loadHistory;$('pr-find').onclick=renderHistory;
$('pr-history').onclick=e=>{const b=e.target.closest('[data-open]');if(b)openProtocol(b.dataset.open);};
window.addEventListener('innova-protocols-open',()=>{if(!$('pr-date').value)$('pr-date').value=new Date().toLocaleDateString('en-CA');loadHistory();if(!isExisting&&!$('pr-number').value)nextProtocolNumber();});

// Destinatários de protocolos: cadastro independente dos destinatários do SAC.
const recOcc=$('recipient-occ-panel'),recProto=$('recipient-protocol-panel');
$('recipient-tab-occ').onclick=()=>{recOcc.classList.remove('hidden');recProto.classList.add('hidden');};
$('recipient-tab-protocol').onclick=()=>{recOcc.classList.add('hidden');recProto.classList.remove('hidden');loadProtocolRecipients();};
async function loadProtocolRecipients(){
 const el=$('pr-rec-table');
 try{
  const {data,error}=await db.from('pcd_protocol_recipients').select('id,display_name,email,recipient_type,active').order('display_name');
  if(error)throw error;
  el.innerHTML='<table><thead><tr><th>Nome</th><th>E-mail</th><th>Tipo</th><th>Situação</th></tr></thead><tbody>'+(data||[]).map(r=>`<tr><td>${esc(r.display_name||'')}</td><td>${esc(r.email)}</td><td>${esc(r.recipient_type)}</td><td><button type="button" class="secondary small" data-proto-rec="${esc(r.id)}" data-next="${r.active?'false':'true'}">${r.active?'ATIVO':'INATIVO'}</button></td></tr>`).join('')+'</tbody></table>';
  el.querySelectorAll('[data-proto-rec]').forEach(btn=>btn.onclick=async()=>{
   const next=btn.dataset.next==='true';
   if(!confirm((next?'Ativar':'Inativar')+' este destinatário de protocolos?'))return;
   const {error}=await db.from('pcd_protocol_recipients').update({active:next}).eq('id',btn.dataset.protoRec);
   if(error){$('pr-rec-feedback').textContent='Falha: '+error.message;return;}
   loadProtocolRecipients();
  });
 }catch(e){el.textContent='Cadastro indisponível: '+e.message+' (execute o SQL complementar).';}
}
$('pr-rec-add').onclick=async()=>{
 const display_name=$('pr-rec-name').value.trim(),email=$('pr-rec-email').value.trim().toLowerCase(),recipient_type=$('pr-rec-type').value;
 if(!display_name||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){$('pr-rec-feedback').textContent='Informe nome e e-mail válido.';return;}
 const {error}=await db.from('pcd_protocol_recipients').upsert({display_name,email,recipient_type,active:true},{onConflict:'email'});
 if(error){$('pr-rec-feedback').textContent='Não foi possível cadastrar: '+error.message;return;}
 $('pr-rec-name').value='';$('pr-rec-email').value='';$('pr-rec-feedback').textContent='Destinatário salvo.';loadProtocolRecipients();
};

// Previsualização do próximo número ao iniciar o módulo.
if($('pr-number')&&!$('pr-number').value)nextProtocolNumber();
