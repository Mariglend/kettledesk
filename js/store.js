'use strict'
// ═══ STORE: dati del gestionale, salvataggio cifrato su disco ═══════
//
// DB = {
//   version, updatedAt,
//   settings: { studio, tipi[], methods[], listino[], ignoreTitles[], autoIgnoreAllDay, currency, phonePrefix },
//   trainers: [{id,name,email,short,color,role,calId,targetOre,active}],
//   clients:  [{id,firstName,lastName,aliases[],phone,email,birth,goal,trainerId,status,notes,problems[],measures[],photos[],createdAt}],
//   packages: [{id,clientId,name,lessons,price,purchaseDate,expiryDate,installments[{id,dueDate,amount}],note}],
//   payments: [{id,clientId,packageId,amount,date,method,note,number}],
//   programs: [{id,clientId,name,notes,startDate,active,days[{id,name,exercises[{id,name,sets,reps,load,rest,notes}]}]}],
//   templates:[stessa forma dei programmi, senza clientId],
//   logs:     [{id,clientId,programId,dayId,date,items[{exId,name,sets[{reps,load}]}],note}],
//   links:    { eventId | 'series:'+recurringId : clientId | 'ignored' | 'none' },
//   attendance:{ eventId: {s:'present'|'absent'|'late', clientId, packageId, date} },
//   seq: { client, receipt }
// }

const DEFAULT_TIPI = [
  {name:N_('Forza'),color:'#8A6A36'},{name:N_('Ipertrofia'),color:'#3E6A8A'},{name:N_('Definizione'),color:'#2F6B57'},
  {name:N_('Cardio'),color:'#B7822E'},{name:N_('Benessere'),color:'#7A4E6B'},{name:N_('Rieducazione'),color:'#5B5F8A'},
  {name:N_('Performance'),color:'#355C6B'},{name:N_('Post-parto'),color:'#8A4B3F'},
]
const GOALS = [N_('Dimagrimento'),N_('Tonificazione'),N_('Ipertrofia'),N_('Forza'),N_('Performance'),N_('Benessere'),N_('Rieducazione'),N_('Post-parto'),N_('Postura')]

const CURRENCIES = ['EUR','USD','GBP','CHF','CNY','ALL','BRL','MXN','CAD','AUD','SEK','NOK','DKK','PLN','CZK','RON','HUF','TRY','JPY','INR']

// I nomi predefiniti (tipi, metodi di pagamento) vengono creati nella lingua in uso al primo avvio
function emptyDB(){
  return {
    version:2, updatedAt:null,
    settings:{
      studio:{name:'', address:'', vat:''},
      tipi: DEFAULT_TIPI.map(x=>({...x, name:t(x.name)})),
      methods:[t('Contanti'), t('Carta / POS'), t('Bonifico'), ...(LANG==='it'?['Satispay']:[])],
      listino:[], ignoreTitles:[], autoIgnoreAllDay:true,
      currency: {zh:'CNY', sq:'ALL'}[LANG] || 'EUR',
      phonePrefix: LANGS[LANG]?.phone || '',
    },
    trainers:[], clients:[], packages:[], payments:[], programs:[], templates:[], logs:[],
    links:{}, attendance:{}, seq:{client:1, receipt:1},
  }
}

const Store = {
  _writing: Promise.resolve(),
  _onSave: [],

  async load(){
    const r = await API.storeRead('db')
    if(!r.ok) throw new Error(t('Impossibile leggere i dati: {e}',{e:r.error}))
    if(r.value){
      DB = JSON.parse(r.value)
      Store.normalize()
      return
    }
    // Primo avvio della versione 2: importo i dati della versione precedente (localStorage)
    DB = emptyDB()
    const old = localStorage.getItem('ap_gestionale_v1')
    if(old){
      try { await Store.migrateV1(JSON.parse(old)) } catch(e){ console.error(e); toast(t('Importazione dei dati precedenti incompleta: {e}',{e:e.message}),'err') }
    }
    await Store.saveNow()
    if(old){
      await API.storeWrite('v1-originale', old)       // copia di sicurezza, cifrata
      localStorage.removeItem('ap_gestionale_v1')
      Object.keys(localStorage).filter(k=>k.startsWith('ap_gcal_cache_')).forEach(k=>localStorage.removeItem(k))
    }
  },

  // Completa i campi mancanti (dati importati da backup o versioni precedenti)
  normalize(){
    const d = emptyDB()
    for(const k of Object.keys(d)) if(DB[k]==null) DB[k]=d[k]
    for(const k of Object.keys(d.settings)) if(DB.settings[k]==null) DB.settings[k]=d.settings[k]
    DB.clients.forEach(c=>{ c.aliases??=[]; c.problems??=[]; c.measures??=[]; c.photos??=[]; c.status??='active' })
    DB.packages.forEach(p=>{ p.installments??=[] })
    DB.trainers.forEach(x=>{ x.active??=true; x.targetOre??=80 })
  },

  save(){
    if(!DB) return
    DB.updatedAt = new Date().toISOString()
    Ev.invalidate()
    const snapshot = JSON.stringify(DB)
    Store._writing = Store._writing.then(async()=>{
      const r = await API.storeWrite('db', snapshot)
      if(!r.ok) toast(t('Salvataggio non riuscito: {e}',{e:r.error}), 'err')
    })
    Store._onSave.forEach(fn=>fn())
    return Store._writing
  },
  saveNow(){ return Store.save() },

  // ── Selettori ────────────────────────────────────────────────
  trainer(id){ return DB.trainers.find(x=>x.id===id) },
  trainerByEmail(email){ return DB.trainers.find(x=>(x.email||'').toLowerCase()===(email||'').toLowerCase()) },
  client(id){ return DB.clients.find(c=>c.id==id) },
  fullName(c){ return c ? [c.firstName, c.lastName].filter(Boolean).join(' ') : '' },
  canSee(c){ return isAdmin() || c.trainerId===CU.id },
  // Clienti visibili all'utente (admin: tutti)
  myClients({archived=false}={}){ return DB.clients.filter(c=>Store.canSee(c) && (archived || c.status!=='archived')) },

  packagesOf(cid){ return DB.packages.filter(p=>p.clientId==cid).sort((a,b)=>(b.purchaseDate||'').localeCompare(a.purchaseDate||'')) },
  pkg(id){ return DB.packages.find(p=>p.id===id) },
  pkgUsed(p){ let n=0; for(const a of Object.values(DB.attendance)) if(a.packageId===p.id && (a.s==='present'||a.s==='late')) n++; return n },
  pkgRemaining(p){ return (p.lessons||0) - Store.pkgUsed(p) },
  pkgExpired(p, onISO=todayISO()){ return !!p.expiryDate && p.expiryDate < onISO },
  // Pacchetto su cui scalare una lezione in una certa data
  activePackage(cid, onISO=todayISO()){
    const list = DB.packages.filter(p=>p.clientId==cid).sort((a,b)=>(a.purchaseDate||'').localeCompare(b.purchaseDate||''))
    return list.find(p=>(!p.purchaseDate || p.purchaseDate<=onISO) && !Store.pkgExpired(p,onISO) && Store.pkgRemaining(p)>0)
        || null
  },
  currentPackage(cid){
    return Store.activePackage(cid) || Store.packagesOf(cid)[0] || null
  },

  // ── Presenze ─────────────────────────────────────────────────
  setAttendance(ev, clientId, status){
    const prev = DB.attendance[ev.id]
    if(!status || !clientId){ delete DB.attendance[ev.id]; return }
    let packageId = prev && prev.clientId==clientId ? prev.packageId : null
    if(packageId && !Store.pkg(packageId)) packageId=null
    if(!packageId && status!=='absent'){ packageId = Store.activePackage(clientId, isoOf(ev.start))?.id || null }
    DB.attendance[ev.id] = {s:status, clientId, packageId: status==='absent'?(prev?.packageId&&prev.clientId==clientId?prev.packageId:null):packageId, date:isoOf(ev.start)}
  },

  // ── Foto (file cifrati separati) ─────────────────────────────
  async photoSave(dataUrl){
    const id = uid('ph')
    const r = await API.storeWrite('photo-'+id, dataUrl)
    if(!r.ok) throw new Error(r.error)
    return id
  },
  _photoCache: new Map(),
  async photoLoad(id){
    if(Store._photoCache.has(id)) return Store._photoCache.get(id)
    const r = await API.storeRead('photo-'+id)
    const v = r.ok ? r.value : null
    if(v) Store._photoCache.set(id, v)
    return v
  },
  async photoDelete(id){ Store._photoCache.delete(id); await API.storeDelete('photo-'+id) },

  // ── Migrazione dalla versione 1 (localStorage) ───────────────
  async migrateV1(o){
    DB.trainers = (o.TRAINERS||[]).map(x=>({id:x.id, name:x.name, email:x.email, short:x.short||(x.name||'').split(' ')[0], color:x.color||avColor(x.name), role:x.role||'trainer', calId:x.calId||'primary', targetOre:x.targetOre||80, active:true}))
    let maxId = 0
    for(const c of (o.clients||[])){
      maxId = Math.max(maxId, Number(c.id)||0)
      const parts = (c.name||'').trim().split(/\s+/)
      const nc = {
        id:c.id, firstName:parts[0]||'', lastName:parts.slice(1).join(' '), aliases:[],
        phone:c.phone||'', email:c.email||'', birth:'', age:c.age||null, goal:c.goal||'',
        trainerId:c.trainer, status:'active', notes:c.notes||'',
        problems:(c.problems||[]).map(p=>({id:uid('pb'), type:p.type||'medium', text:p.text||p.desc||p.title||'', date:p.date||''})),
        measures:(c.measures||[]).map(m=>({...m})), photos:[], createdAt:new Date().toISOString(),
      }
      for(const ph of (c.progress||[])){
        if(!ph.data) continue
        const id = await Store.photoSave(ph.data)
        nc.photos.push({id, date:ph.date||new Date().toISOString()})
      }
      if((c.exercises||[]).length){
        DB.programs.push({id:uid('pg'), clientId:c.id, name:t('Scheda importata'), notes:'', startDate:'', active:true,
          days:[{id:uid('d'), name:t('Giorno {l}',{l:'A'}), exercises:c.exercises.map(e=>({id:uid('e'), name:e.name||'', sets:e.serie||'', reps:e.rip||'', load:e.peso||'', rest:'', notes:''}))}]})
      }
      let pkgId = null
      if(c.package && c.package.total){
        pkgId = uid('pk')
        DB.packages.push({id:pkgId, clientId:c.id, name:t('Pacchetto {n} lezioni',{n:c.package.total}), lessons:c.package.total, price:c.package.price||0,
          purchaseDate:c.package.purchaseDate||'', expiryDate:c.package.expiryDate||'', installments:[], note:''})
        if(c.package.price>0) DB.payments.push({id:uid('py'), clientId:c.id, packageId:pkgId, amount:c.package.price, date:c.package.purchaseDate||todayISO(), method:t('Non indicato'), note:t('Importato dalla versione precedente'), number:DB.seq.receipt++})
      }
      for(const [eid, s] of Object.entries(c.attendance||{})){
        DB.attendance[eid] = {s: s==='present'?'present':'absent', clientId:c.id, packageId: s==='present'?pkgId:null, date:''}
      }
      DB.clients.push(nc)
    }
    DB.seq.client = Math.max(maxId+1, o.nextId||1)
    for(const [eid, v] of Object.entries(o.eventLinks||{})){
      DB.links[eid] = (v===0||v==='0') ? 'ignored' : v
    }
    // Coda eventi offline della 1.6
    try {
      const q = JSON.parse(localStorage.getItem('ap_gcal_queue')||'[]')
      if(q.length){
        await API.storeWrite('queue', JSON.stringify(q.map(i=>({qid:uid('q'), op:'insert', email:i.email, calId:i.calId, eventId:i.tempId, body:i.body}))))
        localStorage.removeItem('ap_gcal_queue')
      }
    } catch {}
  },
}

// Liste di supporto (tradotte quando vengono mostrate)
const EXERCISE_LIBRARY = [N_('Squat'),N_('Front squat'),N_('Box squat'),N_('Stacco da terra'),N_('Stacco rumeno'),N_('Stacco sumo'),N_('Panca piana'),N_('Panca inclinata'),N_('Panca con manubri'),N_('Military press'),N_('Lento avanti manubri'),N_('Trazioni alla sbarra'),N_('Lat machine'),N_('Rematore bilanciere'),N_('Rematore manubrio'),N_('Pulley basso'),N_('Pulldown'),N_('Leg press'),N_('Affondi'),N_('Bulgarian split squat'),N_('Hip thrust'),N_('Glute bridge'),N_('Leg curl'),N_('Leg extension'),N_('Calf raise'),N_('Dip'),N_('Push up'),N_('Croci ai cavi'),N_('Alzate laterali'),N_('Face pull'),N_('Curl bilanciere'),N_('Curl manubri'),N_('Hammer curl'),N_('French press'),N_('Push down ai cavi'),N_('Plank'),N_('Side plank'),N_('Dead bug'),N_('Bird dog'),N_('Pallof press'),N_('Farmer walk'),N_('Kettlebell swing'),N_('Goblet squat'),N_('Step up'),N_('Nordic curl'),N_('Good morning'),N_('Russian twist'),N_('Crunch'),N_('Mobilità anche'),N_('Mobilità spalle'),N_('Vogatore'),N_('Bike'),N_('Tapis roulant'),N_('Corda'),N_('Sled push')]
