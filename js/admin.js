'use strict'
// ═══ TEAM, IMPOSTAZIONI, BACKUP (solo amministratori) ═════════════

const TRAINER_COLORS=['#2F6B57','#3E6A8A','#8A6A36','#7A4E6B','#4F6B3A','#8A4B3F','#355C6B','#5B5F8A']

const Team = {
  render(){
    const r=periodRange('month')
    document.getElementById('page-team').innerHTML=`
      <div class="head"><div><h1>${t('Team')}</h1><p>${t('Chi può accedere al gestionale e come sta andando il mese.')}</p></div>
        <div class="actions"><button class="btn btn-primary" onclick="Team.editor()"><i class="ti ti-user-plus"></i> ${t('Aggiungi trainer')}</button></div></div>
      <div class="panel"><div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>${t('Trainer')}</th><th>${t('Ruolo')}</th><th>${t('Calendario')}</th><th class="r">${t('Clienti')}</th><th class="r">${t('Sessioni del mese')}</th><th>${t("Ore rispetto all'obiettivo")}</th><th></th></tr></thead>
        <tbody>${DB.trainers.map(x=>{
          const ev=Ev.sessions(e=>e.trainerId===x.id && inRange(e.start,r)), ore=Math.round(ev.reduce((a,e)=>a+Ev.dur(e)/60,0)*10)/10
          const p=pct(ore,x.targetOre||1), readable=x.id===CU.id||(x.calId&&x.calId!=='primary')
          return `<tr style="${x.active===false?'opacity:.55':''}"><td><div class="cell-person">${avatar(x.name,'',x.color)}<div><b>${esc(x.name)}${x.id===CU.id?` <span class="faint" style="font-weight:400">(${t('tu')})</span>`:''}</b><span>${esc(x.email)}</span></div></div></td>
            <td>${x.role==='admin'?`<span class="tag brass">${t('Amministratore')}</span>`:`<span class="tag">${t('Trainer')}</span>`}${x.active===false?` <span class="tag red">${t('Disattivato')}</span>`:''}</td>
            <td>${readable?`<span class="tag green"><i class="ti ti-check"></i> ${x.id===CU.id?t('il tuo'):t('condiviso')}</span>`:`<span class="tag amber" title="${t('Chiedi al trainer di condividere il calendario e inserisci qui il suo indirizzo')}">${t('non visibile')}</span>`}</td>
            <td class="r">${DB.clients.filter(c=>c.trainerId===x.id && c.status!=='archived').length}</td><td class="r">${ev.length}</td>
            <td><div class="bar-row"><div class="bar" style="width:140px"><div style="width:${Math.min(100,p)}%;background:${p>=80?'var(--green)':p>=50?'var(--amber)':'var(--red)'}"></div></div><span>${t('{h} di {target} h',{h:numText(ore), target:x.targetOre})}</span></div></td>
            <td class="r"><button class="btn btn-ghost btn-sm" onclick="Team.editor('${x.id}')"><i class="ti ti-pencil"></i> ${t('Modifica')}</button></td></tr>`}).join('')}</tbody></table></div></div>
      <div class="note"><i class="ti ti-info-circle"></i><div>${t("<b>Come vedere i calendari dei trainer.</b> Ogni trainer condivide il proprio Google Calendar con il tuo account, con il permesso “Apporta modifiche agli eventi”. Poi qui inserisci nel campo Calendario l'indirizzo del suo calendario (di solito la sua email). Solo gli account in questo elenco possono accedere: i trainer vedono solo i propri clienti e appuntamenti, mai prezzi e pagamenti.")}</div></div>`
  },
  editor(id){
    const tr=id?Store.trainer(id):null
    const defColor=tr?.color||TRAINER_COLORS[DB.trainers.length%8]
    openDialog({title:tr?t('Modifica trainer'):t('Aggiungi trainer'),
      body:`<div class="row"><div class="field"><label for="tm-name">${t('Nome e cognome')}</label><input class="in" id="tm-name" value="${esc(tr?.name||'')}"></div>
          <div class="field"><label for="tm-email">${t('Email Google')}</label><input class="in" id="tm-email" type="email" value="${esc(tr?.email||'')}"></div></div>
        <div class="row"><div class="field"><label for="tm-role">${t('Ruolo')}</label><select class="in" id="tm-role"><option value="trainer">${t('Trainer')}</option><option value="admin" ${tr?.role==='admin'?'selected':''}>${t('Amministratore')}</option></select></div>
          <div class="field"><label for="tm-target">${t('Obiettivo ore al mese')}</label><input class="in" type="number" id="tm-target" value="${tr?.targetOre||80}"></div></div>
        <div class="field"><label for="tm-cal">${t('Calendario')}</label><input class="in" id="tm-cal" value="${esc(tr?.calId||'primary')}"><small>${t("“primary” = il calendario principale dell'account. Per leggere il calendario di un altro trainer scrivi l'indirizzo del calendario condiviso.")}</small></div>
        <div class="field"><label>${t('Colore')}</label><div style="display:flex;gap:8px">${TRAINER_COLORS.map(c=>`<label style="cursor:pointer"><input type="radio" name="tm-color" value="${c}" ${defColor===c?'checked':''} style="display:none" onchange="document.querySelectorAll('.tm-sw').forEach(s=>s.style.outline='');this.nextElementSibling.style.outline='2px solid var(--ink)'"><span class="tm-sw av sm" style="background:${c};outline-offset:2px;${defColor===c?'outline:2px solid var(--ink)':''}"></span></label>`).join('')}</div></div>
        ${tr&&tr.id!==CU.id?`<label class="check"><input type="checkbox" id="tm-active" ${tr.active!==false?'checked':''}> <span>${t('Può accedere al gestionale')}</span></label>`:''}`,
      foot:`${tr&&tr.id!==CU.id?`<div class="left"><button class="btn btn-danger btn-sm" onclick="Team.del('${tr.id}')"><i class="ti ti-trash"></i> ${t('Rimuovi')}</button></div>`:''}
        <button class="btn btn-line" onclick="closeDialog()">${t('Annulla')}</button><button class="btn btn-primary" onclick="Team.save(${tr?`'${tr.id}'`:'null'})">${t('Salva')}</button>`})
  },
  save(id){
    const name=val('tm-name'), email=val('tm-email').toLowerCase()
    if(!name||!email.includes('@')){ toast(t('Nome ed email sono obbligatori'),'err'); return }
    if(DB.trainers.some(x=>x.id!==id && x.email.toLowerCase()===email)){ toast(t('Email già presente'),'err'); return }
    let tr=id?Store.trainer(id):null
    const role=val('tm-role')
    if(tr && tr.role==='admin' && role!=='admin' && DB.trainers.filter(x=>x.role==='admin').length===1){ toast(t('Serve almeno un amministratore'),'err'); return }
    if(!tr){ tr={id:uid('t'), active:true}; DB.trainers.push(tr) }
    Object.assign(tr,{name, email, short:name.split(' ')[0], role, targetOre:parseInt(val('tm-target'))||80, calId:val('tm-cal')||'primary', color:document.querySelector('input[name=tm-color]:checked')?.value||tr.color||TRAINER_COLORS[0]})
    if(document.getElementById('tm-active')) tr.active=checked('tm-active')
    if(tr.id===CU.id){ Object.assign(CU,tr); renderMe() }
    applyBrand()
    Store.save(); closeDialog(); refresh(); toast(t('Team aggiornato')); Sync.fetch()
  },
  del(id){
    const tr=Store.trainer(id), n=DB.clients.filter(c=>c.trainerId===id).length
    closeDialog()
    const msg=[t('Rimuovere {name}?',{name:esc(tr.name)}), n?tp(n,'Il suo cliente passa a te.','I suoi {n} clienti passano a te.'):'', t("Se vuoi solo bloccare l'accesso, usa “Può accedere” in Modifica.")].filter(Boolean).join(' ')
    confirmBox(msg, ()=>{
      DB.clients.forEach(c=>{ if(c.trainerId===id) c.trainerId=CU.id })
      DB.trainers=DB.trainers.filter(x=>x.id!==id); Store.save(); refresh(); toast(t('Trainer rimosso'))
    }, {yes:t('Rimuovi')})
  },
}
RENDER.team = Team.render

// ── Lingua (per tutti gli utenti, dal pulsante in basso a sinistra) ──
function langDialog(){
  openDialog({title:t('Lingua'),
    body:`<div class="field"><label for="lang-sel">${t("Lingua dell'interfaccia")}</label><select class="in" id="lang-sel">${langOptions()}</select>
      <small>${t('Vale per questo computer. Date e numeri seguono la lingua scelta.')}</small></div>`,
    foot:`<button class="btn btn-line" onclick="closeDialog()">${t('Annulla')}</button><button class="btn btn-primary" onclick="const l=val('lang-sel');closeDialog();setLang(l)">${t('Salva')}</button>`})
}

// ── Impostazioni ─────────────────────────────────────────────
const Settings = {
  tab:'studio',
  render(){
    const tabs=[['studio',t('Studio')],['listino',t('Listino')],['calendario',t('Calendario')],['modelli',t('Modelli di scheda')],['backup',t('Backup e sicurezza')]]
    document.getElementById('page-impostazioni').innerHTML=`
      <div class="head"><div><h1>${t('Impostazioni')}</h1><p>${t('Configurazione dello studio, del listino e dei backup.')}</p></div></div>
      <div class="tabs">${tabs.map(([k,l])=>`<button class="tab ${Settings.tab===k?'active':''}" onclick="Settings.tab='${k}';Settings.render()">${l}</button>`).join('')}</div>
      <div id="set-body" style="max-width:980px"></div>`
    Settings[Settings.tab]()
  },
  body(h){ document.getElementById('set-body').innerHTML=h },

  studio(){
    const s=DB.settings
    const curName=code=>{ try{ return new Intl.DisplayNames([locale()],{type:'currency'}).of(code) }catch{ return code } }
    Settings.body(`<div class="panel"><div class="panel-h"><h3>${t('Lingua e formati')}</h3></div><div class="panel-b">
        <div class="row3">
          <div class="field"><label for="st-lang">${t('Lingua')}</label><select class="in" id="st-lang" onchange="setLang(this.value)">${langOptions()}</select><small>${t('Vale per questo computer.')}</small></div>
          <div class="field"><label for="st-cur">${t('Valuta')}</label><select class="in" id="st-cur" onchange="DB.settings.currency=this.value;Store.save();Settings.render()">${[...new Set([s.currency, ...CURRENCIES])].map(c=>`<option value="${c}" ${c===s.currency?'selected':''}>${esc(curName(c))} (${c})</option>`).join('')}</select></div>
          <div class="field"><label for="st-phone">${t('Prefisso telefonico predefinito')}</label><input class="in" id="st-phone" value="${esc(s.phonePrefix||'')}" placeholder="39" onchange="DB.settings.phonePrefix=this.value.replace(/\\D/g,'');Store.save()"><small>${t('Usato per WhatsApp quando il numero non ha il prefisso internazionale.')}</small></div>
        </div></div></div>
      <div class="panel"><div class="panel-h"><h3>${t('Dati dello studio')}</h3><span class="faint" style="font-size:12px">${t('compaiono su ricevute e schede stampate')}</span></div><div class="panel-b">
        <div class="field"><label for="st-name">${t('Nome')}</label><input class="in" id="st-name" value="${esc(s.studio.name)}" placeholder="${t('es. Studio Rossi Personal Training')}"><small>${t('Compare nel menu, nella schermata di accesso e sulle stampe. Le iniziali diventano il monogramma.')}</small></div>
        <div class="row"><div class="field"><label for="st-addr">${t('Indirizzo')}</label><input class="in" id="st-addr" value="${esc(s.studio.address)}"></div>
          <div class="field"><label for="st-vat">${t('Partita IVA')}</label><input class="in" id="st-vat" value="${esc(s.studio.vat)}"></div></div>
        <button class="btn btn-primary" onclick="Settings.saveStudio()">${t('Salva')}</button></div></div>
      <div class="grid2">
        <div class="panel"><div class="panel-h"><h3>${t('Tipi di allenamento')}</h3></div><div class="panel-b">
          <div class="faint" style="font-size:13px;margin-bottom:12px">${t('Sul calendario scrivi “Nome - Tipo”, per esempio “Anna - Forza”.')}</div>
          ${s.tipi.map((x,i)=>`<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px"><input type="color" value="${x.color}" onchange="DB.settings.tipi[${i}].color=this.value;Store.save()" style="width:38px;height:34px;border:1px solid var(--line);border-radius:7px;background:none;cursor:pointer" aria-label="${t('Colore')}">
            <input class="in" value="${esc(x.name)}" onchange="DB.settings.tipi[${i}].name=this.value.trim();Store.save()"><button class="btn btn-ghost btn-icon" aria-label="${t('Rimuovi')}" onclick="DB.settings.tipi.splice(${i},1);Store.save();Settings.render()"><i class="ti ti-x"></i></button></div>`).join('')}
          <button class="btn btn-line btn-sm" onclick="DB.settings.tipi.push({name:t('Nuovo tipo'),color:'#5E6661'});Store.save();Settings.render()"><i class="ti ti-plus"></i> ${t('Aggiungi')}</button></div></div>
        <div class="panel"><div class="panel-h"><h3>${t('Metodi di pagamento')}</h3></div><div class="panel-b">
          ${s.methods.map((m,i)=>`<div style="display:flex;gap:8px;margin-bottom:8px"><input class="in" value="${esc(m)}" onchange="DB.settings.methods[${i}]=this.value.trim();Store.save()"><button class="btn btn-ghost btn-icon" aria-label="${t('Rimuovi')}" onclick="DB.settings.methods.splice(${i},1);Store.save();Settings.render()"><i class="ti ti-x"></i></button></div>`).join('')}
          <button class="btn btn-line btn-sm" onclick="DB.settings.methods.push(t('Nuovo metodo'));Store.save();Settings.render()"><i class="ti ti-plus"></i> ${t('Aggiungi')}</button></div></div>
      </div>`)
  },
  saveStudio(){
    Object.assign(DB.settings.studio,{name:val('st-name'),address:val('st-addr'),vat:val('st-vat')})
    Store.save(); applyBrand(); toast(t('Dati salvati'))
  },

  listino(){
    const L=DB.settings.listino
    Settings.body(`<div class="panel"><div class="panel-h"><h3>${t('Listino pacchetti')}</h3><button class="btn btn-primary btn-sm" onclick="DB.settings.listino.push({id:uid('ls'),name:t('Pacchetto {n} lezioni',{n:10}),lessons:10,price:0,validityDays:90});Store.save();Settings.render()"><i class="ti ti-plus"></i> ${t('Aggiungi')}</button></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>${t('Nome')}</th><th>${t('Lezioni')}</th><th>${Money.priceLabel(t('Prezzo'))}</th><th>${t('Validità (giorni)')}</th><th class="r">${t('A lezione')}</th><th></th></tr></thead><tbody>
      ${L.map((l,i)=>`<tr><td><input class="in" value="${esc(l.name)}" onchange="DB.settings.listino[${i}].name=this.value;Store.save()"></td>
        <td style="width:110px"><input class="in" type="number" value="${l.lessons}" onchange="DB.settings.listino[${i}].lessons=parseInt(this.value)||1;Store.save();Settings.render()"></td>
        <td style="width:130px"><input class="in" type="number" step="0.01" value="${l.price}" onchange="DB.settings.listino[${i}].price=num(this.value);Store.save();Settings.render()"></td>
        <td style="width:140px"><input class="in" type="number" value="${l.validityDays||''}" placeholder="${t('nessuna')}" onchange="DB.settings.listino[${i}].validityDays=parseInt(this.value)||null;Store.save()"></td>
        <td class="r">${l.lessons&&l.price?eur(l.price/l.lessons,2):'—'}</td>
        <td class="r"><button class="btn btn-ghost btn-icon" aria-label="${t('Rimuovi')}" onclick="DB.settings.listino.splice(${i},1);Store.save();Settings.render()"><i class="ti ti-trash"></i></button></td></tr>`).join('')
        ||`<tr><td colspan="6"><div class="empty"><b>${t('Listino vuoto')}</b>${t('Aggiungi i pacchetti che vendi: quando registri una vendita basta sceglierli.')}</div></td></tr>`}</tbody></table></div></div>`)
  },

  calendario(){
    const s=DB.settings
    const aliases=DB.clients.flatMap(c=>c.aliases.map(a=>({a,c}))).sort((x,y)=>x.a.localeCompare(y.a,locale()))
    Settings.body(`<div class="panel"><div class="panel-h"><h3>${t('Riconoscimento degli appuntamenti')}</h3></div><div class="panel-b">
        <label class="check"><input type="checkbox" ${s.autoIgnoreAllDay?'checked':''} onchange="DB.settings.autoIgnoreAllDay=this.checked;Store.save()"> <span>${t('Ignora gli eventi di tutto il giorno (compleanni, ferie, promemoria)')}</span></label>
        <div class="faint" style="font-size:13px">${t('Un appuntamento viene collegato da solo quando il titolo corrisponde a nome e cognome, cognome e nome, o a uno dei nomi memorizzati qui sotto. Tutto il resto finisce in “Da classificare”.')}</div></div></div>
      <div class="grid2">
        <div class="panel"><div class="panel-h"><h3>${t('Nomi memorizzati')}</h3><span class="faint" style="font-size:12px">${aliases.length}</span></div><div class="panel-b flush">
          ${aliases.map(({a,c})=>`<div class="list-item"><div class="grow"><b>“${esc(a)}”</b><span>${t('collegato a {name}',{name:esc(Store.fullName(c))})}</span></div><button class="btn btn-ghost btn-sm" onclick="Settings.dropAlias(${c.id},'${esc(a).replace(/'/g,'&#39;')}')">${t('Dimentica')}</button></div>`).join('')||`<div class="empty">${t('Nessun nome memorizzato. Si aggiungono quando colleghi un appuntamento.')}</div>`}</div></div>
        <div class="panel"><div class="panel-h"><h3>${t('Titoli sempre esclusi')}</h3><span class="faint" style="font-size:12px">${s.ignoreTitles.length}</span></div><div class="panel-b flush">
          ${s.ignoreTitles.map((k,i)=>`<div class="list-item"><div class="grow"><b>“${esc(k)}”</b><span>${t('non è un allenamento')}</span></div><button class="btn btn-ghost btn-sm" onclick="DB.settings.ignoreTitles.splice(${i},1);Store.save();Settings.render()">${t('Ripristina')}</button></div>`).join('')||`<div class="empty">${t('Nessun titolo escluso.')}</div>`}
          <div class="list-item"><input class="in" id="ign-new" placeholder="${t('es. dentista, palestra chiusa')}"><button class="btn btn-line btn-sm" onclick="Settings.addIgnore()">${t('Aggiungi')}</button></div></div></div>
      </div>`)
  },
  addIgnore(){
    const k=normName(val('ign-new'))
    if(k && !DB.settings.ignoreTitles.includes(k)){ DB.settings.ignoreTitles.push(k); Store.save() }
    Settings.render()
  },
  dropAlias(cid, a){ const c=Store.client(cid); c.aliases=c.aliases.filter(x=>x!==a); Store.save(); Settings.render(); toast(t('Nome dimenticato')) },

  modelli(){
    Settings.body(`<div class="panel"><div class="panel-h"><h3>${t('Modelli di scheda')}</h3><button class="btn btn-primary btn-sm" onclick="Programs.editor(null,null,true)"><i class="ti ti-plus"></i> ${t('Nuovo modello')}</button></div><div class="panel-b flush">
      ${DB.templates.map(x=>`<div class="list-item"><div class="grow"><b>${esc(x.name)}</b><span>${tp(x.days.length,'1 giorno','{n} giorni')}, ${tp(x.days.reduce((a,d)=>a+d.exercises.length,0),'1 esercizio','{n} esercizi')}</span></div>
        <button class="btn btn-line btn-sm" onclick="Programs.editor(null,'${x.id}',true)"><i class="ti ti-pencil"></i> ${t('Modifica')}</button>
        <button class="btn btn-ghost btn-icon btn-sm" aria-label="${t('Elimina')}" onclick="Settings.delTemplate('${x.id}')"><i class="ti ti-trash"></i></button></div>`).join('')
        ||`<div class="empty"><b>${t('Nessun modello')}</b>${t('Salva una scheda come modello dal menu della scheda, oppure creane uno qui. I modelli si applicano a qualsiasi cliente.')}</div>`}</div></div>`)
  },
  delTemplate(id){ confirmBox(t('Eliminare il modello?'), ()=>{ DB.templates=DB.templates.filter(x=>x.id!==id); Store.save(); Settings.render() }, {yes:t('Elimina')}) },

  async backup(){
    const dir=localStorage.getItem(LS.bkDir), auto=localStorage.getItem(LS.bkAuto)==='1', last=localStorage.getItem(LS.bkLast)
    const hasPwd=!!(await API.secureGet('backupPassword'))
    Settings.body(`<div class="note blue"><i class="ti ti-shield-lock"></i><div>${t("<b>I dati sono cifrati su questo computer.</b> Vengono letti solo dall'utente Windows che usa il gestionale. Il backup serve se il PC si rompe: scegli una cartella di OneDrive, Google Drive o una chiavetta. Con la password, anche il file di backup e le foto sono cifrati.")}</div></div>
      <div class="panel"><div class="panel-h"><h3>${t('Backup')}</h3>${last?`<span class="faint" style="font-size:12px">${t('ultimo {date}',{date:new Date(last).toLocaleString(locale())})}</span>`:''}</div><div class="panel-b">
        <div class="field"><label>${t('Cartella')}</label><div style="display:flex;gap:8px"><input class="in" readonly value="${esc(dir||t('Nessuna cartella scelta'))}"><button class="btn btn-line" onclick="Backup.chooseDir()">${t('Scegli')}</button>${dir?`<button class="btn btn-ghost" onclick="API.openFolder(localStorage.getItem(LS.bkDir))">${t('Apri')}</button>`:''}</div></div>
        <label class="check"><input type="checkbox" ${auto?'checked':''} ${dir?'':'disabled'} onchange="localStorage.setItem(LS.bkAuto,this.checked?'1':'0')"> <span>${t('Aggiorna il backup in automatico dopo ogni modifica')}</span></label>
        <div class="faint" style="font-size:13px;margin-bottom:14px">${t('Nella cartella: kettledesk-data.json (tutto, per il ripristino), clienti.csv e pagamenti.csv (per Excel, senza dati sanitari), foto\\ e una copia al giorno in storico\\.')}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-primary" onclick="Backup.run(true)" ${dir?'':'disabled'}><i class="ti ti-device-floppy"></i> ${t('Esegui backup ora')}</button>
          <button class="btn btn-line" onclick="Backup.restore()"><i class="ti ti-restore"></i> ${t('Ripristina da backup')}</button></div></div></div>
      <div class="panel"><div class="panel-h"><h3>${t('Password del backup')}</h3>${hasPwd?`<span class="tag green"><i class="ti ti-lock"></i> ${t('Attiva')}</span>`:`<span class="tag amber">${t('Non impostata')}</span>`}</div><div class="panel-b">
        <div class="faint" style="font-size:13px;margin-bottom:12px">${t('Consigliata: il backup contiene problematiche fisiche, misure e foto dei clienti. Conserva la password in un posto sicuro: senza, il backup non si può ripristinare.')}</div>
        <div class="row"><div class="field"><label for="bk-p1">${t('Nuova password')}</label><input class="in" type="password" id="bk-p1" autocomplete="new-password"></div><div class="field"><label for="bk-p2">${t('Ripeti')}</label><input class="in" type="password" id="bk-p2" autocomplete="new-password"></div></div>
        <div style="display:flex;gap:8px"><button class="btn btn-primary" onclick="Backup.setPassword()">${t('Salva password')}</button>${hasPwd?`<button class="btn btn-ghost" onclick="Backup.clearPassword()">${t('Rimuovi password')}</button>`:''}</div></div></div>`)
  },
}
RENDER.impostazioni = Settings.render

// ── Backup ───────────────────────────────────────────────────
// I nomi dei file restano fissi in ogni lingua, così il ripristino li trova sempre
const Backup = {
  async chooseDir(){ const d=await API.chooseFolder(); if(d){ localStorage.setItem(LS.bkDir,d); localStorage.setItem(LS.bkAuto,'1'); await Backup.run(true); Settings.render() } },
  csvClients(){
    const rows=[[t('Nome'),t('Cognome'),t('Telefono'),t('Email'),t('Obiettivo'),t('Trainer'),t('Stato'),t('Pacchetto in corso'),t('Lezioni rimaste'),t('Scadenza'),t('Da incassare')]]
    DB.clients.forEach(c=>{ const p=Store.currentPackage(c.id); rows.push([c.firstName,c.lastName,c.phone,c.email,c.goal,Store.trainer(c.trainerId)?.name||'',c.status==='archived'?t('Archiviato'):t('Attivo'),p?.name||'',p?Store.pkgRemaining(p):'',p?.expiryDate||'',numText(Money.clientDue(c.id))]) })
    return toCsv(rows)
  },
  csvPayments(){
    const rows=[[t('Data'),t('Ricevuta'),t('Cliente'),t('Pacchetto'),t('Metodo'),t('Nota'),t('Importo')]]
    DB.payments.slice().sort((a,b)=>a.date.localeCompare(b.date)).forEach(p=>rows.push([p.date,p.number||'',Store.fullName(Store.client(p.clientId)),Store.pkg(p.packageId)?.name||t('Altro'),p.method||'',p.note||'',numText(p.amount)]))
    return toCsv(rows)
  },
  async run(manual){
    const dir=localStorage.getItem(LS.bkDir)
    if(!dir){ if(manual) toast(t('Scegli prima la cartella dei backup'),'err'); return }
    const hasPwd=!!(await API.secureGet('backupPassword'))
    const r=await API.writeBackup(dir, {
      'kettledesk-data.json': JSON.stringify({app:'kettledesk', version:2, exportedAt:new Date().toISOString(), db:DB}),
      'clienti.csv': Backup.csvClients(),
      'pagamenti.csv': Backup.csvPayments(),
    }, hasPwd)
    if(r.ok){ localStorage.setItem(LS.bkLast, new Date().toISOString()); if(manual) toast(t('Backup completato')) }
    else toast(t('Backup non riuscito: {e}',{e:r.error}),'err')
  },
  schedule: debounce(()=>{ if(localStorage.getItem(LS.bkAuto)==='1' && localStorage.getItem(LS.bkDir)) Backup.run(false) }, 15000),
  async setPassword(){
    const a=val('bk-p1'), b=val('bk-p2')
    if(a.length<8){ toast(t('Usa almeno 8 caratteri'),'err'); return }
    if(a!==b){ toast(t('Le password non coincidono'),'err'); return }
    await API.secureSet('backupPassword', a)
    toast(t('Password salvata: i prossimi backup saranno cifrati')); Settings.render(); Backup.run(false)
  },
  clearPassword(){ confirmBox(t('Rimuovere la password? I prossimi backup non saranno cifrati.'), async()=>{ await API.secureSet('backupPassword', null); Settings.render() }, {yes:t('Rimuovi')}) },

  async restore(){
    const pick=await API.pickBackup(); if(!pick) return
    if(pick.error){ toast(pick.error,'err'); return }
    if(pick.encrypted){
      Backup._file=pick.file
      openDialog({title:t('Backup cifrato'), body:`<div class="field"><label for="rs-pwd">${t('Password del backup')}</label><input class="in" type="password" id="rs-pwd"></div>`,
        foot:`<button class="btn btn-line" onclick="closeDialog()">${t('Annulla')}</button><button class="btn btn-primary" onclick="Backup.readAndConfirm(Backup._file, val('rs-pwd'))">${t('Apri')}</button>`})
    } else Backup.readAndConfirm(pick.file, null)
  },
  async readAndConfirm(file, pwd){
    const r=await API.readBackup(file, pwd)
    if(!r.ok){ toast(r.error,'err'); return }
    closeAllDialogs()
    let o; try{ o=JSON.parse(r.json) }catch{ toast(t('File non valido'),'err'); return }
    const isV1=!o.db && Array.isArray(o.clients)
    if(!isV1 && !o.db?.clients){ toast(t('Questo file non è un backup del gestionale'),'err'); return }
    const n=isV1?o.clients.length:o.db.clients.length
    const when=o.exportedAt?new Date(o.exportedAt).toLocaleString(locale()):t('file scelto')
    confirmBox(tp(n,'Sostituire tutti i dati attuali con il backup del {date} (1 cliente)? Prima viene salvata una copia dei dati attuali nella cartella dei backup, se impostata.','Sostituire tutti i dati attuali con il backup del {date} ({n} clienti)? Prima viene salvata una copia dei dati attuali nella cartella dei backup, se impostata.',{date:when}), async()=>{
      await Backup.run(false)
      if(isV1){ DB=emptyDB(); await Store.migrateV1(o) } else { DB=o.db; Store.normalize() }
      const ph=await API.importBackupPhotos(file, pwd)
      await Store.save()
      if(!Store.trainerByEmail(CU.email)){ toast(t('Il tuo account non è nel backup: rientra con un account amministratore'),'warn'); Auth.logout(); return }
      CU=Store.trainerByEmail(CU.email); applyBrand(); renderMe()
      toast(ph.count?tp(ph.count,'Backup ripristinato, 1 foto','Backup ripristinato, {n} foto'):t('Backup ripristinato')); go('dashboard')
    }, {title:t('Ripristina backup'), yes:t('Ripristina')})
  },
}
Store._onSave.push(()=>Backup.schedule())
