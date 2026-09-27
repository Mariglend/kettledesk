'use strict'
// ═══ GOOGLE: accesso, token, sincronizzazione calendario, coda offline ═══

const CAL_API = 'https://www.googleapis.com/calendar/v3'
const PEOPLE_API = 'https://www.googleapis.com/oauth2/v3/userinfo'

// ── Accesso ────────────────────────────────────────────────────
const Auth = {
  token:null, exp:0, needsRelogin:false, _refreshing:null,

  showGate(which){
    document.getElementById('gate-setup').classList.toggle('active', which==='setup')
    document.getElementById('gate-login').classList.toggle('active', which==='login')
    document.getElementById('app').classList.toggle('active', which==='app')
  },

  async saveSetup(){
    const id=val('setup-id'), sec=val('setup-secret')
    const err=document.getElementById('setup-err')
    if(!id.endsWith('.apps.googleusercontent.com')){
      err.classList.remove('hidden'); err.textContent=t('Il Client ID deve terminare con .apps.googleusercontent.com'); return
    }
    localStorage.setItem(LS.clientId, id)
    await API.secureSet('clientSecret', sec||null)
    err.classList.add('hidden')
    Auth.showGate('login')
  },

  resetSetup(){
    confirmBox(t("Vuoi inserire un nuovo Client ID? Dovrai rifare l'accesso. I dati dei clienti non vengono toccati."), async()=>{
      localStorage.removeItem(LS.clientId); localStorage.removeItem(LS.token); localStorage.removeItem(LS.lastUser)
      await API.secureSet('clientSecret', null); await API.secureSet('refreshTokens', null)
      Auth.showGate('setup')
    }, {title:t('Cambia Client ID'), yes:t('Cambia'), danger:false})
  },

  async login(){
    const btn=document.getElementById('login-btn'), err=document.getElementById('login-err')
    err.classList.add('hidden')
    if(!navigator.onLine){ err.classList.remove('hidden'); err.textContent=t('Serve la connessione a internet per il primo accesso.'); return }
    btn.disabled=true; btn.innerHTML='<i class="ti ti-loader-2"></i> '+t("Completa l'accesso nel browser…")
    try{
      const tk = await API.googleOAuth({clientId:localStorage.getItem(LS.clientId), clientSecret:await Auth.secret()})
      const r = await fetch(PEOPLE_API,{headers:{Authorization:`Bearer ${tk.access_token}`}})
      if(!r.ok) throw new Error(t('Impossibile leggere il profilo Google'))
      const profile = await r.json()
      let tr = Store.trainerByEmail(profile.email)
      if(!tr){
        if(DB.trainers.length) throw new Error(t("L'account {email} non è autorizzato. L'amministratore deve aggiungerlo in Team.",{email:profile.email}))
        const name = profile.name || profile.email.split('@')[0]
        tr = {id:'t1', name, email:profile.email, short:name.split(' ')[0], color:'#2F6B57', role:'admin', calId:'primary', targetOre:80, active:true}
        DB.trainers.push(tr); await Store.save()
      }
      if(tr.active===false) throw new Error(t("L'account {email} è disattivato.",{email:profile.email}))
      CU = tr
      Auth.setToken(tk.access_token, tk.expires_in)
      if(tk.refresh_token) await Auth.storeRefresh(profile.email, tk.refresh_token)
      localStorage.setItem(LS.lastUser, profile.email.toLowerCase())
      startApp()
    }catch(e){
      err.classList.remove('hidden'); err.textContent=e.message||t('Accesso non riuscito')
    }finally{
      btn.disabled=false; btn.innerHTML='<i class="ti ti-brand-google"></i> '+t('Accedi con Google')
    }
  },

  logout(){
    localStorage.removeItem(LS.lastUser); localStorage.removeItem(LS.token)
    Auth.token=null; Auth.exp=0; CU=null; EVENTS=[]
    closeAllDialogs()
    Auth.showGate('login')
  },

  async secret(){ return (await API.secureGet('clientSecret')) || '' },
  async refreshTokens(){ try{ return JSON.parse((await API.secureGet('refreshTokens'))||'{}') }catch{ return {} } },
  async storeRefresh(email, rt){ const all=await Auth.refreshTokens(); all[email.toLowerCase()]=rt; await API.secureSet('refreshTokens', JSON.stringify(all)) },
  setToken(tok, expiresIn){
    Auth.token=tok; Auth.exp=Date.now()+(expiresIn||3600)*1000
    localStorage.setItem(LS.token, JSON.stringify({t:tok, exp:Auth.exp, email:CU?.email?.toLowerCase()}))
  },
  restoreToken(){
    try{ const s=JSON.parse(localStorage.getItem(LS.token)||'null'); if(s && s.email===CU.email.toLowerCase()){ Auth.token=s.t; Auth.exp=s.exp } }catch{}
  },

  // Token valido o null (offline / sessione da rifare)
  async getToken(force=false){
    if(!force && Auth.token && Auth.exp > Date.now()+60000) return Auth.token
    if(!CU || !navigator.onLine) return null
    if(Auth._refreshing) return Auth._refreshing
    Auth._refreshing = (async()=>{
      try{
        const rt = (await Auth.refreshTokens())[CU.email.toLowerCase()]
        if(!rt){ Auth.needsRelogin=true; return null }
        const r = await API.googleRefresh({clientId:localStorage.getItem(LS.clientId), clientSecret:await Auth.secret(), refreshToken:rt})
        if(r.ok){ Auth.needsRelogin=false; Auth.setToken(r.access_token, r.expires_in); return Auth.token }
        if(r.code==='invalid_grant') Auth.needsRelogin=true
        return null
      } finally { Auth._refreshing=null }
    })()
    return Auth._refreshing
  },
}

class NetError extends Error { constructor(code){ super(code); this.code=code } }

async function gfetch(url, opts={}){
  let tok = await Auth.getToken()
  if(!tok) throw new NetError(Auth.needsRelogin?'RELOGIN':'OFFLINE')
  const doFetch = tk => fetch(url,{...opts, headers:{...(opts.headers||{}), Authorization:`Bearer ${tk}`, 'Content-Type':'application/json'}})
  let r
  try{ r = await doFetch(tok) }catch{ throw new NetError('OFFLINE') }
  if(r.status===401){
    tok = await Auth.getToken(true)
    if(!tok) throw new NetError('RELOGIN')
    try{ r = await doFetch(tok) }catch{ throw new NetError('OFFLINE') }
  }
  return r
}

// ── Eventi: conversione ───────────────────────────────────────
function parseGEvent(item, calId, trainerId){
  const title = item.summary || t('(senza titolo)')
  const idx = title.indexOf(' - ')
  const clientName = (idx>0 ? title.slice(0,idx) : title).trim()
  const tipoRaw = idx>0 ? title.slice(idx+3).trim() : ''
  const tipo = DB.settings.tipi.find(x=>normName(x.name)===normName(tipoRaw))?.name || tipoRaw || t('Allenamento')
  const allDay = !!item.start?.date && !item.start?.dateTime
  return {
    id:item.id, recurringId:item.recurringEventId||null, calId, trainerId,
    title, clientName, tipo, allDay,
    start:item.start?.dateTime || (item.start?.date+'T00:00'),
    end:item.end?.dateTime || (item.end?.date+'T00:00'),
    note:item.description||'',
    appClientId:item.extendedProperties?.private?.apClient || null,
  }
}
const TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
function buildBody({clientId, clientName, tipo, date, time, duration, note}){
  const start=new Date(`${date}T${time}`)
  const end=new Date(start.getTime()+Number(duration||60)*60000)
  const body={
    summary: tipo ? `${clientName} - ${tipo}` : clientName,
    description: note||'',
    start:{dateTime:start.toISOString(), timeZone:TIME_ZONE},
    end:{dateTime:end.toISOString(), timeZone:TIME_ZONE},
  }
  if(clientId) body.extendedProperties={private:{apClient:String(clientId)}}
  return body
}

// ── Sincronizzazione ─────────────────────────────────────────
const Sync = {
  state:'idle', msgKey:'', msgVars:null, lastAt:null, queue:[], _busy:false, _flushing:false,

  cacheName(){ return 'cache-'+CU.email.toLowerCase().replace(/[^a-z0-9]/g,'_') },
  async loadQueue(){ try{ const r=await API.storeRead('queue'); Sync.queue = r.ok&&r.value ? JSON.parse(r.value) : [] }catch{ Sync.queue=[] } },
  saveQueue(){ return API.storeWrite('queue', JSON.stringify(Sync.queue)) },
  myQueue(){ return CU ? Sync.queue.filter(i=>i.email===CU.email.toLowerCase()) : [] },
  async saveCache(){ await API.storeWrite(Sync.cacheName(), JSON.stringify({at:Sync.lastAt, events:EVENTS})) },
  async loadCache(){
    try{ const r=await API.storeRead(Sync.cacheName()); if(r.ok&&r.value){ const o=JSON.parse(r.value); EVENTS=o.events||[]; Sync.lastAt=o.at } }catch{ EVENTS=[] }
    Ev.invalidate()
  },

  // Calendari da leggere: il proprio + (admin) quelli condivisi dei trainer
  calendars(){
    const list=[{calId:CU.calId||'primary', trainerId:CU.id}]
    if(isAdmin()){
      DB.trainers.filter(x=>x.id!==CU.id && x.active!==false && x.calId && x.calId!=='primary')
        .forEach(x=>{ if(!list.some(y=>y.calId===x.calId)) list.push({calId:x.calId, trainerId:x.id}) })
    }
    return list
  },

  // Il messaggio si salva come chiave, così si ritraduce se cambia la lingua
  message(){ return Sync.msgKey ? t(Sync.msgKey, Sync.msgVars) : '' },
  setStatus(state, key, vars){ Sync.state=state; Sync.msgKey=key; Sync.msgVars=vars||null; Sync.renderBadge(); document.querySelectorAll('[data-sync-status]').forEach(el=>Cal.renderStatus(el)) },
  renderBadge(){
    const el=document.getElementById('sync'); if(!el) return
    const n=Sync.myQueue().length, errs=Sync.myQueue().filter(i=>i.error).length
    const online=navigator.onLine && Sync.state!=='offline'
    el.className='sync'+(Sync.state==='error'||errs?' err':online?'':' off')
    document.getElementById('sync-text').textContent =
      (Sync.state==='error' ? t('Da riconnettere') : online ? t('Sincronizzato') : t('Offline'))
      + (n ? ', '+t('{n} in attesa',{n}) : '') + (errs ? ', '+t('{n} con errore',{n:errs}) : '')
    el.title = errs ? Sync.myQueue().filter(i=>i.error).map(i=>i.error).join('\n') : (Sync.lastAt?t('Ultimo aggiornamento: {d}',{d:new Date(Sync.lastAt).toLocaleString(locale())}):'')
  },

  async fetch(){
    if(!CU || Sync._busy) return
    Sync._busy=true
    try{
      Sync.setStatus('loading',N_('Aggiornamento dal calendario…'))
      if(!(await Auth.getToken())){ Sync.offline(Auth.needsRelogin?'RELOGIN':'OFFLINE'); return }
      await Sync.flush()
      const now=new Date()
      const params={timeMin:new Date(now.getFullYear()-1, now.getMonth(), 1).toISOString(), timeMax:new Date(now.getFullYear(), now.getMonth()+4, 0, 23, 59).toISOString(), singleEvents:'true', orderBy:'startTime', maxResults:'2500'}
      let all=[], failed=[]
      for(const {calId, trainerId} of Sync.calendars()){
        let pageToken=null
        do{
          const qs=new URLSearchParams({...params, ...(pageToken?{pageToken}:{})})
          let r
          try{ r=await gfetch(`${CAL_API}/calendars/${encodeURIComponent(calId)}/events?${qs}`) }
          catch(e){ Sync.offline(e.code); return }
          if(!r.ok){ failed.push(Store.trainer(trainerId)?.name||calId); break }
          const d=await r.json()
          for(const it of d.items||[]) if(it.status!=='cancelled') all.push(parseGEvent(it, calId, trainerId))
          pageToken=d.nextPageToken
        } while(pageToken)
      }
      const pending=EVENTS.filter(e=>e.pending)
      EVENTS=all.concat(pending).sort((a,b)=>new Date(a.start)-new Date(b.start))
      Sync.lastAt=new Date().toISOString()
      Ev.invalidate()
      await Sync.saveCache()
      Sync.setStatus('ok', failed.length?N_('Aggiornato alle {time}. Calendario non accessibile: {names}'):N_('Aggiornato alle {time}'), {time:fmtTime(Sync.lastAt), names:failed.join(', ')})
      refresh()
    } finally { Sync._busy=false }
  },

  offline(code){
    if(code==='RELOGIN') Sync.setStatus('error',N_('Sessione Google scaduta: esci e rientra per aggiornare. Stai lavorando sui dati salvati.'))
    else if(Sync.lastAt) Sync.setStatus('offline',N_('Offline: stai vedendo gli appuntamenti salvati il {d}. Le modifiche partono appena torna la connessione.'), {d:new Date(Sync.lastAt).toLocaleString(locale())})
    else Sync.setStatus('offline',N_('Offline: stai vedendo gli appuntamenti salvati. Le modifiche partono appena torna la connessione.'))
    refresh()
  },

  // ── Operazioni sugli eventi (con coda se offline) ──────────
  async enqueue(item){
    item.qid=uid('q'); item.email=CU.email.toLowerCase()
    Sync.queue.push(item); await Sync.saveQueue(); Sync.renderBadge()
  },

  async insert(calId, trainerId, body){
    try{
      const r=await gfetch(`${CAL_API}/calendars/${encodeURIComponent(calId)}/events`,{method:'POST', body:JSON.stringify(body)})
      if(!r.ok){ const e=await r.json().catch(()=>({})); throw new Error(e.error?.message||t('Errore di Google Calendar')) }
      const ev=parseGEvent(await r.json(), calId, trainerId)
      EVENTS.push(ev); Sync.sortSave()
      return {ev, queued:false}
    }catch(e){
      if(!(e instanceof NetError)) throw e
      const ev=parseGEvent({id:uid('local_'), ...body}, calId, trainerId); ev.pending=true
      await Sync.enqueue({op:'insert', calId, trainerId, eventId:ev.id, body})
      EVENTS.push(ev); Sync.sortSave()
      return {ev, queued:true}
    }
  },

  async patch(ev, body){
    const apply=()=>{ const n=parseGEvent({id:ev.id, recurringEventId:ev.recurringId, ...body}, ev.calId, ev.trainerId); n.pending=ev.pending; Object.assign(ev, n) }
    if(ev.pending){
      const ins=Sync.queue.find(q=>q.op==='insert' && q.eventId===ev.id)
      if(ins){ ins.body={...ins.body, ...body}; await Sync.saveQueue(); apply(); Sync.sortSave(); return {queued:true} }
    }
    try{
      const r=await gfetch(`${CAL_API}/calendars/${encodeURIComponent(ev.calId)}/events/${encodeURIComponent(ev.id)}`,{method:'PATCH', body:JSON.stringify(body)})
      if(!r.ok){ const e=await r.json().catch(()=>({})); throw new Error(e.error?.message||t('Errore di Google Calendar')) }
      apply(); Sync.sortSave(); return {queued:false}
    }catch(e){
      if(!(e instanceof NetError)) throw e
      await Sync.enqueue({op:'patch', calId:ev.calId, eventId:ev.id, body})
      apply(); ev.pending=true; Sync.sortSave(); return {queued:true}
    }
  },

  async remove(ev){
    const drop=()=>{ EVENTS=EVENTS.filter(e=>e.id!==ev.id); delete DB.attendance[ev.id]; delete DB.links[ev.id]; Sync.sortSave(); Store.save() }
    if(ev.pending && Sync.queue.some(q=>q.op==='insert' && q.eventId===ev.id)){
      Sync.queue=Sync.queue.filter(q=>q.eventId!==ev.id); await Sync.saveQueue(); drop(); return {queued:false}
    }
    try{
      const r=await gfetch(`${CAL_API}/calendars/${encodeURIComponent(ev.calId)}/events/${encodeURIComponent(ev.id)}`,{method:'DELETE'})
      if(!r.ok && r.status!==404 && r.status!==410){ const e=await r.json().catch(()=>({})); throw new Error(e.error?.message||t('Errore di Google Calendar')) }
      drop(); return {queued:false}
    }catch(e){
      if(!(e instanceof NetError)) throw e
      Sync.queue=Sync.queue.filter(q=>!(q.op==='patch' && q.eventId===ev.id))
      await Sync.enqueue({op:'delete', calId:ev.calId, eventId:ev.id}); drop(); return {queued:true}
    }
  },

  sortSave(){ EVENTS.sort((a,b)=>new Date(a.start)-new Date(b.start)); Ev.invalidate(); Sync.saveCache(); Sync.renderBadge() },

  // Sostituisce l'id provvisorio con quello di Google ovunque
  remap(oldId, newId){
    if(oldId in DB.links){ DB.links[newId]=DB.links[oldId]; delete DB.links[oldId] }
    if(oldId in DB.attendance){ DB.attendance[newId]=DB.attendance[oldId]; delete DB.attendance[oldId] }
    DB.logs.forEach(l=>{ if(l.eventId===oldId) l.eventId=newId })
    Sync.queue.forEach(q=>{ if(q.eventId===oldId) q.eventId=newId })
    const e=EVENTS.find(x=>x.id===oldId); if(e){ e.id=newId; delete e.pending }
  },

  async flush(){
    if(Sync._flushing || !Sync.myQueue().length) return
    Sync._flushing=true
    let sent=0
    try{
      for(const item of [...Sync.myQueue()]){
        const url=`${CAL_API}/calendars/${encodeURIComponent(item.calId)}/events`
        let r
        try{
          if(item.op==='insert') r=await gfetch(url,{method:'POST', body:JSON.stringify(item.body)})
          else if(item.op==='patch') r=await gfetch(`${url}/${encodeURIComponent(item.eventId)}`,{method:'PATCH', body:JSON.stringify(item.body)})
          else r=await gfetch(`${url}/${encodeURIComponent(item.eventId)}`,{method:'DELETE'})
        }catch{ break }
        const gone = item.op!=='insert' && (r.status===404||r.status===410)
        if(!r.ok && !gone){
          const e=await r.json().catch(()=>({}))
          item.error=e.error?.message||t('Errore {code}',{code:r.status})
          continue
        }
        if(item.op==='insert'){ const g=await r.json(); Sync.remap(item.eventId, g.id) }
        else { const e=EVENTS.find(x=>x.id===item.eventId); if(e) delete e.pending }
        Sync.queue=Sync.queue.filter(q=>q.qid!==item.qid)
        sent++
      }
    } finally {
      Sync._flushing=false
      await Sync.saveQueue()
      if(sent){ Store.save(); Sync.sortSave(); toast(tp(sent,'1 modifica inviata a Google Calendar','{n} modifiche inviate a Google Calendar')) }
      Sync.renderBadge()
    }
  },
}

window.addEventListener('online', ()=>{ if(CU) Sync.fetch() })
window.addEventListener('offline', ()=>{ if(CU){ Sync.offline('OFFLINE') } })
setInterval(()=>{ if(CU && navigator.onLine && Sync.myQueue().length) Sync.flush() }, 60000)
setInterval(()=>{ if(CU && navigator.onLine) Sync.fetch() }, 10*60000)
