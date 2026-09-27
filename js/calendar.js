'use strict'
// ═══ CALENDARIO: settimana, elenco, da classificare ═══════════════

const Cal = {
  view:'week', offset:0, inboxAll:false, trainerFilter:'',
  H0:6, H1:23, ROW:52,

  renderStatus(el){
    el.className='cal-status '+(Sync.state==='ok'?'':Sync.state)
    el.innerHTML=`<span class="dot"></span><span>${esc(Sync.message())}</span>
      <button class="btn btn-ghost btn-sm" style="margin-left:auto" onclick="Sync.fetch()"><i class="ti ti-refresh"></i> ${t('Aggiorna')}</button>`
  },

  weekStart(){ const d=new Date(); const dow=(d.getDay()+6)%7; d.setHours(0,0,0,0); d.setDate(d.getDate()-dow+Cal.offset*7); return d },

  events(){
    let evs=Ev.mine()
    if(Cal.trainerFilter) evs=evs.filter(e=>e.trainerId===Cal.trainerFilter)
    return evs
  },

  render(){
    const inboxN=Ev.inbox().length
    const ws=Cal.weekStart(), we=new Date(ws); we.setDate(we.getDate()+6)
    const label = `${fmtShort(ws)} – ${fmtDate(we)}`
    const trainers=DB.trainers.filter(x=>x.active!==false)
    document.getElementById('page-calendario').innerHTML=`
      <div class="head"><div><h1>${t('Calendario')}</h1><p>${t('Gli appuntamenti di Google Calendar, riconosciuti e collegati ai clienti.')}</p></div>
        <div class="actions"><button class="btn btn-primary" onclick="Ev.editor()"><i class="ti ti-plus"></i> ${t('Nuovo appuntamento')}</button></div></div>
      <div class="cal-status" data-sync-status></div>
      <div class="tabs">
        <button class="tab ${Cal.view==='week'?'active':''}" onclick="Cal.view='week';Cal.render()"><i class="ti ti-calendar-week"></i> ${t('Settimana')}</button>
        <button class="tab ${Cal.view==='list'?'active':''}" onclick="Cal.view='list';Cal.render()"><i class="ti ti-list"></i> ${t('Elenco')}</button>
        <button class="tab ${Cal.view==='inbox'?'active':''}" onclick="Cal.view='inbox';Cal.render()"><i class="ti ti-inbox"></i> ${t('Da classificare')} ${inboxN?`<span class="count">${inboxN}</span>`:''}</button>
      </div>
      ${Cal.view!=='inbox'?`<div class="cal-bar">
        <button class="btn btn-line btn-icon" aria-label="${t('Settimana precedente')}" onclick="Cal.offset--;Cal.render()"><i class="ti ti-chevron-left"></i></button>
        <button class="btn btn-line btn-icon" aria-label="${t('Settimana successiva')}" onclick="Cal.offset++;Cal.render()"><i class="ti ti-chevron-right"></i></button>
        <button class="btn btn-line btn-sm" onclick="Cal.offset=0;Cal.render()">${t('Oggi')}</button>
        <span class="label">${label}</span>
        ${isAdmin()&&trainers.length>1?`<select class="in" style="width:200px;margin-left:auto" onchange="Cal.trainerFilter=this.value;Cal.render()"><option value="">${t('Tutto il team')}</option>${trainers.map(x=>`<option value="${x.id}" ${Cal.trainerFilter===x.id?'selected':''}>${esc(x.name)}</option>`).join('')}</select>`:''}
      </div>`:''}
      <div id="cal-body"></div>`
    Cal.renderStatus(document.querySelector('#page-calendario [data-sync-status]'))
    if(Cal.view==='week') Cal.renderWeek(ws)
    else if(Cal.view==='list') Cal.renderList(ws)
    else Cal.renderInbox()
  },

  evClass(e){
    const r=Ev.resolve(e)
    return r.s==='client'?'':r.s==='ignored'?'ignored':'unknown'
  },
  evColor(e){ return Store.trainer(e.trainerId)?.color || '#2F6B57' },

  renderWeek(ws){
    const days=[...Array(7)].map((_,i)=>{ const d=new Date(ws); d.setDate(d.getDate()+i); return d })
    const todayI=isoOf(new Date())
    const hours=[]; for(let h=Cal.H0;h<Cal.H1;h++) hours.push(h)
    const evs=Cal.events()
    const cols=days.map(d=>{
      const iso=isoOf(d)
      const dayEvs=evs.filter(e=>!e.allDay && isoOf(e.start)===iso)
      // colonne per eventi sovrapposti
      const placed=[]
      dayEvs.forEach(e=>{
        const s=new Date(e.start).getTime(), en=new Date(e.end).getTime()
        let col=0; while(placed.some(p=>p.col===col && p.s<en && s<p.en)) col++
        placed.push({e,s,en,col})
      })
      const blocks=placed.map(p=>{
        const overlap=placed.filter(q=>q.s<p.en && p.s<q.en)
        const n=Math.max(...overlap.map(q=>q.col))+1
        const st=new Date(p.s), top=((st.getHours()-Cal.H0)*60+st.getMinutes())/60*Cal.ROW
        const h=Math.max(22,(p.en-p.s)/3600000*Cal.ROW-2)
        const r=Ev.resolve(p.e), c=r.s==='client'?r.c:null
        const color=Cal.evColor(p.e)
        const what = r.s==='client'&&p.e.tipo ? ' '+esc(p.e.tipo) : r.s==='suggest' ? ' '+t('da confermare') : r.s==='unknown' ? ' '+t('da classificare') : ''
        return `<div class="ev ${Cal.evClass(p.e)}" style="top:${top}px;height:${h}px;left:calc(${p.col/n*100}% + 3px);width:calc(${100/n}% - 6px);border-left-color:${r.s==='client'?color:r.s==='ignored'?'var(--ink-3)':'var(--amber)'};${r.s==='client'?`background:${color}1A`:''}"
          onclick="Ev.open('${p.e.id}')" title="${esc(p.e.title)}">
          <b>${p.e.pending?'<i class="ti ti-cloud-upload" style="color:var(--amber)"></i> ':''}${esc(c?Store.fullName(c):p.e.clientName)}</b>
          <span>${fmtTime(p.e.start)}${what}</span></div>`
      }).join('')
      const nowLine = iso===todayI ? (()=>{ const n=new Date(); const top=((n.getHours()-Cal.H0)*60+n.getMinutes())/60*Cal.ROW; return top>0?`<div class="now-line" style="top:${top}px"></div>`:'' })() : ''
      return `<div class="day-col ${iso===todayI?'today':''}" ondblclick="Cal.newAt(event,'${iso}')">${hours.map(()=>'<div class="slot"></div>').join('')}${blocks}${nowLine}</div>`
    }).join('')
    const allDay=evs.filter(e=>e.allDay && days.some(d=>isoOf(d)===isoOf(e.start)))
    document.getElementById('cal-body').innerHTML=`
      ${allDay.length?`<div class="note" style="margin-bottom:12px"><i class="ti ti-calendar-event"></i><div>${t('Eventi di tutto il giorno:')} ${allDay.map(e=>`<a href="#" onclick="Ev.open('${e.id}');return false">${esc(e.title)}</a>`).join(', ')}</div></div>`:''}
      <div class="week">
        <div class="week-head"><div></div>${days.map(d=>`<div class="${isoOf(d)===todayI?'today':''}">${fmtWeekday(d)}<b>${d.getDate()}</b></div>`).join('')}</div>
        <div class="week-body" id="week-body"><div class="hours">${hours.map(h=>`<div>${h}:00</div>`).join('')}</div>${cols}</div>
      </div>
      <div class="legend">
        <span><i class="sw" style="background:var(--green-soft);border-left:3px solid var(--green)"></i> ${t('Cliente riconosciuto')}</span>
        <span><i class="sw" style="background:var(--amber-soft);border-left:3px dashed var(--amber)"></i> ${t('Da classificare')}</span>
        <span><i class="sw" style="background:var(--line-2)"></i> ${t('Non è un allenamento')}</span>
        <span><i class="ti ti-cloud-upload" style="color:var(--amber)"></i> ${t('In attesa di invio')}</span>
        <span class="faint">${t('Doppio clic su un orario per creare un appuntamento.')}</span>
      </div>`
    const wb=document.getElementById('week-body')
    const firsts=evs.filter(e=>!e.allDay && days.some(d=>isoOf(d)===isoOf(e.start))).map(e=>new Date(e.start).getHours())
    const h=firsts.length?Math.min(...firsts):8
    wb.scrollTop=Math.max(0,(h-Cal.H0-0.5)*Cal.ROW)
  },

  newAt(e, iso){
    const rect=e.currentTarget.getBoundingClientRect()
    const mins=Math.floor(((e.clientY-rect.top)/Cal.ROW*60)/30)*30
    const h=Cal.H0+Math.floor(mins/60), m=mins%60
    Ev.editor({date:iso, time:`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`})
  },

  renderList(ws){
    const from=new Date(ws), to=new Date(ws); to.setDate(to.getDate()+14)
    const evs=Cal.events().filter(e=>{ const d=new Date(e.start); return d>=from && d<to })
    const byDay={}; evs.forEach(e=>{ (byDay[isoOf(e.start)] ||= []).push(e) })
    const days=Object.keys(byDay).sort()
    document.getElementById('cal-body').innerHTML = days.length ? days.map(d=>`
      <div class="panel"><div class="panel-h"><h3 style="text-transform:capitalize">${fmtDay(d+'T12:00')}</h3><span class="faint">${tp(byDay[d].length,'1 evento','{n} eventi')}</span></div>
      <div class="panel-b flush">${byDay[d].map(e=>Cal.row(e)).join('')}</div></div>`).join('')
      : `<div class="panel"><div class="empty"><i class="ti ti-calendar-off"></i><b>${t('Nessun appuntamento in queste due settimane')}</b>${t('Crea un appuntamento o scegli un altro periodo.')}</div></div>`
  },

  row(e, extra=''){
    const r=Ev.resolve(e), c=r.s==='client'?r.c:null
    const tr=Store.trainer(e.trainerId)
    const att=DB.attendance[e.id]
    const tag = r.s==='ignored' ? `<span class="tag">${t('Non allenamento')}</span>`
      : r.s==='suggest' ? `<span class="tag blue">${t('Forse {name}',{name:esc(Store.fullName(r.c))})}</span>`
      : r.s==='unknown' ? `<span class="tag amber">${t('Da classificare')}</span>`
      : att ? ({present:`<span class="tag green">${t('Presente')}</span>`,absent:`<span class="tag red">${t('Assente')}</span>`,late:`<span class="tag amber">${t('Disdetta tardiva')}</span>`})[att.s]
      : new Date(e.end)<new Date() ? `<span class="tag">${t('Presenza da segnare')}</span>` : ''
    return `<div class="list-item click" onclick="Ev.open('${e.id}')">
      <div class="ev-t"><b>${e.allDay?t('Tutto il giorno'):fmtTime(e.start)}</b><span>${e.allDay?'':t('{n} min',{n:Math.round(Ev.dur(e))})}</span></div>
      ${c?avatar(Store.fullName(c)):`<span class="av" style="background:var(--line)"><i class="ti ti-calendar-event" style="color:var(--ink-2)"></i></span>`}
      <div class="grow"><b>${esc(c?Store.fullName(c):e.title)}</b><span>${esc([c?e.tipo:'', isAdmin()&&tr?(tr.short||tr.name):''].filter(Boolean).join(', '))}</span></div>
      ${e.pending?`<i class="ti ti-cloud-upload" title="${t('In attesa di invio')}" style="color:var(--amber)"></i>`:''}${tag}${extra}</div>`
  },

  // Da classificare: raggruppati per titolo, così "Anna" si sistema una volta sola
  renderInbox(){
    const evs=Ev.inbox(Cal.inboxAll)
    const groups={}
    evs.forEach(e=>{ const k=normName(e.clientName); (groups[k] ||= []).push(e) })
    const keys=Object.keys(groups).sort((a,b)=>groups[b].length-groups[a].length)
    const intro=`<div class="note"><i class="ti ti-info-circle"></i><div class="grow">${t('Qui finiscono gli appuntamenti che il gestionale non sa a chi assegnare, per esempio “Anna” scritto dal telefono. Collegali al cliente giusto una volta sola: il nome viene ricordato e i prossimi si collegano da soli. Gli eventi personali segnali come <b>non allenamento</b>: non entrano nelle statistiche.')}</div>
      <label class="check" style="margin:0;white-space:nowrap"><input type="checkbox" ${Cal.inboxAll?'checked':''} onchange="Cal.inboxAll=this.checked;Cal.render()"> ${t('Mostra anche i più vecchi')}</label></div>`
    if(!keys.length){
      document.getElementById('cal-body').innerHTML=intro+`<div class="panel"><div class="empty"><i class="ti ti-circle-check" style="color:var(--green)"></i><b>${t('Tutto classificato')}</b>${t('Ogni appuntamento è collegato a un cliente o escluso.')}</div></div>`
      return
    }
    document.getElementById('cal-body').innerHTML=intro+keys.map(k=>{
      const g=groups[k], first=g[0], r=Ev.resolve(first)
      const cands=(r.cands||[]).map(id=>Store.client(id)).filter(c=>c&&Store.canSee(c))
      return `<div class="panel">
        <div class="panel-h"><h3>“${esc(first.clientName)}”<span class="sub">${tp(g.length,'1 appuntamento','{n} appuntamenti')}</span></h3>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            ${r.s==='suggest'?`<button class="btn btn-primary btn-sm" onclick="Cal.groupLink('${k}',${r.c.id})"><i class="ti ti-check"></i> ${t('È {name}',{name:esc(Store.fullName(r.c))})}</button>`:''}
            <select class="in" style="width:220px;padding:6px 10px" id="grp-${esc(k).replace(/\s/g,'_')}"><option value="">${t('Collega a…')}</option>
              ${cands.length?`<optgroup label="${t('Possibili')}">${cands.map(c=>`<option value="${c.id}">${esc(Store.fullName(c))}</option>`).join('')}</optgroup>`:''}
              <optgroup label="${t('Tutti i clienti')}">${Ev.clientOptions()}</optgroup></select>
            <button class="btn btn-line btn-sm" onclick="Cal.groupLinkSel('${k}')">${t('Collega tutti')}</button>
            <button class="btn btn-ghost btn-sm" onclick="Cal.groupIgnore('${k}')"><i class="ti ti-eye-off"></i> ${t('Non è un allenamento')}</button>
          </div></div>
        <div class="panel-b flush">${g.slice(0,6).map(e=>Cal.row(e, `<span class="faint" style="font-size:12px;width:120px;text-align:right">${fmtShort(e.start)}</span>`)).join('')}
          ${g.length>6?`<div class="list-item faint" style="font-size:13px">${t('e altri {n}, stessa azione per tutti',{n:g.length-6})}</div>`:''}</div>
      </div>`
    }).join('')
  },
  groupLink(k, cid){ Ev.linkGroup(k, cid); refresh(); toast(t('Collegati a {name}. Il nome è stato memorizzato.',{name:Store.fullName(Store.client(cid))})) },
  groupLinkSel(k){
    const cid=document.getElementById('grp-'+k.replace(/\s/g,'_'))?.value
    if(!cid){ toast(t('Scegli un cliente'),'err'); return }
    Cal.groupLink(k, cid)
  },
  groupIgnore(k){ Ev.ignoreGroup(k); refresh(); toast(t('Esclusi: anche i prossimi con questo titolo verranno ignorati')) },
}
RENDER.calendario = Cal.render
