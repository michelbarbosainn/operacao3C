
import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.49.8';
const $=id=>document.getElementById(id);
let db=null, pending=[];
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
$('login').onclick=async()=>{try{
 const url=$('url').value.trim(),key=$('key').value.trim();if(!url.startsWith('https://')||!key)throw Error('Informe URL HTTPS e chave pública.');
 db=createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true}});
 const {data,error}=await db.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});
 if(error)throw error;
 const {error:check}=await db.rpc('pcd_dashboard');if(check)throw check;
 localStorage.setItem('pcd_url',url);localStorage.setItem('pcd_public_key',key);
 $('who').textContent=data.user.email;$('setup').classList.add('hidden');$('app').classList.remove('hidden');$('logout').classList.remove('hidden');
 await dashboard();msg('Conectado. Banco pronto para importações.');
 }catch(e){msg(e.message,true);}
};
$('logout').onclick=async()=>{await db?.auth.signOut();location.reload();};
$('url').value=localStorage.getItem('pcd_url')||'';
$('key').value=localStorage.getItem('pcd_public_key')||'';
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
 $('previewBox').innerHTML=table(['Plano','Carregamento','Cidade','Perfil','Motorista','Placa'],
 pending.slice(0,30).map(x=>[x.plan_number,x.loading_on,x.city,x.vehicle_profile,x.driver_name,x.plate]));
 $('import').disabled=false;msg('Prévia pronta. Confira os dados antes de confirmar.');
 }catch(e){pending=[];$('import').disabled=true;msg(e.message,true);}
};
$('paste').addEventListener('input',()=>{$('import').disabled=true;pending=[];});
$('import').onclick=async()=>{if(!pending.length)return;
 if(!confirm(`Gravar ${pending.length} rotas no banco? Registros existentes não serão sobrescritos.`))return;
 $('import').disabled=true;try{await submit('DIARIO',pending);$('paste').value='';$('previewBox').innerHTML='';$('count').textContent='';pending=[];}catch(e){msg(e.message,true);}finally{$('import').disabled=false;}
};
