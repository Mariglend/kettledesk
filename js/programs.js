'use strict'
// ═══ SCHEDE DI ALLENAMENTO, REGISTRO E PROGRESSI ═══════════════════

const Programs = {
  _draft:null, progEx:'',

  of(cid){ return DB.programs.filter(p=>p.clientId==cid).sort((a,b)=>(b.active-a.active)||(b.startDate||'').localeCompare(a.startDate||'')) },
  logsOf(cid){ return DB.logs.filter(l=>l.clientId==cid).sort((a,b)=>b.date.localeCompare(a.date)) },
  // Ultima esecuzione registrata di un esercizio (per nome)
  lastFor(cid, name){
    const k=normName(name)
    for(const l of Programs.logsOf(cid)){ const it=l.items.find(i=>normName(i.name)===k && i.sets.some(s=>s.reps||s.load)); if(it) return {date:l.date, sets:it.sets} }
    return null
  },
  setsText(sets){ return sets.filter(s=>s.reps||s.load).map(s=>`${s.reps||'?'}${s.load?'×'+s.load:''}`).join(', ') },
  bestLoad(sets){ return Math.max(0,...sets.map(s=>num(s.load))) },
  datalist(){
    const names=new Set(EXERCISE_LIBRARY.map(n=>t(n)))
    DB.programs.concat(DB.templates).forEach(p=>p.days.forEach(d=>d.exercises.forEach(e=>e.name&&names.add(e.name))))
    return `<datalist id="ex-lib">${[...names].sort((a,b)=>a.localeCompare(b,locale())).map(n=>`<option value="${esc(n)}">`).join('')}</datalist>`
  },
  dayName(i){ return t('Giorno {l}',{l:String.fromCharCode(65+i)}) },

  // ── Scheda cliente ─────────────────────────────────────────
  clientTab(c, el){
    const progs=Programs.of(c.id), logs=Programs.logsOf(c.id)
    const exNames=[...new Set(logs.flatMap(l=>l.items.filter(i=>i.sets.some(s=>num(s.load)>0)).map(i=>i.name)))]
    if(!exNames.some(n=>n===Programs.progEx)) Programs.progEx=exNames[0]||''
    el.innerHTML=`
      <div class="head" style="margin-bottom:16px"><div></div><div class="actions">
        ${progs.some(p=>p.active)?`<button class="btn btn-line" onclick="Programs.logDialog(${c.id})"><i class="ti ti-barbell"></i> ${t('Registra allenamento')}</button>`:''}
        ${DB.templates.length?`<button class="btn btn-line" onclick="Programs.fromTemplateDialog(${c.id})"><i class="ti ti-copy"></i> ${t('Da modello')}</button>`:''}
        <button class="btn btn-primary" onclick="Programs.editor(${c.id})"><i class="ti ti-plus"></i> ${t('Nuova scheda')}</button></div></div>
      ${progs.map(p=>Programs.card(p, c)).join('') || `<div class="panel"><div class="empty"><i class="ti ti-barbell"></i><b>${t('Nessuna scheda')}</b>${t('Crea la prima scheda: giorni, esercizi, serie, ripetizioni e carichi. Poi registra gli allenamenti per vedere i progressi.')}</div></div>`}
      ${logs.length?`<div class="grid2">
        <div class="panel"><div class="panel-h"><h3>${t('Progressi')}</h3>${exNames.length?`<select class="in" style="width:220px;padding:6px 10px" onchange="Programs.progEx=this.value;Clients.renderDetail()">${exNames.map(n=>`<option ${n===Programs.progEx?'selected':''}>${esc(n)}</option>`).join('')}</select>`:''}</div>
          <div class="panel-b">${Programs.progressChart(c.id, Programs.progEx)}</div></div>
        <div class="panel"><div class="panel-h"><h3>${t('Registro allenamenti')}</h3><span class="faint" style="font-size:12px">${tp(logs.length,'1 sessione','{n} sessioni')}</span></div>
          <div class="panel-b flush" style="max-height:380px;overflow-y:auto">${logs.map(l=>{ const pg=DB.programs.find(x=>x.id===l.programId), d=pg?.days.find(x=>x.id===l.dayId); return `<div class="list-item">
            <div class="grow"><b>${fmtDate(l.date)}${d?`, ${esc(d.name)}`:''}</b><span>${l.items.filter(i=>i.sets.some(s=>s.reps||s.load)).map(i=>`${esc(i.name)} ${esc(Programs.setsText(i.sets))}`).join('; ')}${l.note?`. ${esc(l.note)}`:''}</span></div>
            <button class="btn btn-ghost btn-icon btn-sm" aria-label="${t('Elimina')}" onclick="Programs.delLog('${l.id}')"><i class="ti ti-trash"></i></button></div>`}).join('')}</div></div>
      </div>`:''}`
  },

  card(p, c){
    const info=[p.startDate?t('Dal {date}',{date:fmtDate(p.startDate)}):'', tp(p.days.length,'1 giorno','{n} giorni'), p.notes?esc(p.notes):''].filter(Boolean).join('. ')
    return `<div class="prog">
      <div class="prog-h"><div class="grow"><h3>${esc(p.name)}</h3><div class="faint" style="font-size:12.5px">${info}</div></div>
        ${p.active?`<span class="tag green">${t('Attiva')}</span>`:`<span class="tag">${t('Archiviata')}</span>`}
        <button class="btn btn-line btn-sm" onclick="Programs.print('${p.id}')"><i class="ti ti-printer"></i> ${t('Stampa')}</button>
        <button class="btn btn-line btn-sm" onclick="Programs.editor(${c.id},'${p.id}')"><i class="ti ti-pencil"></i> ${t('Modifica')}</button>
        <button class="btn btn-ghost btn-icon btn-sm" title="${t('Altre azioni')}" onclick="Programs.menu('${p.id}')"><i class="ti ti-dots"></i></button></div>
      ${p.days.map(d=>`<div class="day"><div class="day-h"><h4>${esc(d.name)}</h4><span class="faint" style="font-size:12px">${tp(d.exercises.length,'1 esercizio','{n} esercizi')}</span>
          ${p.active?`<button class="btn btn-ghost btn-sm" style="margin-left:auto" onclick="Programs.logDialog(${c.id},null,'${p.id}','${d.id}')"><i class="ti ti-player-play"></i> ${t('Registra')}</button>`:''}</div>
        <table class="ex-tbl ex-view"><tbody>${d.exercises.map((e,i)=>{ const last=Programs.lastFor(c.id,e.name); return `<tr>
          <td class="ord">${i+1}</td><td class="exn">${esc(e.name)}${e.notes?`<span class="note">${esc(e.notes)}</span>`:''}</td>
          <td>${esc(e.sets||'—')} × ${esc(e.reps||'—')}</td><td>${e.load?esc(e.load):'<span class="faint">—</span>'}</td><td class="faint">${e.rest?t('rec. {rest}',{rest:esc(e.rest)}):''}</td>
          <td class="faint" style="font-size:12.5px;text-align:right">${last?t('ultimo {date}: {sets}',{date:fmtShort(last.date), sets:esc(Programs.setsText(last.sets))}):''}</td></tr>`}).join('')||`<tr><td class="faint">${t('Nessun esercizio')}</td></tr>`}</tbody></table></div>`).join('')}
    </div>`
  },

  menu(pid){
    const p=DB.programs.find(x=>x.id===pid)
    openDialog({title:esc(p.name), body:`<div style="display:flex;flex-direction:column;gap:8px">
      <button class="btn btn-line" onclick="Programs.duplicate('${pid}')"><i class="ti ti-copy"></i> ${t('Duplica come nuova scheda')}</button>
      <button class="btn btn-line" onclick="Programs.saveTemplate('${pid}')"><i class="ti ti-template"></i> ${t('Salva come modello riutilizzabile')}</button>
      <button class="btn btn-line" onclick="Programs.toggle('${pid}')"><i class="ti ${p.active?'ti-archive':'ti-archive-off'}"></i> ${p.active?t('Archivia'):t('Rendi attiva')}</button>
      <button class="btn btn-danger" onclick="Programs.del('${pid}')"><i class="ti ti-trash"></i> ${t('Elimina scheda')}</button></div>`})
  },
  clone(p){ return {...JSON.parse(JSON.stringify(p)), id:uid('pg'), days:p.days.map(d=>({...d, id:uid('d'), exercises:d.exercises.map(e=>({...e, id:uid('e')}))}))} },
  duplicate(pid){
    const p=DB.programs.find(x=>x.id===pid), n=Programs.clone(p)
    n.name=t('{name} (copia)',{name:p.name}); n.startDate=todayISO(); n.active=true
    DB.programs.push(n); Store.save(); closeDialog(); refresh(); toast(t('Scheda duplicata'))
  },
  saveTemplate(pid){
    const p=DB.programs.find(x=>x.id===pid), tpl=Programs.clone(p)
    delete tpl.clientId; delete tpl.active; delete tpl.startDate
    DB.templates.push(tpl); Store.save(); closeDialog(); toast(t('Salvata tra i modelli'))
  },
  toggle(pid){ const p=DB.programs.find(x=>x.id===pid); p.active=!p.active; Store.save(); closeDialog(); refresh() },
  del(pid){
    closeDialog()
    confirmBox(t('Eliminare questa scheda? Il registro degli allenamenti già fatti resta.'), ()=>{ DB.programs=DB.programs.filter(x=>x.id!==pid); Store.save(); refresh(); toast(t('Scheda eliminata')) }, {yes:t('Elimina')})
  },
  fromTemplateDialog(cid){
    openDialog({title:t('Nuova scheda da modello'), body:`<div class="field"><label for="tp-sel">${t('Modello')}</label><select class="in" id="tp-sel">${DB.templates.map(x=>`<option value="${x.id}">${esc(x.name)} (${tp(x.days.length,'1 giorno','{n} giorni')})</option>`).join('')}</select></div>`,
      foot:`<button class="btn btn-line" onclick="closeDialog()">${t('Annulla')}</button><button class="btn btn-primary" onclick="Programs.fromTemplate(${cid})">${t('Crea scheda')}</button>`})
  },
  fromTemplate(cid){
    const tpl=DB.templates.find(x=>x.id===val('tp-sel')), n=Programs.clone(tpl)
    Object.assign(n,{clientId:cid, active:true, startDate:todayISO()})
    DB.programs.push(n); Store.save(); closeDialog(); refresh(); Programs.editor(cid, n.id)
  },

  // ── Editor scheda ──────────────────────────────────────────
  editor(cid, pid, isTemplate=false){
    const src = pid ? (isTemplate?DB.templates:DB.programs).find(x=>x.id===pid) : null
    Programs._draft = src ? JSON.parse(JSON.stringify(src)) : {id:uid('pg'), clientId:cid, name:t('Scheda {month}',{month:fmtMonth(new Date(),true)}), notes:'', startDate:todayISO(), active:true,
      days:[{id:uid('d'), name:Programs.dayName(0), exercises:[{id:uid('e'),name:'',sets:'3',reps:'10',load:'',rest:'90"',notes:''}]}]}
    Programs._isTpl=isTemplate; Programs._isNew=!src
    openDialog({title:isTemplate?t('Modello di scheda'):src?t('Modifica scheda'):t('Nuova scheda'), sub:cid?esc(Store.fullName(Store.client(cid))):'', size:'xwide',
      body:`${Programs.datalist()}<div id="pe-body"></div>`,
      foot:`<button class="btn btn-line" onclick="closeDialog()">${t('Annulla')}</button><button class="btn btn-primary" onclick="Programs.saveEditor()">${t('Salva scheda')}</button>`,
      onOpen:()=>Programs.renderEditor()})
  },
  renderEditor(){
    const p=Programs._draft
    document.getElementById('pe-body').innerHTML=`
      <div class="row3"><div class="field" style="grid-column:span ${Programs._isTpl?3:2}"><label>${t('Nome')}</label><input class="in" data-k="name" value="${esc(p.name)}"></div>
        ${Programs._isTpl?'':`<div class="field"><label>${t('Inizio')}</label><input class="in" type="date" data-k="startDate" value="${esc(p.startDate||'')}"></div>`}</div>
      <div class="field"><label>${t('Note generali')}</label><input class="in" data-k="notes" value="${esc(p.notes||'')}" placeholder="${t('es. riscaldamento 10 minuti, focus tecnica')}"></div>
      ${p.days.map((d,di)=>`<div class="panel" style="margin-bottom:14px"><div class="panel-h">
          <input class="in" data-d="${di}" data-k="name" value="${esc(d.name)}" style="max-width:260px;font-weight:700">
          <div style="display:flex;gap:6px"><button class="btn btn-ghost btn-sm" onclick="Programs.op('dupDay',${di})"><i class="ti ti-copy"></i> ${t('Duplica giorno')}</button>
          ${p.days.length>1?`<button class="btn btn-ghost btn-sm" onclick="Programs.op('delDay',${di})"><i class="ti ti-trash"></i> ${t('Rimuovi giorno')}</button>`:''}</div></div>
        <div class="panel-b" style="padding-top:8px"><table class="ex-tbl"><thead><tr><th></th><th>${t('Esercizio')}</th><th>${t('Serie')}</th><th>${t('Ripetizioni')}</th><th>${t('Carico')}</th><th>${t('Recupero')}</th><th>${t('Note tecniche')}</th><th></th></tr></thead><tbody>
          ${d.exercises.map((e,ei)=>`<tr><td class="ord">${ei+1}</td>
            <td><input class="in" list="ex-lib" data-d="${di}" data-e="${ei}" data-k="name" value="${esc(e.name)}" placeholder="${t('Cerca o scrivi')}"></td>
            <td class="n"><input class="in" data-d="${di}" data-e="${ei}" data-k="sets" value="${esc(e.sets)}"></td>
            <td class="n"><input class="in" data-d="${di}" data-e="${ei}" data-k="reps" value="${esc(e.reps)}" placeholder="8-10"></td>
            <td class="n"><input class="in" data-d="${di}" data-e="${ei}" data-k="load" value="${esc(e.load)}" placeholder="kg"></td>
            <td class="n"><input class="in" data-d="${di}" data-e="${ei}" data-k="rest" value="${esc(e.rest)}"></td>
            <td><input class="in" data-d="${di}" data-e="${ei}" data-k="notes" value="${esc(e.notes)}"></td>
            <td style="white-space:nowrap"><button class="btn btn-ghost btn-icon btn-sm" aria-label="${t('Sposta su')}" onclick="Programs.op('up',${di},${ei})" ${ei===0?'disabled':''}><i class="ti ti-arrow-up"></i></button>
              <button class="btn btn-ghost btn-icon btn-sm" aria-label="${t('Rimuovi')}" onclick="Programs.op('delEx',${di},${ei})"><i class="ti ti-x"></i></button></td></tr>`).join('')}
        </tbody></table>
        <button class="btn btn-line btn-sm" style="margin-top:8px" onclick="Programs.op('addEx',${di})"><i class="ti ti-plus"></i> ${t('Esercizio')}</button></div></div>`).join('')}
      <button class="btn btn-line" onclick="Programs.op('addDay')"><i class="ti ti-plus"></i> ${t('Aggiungi giorno')}</button>`
  },
  collect(){
    const p=Programs._draft
    document.querySelectorAll('#pe-body [data-k]').forEach(el=>{
      const {d,e,k}=el.dataset
      if(d==null) p[k]=el.value
      else if(e==null) p.days[d][k]=el.value
      else p.days[d].exercises[e][k]=el.value
    })
  },
  op(kind, di, ei){
    Programs.collect()
    const days=Programs._draft.days
    if(kind==='addEx'){ const prev=days[di].exercises.at(-1); days[di].exercises.push({id:uid('e'),name:'',sets:prev?.sets||'3',reps:prev?.reps||'10',load:'',rest:prev?.rest||'',notes:''}) }
    if(kind==='delEx') days[di].exercises.splice(ei,1)
    if(kind==='up' && ei>0){ const ex=days[di].exercises; [ex[ei-1],ex[ei]]=[ex[ei],ex[ei-1]] }
    if(kind==='addDay') days.push({id:uid('d'), name:Programs.dayName(days.length), exercises:[{id:uid('e'),name:'',sets:'3',reps:'10',load:'',rest:'',notes:''}]})
    if(kind==='dupDay'){ const d=JSON.parse(JSON.stringify(days[di])); d.id=uid('d'); d.name=Programs.dayName(days.length); d.exercises.forEach(e=>e.id=uid('e')); days.splice(di+1,0,d) }
    if(kind==='delDay') days.splice(di,1)
    Programs.renderEditor()
  },
  saveEditor(){
    Programs.collect()
    const p=Programs._draft
    p.days.forEach(d=>d.exercises=d.exercises.filter(e=>e.name.trim()))
    if(!p.name.trim()){ toast(t('Dai un nome alla scheda'),'err'); return }
    const list=Programs._isTpl?DB.templates:DB.programs
    const i=list.findIndex(x=>x.id===p.id)
    if(i>=0) list[i]=p; else list.push(p)
    Store.save(); closeDialog(); refresh(); toast(t('Scheda salvata'))
  },

  // ── Registra allenamento ───────────────────────────────────
  logDialog(cid, eventId, pid, did){
    const progs=Programs.of(cid).filter(p=>p.active)
    if(!progs.length){ toast(t('Crea prima una scheda attiva'),'err'); go('cliente',cid,'training'); return }
    const p=progs.find(x=>x.id===pid)||progs[0]
    const ev=eventId?Ev.byId(eventId):null
    Programs._log={cid, eventId}
    openDialog({title:t('Registra allenamento'), sub:esc(Store.fullName(Store.client(cid)))+(ev?', '+fmtDay(ev.start):''), size:'xwide',
      body:`<div class="row3"><div class="field"><label for="lg-prog">${t('Scheda')}</label><select class="in" id="lg-prog" onchange="Programs.fillDays()">${progs.map(x=>`<option value="${x.id}" ${x.id===p.id?'selected':''}>${esc(x.name)}</option>`).join('')}</select></div>
        <div class="field"><label for="lg-day">${t('Giorno')}</label><select class="in" id="lg-day" onchange="Programs.renderLogRows()"></select></div>
        <div class="field"><label for="lg-date">${t('Data')}</label><input class="in" type="date" id="lg-date" value="${ev?isoOf(ev.start):todayISO()}"></div></div>
        <div class="faint" style="font-size:12.5px;margin-bottom:10px">${t("Per ogni serie inserisci ripetizioni e carico. I valori proposti sono quelli dell'ultima volta.")}</div>
        <div id="lg-rows"></div>
        <div class="field" style="margin-top:12px"><label for="lg-note">${t('Note della sessione')}</label><input class="in" id="lg-note" placeholder="${t('Sensazioni, dolori, RPE…')}"></div>
        ${ev&&!DB.attendance[ev.id]?`<label class="check"><input type="checkbox" id="lg-present" checked> <span>${t('Segna anche la presenza e scala la lezione dal pacchetto')}</span></label>`:''}`,
      foot:`<button class="btn btn-line" onclick="closeDialog()">${t('Annulla')}</button><button class="btn btn-primary" onclick="Programs.saveLog()">${t('Salva allenamento')}</button>`,
      onOpen:()=>{ Programs.fillDays(did) }})
  },
  fillDays(did){
    const p=DB.programs.find(x=>x.id===val('lg-prog'))
    // giorno suggerito: quello dopo l'ultimo registrato
    const last=DB.logs.filter(l=>l.programId===p.id).sort((a,b)=>b.date.localeCompare(a.date))[0]
    const li=last?p.days.findIndex(d=>d.id===last.dayId):-1
    const sug=did || p.days[(li+1)%p.days.length]?.id
    document.getElementById('lg-day').innerHTML=p.days.map(d=>`<option value="${d.id}" ${d.id===sug?'selected':''}>${esc(d.name)}</option>`).join('')
    Programs.renderLogRows()
  },
  renderLogRows(){
    const p=DB.programs.find(x=>x.id===val('lg-prog')), d=p.days.find(x=>x.id===val('lg-day'))
    const cid=Programs._log.cid
    document.getElementById('lg-rows').innerHTML=`<table class="ex-tbl"><thead><tr><th>${t('Esercizio')}</th><th>${t('Previsto')}</th><th>${t('Serie eseguite (ripetizioni × carico)')}</th></tr></thead><tbody>
      ${d.exercises.map((e,ei)=>{
        const last=Programs.lastFor(cid,e.name)
        const n=Math.max(1,Math.min(10, parseInt(e.sets)||last?.sets.length||3))
        return `<tr><td class="exn" style="font-weight:600;padding-top:10px;vertical-align:top;min-width:180px">${esc(e.name)}${last?`<div class="faint" style="font-size:12px;font-weight:400">${t('ultimo: {sets}',{sets:esc(Programs.setsText(last.sets))})}</div>`:''}</td>
          <td class="faint" style="vertical-align:top;padding-top:10px;white-space:nowrap">${esc(e.sets||'')}×${esc(e.reps||'')}${e.load?' @ '+esc(e.load):''}</td>
          <td><div style="display:flex;flex-wrap:wrap;gap:6px">${[...Array(n)].map((_,si)=>{ const ls=last?.sets[si]; return `<div style="display:flex;gap:3px;align-items:center;background:var(--paper-2);border:1px solid var(--line-2);border-radius:8px;padding:4px 6px">
            <span class="faint" style="font-size:11px;width:14px">${si+1}</span>
            <input class="in" style="width:52px;padding:5px 7px" data-lx="${ei}" data-ls="${si}" data-lk="reps" value="${esc(ls?.reps||String(e.reps||'').split('-')[0])}" aria-label="${t('Ripetizioni serie {n}',{n:si+1})}">
            <span class="faint">×</span><input class="in" style="width:62px;padding:5px 7px" data-lx="${ei}" data-ls="${si}" data-lk="load" value="${esc(ls?.load||String(e.load||'').replace(/[^0-9.,]/g,''))}" placeholder="kg" aria-label="${t('Carico serie {n}',{n:si+1})}"></div>`}).join('')}
            <button class="btn btn-ghost btn-sm" onclick="Programs.addSet(this,${ei})" aria-label="${t('Aggiungi serie')}"><i class="ti ti-plus"></i></button></div></td></tr>`}).join('')}</tbody></table>`
  },
  addSet(btn, ei){
    const box=btn.parentElement, blocks=box.querySelectorAll(':scope > div'), last=blocks[blocks.length-1], si=blocks.length
    const n=last.cloneNode(true)
    n.querySelector('span').textContent=si+1
    n.querySelectorAll('input').forEach(i=>i.dataset.ls=si)
    box.insertBefore(n, btn)
  },
  saveLog(){
    const p=DB.programs.find(x=>x.id===val('lg-prog')), d=p.days.find(x=>x.id===val('lg-day'))
    const items=d.exercises.map((e,ei)=>{
      const sets=[]
      document.querySelectorAll(`#lg-rows [data-lx="${ei}"][data-lk="reps"]`).forEach(inp=>{
        const si=inp.dataset.ls, load=document.querySelector(`#lg-rows [data-lx="${ei}"][data-ls="${si}"][data-lk="load"]`).value.trim().replace(',','.')
        if(inp.value.trim()||load) sets.push({reps:inp.value.trim(), load})
      })
      return {exId:e.id, name:e.name, sets}
    }).filter(i=>i.sets.length)
    if(!items.length){ toast(t('Inserisci almeno una serie'),'err'); return }
    const {cid, eventId}=Programs._log
    DB.logs.push({id:uid('lg'), clientId:cid, programId:p.id, dayId:d.id, date:val('lg-date')||todayISO(), eventId:eventId||null, items, note:val('lg-note')})
    if(eventId && checked('lg-present')) Store.setAttendance(Ev.byId(eventId), cid, 'present')
    Store.save(); closeDialog(); refresh(); toast(t('Allenamento registrato'))
  },
  delLog(id){ confirmBox(t('Eliminare questa sessione dal registro?'), ()=>{ DB.logs=DB.logs.filter(l=>l.id!==id); Store.save(); refresh() }, {yes:t('Elimina')}) },

  progressChart(cid, name){
    if(!name) return `<div class="faint">${t('Registra un allenamento con i carichi per vedere i progressi.')}</div>`
    const k=normName(name)
    const pts=Programs.logsOf(cid).slice().reverse().map(l=>{ const it=l.items.find(i=>normName(i.name)===k); return it?{date:l.date, v:Programs.bestLoad(it.sets)}:null }).filter(p=>p&&p.v>0)
    if(!pts.length) return `<div class="faint">${t('Nessun carico registrato per questo esercizio.')}</div>`
    const W=520,H=190,P=34, vs=pts.map(p=>p.v), mn=Math.min(...vs)*0.95, mx=Math.max(...vs)*1.05||1
    const x=i=>P+(pts.length===1?(W-2*P)/2:i*(W-2*P)/(pts.length-1)), y=v=>H-P-(v-mn)/(mx-mn||1)*(H-2*P)
    const d=pts.at(-1).v-pts[0].v
    return `<div style="display:flex;gap:24px;margin-bottom:10px">
        <div><div class="faint" style="font-size:12px">${t('Carico massimo')}</div><b style="font-size:22px">${numText(Math.max(...vs))} kg</b></div>
        <div><div class="faint" style="font-size:12px">${t('Dal primo allenamento')}</div><b style="font-size:22px" class="${d>0?'up':d<0?'down':'flat'}">${d>0?'+':''}${numText(Math.round(d*10)/10)} kg</b></div>
        <div><div class="faint" style="font-size:12px">${t('Sessioni')}</div><b style="font-size:22px">${pts.length}</b></div></div>
      <svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block">
        ${[0,1,2,3].map(i=>{ const v=mn+(mx-mn)*i/3; return `<line x1="${P}" x2="${W-P}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line-2)"/><text x="${P-6}" y="${y(v)+4}" text-anchor="end" font-size="10" fill="var(--ink-3)">${Math.round(v)}</text>` }).join('')}
        <polyline fill="none" stroke="var(--forest-3)" stroke-width="2.5" stroke-linejoin="round" points="${pts.map((p,i)=>x(i)+','+y(p.v)).join(' ')}"/>
        ${pts.map((p,i)=>`<circle cx="${x(i)}" cy="${y(p.v)}" r="4" fill="var(--brass)"><title>${fmtDate(p.date)}: ${numText(p.v)} kg</title></circle>`).join('')}
        ${pts.map((p,i)=> (pts.length<=8 || i%Math.ceil(pts.length/8)===0) ? `<text x="${x(i)}" y="${H-10}" text-anchor="middle" font-size="10" fill="var(--ink-3)">${fmtShort(p.date)}</text>`:'').join('')}
      </svg>`
  },

  // ── Stampa ─────────────────────────────────────────────────
  print(pid){
    const p=DB.programs.find(x=>x.id===pid), c=Store.client(p.clientId), tr=Store.trainer(c.trainerId)
    const who=[esc(Store.fullName(c)), tr?t('trainer {name}',{name:esc(tr.name)}):'', p.startDate?t('dal {date}',{date:fmtDate(p.startDate)}):''].filter(Boolean).join(', ')
    const wk=n=>`<th style="width:9%">${t('Sett. {n}',{n})}</th>`
    printHtml(`<div class="pr-head"><div><div class="mono">${esc(studioMono())}</div><div style="font-size:10pt;color:#555;margin-top:4px">${esc(studioName())}</div></div>
      <div style="text-align:right"><h1>${esc(p.name)}</h1><div>${who}</div></div></div>
      ${p.notes?`<p style="margin-bottom:14px">${esc(p.notes)}</p>`:''}
      ${p.days.map(d=>`<div class="pr-day"><h2>${esc(d.name)}</h2><table class="pr-tbl"><thead><tr><th style="width:4%">#</th><th style="width:30%">${t('Esercizio')}</th><th>${t('Serie')}</th><th>${t('Rip.')}</th><th>${t('Carico')}</th><th>${t('Rec.')}</th>${wk(1)}${wk(2)}${wk(3)}${wk(4)}</tr></thead>
        <tbody>${d.exercises.map((e,i)=>`<tr><td>${i+1}</td><td><b>${esc(e.name)}</b>${e.notes?`<div style="font-size:9pt;color:#666">${esc(e.notes)}</div>`:''}</td><td>${esc(e.sets)}</td><td>${esc(e.reps)}</td><td>${esc(e.load)}</td><td>${esc(e.rest)}</td><td></td><td></td><td></td><td></td></tr>`).join('')}</tbody></table></div>`).join('')}
      <div class="pr-foot">${t('Stampata il {date}.',{date:fmtDate(new Date())})}</div>`)
  },
}
