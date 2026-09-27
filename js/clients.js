'use strict'
// ═══ CLIENTI: elenco, scheda, anagrafica, misure, foto, note ═══════

const Clients = {
  q:'', status:'active', trainer:'', flag:'', tab:'overview', selPhotos:[],

  // Mappa clientId → eventi (calcolata una volta per disegno)
  eventMap(){
    const m=new Map()
    for(const e of EVENTS){ const c=Ev.clientOf(e); if(c){ if(!m.has(c.id)) m.set(c.id,[]); m.get(c.id).push(e) } }
    return m
  },
  ageOf(c){
    if(c.birth){ const b=new Date(c.birth), n=new Date(); let a=n.getFullYear()-b.getFullYear(); if(n<new Date(n.getFullYear(), b.getMonth(), b.getDate())) a--; return a }
    return c.age||null
  },
  byName(a,b){ return Store.fullName(a).localeCompare(Store.fullName(b), locale()) },

  renderList(){
    const em=Clients.eventMap(), now=Date.now()
    const q=normName(Clients.q)
    let list=Store.myClients({archived:true})
    if(Clients.status!=='all') list=list.filter(c=>Clients.status==='archived' ? c.status==='archived' : c.status!=='archived')
    if(Clients.trainer) list=list.filter(c=>c.trainerId===Clients.trainer)
    if(q) list=list.filter(c=>normName(Store.fullName(c)+' '+c.aliases.join(' ')+' '+(c.phone||'')).includes(q))
    const rows=list.map(c=>{
      const evs=em.get(c.id)||[]
      const last=[...evs].reverse().find(e=>new Date(e.start).getTime()<now)
      const next=evs.find(e=>new Date(e.start).getTime()>=now)
      const p=Store.currentPackage(c.id)
      const due=isAdmin()?Money.clientDue(c.id):0
      return {c, last, next, p, due}
    }).filter(r=>{
      if(Clients.flag==='due') return r.due>0.005
      if(Clients.flag==='low') return r.p && (Store.pkgRemaining(r.p)<=2 || Store.pkgExpired(r.p))
      if(Clients.flag==='idle') return !r.next && (!r.last || now-new Date(r.last.start)>21*864e5)
      return true
    }).sort((a,b)=>Clients.byName(a.c,b.c))

    const trainers=DB.trainers
    const filtered = Clients.q || Clients.flag
    document.getElementById('page-clienti').innerHTML=`
      <div class="head"><div><h1>${t('Clienti')}</h1><p>${isAdmin()?t('Tutti i clienti dello studio.'):t('I clienti che segui.')}</p></div>
        <div class="actions"><button class="btn btn-primary" onclick="Clients.editor()"><i class="ti ti-user-plus"></i> ${t('Nuovo cliente')}</button></div></div>
      <div class="cal-bar">
        <div class="search" style="width:280px"><i class="ti ti-search"></i><input class="in" placeholder="${t('Cerca per nome o telefono')}" value="${esc(Clients.q)}" oninput="Clients.q=this.value;Clients.renderListDebounced()" id="cl-search"></div>
        <div class="seg">${[['active',t('Attivi')],['archived',t('Archiviati')],['all',t('Tutti')]].map(([v,l])=>`<button class="${Clients.status===v?'active':''}" onclick="Clients.status='${v}';Clients.renderList()">${l}</button>`).join('')}</div>
        <select class="in" style="width:240px" onchange="Clients.flag=this.value;Clients.renderList()">
          <option value="">${t('Nessun filtro')}</option>
          <option value="low" ${Clients.flag==='low'?'selected':''}>${t('Pacchetto quasi finito o scaduto')}</option>
          <option value="idle" ${Clients.flag==='idle'?'selected':''}>${t('Senza appuntamenti da 3 settimane')}</option>
          ${isAdmin()?`<option value="due" ${Clients.flag==='due'?'selected':''}>${t('Con pagamenti da incassare')}</option>`:''}
        </select>
        ${isAdmin()&&trainers.length>1?`<select class="in" style="width:190px" onchange="Clients.trainer=this.value;Clients.renderList()"><option value="">${t('Tutti i trainer')}</option>${trainers.map(x=>`<option value="${x.id}" ${Clients.trainer===x.id?'selected':''}>${esc(x.name)}</option>`).join('')}</select>`:''}
      </div>
      <div class="panel"><div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>${t('Cliente')}</th>${isAdmin()?`<th>${t('Trainer')}</th>`:''}<th>${t('Pacchetto')}</th>${isAdmin()?`<th class="r">${t('Da incassare')}</th>`:''}<th>${t('Ultima sessione')}</th><th>${t('Prossima')}</th></tr></thead>
        <tbody>${rows.map(({c,last,next,p,due})=>{
          const tr=Store.trainer(c.trainerId)
          const rem=p?Store.pkgRemaining(p):null
          const alert=c.problems.some(x=>x.type==='high')
          const low=p && (rem<=2||Store.pkgExpired(p))
          return `<tr class="click" onclick="go('cliente',${c.id})">
            <td><div class="cell-person">${avatar(Store.fullName(c))}<div><b>${esc(Store.fullName(c))} ${alert?`<i class="ti ti-alert-triangle" style="color:var(--red)" title="${t('Problematica ad alta priorità')}"></i>`:''}</b><span>${esc(c.goal||'')}${c.status==='archived'?' ('+t('archiviato')+')':''}</span></div></div></td>
            ${isAdmin()?`<td>${tr?`<span class="tag" style="background:${tr.color}1F;color:${tr.color}">${esc(tr.short||tr.name)}</span>`:'<span class="faint">—</span>'}</td>`:''}
            <td>${p?`<div class="bar-row"><div class="bar" style="width:90px"><div style="width:${pct(Store.pkgUsed(p),p.lessons)}%;${low?'background:var(--red)':''}"></div></div><span class="${low?'down':''}">${Store.pkgExpired(p)?t('scaduto'):t('{n} su {tot}',{n:rem, tot:p.lessons})}</span></div>`:`<span class="faint">${t('Nessuno')}</span>`}</td>
            ${isAdmin()?`<td class="r ${due>0.005?'strong':''}" style="${due>0.005?'color:var(--red)':''}">${due>0.005?eur(due):'<span class="faint">—</span>'}</td>`:''}
            <td>${last?fmtShort(last.start):'<span class="faint">—</span>'}</td>
            <td>${next?`${fmtShort(next.start)}, ${fmtTime(next.start)}`:'<span class="faint">—</span>'}</td></tr>`
        }).join('') || `<tr><td colspan="6"><div class="empty"><i class="ti ti-users"></i><b>${filtered?t('Nessun cliente corrisponde ai filtri'):t('Nessun cliente ancora')}</b>${filtered?t('Modifica la ricerca o togli il filtro.'):t('Aggiungi il primo cliente con il pulsante in alto.')}</div></td></tr>`}</tbody>
      </table></div></div>`
    if(Clients._refocus){ const s=document.getElementById('cl-search'); s.focus(); s.setSelectionRange(s.value.length,s.value.length); Clients._refocus=false }
  },
  renderListDebounced: debounce(()=>{ Clients._refocus=true; Clients.renderList() }, 180),

  // ── Anagrafica ──────────────────────────────────────────────
  editor(id){
    const c=id?Store.client(id):null
    openDialog({
      title:c?t('Modifica cliente'):t('Nuovo cliente'), size:'wide',
      body:`<div class="row"><div class="field"><label for="ce-first">${t('Nome')}</label><input class="in" id="ce-first" value="${esc(c?.firstName||'')}"></div>
          <div class="field"><label for="ce-last">${t('Cognome')}</label><input class="in" id="ce-last" value="${esc(c?.lastName||'')}"></div></div>
        <div class="row"><div class="field"><label for="ce-phone">${t('Telefono')}</label><input class="in" id="ce-phone" value="${esc(c?.phone||'')}"></div>
          <div class="field"><label for="ce-email">${t('Email')}</label><input class="in" id="ce-email" type="email" value="${esc(c?.email||'')}"></div></div>
        <div class="row"><div class="field"><label for="ce-birth">${t('Data di nascita')}</label><input class="in" id="ce-birth" type="date" value="${esc(c?.birth||'')}"></div>
          <div class="field"><label for="ce-goal">${t('Obiettivo')}</label><input class="in" id="ce-goal" list="goal-list" value="${esc(c?.goal||'')}"><datalist id="goal-list">${GOALS.map(g=>`<option value="${esc(t(g))}">`).join('')}</datalist></div></div>
        ${isAdmin()?`<div class="row"><div class="field"><label for="ce-trainer">${t('Trainer')}</label><select class="in" id="ce-trainer">${DB.trainers.filter(x=>x.active!==false||x.id===c?.trainerId).map(x=>`<option value="${x.id}" ${(c?c.trainerId:CU.id)===x.id?'selected':''}>${esc(x.name)}</option>`).join('')}</select></div>
          <div class="field"><label for="ce-status">${t('Stato')}</label><select class="in" id="ce-status"><option value="active">${t('Attivo')}</option><option value="archived" ${c?.status==='archived'?'selected':''}>${t('Archiviato')}</option></select></div></div>`:''}
        <div class="field"><label for="ce-aliases">${t('Come compare nel calendario')}</label><input class="in" id="ce-aliases" value="${esc((c?.aliases||[]).join(', '))}" placeholder="${t('es. Anna, Anna R, Annina')}">
          <small>${t('Nomi alternativi separati da virgola. Gli appuntamenti con questi titoli vengono collegati da soli a questo cliente. Nome e cognome sono già riconosciuti.')}</small></div>`,
      foot:`${c&&isAdmin()?`<div class="left"><button class="btn btn-danger btn-sm" onclick="Clients.confirmDelete(${c.id})"><i class="ti ti-trash"></i> ${t('Elimina')}</button></div>`:''}
        <button class="btn btn-line" onclick="closeDialog()">${t('Annulla')}</button><button class="btn btn-primary" onclick="Clients.saveEditor(${c?c.id:'null'})">${c?t('Salva modifiche'):t('Aggiungi cliente')}</button>`,
    })
  },
  saveEditor(id){
    const first=val('ce-first'), last=val('ce-last')
    if(!first){ toast(t('Inserisci almeno il nome'),'err'); return }
    // Omonimi: avviso ma consento
    const dup=DB.clients.find(x=>x.id!=id && normName(Store.fullName(x))===normName(first+' '+last))
    let c=id?Store.client(id):null
    const isNew=!c
    const oldName=c?Store.fullName(c):''
    if(isNew){ c={id:DB.seq.client++, aliases:[], problems:[], measures:[], photos:[], notes:'', status:'active', createdAt:new Date().toISOString()}; DB.clients.push(c) }
    Object.assign(c,{firstName:first, lastName:last, phone:val('ce-phone'), email:val('ce-email'), birth:val('ce-birth'), goal:val('ce-goal')})
    c.trainerId = isAdmin() ? val('ce-trainer') : (c.trainerId||CU.id)
    if(isAdmin()) c.status=val('ce-status')
    c.aliases=[]
    val('ce-aliases').split(',').map(s=>s.trim()).filter(Boolean).forEach(a=>Ev.addAlias(c,a))
    // Cambio di nome: il vecchio nome resta riconosciuto, così gli appuntamenti già in calendario non si perdono
    const renamed = oldName && normName(oldName)!==normName(Store.fullName(c))
    if(renamed) Ev.addAlias(c, oldName)
    Store.save(); closeDialog()
    if(dup) toast(t('Attenzione: esiste già un cliente chiamato {name}',{name:Store.fullName(dup)}),'warn')
    else toast(isNew?t('Cliente aggiunto'):renamed?t('Nome aggiornato. “{name}” resta riconosciuto nel calendario',{name:oldName}):t('Modifiche salvate'))
    if(isNew) go('cliente', c.id); else refresh()
  },
  confirmDelete(id){
    const c=Store.client(id)
    confirmBox(t('Eliminare definitivamente <b>{name}</b> con pacchetti, pagamenti, schede, misure e foto? Se ha smesso di allenarsi è meglio <b>archiviarlo</b>: resta nello storico e nelle statistiche.',{name:esc(Store.fullName(c))}), async()=>{
      for(const ph of c.photos) await Store.photoDelete(ph.id)
      DB.clients=DB.clients.filter(x=>x.id!=id)
      const pk=new Set(DB.packages.filter(p=>p.clientId==id).map(p=>p.id))
      DB.packages=DB.packages.filter(p=>p.clientId!=id)
      DB.payments=DB.payments.filter(p=>p.clientId!=id)
      DB.programs=DB.programs.filter(p=>p.clientId!=id)
      DB.logs=DB.logs.filter(l=>l.clientId!=id)
      for(const [k,v] of Object.entries(DB.links)) if(v==id) delete DB.links[k]
      for(const [k,v] of Object.entries(DB.attendance)) if(v.clientId==id || pk.has(v.packageId)) delete DB.attendance[k]
      Store.save(); closeAllDialogs(); go('clienti'); toast(t('Cliente eliminato'))
    }, {title:t('Elimina cliente'), yes:t('Elimina definitivamente')})
  },
  toggleArchive(id){
    const c=Store.client(id)
    c.status=c.status==='archived'?'active':'archived'
    Store.save(); refresh(); toast(c.status==='archived'?t('Cliente archiviato'):t('Cliente riattivato'))
  },

  // ── Scheda cliente ─────────────────────────────────────────
  renderDetail(){
    const c=Store.client(currentClientId); if(!c) return go('clienti')
    const tr=Store.trainer(c.trainerId)
    const p=Store.currentPackage(c.id)
    const due=isAdmin()?Money.clientDue(c.id):0
    const tabs=[
      ['overview',t('Panoramica'),'ti-user'],
      ['training',t('Allenamento'),'ti-barbell', DB.programs.filter(x=>x.clientId==c.id&&x.active).length],
      ['packages',isAdmin()?t('Pacchetti e pagamenti'):t('Pacchetti'),'ti-ticket'],
      ['sessions',t('Presenze'),'ti-calendar-check'],
      ['measures',t('Misure'),'ti-ruler-measure', c.measures.length],
      ['photos',t('Foto'),'ti-photo', c.photos.length],
      ['notes',t('Note e problematiche'),'ti-notes', c.problems.length],
    ]
    document.getElementById('page-cliente').innerHTML=`
      <button class="back" onclick="go('clienti')"><i class="ti ti-arrow-left"></i> ${t('Clienti')}</button>
      <div class="profile">
        ${avatar(Store.fullName(c),'lg')}
        <div class="grow"><h1>${esc(Store.fullName(c))}</h1>
          <div class="meta">
            ${c.status==='archived'?`<span class="tag">${t('Archiviato')}</span>`:''}
            ${c.goal?`<span class="tag brass">${esc(c.goal)}</span>`:''}
            ${tr?`<span class="tag" style="background:${tr.color}1F;color:${tr.color}">${t('Trainer {name}',{name:esc(tr.name)})}</span>`:''}
            ${p?`<span class="tag ${Store.pkgExpired(p)||Store.pkgRemaining(p)<=2?'red':'green'}">${Store.pkgExpired(p)?t('Pacchetto scaduto'):tp(Store.pkgRemaining(p),'1 lezione rimasta','{n} lezioni rimaste')}</span>`:''}
            ${due>0.005?`<span class="tag red">${t('Da incassare {amount}',{amount:eur(due)})}</span>`:''}
          </div></div>
        <div class="actions" style="display:flex;gap:8px;flex-wrap:wrap">
          ${c.phone?`<a class="btn btn-line" href="${waLink(c.phone)}" target="_blank" rel="noopener"><i class="ti ti-brand-whatsapp"></i> WhatsApp</a>`:''}
          <button class="btn btn-line" onclick="Ev.editor({clientId:${c.id}})"><i class="ti ti-calendar-plus"></i> ${t('Appuntamento')}</button>
          <button class="btn btn-line" onclick="Clients.editor(${c.id})"><i class="ti ti-pencil"></i> ${t('Modifica')}</button>
          <button class="btn btn-ghost btn-icon" title="${c.status==='archived'?t('Riattiva'):t('Archivia')}" onclick="Clients.toggleArchive(${c.id})"><i class="ti ${c.status==='archived'?'ti-archive-off':'ti-archive'}"></i></button>
        </div>
      </div>
      <div class="tabs">${tabs.map(([id,l,i,n])=>`<button class="tab ${Clients.tab===id?'active':''}" onclick="Clients.tab='${id}';Clients.renderDetail()"><i class="ti ${i}"></i>${l}${n?`<span class="count">${n}</span>`:''}</button>`).join('')}</div>
      <div id="cl-tab"></div>`
    const el=document.getElementById('cl-tab')
    ;({overview:Clients.tabOverview, training:Programs.clientTab, packages:Money.clientTab, sessions:Clients.tabSessions, measures:Clients.tabMeasures, photos:Clients.tabPhotos, notes:Clients.tabNotes})[Clients.tab](c, el)
  },

  dateCell(d, long){ return `<span class="faint" style="font-size:12px;width:110px;text-align:right">${long?fmtDate(d):fmtShort(d)}</span>` },

  tabOverview(c, el){
    const evs=Ev.forClient(c.id), now=Date.now()
    const next=evs.filter(e=>new Date(e.start).getTime()>=now).slice(0,4)
    const past=evs.filter(e=>new Date(e.start).getTime()<now).reverse()
    const high=c.problems.filter(p=>p.type==='high')
    const p=Store.currentPackage(c.id)
    const prog=DB.programs.find(x=>x.clientId==c.id && x.active)
    const lastLog=DB.logs.filter(l=>l.clientId==c.id).sort((a,b)=>b.date.localeCompare(a.date))[0]
    const age=Clients.ageOf(c)
    el.innerHTML=`
      ${high.map(h=>`<div class="note red"><i class="ti ti-alert-triangle"></i><div><b>${t('Attenzione:')}</b> ${esc(h.text)}</div></div>`).join('')}
      <div class="grid-main">
        <div>
          <div class="panel"><div class="panel-h"><h3>${t('Anagrafica')}</h3><button class="btn btn-ghost btn-sm" onclick="Clients.editor(${c.id})"><i class="ti ti-pencil"></i> ${t('Modifica')}</button></div>
            <div class="panel-b"><div class="facts">
              <div class="fact"><div class="l">${t('Telefono')}</div><div class="v">${c.phone?`<a href="tel:${esc(c.phone)}">${esc(c.phone)}</a>`:'—'}</div></div>
              <div class="fact"><div class="l">${t('Email')}</div><div class="v">${c.email?`<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>`:'—'}</div></div>
              <div class="fact"><div class="l">${t('Età')}</div><div class="v">${age?t('{n} anni',{n:age}):'—'}</div></div>
              <div class="fact"><div class="l">${t('Obiettivo')}</div><div class="v">${esc(c.goal||'—')}</div></div>
              <div class="fact"><div class="l">${t('Trainer')}</div><div class="v">${esc(Store.trainer(c.trainerId)?.name||'—')}</div></div>
              <div class="fact"><div class="l">${t('Nel calendario anche come')}</div><div class="v">${c.aliases.length?esc(c.aliases.join(', ')):`<span class="faint">${t('solo nome e cognome')}</span>`}</div></div>
            </div></div></div>
          <div class="panel"><div class="panel-h"><h3>${t('Prossimi appuntamenti')}</h3><button class="btn btn-ghost btn-sm" onclick="Ev.editor({clientId:${c.id}})"><i class="ti ti-plus"></i> ${t('Nuovo')}</button></div>
            <div class="panel-b flush">${next.map(e=>Cal.row(e,Clients.dateCell(e.start))).join('')||`<div class="empty"><b>${t('Nessun appuntamento in programma')}</b>${t('Fissane uno dal pulsante qui sopra.')}</div>`}</div></div>
          <div class="panel"><div class="panel-h"><h3>${t('Ultime sessioni')}</h3><button class="btn btn-ghost btn-sm" onclick="Clients.tab='sessions';Clients.renderDetail()">${t('Tutte')}</button></div>
            <div class="panel-b flush">${past.slice(0,5).map(e=>Cal.row(e,Clients.dateCell(e.start))).join('')||`<div class="empty">${t('Ancora nessuna sessione registrata.')}</div>`}</div></div>
        </div>
        <div>
          <div class="panel"><div class="panel-h"><h3>${t('Pacchetto in corso')}</h3></div><div class="panel-b">
            ${p?`<b style="font-size:15px">${esc(p.name)}</b><div class="faint" style="font-size:12.5px;margin-bottom:10px">${p.expiryDate?t('Scade il {date}',{date:fmtDate(p.expiryDate)}):t('Senza scadenza')}</div>
              ${Money.lessonsStrip(p)}
              <div class="bar-row"><div class="bar" style="flex:1"><div style="width:${pct(Store.pkgUsed(p),p.lessons)}%"></div></div><b>${tp(Store.pkgRemaining(p),'1 rimasta','{n} rimaste')}</b></div>`
              :`<div class="empty" style="padding:14px"><b>${t('Nessun pacchetto')}</b>${isAdmin()?`<button class="btn btn-brass btn-sm" style="margin-top:10px" onclick="Money.sellDialog(${c.id})">${t('Vendi un pacchetto')}</button>`:t("Chiedi all'amministratore di registrarlo.")}</div>`}
          </div></div>
          <div class="panel"><div class="panel-h"><h3>${t('Allenamento')}</h3><button class="btn btn-ghost btn-sm" onclick="Clients.tab='training';Clients.renderDetail()">${t('Apri')}</button></div><div class="panel-b">
            ${prog?`<b>${esc(prog.name)}</b><div class="faint" style="font-size:12.5px">${tp(prog.days.length,'1 giorno','{n} giorni')}, ${tp(prog.days.reduce((a,d)=>a+d.exercises.length,0),'1 esercizio','{n} esercizi')}</div>
              <div style="margin-top:10px;font-size:13px">${lastLog?t('Ultimo allenamento registrato il {date}.',{date:fmtDate(lastLog.date)}):t('Nessun allenamento registrato.')}</div>
              <button class="btn btn-line btn-sm" style="margin-top:12px" onclick="Programs.logDialog(${c.id})"><i class="ti ti-barbell"></i> ${t('Registra allenamento')}</button>`
              :`<div class="faint">${t('Nessuna scheda attiva.')}</div>`}
          </div></div>
          ${c.measures.length?`<div class="panel"><div class="panel-h"><h3>${t('Peso')}</h3></div><div class="panel-b">${Clients.measureSpark(c,'weight','kg')}</div></div>`:''}
        </div>
      </div>`
  },

  tabSessions(c, el){
    const evs=Ev.forClient(c.id).slice().reverse()
    const now=Date.now()
    let pr=0, ab=0, lt=0
    evs.forEach(e=>{ const a=DB.attendance[e.id]; if(a?.s==='present')pr++; else if(a?.s==='absent')ab++; else if(a?.s==='late')lt++ })
    const pend=evs.filter(e=>new Date(e.end).getTime()<now && !DB.attendance[e.id])
    el.innerHTML=`<div class="kpis">
        <div class="kpi"><div class="l"><i class="ti ti-circle-check"></i>${t('Presenze')}</div><div class="v">${pr}</div></div>
        <div class="kpi"><div class="l"><i class="ti ti-circle-x"></i>${t('Assenze')}</div><div class="v">${ab}</div></div>
        <div class="kpi"><div class="l"><i class="ti ti-clock-exclamation"></i>${t('Disdette tardive')}</div><div class="v">${lt}</div></div>
        <div class="kpi"><div class="l"><i class="ti ti-percentage"></i>${t('Costanza')}</div><div class="v">${pr+ab+lt?pct(pr,pr+ab+lt)+'%':'—'}</div></div>
      </div>
      ${pend.length?`<div class="note amber"><i class="ti ti-checklist"></i><div class="grow"><b>${tp(pend.length,'1 sessione passata senza presenza.','{n} sessioni passate senza presenza.')}</b> ${t('Segna le presenze per scalare le lezioni dal pacchetto.')}</div>
        <button class="btn btn-line btn-sm" onclick="Clients.markAllPresent(${c.id})">${t('Segna tutte presenti')}</button></div>`:''}
      <div class="panel"><div class="panel-b flush">${evs.map(e=>Cal.row(e,Clients.dateCell(e.start,true))).join('')||`<div class="empty"><i class="ti ti-calendar-off"></i><b>${t('Nessun appuntamento collegato')}</b>${t('Gli appuntamenti con questo cliente appariranno qui. Se sul calendario lo scrivi in modo diverso, aggiungi il nome in Modifica.')}</div>`}</div></div>`
  },
  markAllPresent(cid){
    const now=Date.now()
    Ev.forClient(cid).filter(e=>new Date(e.end).getTime()<now && !DB.attendance[e.id]).sort((a,b)=>new Date(a.start)-new Date(b.start))
      .forEach(e=>Store.setAttendance(e, cid, 'present'))
    Store.save(); refresh(); toast(t('Presenze segnate'))
  },

  // ── Misure ─────────────────────────────────────────────────
  MEASURES:[['weight',N_('Peso'),'kg'],['bodyfat',N_('Massa grassa'),'%'],['waist',N_('Vita'),'cm'],['hips',N_('Fianchi'),'cm'],['chest',N_('Petto'),'cm'],['arm',N_('Braccio'),'cm'],['thigh',N_('Coscia'),'cm']],
  measureSpark(c, key, unit){
    const pts=c.measures.filter(m=>num(m[key])>0).sort((a,b)=>a.date.localeCompare(b.date))
    if(pts.length<1) return `<span class="faint">${t('Nessun dato')}</span>`
    const vals=pts.map(m=>num(m[key])), mn=Math.min(...vals), mx=Math.max(...vals)
    const W=300,H=70,P=6
    const xy=vals.map((v,i)=>[P+(pts.length===1?(W-2*P)/2:i*(W-2*P)/(pts.length-1)), H-P-(mx===mn?(H-2*P)/2:(v-mn)/(mx-mn)*(H-2*P))])
    const d=vals[vals.length-1]-vals[0]
    return `<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px"><b style="font-size:22px">${numText(vals[vals.length-1])} <small class="faint" style="font-size:13px">${unit}</small></b>
      ${pts.length>1?`<span class="${d<0?'up':d>0?'down':'flat'}">${t('{delta} {unit} dal {date}',{delta:(d>0?'+':'')+numText(Math.round(d*10)/10), unit, date:fmtShort(pts[0].date)})}</span>`:''}</div>
      <svg class="spark" viewBox="0 0 ${W} ${H}" width="100%" height="${H}"><polyline fill="none" stroke="var(--forest-3)" stroke-width="2" points="${xy.map(p=>p.join(',')).join(' ')}"/>${xy.map(p=>`<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="var(--brass)"/>`).join('')}</svg>`
  },
  tabMeasures(c, el){
    const ms=[...c.measures].sort((a,b)=>b.date.localeCompare(a.date))
    el.innerHTML=`<div class="head" style="margin-bottom:16px"><div></div><div class="actions"><button class="btn btn-primary" onclick="Clients.measureDialog(${c.id})"><i class="ti ti-plus"></i> ${t('Nuova misurazione')}</button></div></div>
      ${ms.length?`<div class="grid3">${Clients.MEASURES.slice(0,3).map(([k,l,u])=>`<div class="panel"><div class="panel-h"><h3>${t(l)}</h3></div><div class="panel-b">${Clients.measureSpark(c,k,u)}</div></div>`).join('')}</div>`:''}
      <div class="panel"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>${t('Data')}</th>${Clients.MEASURES.map(([,l,u])=>`<th class="r">${t(l)} (${u})</th>`).join('')}<th></th></tr></thead>
        <tbody>${ms.map(m=>`<tr><td class="strong">${fmtDate(m.date)}</td>${Clients.MEASURES.map(([k])=>`<td class="r">${m[k]?numText(num(m[k])):'<span class="faint">—</span>'}</td>`).join('')}
          <td class="r"><button class="btn btn-ghost btn-icon btn-sm" aria-label="${t('Elimina')}" onclick="Clients.delMeasure(${c.id},'${m.id}')"><i class="ti ti-trash"></i></button></td></tr>`).join('')
          ||`<tr><td colspan="9"><div class="empty"><i class="ti ti-ruler-measure"></i><b>${t('Nessuna misurazione')}</b>${t('Registra la prima per seguire i progressi nel tempo.')}</div></td></tr>`}</tbody></table></div></div>`
  },
  measureDialog(cid){
    openDialog({title:t('Nuova misurazione'), body:`<div class="field"><label for="m-date">${t('Data')}</label><input class="in" type="date" id="m-date" value="${todayISO()}"></div>
      <div class="row">${Clients.MEASURES.map(([k,l,u])=>`<div class="field"><label for="m-${k}">${t(l)} (${u})</label><input class="in" type="number" step="0.1" id="m-${k}"></div>`).join('')}</div>`,
      foot:`<button class="btn btn-line" onclick="closeDialog()">${t('Annulla')}</button><button class="btn btn-primary" onclick="Clients.saveMeasure(${cid})">${t('Salva misurazione')}</button>`})
  },
  saveMeasure(cid){
    const c=Store.client(cid), m={id:uid('m'), date:val('m-date')||todayISO()}
    Clients.MEASURES.forEach(([k])=>m[k]=val('m-'+k).replace(',','.'))
    if(!Clients.MEASURES.some(([k])=>m[k])){ toast(t('Inserisci almeno un valore'),'err'); return }
    c.measures.push(m); Store.save(); closeDialog(); refresh(); toast(t('Misurazione salvata'))
  },
  delMeasure(cid, mid){
    confirmBox(t('Eliminare questa misurazione?'), ()=>{ const c=Store.client(cid); c.measures=c.measures.filter(m=>m.id!==mid); Store.save(); refresh() }, {yes:t('Elimina')})
  },

  // ── Foto ───────────────────────────────────────────────────
  tabPhotos(c, el){
    const ph=[...c.photos].sort((a,b)=>b.date.localeCompare(a.date))
    Clients.selPhotos=Clients.selPhotos.filter(id=>ph.some(p=>p.id===id))
    el.innerHTML=`<div class="head" style="margin-bottom:16px"><p class="muted" style="margin:0">${t('Le foto sono salvate cifrate su questo computer. Selezionane due per confrontarle.')}</p>
        <div class="actions">${Clients.selPhotos.length===2?`<button class="btn btn-line" onclick="Clients.compare()"><i class="ti ti-arrows-left-right"></i> ${t('Confronta')}</button>`:''}
        <label class="btn btn-primary"><i class="ti ti-upload"></i> ${t('Aggiungi foto')}<input type="file" accept="image/*" multiple hidden onchange="Clients.addPhotos(${c.id},this)"></label></div></div>
      ${ph.length?`<div class="photos">${ph.map(p=>`<div class="photo ${Clients.selPhotos.includes(p.id)?'sel':''}" onclick="Clients.togglePhoto('${p.id}')" ondblclick="Clients.viewPhoto('${p.id}')">
          <img data-photo="${p.id}" alt="${t('Foto del {date}',{date:fmtDate(p.date)})}"><div class="d">${fmtDate(p.date)}</div>
          <button class="x" aria-label="${t('Elimina')}" onclick="event.stopPropagation();Clients.delPhoto(${c.id},'${p.id}')"><i class="ti ti-trash"></i></button></div>`).join('')}</div>`
        :`<div class="panel"><div class="empty"><i class="ti ti-photo"></i><b>${t('Nessuna foto')}</b>${t('Aggiungi le foto dei progressi: vengono ridimensionate e cifrate.')}</div></div>`}`
    Clients.fillPhotos(el)
  },
  async fillPhotos(root){
    for(const img of root.querySelectorAll('img[data-photo]')){ const d=await Store.photoLoad(img.dataset.photo); if(d) img.src=d }
  },
  togglePhoto(id){
    const s=Clients.selPhotos
    if(s.includes(id)) s.splice(s.indexOf(id),1); else { s.push(id); if(s.length>2) s.shift() }
    Clients.renderDetail()
  },
  async viewPhoto(id){
    openDialog({title:t('Foto'), size:'wide', body:`<img data-photo="${id}" style="width:100%;border-radius:10px;display:block">`, onOpen:el=>Clients.fillPhotos(el)})
  },
  compare(){
    const c=Store.client(currentClientId)
    const [a,b]=Clients.selPhotos.map(id=>c.photos.find(p=>p.id===id)).sort((x,y)=>x.date.localeCompare(y.date))
    openDialog({title:t('Confronto'), size:'xwide', body:`<div class="grid2">${[a,b].map(p=>`<div><img data-photo="${p.id}" style="width:100%;border-radius:10px;display:block"><div style="text-align:center;margin-top:8px;font-weight:600">${fmtDate(p.date)}</div></div>`).join('')}</div>`, onOpen:el=>Clients.fillPhotos(el)})
  },
  async addPhotos(cid, input){
    const c=Store.client(cid)
    for(const file of input.files){
      if(!file.type.startsWith('image/')) continue
      const dataUrl=await new Promise(res=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.readAsDataURL(file) })
      const img=await new Promise(res=>{ const i=new Image(); i.onload=()=>res(i); i.src=dataUrl })
      const max=1400; let w=img.width, h=img.height
      if(Math.max(w,h)>max){ const k=max/Math.max(w,h); w=Math.round(w*k); h=Math.round(h*k) }
      const cv=document.createElement('canvas'); cv.width=w; cv.height=h; cv.getContext('2d').drawImage(img,0,0,w,h)
      try{
        const id=await Store.photoSave(cv.toDataURL('image/jpeg',.82))
        c.photos.push({id, date:file.lastModified?new Date(file.lastModified).toISOString():new Date().toISOString()})
      }catch(e){ toast(t('Foto non salvata: {e}',{e:e.message}),'err') }
    }
    Store.save(); refresh(); toast(t('Foto aggiunte'))
  },
  delPhoto(cid, id){
    confirmBox(t('Eliminare questa foto?'), async()=>{ const c=Store.client(cid); c.photos=c.photos.filter(p=>p.id!==id); await Store.photoDelete(id); Store.save(); refresh() }, {yes:t('Elimina')})
  },

  // ── Note e problematiche ──────────────────────────────────
  tabNotes(c, el){
    const lv={high:[t('Alta'),'red'],medium:[t('Media'),'amber'],low:[t('Bassa'),'blue']}
    el.innerHTML=`<div class="grid2">
      <div class="panel"><div class="panel-h"><h3>${t('Problematiche')}</h3><button class="btn btn-ghost btn-sm" onclick="Clients.problemDialog(${c.id})"><i class="ti ti-plus"></i> ${t('Aggiungi')}</button></div>
        <div class="panel-b flush">${[...c.problems].sort((a,b)=>'hml'.indexOf(a.type[0])-'hml'.indexOf(b.type[0])).map(p=>`<div class="list-item">
          <span class="tag ${lv[p.type]?.[1]||''}">${lv[p.type]?.[0]||''}</span><div class="grow"><b style="font-weight:500">${esc(p.text)}</b>${p.date?`<span>${t('dal {date}',{date:fmtDate(p.date)})}</span>`:''}</div>
          <button class="btn btn-ghost btn-icon btn-sm" aria-label="${t('Elimina')}" onclick="Clients.delProblem(${c.id},'${p.id}')"><i class="ti ti-trash"></i></button></div>`).join('')
          ||`<div class="empty"><b>${t('Nessuna problematica')}</b>${t('Infortuni, dolori o limitazioni da ricordare.')}</div>`}</div></div>
      <div class="panel"><div class="panel-h"><h3>${t('Note')}</h3><span class="faint" id="notes-state" style="font-size:12px"></span></div>
        <div class="panel-b"><textarea class="in" id="cl-notes" rows="12" placeholder="${t('Abitudini, preferenze, cose da ricordare…')}" oninput="Clients.saveNotesDebounced(${c.id})">${esc(c.notes||'')}</textarea></div></div>
    </div>`
  },
  saveNotesDebounced: debounce(cid=>{ const c=Store.client(cid); if(!c) return; c.notes=document.getElementById('cl-notes')?.value||''; Store.save(); const s=document.getElementById('notes-state'); if(s) s.textContent=t('Salvato') }, 600),
  problemDialog(cid){
    openDialog({title:t('Nuova problematica'), body:`<div class="field"><label for="pb-text">${t('Descrizione')}</label><input class="in" id="pb-text" placeholder="${t('es. Dolore spalla destra sopra la testa')}"></div>
      <div class="row"><div class="field"><label for="pb-type">${t('Priorità')}</label><select class="in" id="pb-type"><option value="high">${t('Alta')}</option><option value="medium" selected>${t('Media')}</option><option value="low">${t('Bassa')}</option></select></div>
      <div class="field"><label for="pb-date">${t('Dal')}</label><input class="in" type="date" id="pb-date" value="${todayISO()}"></div></div>`,
      foot:`<button class="btn btn-line" onclick="closeDialog()">${t('Annulla')}</button><button class="btn btn-primary" onclick="Clients.saveProblem(${cid})">${t('Aggiungi')}</button>`})
  },
  saveProblem(cid){
    const text=val('pb-text'); if(!text){ toast(t('Scrivi una descrizione'),'err'); return }
    Store.client(cid).problems.push({id:uid('pb'), type:val('pb-type'), text, date:val('pb-date')})
    Store.save(); closeDialog(); refresh()
  },
  delProblem(cid, id){ const c=Store.client(cid); c.problems=c.problems.filter(p=>p.id!==id); Store.save(); refresh() },
}
RENDER.clienti = Clients.renderList
RENDER.cliente = Clients.renderDetail
