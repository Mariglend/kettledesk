'use strict'
// ═══ CORE: stato globale, utilità, navigazione, finestre ═══════════

const API = window.electronAPI
let DB = null            // tutti i dati del gestionale (vedi store.js)
let CU = null            // trainer connesso
let EVENTS = []          // eventi Google Calendar (cache + live)
let currentPage = 'dashboard'
let currentClientId = null

const LS = {
  clientId: 'ap_google_client_id',
  lastUser: 'ap_last_user',
  token:    'ap_google_token',
  bkDir:    'ap_backup_dir',
  bkAuto:   'ap_backup_auto',
  bkLast:   'ap_backup_last',
}

// ── Utilità ────────────────────────────────────────────────────
function esc(s){ return s==null ? '' : String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;') }
function uid(p='x'){ return p + Date.now().toString(36) + Math.random().toString(36).slice(2,7) }
function normName(s){ return (s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^\p{L}\p{N} ]/gu,' ').replace(/\s+/g,' ').trim() }
function isAdmin(){ return CU?.role === 'admin' }
function todayISO(){ const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0') }
function isoOf(d){ d=new Date(d); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0') }
function addDays(iso, n){ const d=new Date(iso+'T12:00'); d.setDate(d.getDate()+n); return isoOf(d) }
function addMonths(iso, n){ const d=new Date(iso+'T12:00'); const day=d.getDate(); d.setDate(1); d.setMonth(d.getMonth()+n); d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth()+1, 0).getDate())); return isoOf(d) }
function fmtDate(d, opts={day:'numeric',month:'short',year:'numeric'}){ if(!d) return '—'; const x=new Date(String(d).length===10?d+'T12:00':d); return isNaN(x)?'—':x.toLocaleDateString(locale(),opts) }
function fmtShort(d){ return fmtDate(d,{day:'numeric',month:'short'}) }
function fmtTime(d){ return new Date(d).toLocaleTimeString(locale(),{hour:'2-digit',minute:'2-digit'}) }
function fmtDay(d){ return new Date(d).toLocaleDateString(locale(),{weekday:'long',day:'numeric',month:'long'}) }
function fmtMonth(d, long){ return new Date(d).toLocaleDateString(locale(),long?{month:'long',year:'numeric'}:{month:'short'}) }
function fmtWeekday(d){ return new Date(d).toLocaleDateString(locale(),{weekday:'short'}) }
// Importi nella valuta scelta in Impostazioni (predefinita euro)
function currency(){ return DB?.settings?.currency || 'EUR' }
function eur(n, dec){
  n=Number(n)||0
  const d=dec??(n%1?2:0)
  try{ return n.toLocaleString(locale(),{style:'currency', currency:currency(), minimumFractionDigits:d, maximumFractionDigits:Math.max(d,2)}) }
  catch{ return n.toFixed(d)+' '+currency() }
}
function currencySymbol(){ try{ return (0).toLocaleString(locale(),{style:'currency',currency:currency()}).replace(/[\d\s., ]/g,'') || currency() }catch{ return currency() } }
function numText(n){ return (Number(n)||0).toLocaleString(locale(),{useGrouping:false, maximumFractionDigits:2}) }
function num(v){ const n=parseFloat(String(v??'').replace(',','.')); return isNaN(n)?0:n }
function initialsOf(name){ return (name||'?').split(/\s+/).filter(Boolean).map(w=>[...w][0]).join('').toUpperCase().slice(0,2) }
const AV_COLORS=['#2F6B57','#3E6A8A','#8A6A36','#7A4E6B','#4F6B3A','#6B5B4E','#355C6B','#8A4B3F']
function avColor(key){ let h=0; for(const ch of String(key||'')) h=(h*31+ch.charCodeAt(0))>>>0; return AV_COLORS[h%AV_COLORS.length] }
function avatar(name, cls='', color){ return `<span class="av ${cls}" style="background:${esc(color||avColor(name))}">${esc(initialsOf(name))}</span>` }
function pct(a,b){ return b>0 ? Math.round(a/b*100) : 0 }
function trend(d){ return d===null?'<span class="flat">—</span>':d===0?`<span class="flat">${t('stabile')}</span>`:d>0?`<span class="up">+${d}%</span>`:`<span class="down">${d}%</span>` }
function debounce(fn, ms){ let tm; return (...a)=>{ clearTimeout(tm); tm=setTimeout(()=>fn(...a), ms) } }
// Numero internazionale per WhatsApp: se manca il prefisso usa quello predefinito dello studio
function phoneDigits(p){
  let d=String(p||'').replace(/[^0-9+]/g,'')
  if(d.startsWith('+')) return d.slice(1)
  if(d.startsWith('00')) return d.slice(2)
  const pre=String(DB?.settings?.phonePrefix||'').replace(/\D/g,'')
  if(!pre) return d
  if(d.startsWith(pre) && d.length>pre.length+8) return d
  return pre + (pre==='39' ? d : d.replace(/^0/,''))
}
function waLink(phone, text){ return `https://wa.me/${phoneDigits(phone)}${text?'?text='+encodeURIComponent(text):''}` }
function val(id){ const el=document.getElementById(id); return el ? el.value.trim() : '' }
function checked(id){ return !!document.getElementById(id)?.checked }

// ── Marchio: nome dello studio (da Impostazioni) e iniziali del personal trainer titolare ──
const APP_NAME = 'Kettledesk'
function studioName(){ return DB?.settings?.studio?.name?.trim() || APP_NAME }
function studioMono(){
  // Iniziali del titolare: il primo amministratore del team (es. Anna Rossi → AR)
  const owner=(DB?.trainers||[]).find(x=>x.role==='admin' && x.active!==false) || (typeof CU!=='undefined' && CU)
  const w=(owner?.name||'').trim().split(/\s+/).filter(Boolean)
  if(!w.length) return 'KD'
  return ([...w[0]][0] + (w.length>1 ? [...w[w.length-1]][0] : '')).toUpperCase()
}
function applyBrand(){
  document.querySelectorAll('[data-brand-name]').forEach(el=>el.textContent=studioName())
  document.querySelectorAll('[data-brand-mono]').forEach(el=>el.textContent=studioMono())
  document.title = DB?.settings?.studio?.name?.trim() ? `${studioName()} — ${APP_NAME}` : APP_NAME
}
function renderMe(){
  if(!CU) return
  document.getElementById('me-name').textContent=CU.name
  document.getElementById('me-role').textContent=CU.role==='admin'?t('Amministratore'):t('Trainer')
  const av=document.getElementById('me-av'); av.textContent=initialsOf(CU.name); av.style.background=CU.color
}

// ── Messaggi ───────────────────────────────────────────────────
let toastTimer
function toast(msg, kind=''){
  const el=document.getElementById('toast')
  el.className='show '+kind
  el.innerHTML=`<i class="ti ${kind==='err'?'ti-alert-circle':kind==='warn'?'ti-cloud-off':'ti-check'}"></i>${esc(msg)}`
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.className='', kind==='err'?5000:3200)
}

// ── Finestre di dialogo ────────────────────────────────────────
// openDialog({title, sub, body, foot, size, onOpen}) → elemento; closeDialog() chiude l'ultima
const dlgStack=[]
function openDialog({title, sub='', body='', foot='', size='', onOpen}){
  const back=document.createElement('div')
  back.className='dlg-back'
  back.innerHTML=`<div class="dlg ${size}" role="dialog" aria-modal="true">
    <div class="dlg-h"><div><h2>${title}</h2>${sub?`<p>${sub}</p>`:''}</div><button class="x-btn" aria-label="${t('Chiudi')}" onclick="closeDialog()"><i class="ti ti-x"></i></button></div>
    <div class="dlg-b">${body}</div>
    ${foot?`<div class="dlg-f">${foot}</div>`:''}
  </div>`
  back.addEventListener('mousedown', e=>{ if(e.target===back) closeDialog() })
  document.getElementById('dlg-root').appendChild(back)
  dlgStack.push(back)
  const first=back.querySelector('input:not([type=hidden]):not([type=checkbox]),select,textarea')
  if(first) setTimeout(()=>first.focus(), 30)
  if(onOpen) onOpen(back)
  return back
}
function closeDialog(){ const d=dlgStack.pop(); if(d) d.remove() }
function closeAllDialogs(){ while(dlgStack.length) closeDialog() }
document.addEventListener('keydown', e=>{ if(e.key==='Escape' && dlgStack.length) closeDialog() })

function confirmBox(msg, onYes, {title, yes, danger=true}={}){
  window.__confirmCb = ()=>{ closeDialog(); onYes() }
  openDialog({title:title||t('Conferma'), body:`<p style="font-size:14.5px;line-height:1.6">${msg}</p>`,
    foot:`<button class="btn btn-line" onclick="closeDialog()">${t('Annulla')}</button><button class="btn ${danger?'btn-danger':'btn-primary'}" onclick="__confirmCb()">${esc(yes||t('Conferma'))}</button>`})
}

// ── Stampa ─────────────────────────────────────────────────────
function printHtml(html){
  const area=document.getElementById('print-area')
  area.innerHTML=html
  document.body.classList.add('printing')
  setTimeout(()=>{ window.print(); document.body.classList.remove('printing'); area.innerHTML='' }, 60)
}

// ── Navigazione ────────────────────────────────────────────────
const NAV = [
  {id:'dashboard',   icon:'ti-layout-grid',      label:N_('Oggi')},
  {id:'calendario',  icon:'ti-calendar',         label:N_('Calendario'), count:()=>Ev.inbox().length},
  {id:'clienti',     icon:'ti-users',            label:N_('Clienti')},
  {id:'statistiche', icon:'ti-chart-histogram',  label:N_('Statistiche')},
  {sep:true, admin:true},
  {id:'incassi',     icon:'ti-wallet',           label:N_('Pagamenti'), admin:true, count:()=>Money.overdueCount()},
  {id:'team',        icon:'ti-id-badge-2',       label:N_('Team'), admin:true},
  {id:'impostazioni',icon:'ti-adjustments-horizontal', label:N_('Impostazioni'), admin:true},
]
const RENDER = {}   // popolato dai moduli: RENDER.dashboard = fn …

function renderNav(){
  document.getElementById('side-nav').innerHTML = NAV.filter(n=>!n.admin||isAdmin()).map(n=>{
    if(n.sep) return '<div class="nav-sep"></div>'
    const c = n.count ? n.count() : 0
    const active = currentPage===n.id || (n.id==='clienti' && currentPage==='cliente')
    return `<button class="nav ${active?'active':''}" onclick="go('${n.id}')"><i class="ti ${n.icon}"></i>${t(n.label)}${c?`<span class="count">${c}</span>`:''}</button>`
  }).join('')
}

function go(page, arg, tab){
  const adminOnly = ['incassi','team','impostazioni']
  if(adminOnly.includes(page) && !isAdmin()) page='dashboard'
  if(page==='cliente'){
    const c = Store.client(arg ?? currentClientId)
    if(!c || !Store.canSee(c)) page='clienti'
    else { if(c.id!=currentClientId) Clients.tab='overview'; if(tab) Clients.tab=tab; currentClientId = c.id }
  }
  currentPage = page
  document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active', p.id==='page-'+page))
  renderNav()
  RENDER[page]?.()
  document.querySelector('.main').scrollTop=0
  window.scrollTo(0,0)
}
// Ridisegna la pagina corrente (dopo un salvataggio o una sincronizzazione)
function refresh(){ if(!CU) return; renderNav(); RENDER[currentPage]?.() }
