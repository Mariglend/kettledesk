#!/usr/bin/env node
// Controlla le traduzioni: elenca le chiavi usate nel codice che mancano in ogni lingua
// e quelle presenti nei file di lingua ma non più usate.
//   node scripts/check-i18n.js            → riepilogo
//   node scripts/check-i18n.js --keys     → stampa tutte le chiavi (JSON)
//   node scripts/check-i18n.js --missing en → stampa le chiavi mancanti di una lingua (JSON)
'use strict'
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const ROOT = path.join(__dirname, '..')
const JS_DIR = path.join(ROOT, 'js')

// ── Estrazione delle chiavi dal codice ─────────────────────────
function readString(src, i) {
  const q = src[i]
  if (q !== "'" && q !== '"') return null
  let j = i + 1
  while (j < src.length && src[j] !== q) { if (src[j] === '\\') j++; j++ }
  return { value: vm.runInNewContext(src.slice(i, j + 1)), end: j + 1 }
}
// Divide gli argomenti di una chiamata (rispettando parentesi, stringhe e template)
function callArgs(src, open) {
  const args = []; let depth = 0, start = open + 1, i = open
  while (i < src.length) {
    const c = src[i]
    if (c === "'" || c === '"') { i = readString(src, i).end; continue }
    if (c === '`') { i++; let d = 0; while (i < src.length && !(src[i] === '`' && d === 0)) { if (src[i] === '\\') i++; else if (src[i] === '$' && src[i + 1] === '{') d++; else if (src[i] === '}' && d > 0) d--; i++ } i++; continue }
    if (c === '(' || c === '[' || c === '{') depth++
    else if (c === ')' || c === ']' || c === '}') { depth--; if (depth === 0) { args.push(src.slice(start, i).trim()); break } }
    else if (c === ',' && depth === 1) { args.push(src.slice(start, i).trim()); start = i + 1 }
    i++
  }
  return args
}
function literal(arg) {
  if (!arg || !/^['"]/.test(arg)) return null
  const r = readString(arg, 0)
  return r && r.end === arg.length ? r.value : null
}
function keysFromJs(src, file, keys) {
  const re = /(?<![\w.$])(t|tp|N_)\(/g
  let m
  while ((m = re.exec(src))) {
    const args = callArgs(src, m.index + m[1].length)
    const lits = m[1] === 'tp' ? [args[1], args[2]] : [args[0]]
    for (const a of lits) {
      const k = literal(a)
      if (k != null) keys.set(k, keys.get(k) || file)
      else if (m[1] !== 't' || /^['"]/.test(a || '')) console.warn(`! ${file}: argomento non letterale in ${m[1]}(): ${String(a).slice(0, 60)}`)
    }
  }
}
function keysFromHtml(src, keys) {
  const decode = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  const re = /<(\w+)([^>]*?)\sdata-i18n(\s[^>]*)?>([\s\S]*?)<\/\1>/g
  let m
  while ((m = re.exec(src))) keys.set(m[4].trim(), 'index.html')
  for (const a of ['data-i18n-ph', 'data-i18n-title']) {
    const r = new RegExp(a + '="([^"]*)"', 'g')
    while ((m = r.exec(src))) keys.set(decode(m[1]), 'index.html')
  }
}
function collectKeys() {
  const keys = new Map()
  for (const f of fs.readdirSync(JS_DIR).filter(f => f.endsWith('.js') && f !== 'i18n.js')) {
    keysFromJs(fs.readFileSync(path.join(JS_DIR, f), 'utf8'), f, keys)
  }
  keysFromHtml(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), keys)
  return keys
}

// ── Lettura dei file di lingua ─────────────────────────────────
function loadLangs() {
  const ctx = { I18N: {} }
  vm.createContext(ctx)
  const dir = path.join(JS_DIR, 'i18n')
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f })
  return ctx.I18N
}
const placeholders = s => (s.match(/\{\w+\}/g) || []).sort().join(',')
const tags = s => (s.match(/<\/?\w+/g) || []).sort().join(',')

const keys = collectKeys()
const argv = process.argv.slice(2)
if (argv[0] === '--keys') { console.log(JSON.stringify([...keys.keys()], null, 1)); process.exit(0) }
const langs = loadLangs()
if (argv[0] === '--missing') { const d = langs[argv[1]] || {}; console.log(JSON.stringify([...keys.keys()].filter(k => !(k in d)), null, 1)); process.exit(0) }

let problems = 0
console.log(`Chiavi usate nel codice: ${keys.size}`)
for (const [code, dict] of Object.entries(langs)) {
  const missing = [...keys.keys()].filter(k => !(k in dict))
  const unused = Object.keys(dict).filter(k => !keys.has(k))
  const bad = Object.entries(dict).filter(([k, v]) => keys.has(k) && (placeholders(k) !== placeholders(v) || tags(k) !== tags(v)))
  problems += missing.length + bad.length
  console.log(`\n[${code}] ${Object.keys(dict).length - unused.length}/${keys.size} tradotte` + (missing.length ? `, ${missing.length} mancanti` : '') + (unused.length ? `, ${unused.length} non più usate` : '') + (bad.length ? `, ${bad.length} con segnaposto o tag diversi` : ''))
  missing.slice(0, 20).forEach(k => console.log(`  - manca: ${k}`))
  bad.slice(0, 20).forEach(([k, v]) => console.log(`  - da controllare: ${k}  →  ${v}`))
  unused.slice(0, 10).forEach(k => console.log(`  - non usata: ${k}`))
}
process.exit(problems ? 1 : 0)
