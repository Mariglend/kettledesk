'use strict'
// ═══ PACCHETTI E PAGAMENTI ═══════════════════════════════════════

const PERIODS={month:N_('Questo mese'), last_month:N_('Mese scorso'), quarter:N_('Ultimi 3 mesi'), year:N_("Quest'anno"), all:N_('Sempre')}
function periodRange(p){
  const n=new Date(), y=n.getFullYear(), m=n.getMonth()
  switch(p){
    case 'last_month': return {start:new Date(y,m-1,1), end:new Date(y,m,0,23,59,59)}
    case 'quarter': return {start:new Date(y,m-2,1), end:new Date(y,m+1,0,23,59,59)}
    case 'year': return {start:new Date(y,0,1), end:new Date(y,11,31,23,59,59)}
    case 'all': return {start:new Date(2000,0,1), end:new Date(2100,0,1)}
    default: return {start:new Date(y,m,1), end:new Date(y,m+1,0,23,59,59)}
  }
}
function prevRange(p){
  const r=periodRange(p), len=r.end-r.start
  if(p==='month'||p==='last_month'){ const s=new Date(r.start); s.setMonth(s.getMonth()-1); return {start:s, end:new Date(r.start.getTime()-1)} }
  if(p==='year') return {start:new Date(r.start.getFullYear()-1,0,1), end:new Date(r.start.getFullYear()-1,11,31,23,59,59)}
  return {start:new Date(r.start.getTime()-len), end:new Date(r.start.getTime()-1)}
}
function inRange(iso, r){ if(!iso) return false; const d=new Date(String(iso).length===10?iso+'T12:00':iso); return d>=r.start && d<=r.end }

const Money = {
  period:'month', view:'open',

  paid(p){ return DB.payments.filter(x=>x.packageId===p.id).reduce((a,x)=>a+num(x.amount),0) },
  due(p){ return Math.max(0, num(p.price)-Money.paid(p)) },
  clientDue(cid){ return DB.packages.filter(p=>p.clientId==cid).reduce((a,p)=>a+Money.due(p),0) },
  // Quanto doveva essere già pagato secondo il piano rate
  expectedBy(p, iso=todayISO()){
    if(!p.installments?.length) return 0
    return p.installments.filter(i=>i.dueDate<=iso).reduce((a,i)=>a+num(i.amount),0)
  },
  overdue(p){ return Math.max(0, Money.expectedBy(p)-Money.paid(p)) },
  nextInstallment(p){
    let cum=0; const paid=Money.paid(p)
    for(const i of [...(p.installments||[])].sort((a,b)=>a.dueDate.localeCompare(b.dueDate))){ cum+=num(i.amount); if(cum>paid+0.005) return {...i, left:Math.min(num(i.amount), cum-paid)} }
    return null
  },
  status(p){
    const due=Money.due(p)
    if(num(p.price)<=0) return [t('Prezzo non indicato'),'']
    if(due<=0.005) return [t('Pagato'),'green']
    if(Money.overdue(p)>0.005) return [t('In ritardo'),'red']
    return [Money.paid(p)>0?t('Parziale'):t('Da pagare'),'amber']
  },
  overdueCount(){ return isAdmin() ? DB.packages.filter(p=>Money.overdue(p)>0.005).length : 0 },
  openPackages(){ return DB.packages.filter(p=>Money.due(p)>0.005 && Store.client(p.clientId)) },
  priceLabel(label){ return `${label} (${currencySymbol()})` },

  lessonsStrip(p){
    const used=[], all=Object.values(DB.attendance).filter(a=>a.packageId===p.id && (a.s==='present'||a.s==='late'))
    all.forEach(a=>used.push(a.s))
    const n=Math.min(p.lessons||0, 60)
    return `<div class="lessons" title="${t('{used} usate su {tot}',{used:Store.pkgUsed(p), tot:p.lessons})}">${[...Array(n)].map((_,i)=>`<i class="${used[i]==='present'?'u':used[i]==='late'?'l':''}"></i>`).join('')}</div>`
  },

  // ── Scheda cliente: pacchetti (e pagamenti per l'admin) ─────
  clientTab(c, el){
    const pk=Store.packagesOf(c.id)
    const cur=Store.activePackage(c.id)
    const pays=DB.payments.filter(p=>p.clientId==c.id).sort((a,b)=>b.date.localeCompare(a.date))
    const totPaid=pays.reduce((a,p)=>a+num(p.amount),0)
    el.innerHTML=`
      ${isAdmin()?`<div class="kpis k3">
        <div class="kpi"><div class="l"><i class="ti ti-receipt"></i>${t('Pagato in totale')}</div><div class="v">${eur(totPaid)}</div></div>
        <div class="kpi ${Money.clientDue(c.id)>0.005?'warn':''}"><div class="l"><i class="ti ti-hourglass"></i>${t('Da incassare')}</div><div class="v">${eur(Money.clientDue(c.id))}</div></div>
        <div class="kpi"><div class="l"><i class="ti ti-ticket"></i>${t('Pacchetti acquistati')}</div><div class="v">${pk.length}</div></div></div>`:''}
      <div class="head" style="margin-bottom:14px"><div><h1 style="font-size:22px">${t('Pacchetti')}</h1></div>
        ${isAdmin()?`<div class="actions"><button class="btn btn-line" onclick="Money.payDialog(${c.id})"><i class="ti ti-cash"></i> ${t('Registra pagamento')}</button><button class="btn btn-brass" onclick="Money.sellDialog(${c.id})"><i class="ti ti-plus"></i> ${t('Vendi pacchetto')}</button></div>`:''}</div>
      ${pk.map(p=>{
        const rem=Store.pkgRemaining(p), exp=Store.pkgExpired(p)
        const [st,stc]=Money.status(p), nx=Money.nextInstallment(p)
        const dates=[t('Acquistato il {date}',{date:fmtDate(p.purchaseDate)}), p.expiryDate?(exp?t('scaduto il {date}',{date:fmtDate(p.expiryDate)}):t('scade il {date}',{date:fmtDate(p.expiryDate)})):''].filter(Boolean).join(', ')
        return `<div class="pkg ${cur?.id===p.id?'current':''}">
          <div class="pkg-top"><div><h4>${esc(p.name)}</h4><span>${dates}</span></div>
            <div style="display:flex;gap:6px;align-items:center">${cur?.id===p.id?`<span class="tag brass">${t('In corso')}</span>`:exp?`<span class="tag red">${t('Scaduto')}</span>`:rem<=0?`<span class="tag">${t('Esaurito')}</span>`:''}
            ${isAdmin()?`<span class="tag ${stc}">${st}</span><button class="btn btn-ghost btn-icon btn-sm" aria-label="${t('Modifica pacchetto')}" onclick="Money.editPackage('${p.id}')"><i class="ti ti-pencil"></i></button>`:''}</div></div>
          ${Money.lessonsStrip(p)}
          <div class="faint" style="font-size:13px">${t('<b>{used}</b> lezioni usate su {tot}, <b>{rem}</b> rimaste',{used:Store.pkgUsed(p), tot:p.lessons, rem:Math.max(0,rem)}).replace(/<b>/g,'<b style="color:var(--ink)">')}</div>
          ${isAdmin()?`<div class="money"><div><div class="l">${t('Prezzo')}</div><div class="v">${eur(p.price)}</div></div><div><div class="l">${t('Pagato')}</div><div class="v">${eur(Money.paid(p))}</div></div>
            <div><div class="l">${nx?t('Prossima rata {date}',{date:fmtShort(nx.dueDate)}):t('Residuo')}</div><div class="v" style="${Money.due(p)>0.005?'color:var(--red)':''}">${eur(nx?nx.left:Money.due(p))}</div></div></div>
            ${Money.due(p)>0.005?`<div style="margin-top:12px;display:flex;gap:8px"><button class="btn btn-primary btn-sm" onclick="Money.payDialog(${c.id},'${p.id}')"><i class="ti ti-cash"></i> ${t('Registra pagamento')}</button>
              ${c.phone?`<a class="btn btn-line btn-sm" target="_blank" rel="noopener" href="${Money.reminderLink(p)}"><i class="ti ti-brand-whatsapp"></i> ${t('Promemoria')}</a>`:''}</div>`:''}`:''}
        </div>`}).join('') || `<div class="panel"><div class="empty"><i class="ti ti-ticket-off"></i><b>${t('Nessun pacchetto')}</b>${isAdmin()?t('Vendi il primo pacchetto: le lezioni verranno scalate a ogni presenza.'):t("Solo l'amministratore può registrare i pacchetti.")}</div></div>`}
      ${isAdmin()?`<div class="panel" style="margin-top:22px"><div class="panel-h"><h3>${t('Pagamenti ricevuti')}</h3></div><div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>${t('Data')}</th><th>${t('Pacchetto')}</th><th>${t('Metodo')}</th><th>${t('Nota')}</th><th class="r">${t('Importo')}</th><th></th></tr></thead>
        <tbody>${pays.map(py=>Money.payRow(py,false)).join('')||`<tr><td colspan="6"><div class="empty">${t('Nessun pagamento registrato.')}</div></td></tr>`}</tbody></table></div></div>`:''}`
  },
  payRow(py, withClient=true){
    const c=Store.client(py.clientId), p=py.packageId&&Store.pkg(py.packageId)
    return `<tr><td>${fmtDate(py.date)}</td>${withClient?`<td><a href="#" onclick="go('cliente',${py.clientId});return false" class="strong" style="text-decoration:none">${esc(Store.fullName(c))}</a></td>`:''}
      <td>${p?esc(p.name):`<span class="faint">${t('Altro')}</span>`}</td><td>${esc(py.method||'')}</td><td class="faint">${esc(py.note||'')}</td>
      <td class="r strong">${eur(py.amount)}</td>
      <td class="r" style="white-space:nowrap"><button class="btn btn-ghost btn-icon btn-sm" title="${t('Stampa ricevuta')}" onclick="Money.receipt('${py.id}')"><i class="ti ti-printer"></i></button>
        <button class="btn btn-ghost btn-icon btn-sm" title="${t('Elimina')}" onclick="Money.delPayment('${py.id}')"><i class="ti ti-trash"></i></button></td></tr>`
  },
  reminderLink(p){
    const c=Store.client(p.clientId), nx=Money.nextInstallment(p)
    const amount=nx?nx.left:Money.due(p)
    const txt = nx
      ? t('Ciao {name}, ti ricordo il saldo di {amount} per “{pkg}” (scadenza {date}). Grazie, {studio}',{name:c.firstName, amount:eur(amount,2), pkg:p.name, date:fmtDate(nx.dueDate), studio:studioName()})
      : t('Ciao {name}, ti ricordo il saldo di {amount} per “{pkg}”. Grazie, {studio}',{name:c.firstName, amount:eur(amount,2), pkg:p.name, studio:studioName()})
    return waLink(c.phone, txt)
  },

  // ── Vendita pacchetto ──────────────────────────────────────
  sellDialog(cid){
    const L=DB.settings.listino
    const methods=DB.settings.methods
    Money._autoName=t('Pacchetto {n} lezioni',{n:10})
    openDialog({title:t('Vendi pacchetto'), sub:esc(Store.fullName(Store.client(cid))), size:'wide',
      body:`${L.length?`<div class="field"><label for="sp-list">${t('Dal listino')}</label><select class="in" id="sp-list" onchange="Money.fillFromList(this.value)"><option value="">${t('Personalizzato')}</option>${L.map(l=>`<option value="${l.id}">${esc(l.name)}, ${tp(l.lessons,'1 lezione','{n} lezioni')}, ${eur(l.price)}</option>`).join('')}</select></div>`
          :`<div class="note"><i class="ti ti-list-details"></i><div>${t('Puoi salvare i pacchetti che vendi più spesso nel listino, in Impostazioni.')}</div></div>`}
        <div class="row3"><div class="field" style="grid-column:span 2"><label for="sp-name">${t('Nome')}</label><input class="in" id="sp-name" value="${esc(Money._autoName)}"></div>
          <div class="field"><label for="sp-lessons">${t('Lezioni')}</label><input class="in" type="number" min="1" id="sp-lessons" value="10" oninput="Money.syncName()"></div></div>
        <div class="row3"><div class="field"><label for="sp-price">${Money.priceLabel(t('Prezzo'))}</label><input class="in" type="number" step="0.01" id="sp-price" oninput="Money.updPlan()"></div>
          <div class="field"><label for="sp-date">${t('Data acquisto')}</label><input class="in" type="date" id="sp-date" value="${todayISO()}" onchange="Money.updExpiry()"></div>
          <div class="field"><label for="sp-exp">${t('Scadenza')}</label><input class="in" type="date" id="sp-exp"><small id="sp-exp-hint"></small></div></div>
        <div class="divider"></div>
        <div class="field"><label>${t('Pagamento')}</label></div>
        <div class="seg" style="margin-bottom:14px" id="sp-mode">${[['full',t('Tutto ora')],['deposit',t('Acconto')],['rate',t('A rate')],['later',t('Più avanti')]].map(([v,l],i)=>`<button type="button" class="${i===0?'active':''}" data-v="${v}" onclick="Money.setMode('${v}')">${l}</button>`).join('')}</div>
        <div id="sp-now" class="row3"><div class="field"><label for="sp-amount">${Money.priceLabel(t('Importo incassato ora'))}</label><input class="in" type="number" step="0.01" id="sp-amount"></div>
          <div class="field"><label for="sp-method">${t('Metodo')}</label><select class="in" id="sp-method">${methods.map(m=>`<option>${esc(m)}</option>`).join('')}</select></div></div>
        <div id="sp-rate" class="hidden"><div class="row3"><div class="field"><label for="sp-n">${t('Numero rate')}</label><input class="in" type="number" min="2" max="24" id="sp-n" value="3" oninput="Money.updPlan()"></div>
          <div class="field"><label for="sp-first">${t('Prima rata')}</label><input class="in" type="date" id="sp-first" value="${todayISO()}" onchange="Money.updPlan()"></div>
          <div class="field"><label>${t('Cadenza')}</label><select class="in" id="sp-every" onchange="Money.updPlan()"><option value="1">${t('Mensile')}</option><option value="0.5">${t('Ogni 2 settimane')}</option></select></div></div>
          <label class="check"><input type="checkbox" id="sp-firstpaid" checked> <span>${t('La prima rata viene pagata oggi')}</span></label>
          <div id="sp-plan" class="faint" style="font-size:13px"></div></div>
        <div class="field" style="margin-top:8px"><label for="sp-note">${t('Nota')}</label><input class="in" id="sp-note"></div>`,
      foot:`<button class="btn btn-line" onclick="closeDialog()">${t('Annulla')}</button><button class="btn btn-brass" onclick="Money.saveSell(${cid})">${t('Registra vendita')}</button>`,
      onOpen:()=>{ Money._mode='full'; Money._validity=null; Money.updExpiry() }})
  },
  _validity:null,
  fillFromList(id){
    const l=DB.settings.listino.find(x=>x.id===id); if(!l) return
    document.getElementById('sp-name').value=l.name
    document.getElementById('sp-lessons').value=l.lessons
    document.getElementById('sp-price').value=l.price
    Money._validity=l.validityDays||null
    Money.updExpiry(); Money.updPlan()
  },
  // Il nome segue il numero di lezioni finché non viene cambiato a mano
  syncName(){
    const el=document.getElementById('sp-name')
    if(el.value!==Money._autoName) return
    Money._autoName=t('Pacchetto {n} lezioni',{n:val('sp-lessons')})
    el.value=Money._autoName
  },
  updExpiry(){
    const days=Money._validity
    const hint=document.getElementById('sp-exp-hint')
    if(days){ document.getElementById('sp-exp').value=addDays(val('sp-date')||todayISO(), days); hint.textContent=t('Validità {n} giorni dal listino',{n:days}) }
    else hint.textContent=t('Facoltativa')
  },
  setMode(m){
    Money._mode=m
    document.querySelectorAll('#sp-mode button').forEach(b=>b.classList.toggle('active', b.dataset.v===m))
    document.getElementById('sp-now').classList.toggle('hidden', m==='rate'||m==='later')
    document.getElementById('sp-rate').classList.toggle('hidden', m!=='rate')
    if(m==='full') document.getElementById('sp-amount').value=val('sp-price')
    if(m==='deposit') document.getElementById('sp-amount').value=''
    Money.updPlan()
  },
  planFrom(){
    const price=num(val('sp-price')), n=Math.max(2,Math.min(24,parseInt(val('sp-n'))||3))
    const every=parseFloat(val('sp-every'))||1, first=val('sp-first')||todayISO()
    const base=Math.floor(price/n*100)/100
    return [...Array(n)].map((_,i)=>({id:uid('in'), dueDate: every===1?addMonths(first,i):addDays(first,i*14), amount: i===n-1 ? Math.round((price-base*(n-1))*100)/100 : base}))
  },
  updPlan(){
    if(Money._mode==='full'){ const a=document.getElementById('sp-amount'); if(a) a.value=val('sp-price') }
    if(Money._mode!=='rate') return
    const plan=Money.planFrom()
    document.getElementById('sp-plan').innerHTML=num(val('sp-price'))>0 ? t('Piano: {plan}',{plan:plan.map(i=>`${fmtShort(i.dueDate)} ${eur(i.amount,2)}`).join(', ')}) : t('Inserisci il prezzo per vedere il piano.')
  },
  saveSell(cid){
    const lessons=parseInt(val('sp-lessons')), price=num(val('sp-price'))
    if(!lessons||lessons<1){ toast(t('Indica il numero di lezioni'),'err'); return }
    const p={id:uid('pk'), clientId:cid, name:val('sp-name')||t('Pacchetto {n} lezioni',{n:lessons}), lessons, price, purchaseDate:val('sp-date')||todayISO(), expiryDate:val('sp-exp'), installments:[], note:val('sp-note')}
    const m=Money._mode
    if(m==='rate' && price<=0){ toast(t('Per le rate serve il prezzo'),'err'); return }
    DB.packages.push(p)
    if(m==='full'||m==='deposit'){
      const amount=num(val('sp-amount'))
      if(amount>0) Money.addPayment({clientId:cid, packageId:p.id, amount, date:p.purchaseDate, method:val('sp-method'), note:m==='deposit'?t('Acconto'):''})
    }
    if(m==='rate'){
      p.installments=Money.planFrom()
      if(checked('sp-firstpaid')) Money.addPayment({clientId:cid, packageId:p.id, amount:p.installments[0].amount, date:todayISO(), method:DB.settings.methods[0], note:t('Prima rata')})
    }
    Store.save(); closeDialog(); refresh(); toast(t('Pacchetto registrato'))
  },

  addPayment(o){
    const py={id:uid('py'), number:DB.seq.receipt++, ...o, amount:Math.round(num(o.amount)*100)/100}
    DB.payments.push(py); return py
  },
  payDialog(cid, pkgId){
    const c=cid?Store.client(cid):null
    const clients=Store.myClients({archived:true}).sort(Clients.byName)
    openDialog({title:t('Registra pagamento'),
      body:`${c?'':`<div class="field"><label for="py-client">${t('Cliente')}</label><select class="in" id="py-client" onchange="Money.fillPkgs(this.value)"><option value="">${t('Scegli…')}</option>${clients.map(x=>`<option value="${x.id}">${esc(Store.fullName(x))}${Money.clientDue(x.id)>0.005?', '+t('da incassare {amount}',{amount:eur(Money.clientDue(x.id))}):''}</option>`).join('')}</select></div>`}
        <div class="field"><label for="py-pkg">${t('Per')}</label><select class="in" id="py-pkg" onchange="Money.suggestAmount()"></select></div>
        <div class="row"><div class="field"><label for="py-amount">${Money.priceLabel(t('Importo'))}</label><input class="in" type="number" step="0.01" id="py-amount"></div>
          <div class="field"><label for="py-date">${t('Data')}</label><input class="in" type="date" id="py-date" value="${todayISO()}"></div></div>
        <div class="row"><div class="field"><label for="py-method">${t('Metodo')}</label><select class="in" id="py-method">${DB.settings.methods.map(m=>`<option>${esc(m)}</option>`).join('')}</select></div>
          <div class="field"><label for="py-note">${t('Nota')}</label><input class="in" id="py-note" placeholder="${t('es. seconda rata')}"></div></div>
        <label class="check"><input type="checkbox" id="py-print"> <span>${t('Stampa la ricevuta dopo il salvataggio')}</span></label>`,
      foot:`<button class="btn btn-line" onclick="closeDialog()">${t('Annulla')}</button><button class="btn btn-primary" onclick="Money.savePay(${cid||'null'})">${t('Registra pagamento')}</button>`,
      onOpen:()=>{ if(c) Money.fillPkgs(c.id, pkgId) }})
  },
  fillPkgs(cid, pkgId){
    const sel=document.getElementById('py-pkg')
    const pk=Store.packagesOf(cid)
    const open=pk.filter(p=>Money.due(p)>0.005)
    sel.innerHTML=[...open, ...pk.filter(p=>!open.includes(p))].map(p=>`<option value="${p.id}" ${p.id===pkgId?'selected':''}>${esc(p.name)} (${fmtShort(p.purchaseDate)}), ${Money.due(p)>0.005?t('residuo {amount}',{amount:eur(Money.due(p),2)}):t('saldato')}</option>`).join('')+`<option value="">${t('Altro, non legato a un pacchetto')}</option>`
    if(pkgId) sel.value=pkgId
    Money.suggestAmount()
  },
  suggestAmount(){
    const p=Store.pkg(val('py-pkg')); const a=document.getElementById('py-amount')
    if(!p){ a.value=''; return }
    const nx=Money.nextInstallment(p)
    a.value = nx ? nx.left.toFixed(2) : Money.due(p)>0 ? Money.due(p).toFixed(2) : ''
  },
  savePay(cid){
    cid = cid || val('py-client')
    if(!cid){ toast(t('Scegli il cliente'),'err'); return }
    const amount=num(val('py-amount'))
    if(amount<=0){ toast(t('Inserisci un importo'),'err'); return }
    const py=Money.addPayment({clientId:Number(cid), packageId:val('py-pkg')||null, amount, date:val('py-date')||todayISO(), method:val('py-method'), note:val('py-note')})
    Store.save(); const pr=checked('py-print'); closeDialog(); refresh(); toast(t('Pagamento registrato'))
    if(pr) Money.receipt(py.id)
  },
  delPayment(id){
    const py=DB.payments.find(p=>p.id===id)
    confirmBox(t('Eliminare il pagamento di {amount} del {date}?',{amount:eur(py.amount,2), date:fmtDate(py.date)}), ()=>{ DB.payments=DB.payments.filter(p=>p.id!==id); Store.save(); refresh(); toast(t('Pagamento eliminato')) }, {yes:t('Elimina')})
  },

  // ── Modifica pacchetto e rate ──────────────────────────────
  editPackage(id){
    const p=Store.pkg(id); Money._inst=(p.installments||[]).map(i=>({...i}))
    openDialog({title:t('Modifica pacchetto'), size:'wide',
      body:`<div class="row3"><div class="field" style="grid-column:span 2"><label for="ep-name">${t('Nome')}</label><input class="in" id="ep-name" value="${esc(p.name)}"></div>
          <div class="field"><label for="ep-lessons">${t('Lezioni')}</label><input class="in" type="number" id="ep-lessons" value="${p.lessons}"></div></div>
        <div class="row3"><div class="field"><label for="ep-price">${Money.priceLabel(t('Prezzo'))}</label><input class="in" type="number" step="0.01" id="ep-price" value="${p.price||''}"></div>
          <div class="field"><label for="ep-date">${t('Data acquisto')}</label><input class="in" type="date" id="ep-date" value="${p.purchaseDate||''}"></div>
          <div class="field"><label for="ep-exp">${t('Scadenza')}</label><input class="in" type="date" id="ep-exp" value="${p.expiryDate||''}"></div></div>
        <div class="field"><label for="ep-note">${t('Nota')}</label><input class="in" id="ep-note" value="${esc(p.note||'')}"></div>
        <div class="divider"></div>
        <div class="field"><label>${t('Piano rate')}</label><small>${t('Le scadenze servono per sapere cosa è in ritardo. Senza rate, il residuo resta semplicemente da incassare.')}</small></div>
        <div id="ep-inst"></div>`,
      foot:`<div class="left"><button class="btn btn-danger btn-sm" onclick="Money.delPackage('${p.id}')"><i class="ti ti-trash"></i> ${t('Elimina pacchetto')}</button></div>
        <button class="btn btn-line" onclick="closeDialog()">${t('Annulla')}</button><button class="btn btn-primary" onclick="Money.savePackage('${p.id}')">${t('Salva modifiche')}</button>`,
      onOpen:()=>Money.renderInst()})
  },
  renderInst(){
    const el=document.getElementById('ep-inst')
    el.innerHTML=Money._inst.map((i,k)=>`<div class="row3" style="align-items:end"><div class="field"><label>${t('Scadenza')}</label><input class="in" type="date" value="${i.dueDate}" onchange="Money._inst[${k}].dueDate=this.value"></div>
      <div class="field"><label>${Money.priceLabel(t('Importo'))}</label><input class="in" type="number" step="0.01" value="${i.amount}" onchange="Money._inst[${k}].amount=num(this.value)"></div>
      <div class="field"><button class="btn btn-ghost btn-sm" onclick="Money._inst.splice(${k},1);Money.renderInst()"><i class="ti ti-trash"></i> ${t('Rimuovi')}</button></div></div>`).join('')
      +`<button class="btn btn-line btn-sm" onclick="Money._inst.push({id:uid('in'),dueDate:Money._inst.length?addMonths(Money._inst[Money._inst.length-1].dueDate,1):todayISO(),amount:0});Money.renderInst()"><i class="ti ti-plus"></i> ${t('Aggiungi rata')}</button>`
  },
  savePackage(id){
    const p=Store.pkg(id)
    Object.assign(p,{name:val('ep-name'), lessons:parseInt(val('ep-lessons'))||p.lessons, price:num(val('ep-price')), purchaseDate:val('ep-date'), expiryDate:val('ep-exp'), note:val('ep-note'),
      installments:Money._inst.filter(i=>i.dueDate&&num(i.amount)>0).sort((a,b)=>a.dueDate.localeCompare(b.dueDate))})
    const tot=p.installments.reduce((a,i)=>a+num(i.amount),0)
    const mismatch=p.installments.length && Math.abs(tot-p.price)>0.01
    Store.save(); closeDialog(); refresh()
    toast(mismatch ? t('Salvato. Nota: le rate sommano {tot}, il prezzo è {price}',{tot:eur(tot,2), price:eur(p.price,2)}) : t('Pacchetto aggiornato'), mismatch?'warn':'')
  },
  delPackage(id){
    const p=Store.pkg(id), n=DB.payments.filter(x=>x.packageId===id).length
    const msg=[t('Eliminare “{name}”?',{name:esc(p.name)}), n?tp(n,'Il pagamento collegato resta registrato come “Altro”.','I {n} pagamenti collegati restano registrati come “Altro”.'):'', t('Le presenze restano, ma non scaleranno più da questo pacchetto.')].filter(Boolean).join(' ')
    confirmBox(msg, ()=>{
      DB.packages=DB.packages.filter(x=>x.id!==id)
      DB.payments.forEach(x=>{ if(x.packageId===id) x.packageId=null })
      Object.values(DB.attendance).forEach(a=>{ if(a.packageId===id) a.packageId=null })
      Store.save(); closeAllDialogs(); refresh(); toast(t('Pacchetto eliminato'))
    }, {yes:t('Elimina')})
  },

  // ── Ricevuta (non fiscale) ─────────────────────────────────
  receipt(id){
    const py=DB.payments.find(p=>p.id===id), c=Store.client(py.clientId), p=py.packageId&&Store.pkg(py.packageId), s=DB.settings.studio
    printHtml(`<div class="pr-head"><div><div class="mono">${esc(studioMono())}</div><div style="margin-top:6px;font-weight:600">${esc(studioName())}</div><div style="font-size:10pt;color:#555">${esc(s.address)}${s.vat?`<br>${t('P. IVA')} ${esc(s.vat)}`:''}</div></div>
        <div style="text-align:right"><h1>${t('Ricevuta di pagamento')}</h1><div>${t('n. {num} del {date}',{num:py.number||'—', date:fmtDate(py.date)})}</div></div></div>
      <p style="margin:24px 0 8px">${t('Ricevuto da <b>{name}</b>',{name:esc(Store.fullName(c))})}</p>
      <table class="pr-tbl"><thead><tr><th>${t('Descrizione')}</th><th>${t('Metodo')}</th><th style="text-align:right">${t('Importo')}</th></tr></thead>
        <tbody><tr><td>${p?esc(p.name):t('Servizi di personal training')}${py.note?` (${esc(py.note)})`:''}</td><td>${esc(py.method||'')}</td><td style="text-align:right;font-weight:700">${eur(py.amount,2)}</td></tr></tbody></table>
      ${p?`<p style="margin-top:14px;font-size:10.5pt">${t('Prezzo del pacchetto {price}, pagato finora {paid}, residuo {due}.',{price:eur(p.price,2), paid:eur(Money.paid(p),2), due:eur(Money.due(p),2)})}</p>`:''}
      <div style="margin-top:60px;display:flex;justify-content:flex-end"><div style="border-top:1px solid #999;width:220px;text-align:center;padding-top:6px;font-size:10pt">${t('Firma')}</div></div>
      <div class="pr-foot">${t('Documento non valido ai fini fiscali.')}</div>`)
  },

  // ── Pagina Pagamenti (solo admin) ──────────────────────────
  render(){
    const r=periodRange(Money.period), pr=prevRange(Money.period)
    const pays=DB.payments.filter(p=>inRange(p.date,r))
    const prevPays=DB.payments.filter(p=>inRange(p.date,pr))
    const sold=DB.packages.filter(p=>inRange(p.purchaseDate,r))
    const incassato=pays.reduce((a,p)=>a+num(p.amount),0), prevInc=prevPays.reduce((a,p)=>a+num(p.amount),0)
    const venduto=sold.reduce((a,p)=>a+num(p.price),0)
    const open=Money.openPackages()
    const daIncassare=open.reduce((a,p)=>a+Money.due(p),0)
    const ritardo=DB.packages.reduce((a,p)=>a+Money.overdue(p),0)
    const lez=sold.reduce((a,p)=>a+(p.lessons||0),0)
    const d=prevInc>0?Math.round((incassato-prevInc)/prevInc*100):null
    // Ultimi 12 mesi
    const n=new Date(), months=[...Array(12)].map((_,i)=>{ const m=new Date(n.getFullYear(), n.getMonth()-11+i, 1); return {m, key:m.getFullYear()+'-'+String(m.getMonth()+1).padStart(2,'0'), inc:0, sold:0} })
    DB.payments.forEach(p=>{ const k=(p.date||'').slice(0,7); const x=months.find(m=>m.key===k); if(x) x.inc+=num(p.amount) })
    DB.packages.forEach(p=>{ const k=(p.purchaseDate||'').slice(0,7); const x=months.find(m=>m.key===k); if(x) x.sold+=num(p.price) })
    const mx=Math.max(1,...months.map(m=>Math.max(m.inc,m.sold)))
    const byMethod={}; pays.forEach(p=>{ const k=p.method||t('Non indicato'); byMethod[k]=(byMethod[k]||0)+num(p.amount) })
    const byTrainer={}; pays.forEach(p=>{ const tr=Store.trainer(Store.client(p.clientId)?.trainerId); const k=tr?.name||t('Senza trainer'); byTrainer[k]=(byTrainer[k]||0)+num(p.amount) })
    const hb=(obj)=>{ const e=Object.entries(obj).sort((a,b)=>b[1]-a[1]); const m=Math.max(1,...e.map(x=>x[1])); return e.length?`<div class="hbars">${e.map(([k,v])=>`<div class="hb"><span>${esc(k)}</span><div class="bar brass"><div style="width:${v/m*100}%"></div></div><span class="r">${eur(v)}</span></div>`).join('')}</div>`:`<div class="faint">${t('Nessun incasso nel periodo.')}</div>` }

    const openRows=open.map(p=>({p, c:Store.client(p.clientId), od:Money.overdue(p), nx:Money.nextInstallment(p)}))
      .sort((a,b)=>b.od-a.od || (a.nx?.dueDate||'9').localeCompare(b.nx?.dueDate||'9'))
    document.getElementById('page-incassi').innerHTML=`
      <div class="head"><div><h1>${t('Pagamenti')}</h1><p>${t('Incassi, crediti aperti e rate. Visibile solo agli amministratori.')}</p></div>
        <div class="actions"><select class="in" style="width:170px" onchange="Money.period=this.value;Money.render()">${Object.entries(PERIODS).map(([k,l])=>`<option value="${k}" ${Money.period===k?'selected':''}>${t(l)}</option>`).join('')}</select>
          <button class="btn btn-line" onclick="Money.exportCsv()"><i class="ti ti-file-spreadsheet"></i> ${t('Esporta')}</button>
          <button class="btn btn-line" onclick="Money.payDialog()"><i class="ti ti-cash"></i> ${t('Registra pagamento')}</button>
          <button class="btn btn-brass" onclick="Money.pickClientToSell()"><i class="ti ti-plus"></i> ${t('Vendi pacchetto')}</button></div></div>
      <div class="kpis k5">
        <div class="kpi"><div class="l"><i class="ti ti-cash"></i>${t('Incassato')}</div><div class="v">${eur(incassato)}</div><div class="s">${Money.period==='all'?t("dall'inizio"):t('{trend} rispetto al periodo prima',{trend:trend(d)})}</div></div>
        <div class="kpi"><div class="l"><i class="ti ti-ticket"></i>${t('Venduto')}</div><div class="v">${eur(venduto)}</div><div class="s">${tp(sold.length,'1 pacchetto','{n} pacchetti')}, ${tp(lez,'1 lezione','{n} lezioni')}</div></div>
        <div class="kpi click" onclick="Money.view='open';Money.render()"><div class="l"><i class="ti ti-hourglass"></i>${t('Da incassare')}</div><div class="v">${eur(daIncassare)}</div><div class="s">${tp(open.length,'1 pacchetto aperto','{n} pacchetti aperti')}</div></div>
        <div class="kpi ${ritardo>0.005?'warn':'good'}"><div class="l"><i class="ti ti-alarm"></i>${t('In ritardo')}</div><div class="v">${eur(ritardo)}</div><div class="s">${t('rate scadute non pagate')}</div></div>
        <div class="kpi"><div class="l"><i class="ti ti-calculator"></i>${t('Prezzo medio lezione')}</div><div class="v">${lez?eur(venduto/lez,2):'—'}</div><div class="s">${t('sui pacchetti del periodo')}</div></div>
      </div>
      <div class="grid-main">
        <div class="panel"><div class="panel-h"><h3>${t('Ultimi 12 mesi')}</h3><div class="legend" style="margin:0"><span><i class="sw" style="background:var(--forest-3)"></i>${t('Incassato')}</span><span><i class="sw" style="background:var(--brass-2)"></i>${t('Venduto')}</span></div></div>
          <div class="panel-b"><div class="vbars" style="gap:10px">${months.map(m=>`<div class="vb" style="flex-direction:row;align-items:flex-end;gap:2px" title="${fmtMonth(m.m,true)}: ${t('incassato {a}, venduto {b}',{a:eur(m.inc), b:eur(m.sold)})}">
            <div style="height:${m.inc/mx*100}%;min-height:${m.inc?2:0}px"></div><div style="height:${m.sold/mx*100}%;min-height:${m.sold?2:0}px;background:var(--brass-2)"></div></div>`).join('')}</div>
            <div class="vlabels" style="gap:10px">${months.map(m=>`<span>${fmtMonth(m.m)}</span>`).join('')}</div></div></div>
        <div><div class="panel"><div class="panel-h"><h3>${t('Per metodo')}</h3><span class="faint" style="font-size:12px">${t(PERIODS[Money.period])}</span></div><div class="panel-b">${hb(byMethod)}</div></div>
          ${DB.trainers.length>1?`<div class="panel"><div class="panel-h"><h3>${t('Per trainer')}</h3></div><div class="panel-b">${hb(byTrainer)}</div></div>`:''}</div>
      </div>
      <div class="tabs">
        <button class="tab ${Money.view==='open'?'active':''}" onclick="Money.view='open';Money.render()">${t('Crediti aperti')} <span class="count">${open.length}</span></button>
        <button class="tab ${Money.view==='moves'?'active':''}" onclick="Money.view='moves';Money.render()">${t('Movimenti del periodo')} <span class="count">${pays.length}</span></button>
        <button class="tab ${Money.view==='sold'?'active':''}" onclick="Money.view='sold';Money.render()">${t('Pacchetti venduti')} <span class="count">${sold.length}</span></button>
      </div>
      <div class="panel"><div class="tbl-wrap"><table class="tbl">${
        Money.view==='open' ? `<thead><tr><th>${t('Cliente')}</th><th>${t('Pacchetto')}</th><th class="r">${t('Prezzo')}</th><th class="r">${t('Pagato')}</th><th class="r">${t('Residuo')}</th><th>${t('Prossima scadenza')}</th><th>${t('Stato')}</th><th></th></tr></thead>
          <tbody>${openRows.map(({p,c,od,nx})=>{ const [st,stc]=Money.status(p); return `<tr>
            <td><div class="cell-person">${avatar(Store.fullName(c),'sm')}<a href="#" class="strong" style="text-decoration:none" onclick="go('cliente',${c.id});return false">${esc(Store.fullName(c))}</a></div></td>
            <td>${esc(p.name)}</td><td class="r">${eur(p.price)}</td><td class="r">${eur(Money.paid(p))}</td><td class="r strong">${eur(Money.due(p),2)}</td>
            <td>${nx?`${fmtDate(nx.dueDate)}, ${eur(nx.left,2)}`:`<span class="faint">${t('nessuna rata')}</span>`}</td><td><span class="tag ${stc}">${st}${od>0.005?' '+eur(od,2):''}</span></td>
            <td class="r" style="white-space:nowrap">${c.phone?`<a class="btn btn-ghost btn-icon btn-sm" title="${t('Promemoria WhatsApp')}" target="_blank" rel="noopener" href="${Money.reminderLink(p)}"><i class="ti ti-brand-whatsapp"></i></a>`:''}
              <button class="btn btn-primary btn-sm" onclick="Money.payDialog(${c.id},'${p.id}')">${t('Incassa')}</button></td></tr>`}).join('')
            || `<tr><td colspan="8"><div class="empty"><i class="ti ti-circle-check" style="color:var(--green)"></i><b>${t('Nessun credito aperto')}</b>${t('Tutti i pacchetti con prezzo sono saldati.')}</div></td></tr>`}</tbody>`
        : Money.view==='moves' ? `<thead><tr><th>${t('Data')}</th><th>${t('Cliente')}</th><th>${t('Pacchetto')}</th><th>${t('Metodo')}</th><th>${t('Nota')}</th><th class="r">${t('Importo')}</th><th></th></tr></thead>
          <tbody>${pays.sort((a,b)=>b.date.localeCompare(a.date)).map(p=>Money.payRow(p)).join('')||`<tr><td colspan="7"><div class="empty">${t('Nessun incasso nel periodo.')}</div></td></tr>`}</tbody>`
        : `<thead><tr><th>${t('Data')}</th><th>${t('Cliente')}</th><th>${t('Pacchetto')}</th><th class="r">${t('Lezioni')}</th><th class="r">${t('Prezzo')}</th><th class="r">${t('A lezione')}</th><th>${t('Stato')}</th></tr></thead>
          <tbody>${sold.sort((a,b)=>(b.purchaseDate||'').localeCompare(a.purchaseDate||'')).map(p=>{ const c=Store.client(p.clientId); const [st,stc]=Money.status(p); return `<tr class="click" onclick="go('cliente',${p.clientId},'packages')">
            <td>${fmtDate(p.purchaseDate)}</td><td class="strong">${esc(Store.fullName(c))}</td><td>${esc(p.name)}</td><td class="r">${p.lessons}</td><td class="r">${eur(p.price)}</td><td class="r">${p.lessons&&p.price?eur(p.price/p.lessons,2):'—'}</td><td><span class="tag ${stc}">${st}</span></td></tr>`}).join('')
            ||`<tr><td colspan="7"><div class="empty">${t('Nessun pacchetto venduto nel periodo.')}</div></td></tr>`}</tbody>`
      }</table></div></div>`
  },
  pickClientToSell(){
    const list=Store.myClients().sort(Clients.byName)
    openDialog({title:t('Vendi pacchetto'), body:`<div class="field"><label for="pk-client">${t('Cliente')}</label><select class="in" id="pk-client"><option value="">${t('Scegli…')}</option>${list.map(c=>`<option value="${c.id}">${esc(Store.fullName(c))}</option>`).join('')}</select></div>`,
      foot:`<button class="btn btn-line" onclick="closeDialog()">${t('Annulla')}</button><button class="btn btn-primary" onclick="Money.pickedClient()">${t('Continua')}</button>`})
  },
  pickedClient(){
    const v=val('pk-client')
    if(!v){ toast(t('Scegli un cliente'),'err'); return }
    closeDialog(); Money.sellDialog(Number(v))
  },
  exportCsv(){
    const r=periodRange(Money.period)
    const rows=[[t('Data'),t('Ricevuta'),t('Cliente'),t('Pacchetto'),t('Metodo'),t('Nota'),t('Importo')]]
    DB.payments.filter(p=>inRange(p.date,r)).sort((a,b)=>a.date.localeCompare(b.date)).forEach(p=>rows.push([p.date,p.number||'',Store.fullName(Store.client(p.clientId)),Store.pkg(p.packageId)?.name||t('Altro'),p.method||'',p.note||'',numText(p.amount)]))
    downloadText(`${t('pagamenti')}-${Money.period}-${todayISO()}.csv`, toCsv(rows))
  },
}

// CSV per Excel: separatore ";" dove la virgola è il separatore decimale, altrimenti ","
function csvSep(){ return (1.5).toLocaleString(locale()).includes(',') ? ';' : ',' }
function csvCell(v, sep){ const s=v==null?'':String(v); return (s.includes(sep)||/["\n\r]/.test(s))?'"'+s.replace(/"/g,'""')+'"':s }
function toCsv(rows){ const sep=csvSep(); return '﻿'+rows.map(r=>r.map(v=>csvCell(v,sep)).join(sep)).join('\r\n') }
function downloadText(name, text){
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'})); a.download=name
  document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove() }, 500)
}
RENDER.incassi = Money.render
