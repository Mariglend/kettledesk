'use strict'
// ═══ LINGUE ════════════════════════════════════════════════════════
//
// I testi sono scritti in italiano direttamente nel codice e passano da t():
//   t('Nuovo cliente')                      → "New client" in inglese
//   t('Restano {n} lezioni', {n:3})         → i valori tra graffe vengono sostituiti
//   tp(n, '1 lezione', '{n} lezioni')       → singolare/plurale
//   N_('Oggi')                              → segna un testo tradotto più tardi con t()
// Le traduzioni sono in js/i18n/<codice>.js. Se una traduzione manca si vede il testo italiano.
// Per aggiungere una lingua: copia js/i18n/en.js, traduci i valori, aggiungila in LANGS e in index.html.
// `npm run i18n:check` elenca le chiavi mancanti o non più usate.

const LANGS = {
  it: {name:'Italiano',     locale:'it-IT', phone:'39'},
  en: {name:'English',      locale:'en-GB', phone:''},
  de: {name:'Deutsch',      locale:'de-DE', phone:'49'},
  fr: {name:'Français',     locale:'fr-FR', phone:'33'},
  es: {name:'Español',      locale:'es-ES', phone:'34'},
  pt: {name:'Português',    locale:'pt-PT', phone:'351'},
  zh: {name:'中文（简体）',  locale:'zh-CN', phone:'86'},
  sq: {name:'Shqip',        locale:'sq-AL', phone:'355'},
}
const I18N = {}             // I18N.en = { 'testo italiano': 'English text', … }
const I18N_MISSING = new Set()
let LANG = 'it'

function t(key, vars){
  let s = LANG==='it' ? key : I18N[LANG]?.[key]
  if(s==null){ s=key; I18N_MISSING.add(key) }
  return vars ? s.replace(/\{(\w+)\}/g, (m,k)=> k in vars ? vars[k] : m) : s
}
// N_('testo') segna un testo da tradurre più tardi (es. etichette salvate in liste): restituisce il testo com'è
function N_(s){ return s }
function tp(n, one, other, vars={}){ return t(n===1?one:other, {n, ...vars}) }
function locale(){ return LANGS[LANG]?.locale || 'it-IT' }

function detectLang(){
  let saved=null
  try{ saved=localStorage.getItem('ap_lang') }catch{}
  if(saved && LANGS[saved]) return saved
  const nav=(navigator.language||'en').toLowerCase().split('-')[0]
  return LANGS[nav] ? nav : 'en'
}

// Testi fissi di index.html: data-i18n (contenuto), data-i18n-ph (placeholder), data-i18n-title (title)
function applyStaticTexts(){
  document.querySelectorAll('[data-i18n]').forEach(el=>{
    if(el._k==null) el._k=el.innerHTML.trim()
    el.innerHTML=t(el._k)
  })
  document.querySelectorAll('[data-i18n-ph]').forEach(el=>{ el.placeholder=t(el.dataset.i18nPh) })
  document.querySelectorAll('[data-i18n-title]').forEach(el=>{ el.title=t(el.dataset.i18nTitle); el.setAttribute('aria-label', el.title) })
  document.querySelectorAll('[data-lang-select]').forEach(el=>{
    el.innerHTML=langOptions()
  })
}
function langOptions(){ return Object.entries(LANGS).map(([k,v])=>`<option value="${k}" ${k===LANG?'selected':''}>${v.name}</option>`).join('') }

function setLang(code, {persist=true}={}){
  if(!LANGS[code]) code='en'
  LANG=code
  if(persist){ try{ localStorage.setItem('ap_lang', code) }catch{} }
  document.documentElement.lang = code==='zh' ? 'zh-Hans' : code
  applyStaticTexts()
  window.electronAPI?.setLang?.(code)
  if(typeof applyBrand==='function') applyBrand()
  if(typeof CU!=='undefined' && CU){ renderMe(); refresh() }
}
