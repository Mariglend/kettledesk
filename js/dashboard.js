'use strict'
// ═══ OGGI: agenda del giorno e cose da fare ═══════════════════════

const Dash = {
  render(){
    const now=new Date(), today=todayISO()
    const mine=Ev.mine().filter(e=>!e.allDay)
    const todayEv=mine.filter(e=>isoOf(e.start)===today && Ev.resolve(e).s!=='ignored')
    const ws=new Date(now); ws.setHours(0,0,0,0); ws.setDate(ws.getDate()-((ws.getDay()+6)%7)); const we=new Date(ws); we.setDate(we.getDate()+7)
    const week=Ev.sessions(e=>{ const d=new Date(e.start); return d>=ws && d<we })
    const inbox=Ev.inbox(), confirm=Ev.toConfirm().sort((a,b)=>new Date(b.start)-new Date(a.start))
    const low=Store.myClients().map(c=>({c,p:Store.currentPackage(c.id)})).filter(x=>x.p && (Store.pkgExpired(x.p)||Store.pkgRemaining(x.p)<=2))
    const h=now.getHours(), first=esc(CU.name.split(' ')[0])
    const hello=h<13?t('Buongiorno, {name}',{name:first}):h<18?t('Buon pomeriggio, {name}',{name:first}):t('Buonasera, {name}',{name:first})
    const upcoming=mine.filter(e=>{ const d=new Date(e.start); return isoOf(d)>today && d<new Date(now.getTime()+7*864e5) && Ev.resolve(e).s!=='ignored' }).slice(0,8)

    let money=''
    if(isAdmin()){
      const r=periodRange('month')
      const inc=DB.payments.filter(p=>inRange(p.date,r)).reduce((a,p)=>a+num(p.amount),0)
      const due=Money.openPackages().reduce((a,p)=>a+Money.due(p),0)
      const late=DB.packages.filter(p=>Money.overdue(p)>0.005)
      money=`<div class="kpis k3">
        <div class="kpi click" onclick="go('incassi')"><div class="l"><i class="ti ti-cash"></i>${t('Incassato questo mese')}</div><div class="v">${eur(inc)}</div></div>
        <div class="kpi click" onclick="Money.view='open';go('incassi')"><div class="l"><i class="ti ti-hourglass"></i>${t('Da incassare')}</div><div class="v">${eur(due)}</div></div>
        <div class="kpi click ${late.length?'warn':''}" onclick="Money.view='open';go('incassi')"><div class="l"><i class="ti ti-alarm"></i>${t('Rate in ritardo')}</div><div class="v">${late.length}</div><div class="s">${late.length?t('{amount} da recuperare',{amount:eur(late.reduce((a,p)=>a+Money.overdue(p),0),2)}):t('tutto in regola')}</div></div></div>`
    }

    document.getElementById('page-dashboard').innerHTML=`
      <div class="head"><div><h1>${hello}</h1><p style="text-transform:capitalize">${fmtDay(now)}</p></div>
        <div class="actions"><button class="btn btn-line" onclick="Clients.editor()"><i class="ti ti-user-plus"></i> ${t('Nuovo cliente')}</button><button class="btn btn-primary" onclick="Ev.editor()"><i class="ti ti-calendar-plus"></i> ${t('Nuovo appuntamento')}</button></div></div>
      <div class="cal-status" data-sync-status></div>
      <div class="kpis">
        <div class="kpi"><div class="l"><i class="ti ti-sun"></i>${t('Oggi')}</div><div class="v">${todayEv.filter(e=>Ev.resolve(e).s==='client').length}</div><div class="s">${t('sessioni in agenda')}</div></div>
        <div class="kpi click" onclick="go('calendario')"><div class="l"><i class="ti ti-calendar-week"></i>${t('Questa settimana')}</div><div class="v">${week.length}</div><div class="s">${t('{h} ore con clienti',{h:numText(Math.round(week.reduce((a,e)=>a+Ev.dur(e)/60,0)*10)/10)})}</div></div>
        <div class="kpi click ${inbox.length?'warn':''}" onclick="Cal.view='inbox';go('calendario')"><div class="l"><i class="ti ti-inbox"></i>${t('Da classificare')}</div><div class="v">${inbox.length}</div><div class="s">${t('appuntamenti senza cliente')}</div></div>
        <div class="kpi ${confirm.length?'warn':''}"><div class="l"><i class="ti ti-checklist"></i>${t('Presenze da segnare')}</div><div class="v">${confirm.length}</div><div class="s">${t('sessioni passate')}</div></div>
      </div>
      ${money}
      <div class="grid-main">
        <div>
          <div class="panel"><div class="panel-h"><h3>${t('Agenda di oggi')}</h3><button class="btn btn-ghost btn-sm" onclick="Cal.view='week';Cal.offset=0;go('calendario')">${t('Settimana')}</button></div>
            ${todayEv.length?`<div class="agenda">${todayEv.map(e=>Dash.agItem(e, now)).join('')}</div>`
              :`<div class="empty"><i class="ti ti-mood-smile"></i><b>${t('Nessun appuntamento oggi')}</b>${upcoming.length?t('Il prossimo è {day} alle {time}.',{day:fmtDay(upcoming[0].start), time:fmtTime(upcoming[0].start)}):t('Nessun appuntamento nei prossimi 7 giorni.')}</div>`}</div>
          <div class="panel"><div class="panel-h"><h3>${t('Prossimi giorni')}</h3></div><div class="panel-b flush">${upcoming.map(e=>Cal.row(e,`<span class="faint" style="font-size:12px;width:120px;text-align:right;text-transform:capitalize">${new Date(e.start).toLocaleDateString(locale(),{weekday:'short',day:'numeric',month:'short'})}</span>`)).join('')||`<div class="empty">${t('Niente in programma.')}</div>`}</div></div>
        </div>
        <div>
          ${confirm.length?`<div class="panel"><div class="panel-h"><h3>${t('Presenze da segnare')}</h3><span class="faint" style="font-size:12px">${t('scalano le lezioni')}</span></div><div class="panel-b flush">
            ${confirm.slice(0,6).map(e=>{ const c=Ev.clientOf(e); return `<div class="list-item">${avatar(Store.fullName(c),'sm')}<div class="grow"><b>${esc(Store.fullName(c))}</b><span>${fmtShort(e.start)}, ${fmtTime(e.start)}</span></div>
              <button class="btn btn-line btn-sm" title="${t('Presente')}" onclick="Dash.att('${e.id}','present')"><i class="ti ti-check"></i></button>
              <button class="btn btn-ghost btn-sm" title="${t('Altre opzioni')}" onclick="Ev.open('${e.id}')"><i class="ti ti-dots"></i></button></div>` }).join('')}
            ${confirm.length>6?`<div class="list-item faint" style="font-size:13px">${t('e altre {n}: le trovi nella scheda di ogni cliente, alla voce Presenze',{n:confirm.length-6})}</div>`:''}</div></div>`:''}
          ${inbox.length?`<div class="panel"><div class="panel-h"><h3>${t('Da classificare')}</h3><button class="btn btn-ghost btn-sm" onclick="Cal.view='inbox';go('calendario')">${t('Apri')}</button></div><div class="panel-b flush">
            ${[...new Map(inbox.map(e=>[normName(e.clientName),e])).values()].slice(0,5).map(e=>{ const r=Ev.resolve(e); return `<div class="list-item click" onclick="Ev.open('${e.id}')"><span class="av sm" style="background:var(--amber-soft);color:var(--amber)"><i class="ti ti-question-mark"></i></span><div class="grow"><b>“${esc(e.clientName)}”</b><span>${r.s==='suggest'?t('forse {name}',{name:esc(Store.fullName(r.c))}):t('cliente non riconosciuto')}</span></div></div>` }).join('')}</div></div>`:''}
          <div class="panel"><div class="panel-h"><h3>${t('Pacchetti in esaurimento')}</h3></div><div class="panel-b flush">
            ${low.map(x=>`<div class="list-item click" onclick="go('cliente',${x.c.id},'packages')">${avatar(Store.fullName(x.c),'sm')}<div class="grow"><b>${esc(Store.fullName(x.c))}</b><span>${esc(x.p.name)}</span></div><span class="tag ${Store.pkgExpired(x.p)||Store.pkgRemaining(x.p)<=0?'red':'amber'}">${Store.pkgExpired(x.p)?t('scaduto'):Store.pkgRemaining(x.p)<=0?t('esaurito'):tp(Store.pkgRemaining(x.p),'1 rimasta','{n} rimaste')}</span></div>`).join('')||`<div class="empty">${t('Nessun pacchetto in esaurimento.')}</div>`}</div></div>
        </div>
      </div>`
    Cal.renderStatus(document.querySelector('#page-dashboard [data-sync-status]'))
  },
  agItem(e, now){
    const r=Ev.resolve(e), c=r.s==='client'?r.c:null, att=DB.attendance[e.id]
    const st=new Date(e.start), en=new Date(e.end)
    const cls = st<=now&&en>now ? 'now' : att ? 'done' : !c ? 'unknown' : ''
    const p=c?Store.activePackage(c.id):null
    const warn=c?.problems.find(x=>x.type==='high')
    const info = c
      ? [esc(e.tipo), p?tp(Store.pkgRemaining(p),'1 lezione rimasta','{n} lezioni rimaste'):t('nessun pacchetto attivo')]
      : [r.s==='suggest'?t('Forse {name}, da confermare',{name:esc(Store.fullName(r.c))}):t('Da classificare')]
    if(isAdmin() && DB.trainers.length>1) info.push(esc(Store.trainer(e.trainerId)?.short||''))
    return `<div class="ag-item ${cls}" onclick="Ev.open('${e.id}')">
      <div class="ag-time">${fmtTime(st)}<small>${t('{n} min',{n:Math.round(Ev.dur(e))})}</small></div><div class="ag-dot"></div>
      <div class="ag-body"><b>${esc(c?Store.fullName(c):e.clientName)}</b><span>${info.filter(Boolean).join(', ')}</span>
        ${warn?`<span style="color:var(--red)"><i class="ti ti-alert-triangle"></i> ${esc(warn.text)}</span>`:''}</div>
      <div>${att?({present:`<span class="tag green">${t('Presente')}</span>`,absent:`<span class="tag red">${t('Assente')}</span>`,late:`<span class="tag amber">${t('Disdetta')}</span>`})[att.s]:cls==='now'?`<span class="tag brass">${t('In corso')}</span>`:''}</div></div>`
  },
  att(id, st){ const e=Ev.byId(id); Store.setAttendance(e, Ev.clientOf(e).id, st); Store.save(); refresh(); toast(t('Presenza segnata')) },
}
RENDER.dashboard = Dash.render
