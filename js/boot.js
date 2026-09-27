'use strict'
// ═══ AVVIO ═════════════════════════════════════════════════════════

async function startApp(){
  Auth.showGate('app')
  renderMe()
  Auth.restoreToken()
  await Sync.loadCache()
  if(navigator.onLine) Sync.setStatus('loading', N_('Aggiornamento dal calendario…'))
  else Sync.setStatus('offline', N_('Offline: stai vedendo gli appuntamenti salvati. Le modifiche partono appena torna la connessione.'))
  go('dashboard')
  Sync.fetch()
}

async function boot(){
  setLang(detectLang(), {persist:false})
  if(!API){ document.body.innerHTML=`<p style="padding:40px;font-family:sans-serif">${esc(t("Apri il gestionale dall'applicazione desktop."))}</p>`; return }
  try{ await Store.load() }
  catch(e){ document.body.innerHTML=`<p style="padding:40px;font-family:sans-serif">${esc(t('Errore nel caricamento dei dati: {e}',{e:e.message}))}</p>`; return }
  applyBrand()
  await Sync.loadQueue()
  if(!localStorage.getItem(LS.clientId)){ Auth.showGate('setup'); return }
  const last=localStorage.getItem(LS.lastUser)
  const tr=last && Store.trainerByEmail(last)
  if(tr && tr.active!==false){ CU=tr; startApp(); return }
  Auth.showGate('login')
}
boot()
