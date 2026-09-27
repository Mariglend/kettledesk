'use strict'
// ═══ EVENTI: a chi appartiene ogni appuntamento del calendario ═══════
//
// Ordine con cui un evento viene riconosciuto:
//  1. collegamento fatto a mano (sul singolo evento o sull'intera serie)
//  2. evento creato dal gestionale (porta con sé l'id cliente)
//  3. eventi di tutto il giorno ed esclusioni per titolo → "non è un allenamento"
//  4. nome esatto: "Nome Cognome", "Cognome Nome" o uno dei nomi alternativi del cliente
//  5. nome parziale (solo nome o solo cognome) con un unico cliente possibile → proposta da confermare
//  altrimenti → "da classificare"

const Ev = {
  _res:null, _idx:null,
  invalidate(){ Ev._res=null; Ev._idx=null },

  index(){
    if(Ev._idx) return Ev._idx
    const exact=new Map(), part=new Map()
    const add=(m,k,id)=>{ if(!k) return; if(!m.has(k)) m.set(k,new Set()); m.get(k).add(id) }
    for(const c of DB.clients){
      const f=normName(c.firstName), l=normName(c.lastName)
      add(exact, normName(`${c.firstName} ${c.lastName}`), c.id)
      if(l) add(exact, normName(`${c.lastName} ${c.firstName}`), c.id)
      c.aliases.forEach(a=>add(exact, normName(a), c.id))
      add(part, f, c.id); add(part, l, c.id)
      if(f && l) add(part, `${f} ${l[0]}`, c.id)          // "Anna R"
    }
    return Ev._idx={exact, part}
  },

  pick(ids){
    ids=[...(ids||[])]
    if(ids.length<=1) return ids
    const active=ids.filter(id=>Store.client(id)?.status!=='archived')
    return active.length ? active : ids
  },

  resolve(ev){
    if(!Ev._res) Ev._res=new Map()
    if(Ev._res.has(ev.id)) return Ev._res.get(ev.id)
    const r=Ev._resolve(ev); Ev._res.set(ev.id, r); return r
  },
  _resolve(ev){
    let l=DB.links[ev.id], scope='event'
    if(l==null && ev.recurringId){ l=DB.links['series:'+ev.recurringId]; scope='series' }
    if(l==='ignored') return {s:'ignored', via:'manual', scope}
    if(l==='none') return {s:'unknown', via:'manual', cands:[]}
    if(l!=null){ const c=Store.client(l); if(c) return {s:'client', c, via:'manual', scope} }
    if(ev.appClientId){ const c=Store.client(ev.appClientId); if(c) return {s:'client', c, via:'app'} }
    if(ev.allDay && DB.settings.autoIgnoreAllDay) return {s:'ignored', via:'allday'}
    const key=normName(ev.clientName)
    if(DB.settings.ignoreTitles.includes(key)) return {s:'ignored', via:'rule'}
    const {exact, part}=Ev.index()
    const ex=Ev.pick(exact.get(key))
    if(ex.length===1) return {s:'client', c:Store.client(ex[0]), via:'name'}
    if(ex.length>1) return {s:'unknown', via:'ambiguous', cands:ex}
    const pa=Ev.pick(part.get(key))
    if(pa.length===1) return {s:'suggest', c:Store.client(pa[0]), cands:pa}
    return {s:'unknown', via:pa.length?'ambiguous':'none', cands:pa}
  },

  clientOf(ev){ const r=Ev.resolve(ev); return r.s==='client' ? r.c : null },
  byId(id){ return EVENTS.find(e=>e.id===id) },
  // Eventi visibili: admin tutti, trainer solo i propri
  mine(){ return isAdmin() ? EVENTS : EVENTS.filter(e=>e.trainerId===CU.id) },
  // Eventi collegati a un cliente, con durata in minuti
  sessions(filterFn){ return Ev.mine().filter(e=>Ev.resolve(e).s==='client' && (!filterFn||filterFn(e))) },
  forClient(cid){ return EVENTS.filter(e=>{ const c=Ev.clientOf(e); return c && c.id==cid }) },
  dur(e){ return (new Date(e.end)-new Date(e.start))/60000 },

  // Da classificare: dagli ultimi 45 giorni in avanti (o tutti)
  inbox(all=false){
    const from=Date.now()-45*864e5
    return Ev.mine().filter(e=>{ const s=Ev.resolve(e).s; return (s==='unknown'||s==='suggest') && (all || new Date(e.start).getTime()>=from) })
  },
  // Sessioni passate senza presenza segnata
  toConfirm(){
    const now=Date.now()
    return Ev.sessions(e=>new Date(e.end).getTime()<now && !DB.attendance[e.id] && Store.canSee(Ev.clientOf(e)))
  },

  // ── Azioni ───────────────────────────────────────────────────
  addAlias(c, name){
    const k=normName(name)
    if(!k || k===normName(Store.fullName(c)) || k===normName(`${c.lastName} ${c.firstName}`)) return
    DB.clients.forEach(o=>{ if(o.id!==c.id) o.aliases=o.aliases.filter(a=>normName(a)!==k) })
    if(!c.aliases.some(a=>normName(a)===k)) c.aliases.push(name.trim())
  },
  link(ev, clientId, {remember=false, series=false}={}){
    const c=Store.client(clientId); if(!c) return
    if(series && ev.recurringId){ DB.links['series:'+ev.recurringId]=c.id; delete DB.links[ev.id] }
    else DB.links[ev.id]=c.id
    if(remember) Ev.addAlias(c, ev.clientName)
    const a=DB.attendance[ev.id]
    if(a && a.clientId!=c.id){ const s=a.s; delete DB.attendance[ev.id]; Store.setAttendance(ev, c.id, s) }
    Store.save()
  },
  unlink(ev){
    DB.links[ev.id]='none'
    delete DB.attendance[ev.id]
    Store.save()
  },
  ignore(ev, {always=false, series=false}={}){
    if(series && ev.recurringId) DB.links['series:'+ev.recurringId]='ignored'
    else DB.links[ev.id]='ignored'
    if(always){ const k=normName(ev.clientName); if(k && !DB.settings.ignoreTitles.includes(k)) DB.settings.ignoreTitles.push(k) }
    delete DB.attendance[ev.id]
    Store.save()
  },
  restore(ev){
    const r=Ev.resolve(ev)
    if(r.via==='rule') DB.settings.ignoreTitles=DB.settings.ignoreTitles.filter(k=>k!==normName(ev.clientName))
    if(r.via==='allday') DB.links[ev.id]='none'
    else { delete DB.links[ev.id]; if(r.scope==='series') delete DB.links['series:'+ev.recurringId] }
    Store.save()
  },
  // Collega tutti gli eventi con lo stesso titolo (e i futuri) a un cliente
  linkGroup(key, clientId){
    const c=Store.client(clientId); if(!c) return
    const evs=Ev.inbox(true).filter(e=>normName(e.clientName)===key)
    if(!evs.length) return
    Ev.addAlias(c, evs[0].clientName)
    evs.forEach(e=>{ if(DB.links[e.id]==='none') delete DB.links[e.id] })
    Store.save()
  },
  ignoreGroup(key){
    if(!DB.settings.ignoreTitles.includes(key)) DB.settings.ignoreTitles.push(key)
    Ev.inbox(true).filter(e=>normName(e.clientName)===key).forEach(e=>{ if(DB.links[e.id]==='none') delete DB.links[e.id] })
    Store.save()
  },

  // ── Finestra dettaglio appuntamento ─────────────────────────
  viaLabel(r){
    return {manual: r.scope==='series'?t('collegato a mano, per tutta la serie'):t('collegato a mano'), app:t('creato dal gestionale'), name:t('riconosciuto dal nome')}[r.via]||''
  },
  clientOptions(selected){
    return Store.myClients().sort((a,b)=>Store.fullName(a).localeCompare(Store.fullName(b), locale()))
      .map(c=>`<option value="${c.id}" ${c.id==selected?'selected':''}>${esc(Store.fullName(c))}</option>`).join('')
  },

  open(id){
    const ev=Ev.byId(id); if(!ev) return
    const r=Ev.resolve(ev)
    const tr=Store.trainer(ev.trainerId)
    const att=DB.attendance[ev.id]
    const canEdit=isAdmin() || ev.trainerId===CU.id
    const q=`'${ev.id}'`
    let who=''
    if(r.s==='client'){
      const c=r.c
      who=`<div class="list-item" style="padding:0 0 4px;border:none">${avatar(Store.fullName(c))}
        <div class="grow"><b>${esc(Store.fullName(c))}</b><span>${Ev.viaLabel(r)}</span></div>
        ${Store.canSee(c)?`<button class="btn btn-line btn-sm" onclick="closeDialog();go('cliente',${c.id})">${t('Apri scheda')}</button>`:''}
      </div>
      <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" onclick="Ev.showLinker(${q})"><i class="ti ti-switch-horizontal"></i> ${t('Cambia cliente')}</button>
        ${r.via!=='app'?`<button class="btn btn-ghost btn-sm" onclick="Ev.unlink(Ev.byId(${q}));closeDialog();Ev.open(${q});refresh()"><i class="ti ti-unlink"></i> ${t('Scollega')}</button>`:''}
        <button class="btn btn-ghost btn-sm" onclick="Ev.ignore(Ev.byId(${q}));closeDialog();refresh();toast(t('Escluso dalle statistiche'))"><i class="ti ti-eye-off"></i> ${t('Non è un allenamento')}</button>
      </div>
      <div id="ev-linker"></div>`
    } else if(r.s==='ignored'){
      const why={rule:t('tutti gli eventi chiamati “{name}” sono esclusi',{name:esc(ev.clientName)}), allday:t('evento di tutto il giorno'), manual:t('segnato come non allenamento')}[r.via]
      who=`<div class="note" style="margin:0"><i class="ti ti-eye-off"></i><div class="grow"><b>${t('Escluso dalle statistiche')}</b><br>${why}.</div>
        <button class="btn btn-line btn-sm" onclick="Ev.restore(Ev.byId(${q}));closeDialog();Ev.open(${q});refresh()">${t('Ripristina')}</button></div>`
    } else {
      who = (r.s==='suggest' ? `<div class="note blue" style="margin-bottom:14px"><i class="ti ti-user-question"></i><div class="grow">${t('Sembra <b>{name}</b>.',{name:esc(Store.fullName(r.c))})}</div>
          <button class="btn btn-primary btn-sm" onclick="Ev.doLink(${q},${r.c.id},true)">${t('Conferma')}</button></div>`
        : r.via==='ambiguous' ? `<div class="note amber" style="margin-bottom:14px"><i class="ti ti-users"></i><div>${t('Più clienti corrispondono a “{name}”: scegli quello giusto.',{name:esc(ev.clientName)})}</div></div>` : '')
        + Ev.linkerHtml(ev, r)
    }
    const attHtml = r.s==='client' && Store.canSee(r.c) ? `<div class="divider"></div>
      <div class="field" style="margin-bottom:8px"><label>${t('Presenza')}</label></div>
      <div class="choice">
        ${[['present','ti-circle-check',t('Presente'),''],['absent','ti-circle-x',t('Assente, non scala'),'red'],['late','ti-clock-exclamation',t('Disdetta tardiva, scala'),'amber']]
          .map(([st,i,l,cl])=>`<button class="${att?.s===st?'on '+cl:''}" onclick="Ev.setAtt(${q},'${st}')"><i class="ti ${i}"></i>${l}</button>`).join('')}
      </div>
      <div class="faint" style="font-size:12.5px">${Ev.attLabel(ev, att)}</div>` : ''
    const when = ev.allDay ? t('tutto il giorno') : fmtTime(ev.start)+'–'+fmtTime(ev.end)
    const sub = [fmtDay(ev.start)+', '+when, tr?t('calendario di {name}',{name:esc(tr.name)}):'', ev.pending?t('in attesa di invio a Google'):''].filter(Boolean).join(', ')
    openDialog({
      title: esc(ev.title),
      sub,
      body: `${ev.note?`<div class="ev-card"><span class="muted">${esc(ev.note)}</span></div>`:''}${who}${attHtml}`,
      foot: canEdit ? `<div class="left">
          <button class="btn btn-danger btn-sm" onclick="Ev.confirmDelete(${q})"><i class="ti ti-trash"></i> ${t('Elimina')}</button></div>
          ${r.s==='client'&&Store.canSee(r.c)?`<button class="btn btn-line" onclick="closeDialog();Programs.logDialog(${r.c.id},${q})"><i class="ti ti-barbell"></i> ${t('Registra allenamento')}</button>`:''}
          <button class="btn btn-line" onclick="closeDialog();Ev.editor({id:${q}})"><i class="ti ti-pencil"></i> ${t('Modifica')}</button>` : '',
    })
  },
  attLabel(ev, att){
    if(!att) return new Date(ev.start)>new Date() ? t('Puoi segnarla anche prima, ad esempio per una disdetta.') : t('Non ancora segnata.')
    if(att.s==='absent') return t('Non scala lezioni dal pacchetto.')
    const p=att.packageId && Store.pkg(att.packageId)
    return p ? t('Scalata da “{pkg}”: restano {n} lezioni.',{pkg:esc(p.name), n:Store.pkgRemaining(p)}) : t('Nessun pacchetto attivo: la lezione non è stata scalata.')
  },
  setAtt(id, st){
    const ev=Ev.byId(id), c=Ev.clientOf(ev); if(!c) return
    const cur=DB.attendance[id]?.s
    Store.setAttendance(ev, c.id, cur===st ? null : st)
    Store.save(); closeDialog(); Ev.open(id); refresh()
  },
  linkerHtml(ev, r){
    const opts=(r?.cands?.length ? r.cands : null)
    const q=`'${ev.id}'`
    return `<div class="field"><label for="lk-client">${t('Collega a un cliente')}</label>
        <select class="in" id="lk-client"><option value="">${t('Scegli…')}</option>
        ${opts?`<optgroup label="${t('Possibili')}">${opts.map(id=>{const c=Store.client(id);return c&&Store.canSee(c)?`<option value="${c.id}">${esc(Store.fullName(c))}</option>`:''}).join('')}</optgroup><optgroup label="${t('Tutti i clienti')}">`:''}
        ${Ev.clientOptions()}${opts?'</optgroup>':''}</select></div>
      <label class="check"><input type="checkbox" id="lk-remember" checked> <span>${t('Ricorda “{name}” come nome di questo cliente, così i prossimi appuntamenti si collegano da soli',{name:esc(ev.clientName)})}</span></label>
      ${ev.recurringId?`<label class="check"><input type="checkbox" id="lk-series" checked> <span>${t('Applica a tutti gli appuntamenti di questa serie')}</span></label>`:''}
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">
        <button class="btn btn-primary" onclick="Ev.doLink(${q})"><i class="ti ti-link"></i> ${t('Collega')}</button>
        <button class="btn btn-line" onclick="Ev.doIgnore(${q})"><i class="ti ti-eye-off"></i> ${t('Non è un allenamento')}</button>
      </div>
      <label class="check" style="margin-top:10px"><input type="checkbox" id="lk-always"> <span>${t('Ignora sempre gli eventi chiamati “{name}”',{name:esc(ev.clientName)})}</span></label>`
  },
  showLinker(id){
    const ev=Ev.byId(id)
    document.getElementById('ev-linker').innerHTML='<div class="divider"></div>'+Ev.linkerHtml(ev, null)
  },
  doLink(id, clientId, remember){
    const ev=Ev.byId(id)
    const cid=clientId || val('lk-client')
    if(!cid){ toast(t('Scegli un cliente'),'err'); return }
    Ev.link(ev, cid, {remember: remember ?? checked('lk-remember'), series: checked('lk-series')})
    closeDialog(); refresh(); toast(t('Appuntamento collegato a {name}',{name:Store.fullName(Store.client(cid))}))
  },
  doIgnore(id){
    Ev.ignore(Ev.byId(id), {always:checked('lk-always'), series:checked('lk-series')})
    closeDialog(); refresh(); toast(t('Escluso dalle statistiche'))
  },
  confirmDelete(id){
    const ev=Ev.byId(id)
    confirmBox(t('Eliminare “{title}” del {date}? Verrà cancellato anche da Google Calendar.',{title:esc(ev.title), date:fmtDay(ev.start)}), async()=>{
      try{ const r=await Sync.remove(ev); closeAllDialogs(); refresh(); toast(r.queued?t('Eliminato: la cancellazione su Google partirà appena torni online'):t('Appuntamento eliminato'), r.queued?'warn':'') }
      catch(e){ toast(e.message,'err') }
    }, {title:t('Elimina appuntamento'), yes:t('Elimina')})
  },

  // ── Nuovo / modifica appuntamento ───────────────────────────
  editor({id, clientId, date, time}={}){
    const ev=id ? Ev.byId(id) : null
    const c=ev ? Ev.clientOf(ev) : clientId ? Store.client(clientId) : null
    const d=ev ? new Date(ev.start) : null
    const dur=ev ? Math.round(Ev.dur(ev)) : 60
    const trainers=DB.trainers.filter(x=>x.active!==false && (x.id===CU.id || (isAdmin() && x.calId && x.calId!=='primary')))
    const selTrainer = ev ? ev.trainerId : (c && trainers.some(x=>x.id===c.trainerId) ? c.trainerId : CU.id)
    const durs=[30,45,60,75,90,120]; if(!durs.includes(dur)) durs.push(dur)
    openDialog({
      title: ev?t('Modifica appuntamento'):t('Nuovo appuntamento'),
      sub: ev?t('Le modifiche vengono salvate anche su Google Calendar.'):t('Viene creato su Google Calendar e collegato al cliente.'),
      body:`<div class="field"><label for="ed-client">${t('Cliente')}</label><select class="in" id="ed-client" onchange="document.getElementById('ed-free-wrap').classList.toggle('hidden',this.value!=='__free')">
          <option value="">${t('Scegli…')}</option>${Ev.clientOptions(c?.id)}<option value="__free" ${ev&&!c?'selected':''}>${t('Altro: evento non legato a un cliente')}</option></select></div>
        <div class="field ${ev&&!c?'':'hidden'}" id="ed-free-wrap"><label for="ed-free">${t('Titolo')}</label><input class="in" id="ed-free" value="${ev&&!c?esc(ev.clientName):''}"></div>
        <div class="row"><div class="field"><label for="ed-tipo">${t('Tipo di allenamento')}</label><select class="in" id="ed-tipo">${DB.settings.tipi.map(x=>`<option ${ev?.tipo===x.name?'selected':''}>${esc(x.name)}</option>`).join('')}<option value="" ${ev&&!DB.settings.tipi.some(x=>x.name===ev.tipo)?'selected':''}>${t('Nessuno')}</option></select></div>
          <div class="field"><label for="ed-dur">${t('Durata')}</label><select class="in" id="ed-dur">${durs.sort((a,b)=>a-b).map(m=>`<option value="${m}" ${m===dur?'selected':''}>${t('{n} minuti',{n:m})}</option>`).join('')}</select></div></div>
        <div class="row"><div class="field"><label for="ed-date">${t('Giorno')}</label><input class="in" type="date" id="ed-date" value="${d?isoOf(d):(date||todayISO())}"></div>
          <div class="field"><label for="ed-time">${t('Ora')}</label><input class="in" type="time" id="ed-time" step="900" value="${d?d.toTimeString().slice(0,5):(time||'09:00')}"></div></div>
        ${!ev && trainers.length>1?`<div class="field"><label for="ed-trainer">${t('Nel calendario di')}</label><select class="in" id="ed-trainer">${trainers.map(x=>`<option value="${x.id}" ${x.id===selTrainer?'selected':''}>${esc(x.name)}</option>`).join('')}</select></div>`:''}
        <div class="field"><label for="ed-note">${t('Note')}</label><textarea class="in" id="ed-note" rows="2">${esc(ev?.note||'')}</textarea></div>`,
      foot:`<button class="btn btn-line" onclick="closeDialog()">${t('Annulla')}</button><button class="btn btn-primary" id="ed-save" onclick="Ev.saveEditor(${ev?`'${ev.id}'`:'null'})">${ev?t('Salva modifiche'):t('Crea appuntamento')}</button>`,
    })
  },
  async saveEditor(id){
    const sel=val('ed-client')
    const free = sel==='__free'
    const c = free ? null : Store.client(sel)
    if(!c && !free){ toast(t('Scegli un cliente'),'err'); return }
    const name = free ? val('ed-free') : Store.fullName(c)
    if(!name){ toast(t('Scrivi un titolo'),'err'); return }
    const body=buildBody({clientId:c?.id, clientName:name, tipo:free?'':val('ed-tipo'), date:val('ed-date'), time:val('ed-time'), duration:val('ed-dur'), note:val('ed-note')})
    const btn=document.getElementById('ed-save'); btn.disabled=true
    try{
      let res
      if(id){
        const ev=Ev.byId(id)
        if(!c) body.extendedProperties={private:{apClient:''}}
        res=await Sync.patch(ev, body)
        if(c) DB.links[ev.id]=c.id; else DB.links[ev.id]='ignored'
      } else {
        const tid=document.getElementById('ed-trainer')?.value || CU.id
        const tr=Store.trainer(tid)
        res=await Sync.insert(tid===CU.id ? (CU.calId||'primary') : tr.calId, tid, body)
        if(c) DB.links[res.ev.id]=c.id; else DB.links[res.ev.id]='ignored'
      }
      Store.save(); closeDialog(); refresh()
      toast(res.queued?t('Salvato: verrà inviato a Google Calendar appena torni online'):(id?t('Appuntamento aggiornato'):t('Appuntamento creato')), res.queued?'warn':'')
    }catch(e){ toast(e.message,'err'); btn.disabled=false }
  },
}
