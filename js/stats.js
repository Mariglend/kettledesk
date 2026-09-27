'use strict'
// ═══ STATISTICHE (contano solo gli appuntamenti collegati a un cliente) ═══

const Stats = {
  period:'month', trainer:'',

  tipoColor(name){ return DB.settings.tipi.find(x=>x.name===name)?.color || '#8C938E' },
  // Nomi dei giorni nella lingua scelta (1 gennaio 2024 era lunedì)
  dayNames(){ return [...Array(7)].map((_,i)=>new Date(2024,0,1+i).toLocaleDateString(locale(),{weekday:'long'})) },

  render(){
    const admin=isAdmin()
    const tId = admin ? Stats.trainer : CU.id
    const tr = tId ? Store.trainer(tId) : null
    const color = tr?.color || '#23483D'
    const all = Ev.sessions(e=>!tId || e.trainerId===tId)
    const r=periodRange(Stats.period), pr=prevRange(Stats.period)
    const cur=all.filter(e=>inRange(e.start,r)), prev=all.filter(e=>inRange(e.start,pr))
    const hrs=evs=>evs.reduce((a,e)=>a+Ev.dur(e)/60,0)
    const ore=hrs(cur), oreP=hrs(prev)
    const dO=oreP>0?Math.round((ore-oreP)/oreP*100):null, dS=prev.length?Math.round((cur.length-prev.length)/prev.length*100):null
    const weeks=Math.max(1,(Math.min(r.end,new Date(Math.max(Date.now(), r.start.getTime())))-r.start)/(7*864e5))
    const avg=cur.length?Math.round(ore/cur.length*60):0
    const unclassified=Ev.mine().filter(e=>(!tId||e.trainerId===tId) && inRange(e.start,r) && ['unknown','suggest'].includes(Ev.resolve(e).s)).length

    // presenze nel periodo
    let p=0,a=0,l=0
    cur.forEach(e=>{ const x=DB.attendance[e.id]; if(x?.s==='present')p++; else if(x?.s==='absent')a++; else if(x?.s==='late')l++ })
    const tasso=p+a+l?pct(p,p+a+l):null
    const myCl=Store.myClients().filter(c=>!tId||c.trainerId===tId)
    const activeInPeriod=new Set(cur.map(e=>Ev.clientOf(e).id))

    // per tipo
    const byTipo={}; cur.forEach(e=>{ (byTipo[e.tipo] ||= {n:0,h:0}); byTipo[e.tipo].n++; byTipo[e.tipo].h+=Ev.dur(e)/60 })
    const byTipoP={}; prev.forEach(e=>{ byTipoP[e.tipo]=(byTipoP[e.tipo]||0)+1 })
    const tipi=Object.entries(byTipo).sort((a,b)=>b[1].n-a[1].n)
    // giorni e ore
    const dayN=[0,0,0,0,0,0,0], hourN={}
    cur.forEach(e=>{ const d=new Date(e.start); dayN[(d.getDay()+6)%7]++; hourN[d.getHours()]=(hourN[d.getHours()]||0)+1 })
    const dayL=Stats.dayNames()
    const maxD=Math.max(1,...dayN)
    const hours=[...Array(16)].map((_,i)=>i+6), maxH=Math.max(1,...hours.map(h=>hourN[h]||0))
    // 12 mesi
    const n=new Date()
    const months=[...Array(12)].map((_,i)=>{ const m=new Date(n.getFullYear(), n.getMonth()-11+i, 1); const ev=all.filter(e=>{const d=new Date(e.start); return d.getFullYear()===m.getFullYear()&&d.getMonth()===m.getMonth()}); return {m, h:Math.round(hrs(ev)*10)/10, n:ev.length} })
    // clienti più assidui
    const byClient={}; cur.forEach(e=>{ const c=Ev.clientOf(e); byClient[c.id]=(byClient[c.id]||0)+1 })
    const top=Object.entries(byClient).sort((a,b)=>b[1]-a[1]).slice(0,6)
    // a rischio: nessun appuntamento futuro e ultimo oltre 21 giorni
    const now=Date.now(), em=Clients.eventMap()
    const risk=myCl.map(c=>{ const ev=em.get(c.id)||[]; if(!ev.length) return null; const past=ev.filter(e=>new Date(e.start).getTime()<now); if(!past.length||ev.some(e=>new Date(e.start).getTime()>=now)) return null
      const days=Math.floor((now-new Date(past.at(-1).start))/864e5); return days>=21?{c,days,last:past.at(-1).start}:null }).filter(Boolean).sort((a,b)=>b.days-a.days).slice(0,6)
    // pacchetti da gestire
    const pk=myCl.map(c=>({c,p:Store.currentPackage(c.id)})).filter(x=>x.p && (Store.pkgExpired(x.p)||Store.pkgRemaining(x.p)<=2))

    const insights=[]
    if(tipi.length) insights.push(['ti-star',t("L'allenamento più richiesto è {tipo}, con il {pct}% delle sessioni.",{tipo:esc(tipi[0][0]), pct:pct(tipi[0][1].n,cur.length)})])
    const topH=Object.entries(hourN).sort((a,b)=>b[1]-a[1])[0]; if(topH) insights.push(['ti-clock',tp(topH[1],'La fascia più piena è {from}:00–{to}:00, con 1 sessione.','La fascia più piena è {from}:00–{to}:00, con {n} sessioni.',{from:topH[0], to:+topH[0]+1})])
    const topD=dayN.indexOf(Math.max(...dayN)); if(cur.length) insights.push(['ti-calendar-event',t('Il giorno più intenso: {day}.',{day:dayL[topD]})])
    if(tasso!==null && tasso<75) insights.push(['ti-user-x',t('Costanza al {pct}%: valuta promemoria prima delle sessioni o una regola per le disdette.',{pct:tasso})])
    if(unclassified) insights.push(['ti-inbox',tp(unclassified,'1 appuntamento del periodo è da classificare e non è ancora conteggiato.','{n} appuntamenti del periodo sono da classificare e non sono ancora conteggiati.')])

    const trainers=DB.trainers.filter(x=>x.active!==false)
    document.getElementById('page-statistiche').innerHTML=`
      <div class="head"><div><h1>${t('Statistiche')}</h1><p>${tr?esc(tr.name):t('Tutto il team')}, ${t(PERIODS[Stats.period])}. ${t('Contano solo gli appuntamenti collegati a un cliente.')}</p></div>
        <div class="actions">${admin&&trainers.length>1?`<select class="in" style="width:190px" onchange="Stats.trainer=this.value;Stats.render()"><option value="">${t('Tutto il team')}</option>${trainers.map(x=>`<option value="${x.id}" ${Stats.trainer===x.id?'selected':''}>${esc(x.name)}</option>`).join('')}</select>`:''}
          <select class="in" style="width:170px" onchange="Stats.period=this.value;Stats.render()">${Object.entries(PERIODS).filter(([k])=>k!=='all').map(([k,v])=>`<option value="${k}" ${Stats.period===k?'selected':''}>${t(v)}</option>`).join('')}</select></div></div>
      ${unclassified?`<div class="note amber"><i class="ti ti-inbox"></i><div class="grow">${tp(unclassified,'<b>1 appuntamento da classificare</b> in questo periodo: collegalo a un cliente per contarlo.','<b>{n} appuntamenti da classificare</b> in questo periodo: collegali ai clienti per contarli.')}</div><button class="btn btn-line btn-sm" onclick="Cal.view='inbox';go('calendario')">${t('Classifica')}</button></div>`:''}
      <div class="kpis">
        <div class="kpi"><div class="l"><i class="ti ti-clock"></i>${t('Ore di lavoro')}</div><div class="v">${numText(Math.round(ore*10)/10)}<small>h</small></div><div class="s">${t('{trend} rispetto al periodo prima',{trend:trend(dO)})}</div></div>
        <div class="kpi"><div class="l"><i class="ti ti-calendar-check"></i>${t('Sessioni')}</div><div class="v">${cur.length}</div><div class="s">${t('{trend} rispetto al periodo prima',{trend:trend(dS)})}</div></div>
        <div class="kpi"><div class="l"><i class="ti ti-calendar-stats"></i>${t('A settimana')}</div><div class="v">${numText(Math.round(cur.length/weeks*10)/10)}</div><div class="s">${t('durata media {n} minuti',{n:avg})}</div></div>
        <div class="kpi"><div class="l"><i class="ti ti-user-check"></i>${t('Costanza')}</div><div class="v">${tasso===null?'—':tasso+'%'}</div><div class="s">${t('{p} presenze, {a} assenze, {l} disdette tardive',{p,a,l})}</div></div>
      </div>
      <div class="kpis">
        <div class="kpi"><div class="l"><i class="ti ti-users"></i>${t('Clienti attivi')}</div><div class="v">${activeInPeriod.size}<small>/ ${myCl.length}</small></div><div class="s">${t('con almeno una sessione')}</div></div>
        <div class="kpi"><div class="l"><i class="ti ti-repeat"></i>${t('Sessioni per cliente')}</div><div class="v">${activeInPeriod.size?numText(Math.round(cur.length/activeInPeriod.size*10)/10):'—'}</div><div class="s">${t('nel periodo')}</div></div>
        <div class="kpi"><div class="l"><i class="ti ti-ticket"></i>${t('Lezioni da erogare')}</div><div class="v">${myCl.reduce((s,c)=>{ const q=Store.activePackage(c.id); return s+(q?Math.max(0,Store.pkgRemaining(q)):0) },0)}</div><div class="s">${t('sui pacchetti in corso')}</div></div>
        <div class="kpi ${myCl.filter(c=>c.problems.some(x=>x.type==='high')).length?'warn':''}"><div class="l"><i class="ti ti-alert-triangle"></i>${t('Da seguire con attenzione')}</div><div class="v">${myCl.filter(c=>c.problems.some(x=>x.type==='high')).length}</div><div class="s">${t('problematiche ad alta priorità')}</div></div>
      </div>
      ${insights.length?`<div class="panel"><div class="panel-b" style="display:flex;flex-direction:column;gap:10px">${insights.map(([i,txt])=>`<div style="display:flex;gap:12px;align-items:center"><i class="ti ${i}" style="color:var(--brass);font-size:18px"></i><span>${txt}</span></div>`).join('')}</div></div>`:''}
      <div class="grid2">
        <div class="panel"><div class="panel-h"><h3>${t('Tipi di allenamento')}</h3></div><div class="panel-b">${tipi.length?`<div class="hbars">${tipi.map(([tipo,v])=>`<div class="hb"><span>${esc(tipo)}</span><div class="bar"><div style="width:${pct(v.n,tipi[0][1].n)}%;background:${Stats.tipoColor(tipo)}"></div></div><span class="r">${v.n} <span class="faint" style="font-weight:400">${trend(byTipoP[tipo]?Math.round((v.n-byTipoP[tipo])/byTipoP[tipo]*100):null)}</span></span></div>`).join('')}</div>`:`<div class="faint">${t('Nessuna sessione nel periodo.')}</div>`}</div></div>
        <div class="panel"><div class="panel-h"><h3>${t('Giorni della settimana')}</h3></div><div class="panel-b"><div class="hbars">${dayN.map((v,i)=>`<div class="hb"><span style="text-transform:capitalize">${dayL[i]}</span><div class="bar"><div style="width:${v/maxD*100}%;background:${color}"></div></div><span class="r">${v}</span></div>`).join('')}</div></div></div>
      </div>
      <div class="panel"><div class="panel-h"><h3>${t('Fasce orarie')}</h3><span class="faint" style="font-size:12px">${t('quando si concentrano le sessioni')}</span></div><div class="panel-b">
        <div class="vbars">${hours.map(h=>{ const v=hourN[h]||0; return `<div class="vb">${v?`<span>${v}</span>`:''}<div style="height:${v/maxH*100}%;min-height:${v?3:0}px;background:${color}"></div></div>` }).join('')}</div>
        <div class="vlabels">${hours.map(h=>`<span>${h}</span>`).join('')}</div></div></div>
      <div class="panel"><div class="panel-h"><h3>${t('Ultimi 12 mesi')}</h3><span class="faint" style="font-size:12px">${t('ore di lavoro con clienti')}</span></div><div class="panel-b">${Stats.line(months, color)}</div></div>
      <div class="grid3">
        <div class="panel"><div class="panel-h"><h3>${t('Più costanti')}</h3></div><div class="panel-b flush">${top.map(([id,v],i)=>{ const c=Store.client(id); return `<div class="list-item click" onclick="go('cliente',${id})"><b style="width:18px;color:${i===0?'var(--brass)':'var(--ink-3)'}">${i+1}</b>${avatar(Store.fullName(c),'sm')}<div class="grow"><b>${esc(Store.fullName(c))}</b></div><span class="strong">${v}</span></div>` }).join('')||`<div class="empty">${t('Nessuna sessione.')}</div>`}</div></div>
        <div class="panel"><div class="panel-h"><h3>${t('Da ricontattare')}</h3></div><div class="panel-b flush">${risk.map(x=>`<div class="list-item">${avatar(Store.fullName(x.c),'sm')}<div class="grow"><b><a href="#" style="text-decoration:none" onclick="go('cliente',${x.c.id});return false">${esc(Store.fullName(x.c))}</a></b><span>${t('ultima sessione {date}',{date:fmtShort(x.last)})}</span></div><span class="tag ${x.days>=45?'red':'amber'}">${t('{n} giorni',{n:x.days})}</span>${x.c.phone?`<a class="btn btn-ghost btn-icon btn-sm" target="_blank" rel="noopener" title="WhatsApp" href="${waLink(x.c.phone)}"><i class="ti ti-brand-whatsapp"></i></a>`:''}</div>`).join('')||`<div class="empty"><i class="ti ti-circle-check" style="color:var(--green)"></i>${t('Nessuno inattivo da più di 3 settimane.')}</div>`}</div></div>
        <div class="panel"><div class="panel-h"><h3>${t('Pacchetti da rinnovare')}</h3></div><div class="panel-b flush">${pk.map(x=>`<div class="list-item click" onclick="go('cliente',${x.c.id},'packages')">${avatar(Store.fullName(x.c),'sm')}<div class="grow"><b>${esc(Store.fullName(x.c))}</b><span>${esc(x.p.name)}</span></div><span class="tag ${Store.pkgExpired(x.p)?'red':'amber'}">${Store.pkgExpired(x.p)?t('scaduto'):tp(Store.pkgRemaining(x.p),'1 rimasta','{n} rimaste')}</span></div>`).join('')||`<div class="empty">${t('Nessun pacchetto in esaurimento.')}</div>`}</div></div>
      </div>
      ${admin&&trainers.length>1?Stats.teamTable():''}`
  },

  line(months, color){
    const W=900,H=200,P=36, mx=Math.max(1,...months.map(m=>m.h))
    const x=i=>P+i*(W-2*P)/11, y=v=>H-P-v/mx*(H-2*P)
    const pts=months.map((m,i)=>`${x(i)},${y(m.h)}`).join(' ')
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block">
      ${[0,1,2,3].map(i=>{ const v=mx*i/3; return `<line x1="${P}" x2="${W-P}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line-2)"/><text x="${P-8}" y="${y(v)+4}" text-anchor="end" font-size="11" fill="var(--ink-3)">${Math.round(v)}h</text>` }).join('')}
      <polygon points="${x(0)},${H-P} ${pts} ${x(11)},${H-P}" fill="${color}" opacity=".08"/>
      <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round"/>
      ${months.map((m,i)=>`<circle cx="${x(i)}" cy="${y(m.h)}" r="4" fill="var(--paper)" stroke="${color}" stroke-width="2"><title>${t('{h} ore, {n} sessioni',{h:numText(m.h), n:m.n})}</title></circle>
        ${m.h?`<text x="${x(i)}" y="${y(m.h)-10}" text-anchor="middle" font-size="11" font-weight="600" fill="var(--ink)">${numText(m.h)}</text>`:''}
        <text x="${x(i)}" y="${H-12}" text-anchor="middle" font-size="11" fill="var(--ink-3)">${fmtMonth(m.m)}</text>`).join('')}
    </svg>`
  },

  teamTable(){
    const r=periodRange(Stats.period)
    return `<div class="panel"><div class="panel-h"><h3>${t('Confronto team')}</h3><span class="faint" style="font-size:12px">${t(PERIODS[Stats.period])}</span></div><div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>${t('Trainer')}</th><th class="r">${t('Sessioni')}</th><th class="r">${t('Ore')}</th><th class="r">${t('Clienti')}</th><th class="r">${t('Costanza')}</th></tr></thead><tbody>
      ${DB.trainers.filter(x=>x.active!==false).map(x=>{ const ev=Ev.sessions(e=>e.trainerId===x.id && inRange(e.start,r)); let p=0,tot=0; ev.forEach(e=>{ const a=DB.attendance[e.id]; if(a){tot++; if(a.s==='present')p++} })
        return `<tr><td><div class="cell-person">${avatar(x.name,'sm',x.color)}<b>${esc(x.name)}</b></div></td><td class="r">${ev.length}</td><td class="r strong">${numText(Math.round(ev.reduce((a,e)=>a+Ev.dur(e)/60,0)*10)/10)}</td><td class="r">${DB.clients.filter(c=>c.trainerId===x.id&&c.status!=='archived').length}</td><td class="r">${tot?pct(p,tot)+'%':'—'}</td></tr>`}).join('')}
      </tbody></table></div></div>`
  },
}
RENDER.statistiche = Stats.render
