// main.js — Electron: finestra, OAuth Google, archivio cifrato su disco, backup
const { app, BrowserWindow, shell, ipcMain, safeStorage, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const http = require('http')
const crypto = require('crypto')

let mainWindow = null

// ── Testi del processo principale (le altre traduzioni sono in js/i18n) ──
const MSG = {
  it: { invalidName:'Nome non valido', unknownFormat:'Formato file sconosciuto', noBackupPwd:'Password del backup non impostata', pickFile:'Scegli il file kettledesk-data.json', backupFilter:'Backup del gestionale', needPwd:'Serve la password del backup', wrongPwd:'Password errata', pickFolder:'Scegli la cartella dei backup', denied:'Accesso negato', deniedMsg:'Errore: {e}. Puoi chiudere questa pagina.', loginError:'Errore di accesso', done:'Accesso completato', doneMsg:'Puoi chiudere questa scheda e tornare al gestionale.', timeout:'Tempo scaduto: riprova l\'accesso' },
  en: { invalidName:'Invalid name', unknownFormat:'Unknown file format', noBackupPwd:'Backup password not set', pickFile:'Choose the kettledesk-data.json file', backupFilter:'App backup', needPwd:'The backup password is required', wrongPwd:'Wrong password', pickFolder:'Choose the backup folder', denied:'Access denied', deniedMsg:'Error: {e}. You can close this page.', loginError:'Sign-in error', done:'Signed in', doneMsg:'You can close this tab and go back to the app.', timeout:'Timed out: please sign in again' },
  de: { invalidName:'Ungültiger Name', unknownFormat:'Unbekanntes Dateiformat', noBackupPwd:'Backup-Passwort nicht festgelegt', pickFile:'Datei kettledesk-data.json auswählen', backupFilter:'App-Sicherung', needPwd:'Das Backup-Passwort wird benötigt', wrongPwd:'Falsches Passwort', pickFolder:'Backup-Ordner auswählen', denied:'Zugriff verweigert', deniedMsg:'Fehler: {e}. Du kannst diese Seite schließen.', loginError:'Anmeldefehler', done:'Anmeldung abgeschlossen', doneMsg:'Du kannst diesen Tab schließen und zur App zurückkehren.', timeout:'Zeit abgelaufen: bitte erneut anmelden' },
  fr: { invalidName:'Nom non valide', unknownFormat:'Format de fichier inconnu', noBackupPwd:'Mot de passe de sauvegarde non défini', pickFile:'Choisissez le fichier kettledesk-data.json', backupFilter:'Sauvegarde de l\'application', needPwd:'Le mot de passe de la sauvegarde est requis', wrongPwd:'Mot de passe incorrect', pickFolder:'Choisissez le dossier de sauvegarde', denied:'Accès refusé', deniedMsg:'Erreur : {e}. Vous pouvez fermer cette page.', loginError:'Erreur de connexion', done:'Connexion réussie', doneMsg:'Vous pouvez fermer cet onglet et revenir à l\'application.', timeout:'Délai dépassé : reconnectez-vous' },
  es: { invalidName:'Nombre no válido', unknownFormat:'Formato de archivo desconocido', noBackupPwd:'Contraseña de copia de seguridad no definida', pickFile:'Elige el archivo kettledesk-data.json', backupFilter:'Copia de seguridad de la app', needPwd:'Se necesita la contraseña de la copia de seguridad', wrongPwd:'Contraseña incorrecta', pickFolder:'Elige la carpeta de las copias de seguridad', denied:'Acceso denegado', deniedMsg:'Error: {e}. Puedes cerrar esta página.', loginError:'Error de acceso', done:'Acceso completado', doneMsg:'Puedes cerrar esta pestaña y volver a la app.', timeout:'Tiempo agotado: vuelve a iniciar sesión' },
  pt: { invalidName:'Nome inválido', unknownFormat:'Formato de ficheiro desconhecido', noBackupPwd:'Palavra-passe da cópia de segurança não definida', pickFile:'Escolha o ficheiro kettledesk-data.json', backupFilter:'Cópia de segurança da aplicação', needPwd:'É necessária a palavra-passe da cópia de segurança', wrongPwd:'Palavra-passe incorreta', pickFolder:'Escolha a pasta das cópias de segurança', denied:'Acesso negado', deniedMsg:'Erro: {e}. Pode fechar esta página.', loginError:'Erro de início de sessão', done:'Sessão iniciada', doneMsg:'Pode fechar este separador e voltar à aplicação.', timeout:'Tempo esgotado: inicie sessão novamente' },
  zh: { invalidName:'名称无效', unknownFormat:'未知的文件格式', noBackupPwd:'尚未设置备份密码', pickFile:'选择 kettledesk-data.json 文件', backupFilter:'应用备份', needPwd:'需要备份密码', wrongPwd:'密码错误', pickFolder:'选择备份文件夹', denied:'访问被拒绝', deniedMsg:'错误：{e}。你可以关闭此页面。', loginError:'登录错误', done:'登录成功', doneMsg:'你可以关闭此标签页并返回应用。', timeout:'已超时：请重新登录' },
  sq: { invalidName:'Emër i pavlefshëm', unknownFormat:'Format skedari i panjohur', noBackupPwd:'Fjalëkalimi i kopjes rezervë nuk është vendosur', pickFile:'Zgjidh skedarin kettledesk-data.json', backupFilter:'Kopje rezervë e aplikacionit', needPwd:'Duhet fjalëkalimi i kopjes rezervë', wrongPwd:'Fjalëkalim i gabuar', pickFolder:'Zgjidh dosjen e kopjeve rezervë', denied:'Hyrja u refuzua', deniedMsg:'Gabim: {e}. Mund ta mbyllësh këtë faqe.', loginError:'Gabim gjatë hyrjes', done:'Hyrja u krye', doneMsg:'Mund ta mbyllësh këtë skedë dhe të kthehesh te aplikacioni.', timeout:'Koha mbaroi: provo të hysh përsëri' },
}
let lang = 'it'
function m(key, vars) { let s = (MSG[lang] || MSG.en)[key] || MSG.it[key]; for (const [k, v] of Object.entries(vars || {})) s = s.replace('{' + k + '}', v); return s }
ipcMain.on('set-lang', (e, code) => { if (MSG[code]) lang = code })

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 920, minWidth: 1100, minHeight: 720,
    title: 'Kettledesk',
    backgroundColor: '#0E2A24',
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: { nodeIntegration: false, contextIsolation: true, preload: path.join(__dirname, 'preload.js') },
    autoHideMenuBar: true,
  })
  mainWindow.loadFile(path.join(__dirname, 'index.html'))
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?:|mailto:|tel:)/.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
}

// ── ARCHIVIO CIFRATO ─────────────────────────────────────────
// Ogni "voce" è un file in %APPDATA%\kettledesk\data\<nome>.bin
// cifrato con safeStorage (DPAPI di Windows: leggibile solo dal proprio utente Windows).
const DATA_DIR = () => path.join(app.getPath('userData'), 'data')
function safeName(n) {
  if (typeof n !== 'string' || !/^[a-zA-Z0-9_.-]{1,120}$/.test(n)) throw new Error(m('invalidName') + ': ' + n)
  return n
}
function encLocal(str) {
  return safeStorage.isEncryptionAvailable()
    ? Buffer.concat([Buffer.from('E1'), safeStorage.encryptString(str)])
    : Buffer.concat([Buffer.from('P1'), Buffer.from(str, 'utf8')])
}
function decLocal(buf) {
  const tag = buf.subarray(0, 2).toString()
  const body = buf.subarray(2)
  if (tag === 'E1') return safeStorage.decryptString(body)
  if (tag === 'P1') return body.toString('utf8')
  throw new Error(m('unknownFormat'))
}
function storePath(name) { return path.join(DATA_DIR(), safeName(name) + '.bin') }
function storeRead(name) {
  const p = storePath(name)
  if (!fs.existsSync(p)) return null
  return decLocal(fs.readFileSync(p))
}
function storeWrite(name, str) {
  fs.mkdirSync(DATA_DIR(), { recursive: true })
  const p = storePath(name)
  if (name === 'db' && fs.existsSync(p)) fs.copyFileSync(p, path.join(DATA_DIR(), 'db.prev.bin'))
  fs.writeFileSync(p + '.tmp', encLocal(str))
  fs.renameSync(p + '.tmp', p)
}
function storeList(prefix) {
  try {
    return fs.readdirSync(DATA_DIR()).filter(f => f.endsWith('.bin') && f.startsWith(prefix || '')).map(f => f.slice(0, -4))
  } catch { return [] }
}
ipcMain.handle('store-read', (e, name) => {
  try { return { ok: true, value: storeRead(name) } } catch (err) { return { ok: false, error: err.message } }
})
ipcMain.handle('store-write', (e, name, str) => {
  try { storeWrite(name, str); return { ok: true } } catch (err) { return { ok: false, error: err.message } }
})
ipcMain.handle('store-delete', (e, name) => {
  try { const p = storePath(name); if (fs.existsSync(p)) fs.unlinkSync(p); return { ok: true } } catch (err) { return { ok: false, error: err.message } }
})

// Segreti (refresh token, client secret, password backup) — stesso archivio cifrato
function secrets() { try { return JSON.parse(storeRead('secrets') || '{}') } catch { return {} } }
ipcMain.handle('secure-get', (e, key) => secrets()[key] ?? null)
ipcMain.handle('secure-set', (e, key, value) => {
  const all = secrets()
  if (value == null || value === '') delete all[key]; else all[key] = value
  storeWrite('secrets', JSON.stringify(all))
  return true
})

// Migrazione dal vecchio secure.json (v1.6)
function migrateOldSecure() {
  const old = path.join(app.getPath('userData'), 'secure.json')
  if (!fs.existsSync(old)) return
  try {
    const raw = JSON.parse(fs.readFileSync(old, 'utf8'))
    const all = secrets()
    for (const [k, v] of Object.entries(raw)) {
      try {
        all[k] = safeStorage.isEncryptionAvailable()
          ? safeStorage.decryptString(Buffer.from(v, 'base64'))
          : Buffer.from(v, 'base64').toString('utf8')
      } catch {}
    }
    storeWrite('secrets', JSON.stringify(all))
    fs.unlinkSync(old)
  } catch {}
}

// ── CIFRATURA BACKUP CON PASSWORD (AES-256-GCM) ──────────────
function encPass(str, password) {
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12)
  const key = crypto.scryptSync(password, salt, 32)
  const c = crypto.createCipheriv('aes-256-gcm', key, iv)
  const data = Buffer.concat([c.update(str, 'utf8'), c.final()])
  return JSON.stringify({ enc: 'aes-256-gcm', salt: salt.toString('base64'), iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: data.toString('base64') })
}
function decPass(txt, password) {
  const o = JSON.parse(txt)
  const key = crypto.scryptSync(password, Buffer.from(o.salt, 'base64'), 32)
  const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(o.iv, 'base64'))
  d.setAuthTag(Buffer.from(o.tag, 'base64'))
  return Buffer.concat([d.update(Buffer.from(o.data, 'base64')), d.final()]).toString('utf8')
}
function isEncBackup(txt) { try { return JSON.parse(txt).enc === 'aes-256-gcm' } catch { return false } }
function atomicWrite(dest, content) {
  fs.writeFileSync(dest + '.tmp', content)
  fs.renameSync(dest + '.tmp', dest)
}

// files: { 'kettledesk-data.json': str, 'clienti.csv': str, ... }
ipcMain.handle('write-backup', async (e, folder, files, withPassword) => {
  try {
    const password = withPassword ? secrets().backupPassword : null
    if (withPassword && !password) throw new Error(m('noBackupPwd'))
    fs.mkdirSync(folder, { recursive: true })
    const day = new Date().toISOString().slice(0, 10)
    for (const [name, content] of Object.entries(files)) {
      const safe = path.basename(name)
      const out = safe.endsWith('.json') && password ? encPass(content, password) : content
      atomicWrite(path.join(folder, safe), out)
      if (safe.endsWith('.json')) {
        const hist = path.join(folder, 'storico')
        fs.mkdirSync(hist, { recursive: true })
        atomicWrite(path.join(hist, safe.replace('.json', `-${day}.json`)), out)
      }
    }
    // Foto: copiate una volta sola (nome = id)
    const fdir = path.join(folder, 'foto')
    fs.mkdirSync(fdir, { recursive: true })
    for (const name of storeList('photo-')) {
      const id = name.slice(6)
      const dest = path.join(fdir, id + (password ? '.enc' : '.jpg'))
      if (fs.existsSync(dest)) continue
      const dataUrl = storeRead(name)
      if (!dataUrl) continue
      if (password) atomicWrite(dest, encPass(dataUrl, password))
      else atomicWrite(dest, Buffer.from(dataUrl.split(',')[1] || '', 'base64'))
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('pick-backup', async () => {
  const r = await dialog.showOpenDialog(mainWindow, {
    title: m('pickFile'),
    properties: ['openFile'],
    filters: [{ name: m('backupFilter'), extensions: ['json'] }],
  })
  if (r.canceled) return null
  const file = r.filePaths[0]
  try {
    const txt = fs.readFileSync(file, 'utf8')
    return { file, encrypted: isEncBackup(txt) }
  } catch (err) { return { error: err.message } }
})

ipcMain.handle('read-backup', async (e, file, password) => {
  try {
    const txt = fs.readFileSync(file, 'utf8')
    if (isEncBackup(txt)) {
      if (!password) return { ok: false, error: m('needPwd') }
      try { return { ok: true, json: decPass(txt, password) } } catch { return { ok: false, error: m('wrongPwd') } }
    }
    return { ok: true, json: txt }
  } catch (err) { return { ok: false, error: err.message } }
})

// Importa le foto da <cartella del backup>\foto (o ..\foto se il file è in storico\)
ipcMain.handle('import-backup-photos', async (e, file, password) => {
  let dir = path.join(path.dirname(file), 'foto')
  if (!fs.existsSync(dir)) dir = path.join(path.dirname(file), '..', 'foto')
  if (!fs.existsSync(dir)) return { ok: true, count: 0 }
  let count = 0
  for (const f of fs.readdirSync(dir)) {
    const m = f.match(/^([a-zA-Z0-9_-]+)\.(jpg|enc)$/)
    if (!m) continue
    try {
      const raw = fs.readFileSync(path.join(dir, f))
      const dataUrl = m[2] === 'enc' ? decPass(raw.toString('utf8'), password || '') : 'data:image/jpeg;base64,' + raw.toString('base64')
      storeWrite('photo-' + m[1], dataUrl)
      count++
    } catch {}
  }
  return { ok: true, count }
})

ipcMain.handle('choose-folder', async () => {
  const r = await dialog.showOpenDialog(mainWindow, { title: m('pickFolder'), properties: ['openDirectory', 'createDirectory'] })
  return r.canceled ? null : r.filePaths[0]
})
ipcMain.handle('open-folder', (e, folder) => shell.openPath(folder))

// ── OAUTH: PKCE + loopback ────────────────────────────────────
function doGoogleOAuth({ clientId, clientSecret }) {
  return new Promise((resolve, reject) => {
    const verifier = base64url(crypto.randomBytes(32))
    const challenge = base64url(crypto.createHash('sha256').update(verifier).digest())
    let timer = null
    const done = () => { clearTimeout(timer); try { server.close() } catch {} }

    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url, `http://127.0.0.1:${server.address().port}`)
        if (url.pathname !== '/callback') { res.writeHead(404).end('Not found'); return }
        const code = url.searchParams.get('code')
        const error = url.searchParams.get('error')
        if (error) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(htmlPage(m('denied'), m('deniedMsg', { e: error }), '#B5483F'))
          done(); reject(new Error(m('denied') + ': ' + error)); return
        }
        if (!code) { res.writeHead(400).end('Missing code'); return }

        const body = {
          code, client_id: clientId,
          redirect_uri: `http://127.0.0.1:${server.address().port}/callback`,
          grant_type: 'authorization_code', code_verifier: verifier,
        }
        if (clientSecret && clientSecret.trim()) body.client_secret = clientSecret.trim()
        const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body),
        })
        const tokenData = await tokenResp.json()
        if (tokenData.error) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(htmlPage(m('loginError'), tokenData.error_description || tokenData.error, '#B5483F'))
          done(); reject(new Error(tokenData.error_description || tokenData.error)); return
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(htmlPage(m('done'), m('doneMsg'), '#2F6B57'))
        done()
        if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus() }
        resolve({ access_token: tokenData.access_token, expires_in: tokenData.expires_in || 3600, refresh_token: tokenData.refresh_token || null })
      } catch (e) {
        try { res.writeHead(500).end('Internal error') } catch {}
        done(); reject(e)
      }
    })

    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port
      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
      authUrl.searchParams.set('client_id', clientId)
      authUrl.searchParams.set('redirect_uri', `http://127.0.0.1:${port}/callback`)
      authUrl.searchParams.set('response_type', 'code')
      authUrl.searchParams.set('scope', [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
      ].join(' '))
      authUrl.searchParams.set('code_challenge', challenge)
      authUrl.searchParams.set('code_challenge_method', 'S256')
      authUrl.searchParams.set('access_type', 'offline')
      authUrl.searchParams.set('prompt', 'consent')
      shell.openExternal(authUrl.toString())
    })
    timer = setTimeout(() => { try { server.close() } catch {}; reject(new Error(m('timeout'))) }, 5 * 60 * 1000)
  })
}

async function refreshGoogleToken({ clientId, clientSecret, refreshToken }) {
  const body = { client_id: clientId, refresh_token: refreshToken, grant_type: 'refresh_token' }
  if (clientSecret && clientSecret.trim()) body.client_secret = clientSecret.trim()
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body),
  })
  const d = await r.json()
  if (d.error) { const err = new Error(d.error_description || d.error); err.code = d.error; throw err }
  return { access_token: d.access_token, expires_in: d.expires_in || 3600 }
}

function base64url(buf) { return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '') }
function htmlPage(title, msg, color) {
  const h = (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  title = h(title); msg = h(msg)
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
    <style>body{font-family:system-ui,sans-serif;background:#0E2A24;color:#EDEBE4;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center}
    .box{background:#fff;color:#1D2320;border-radius:14px;padding:44px;max-width:420px;text-align:center}
    h1{color:${color};font-size:21px;margin:0 0 12px;font-weight:600}p{color:#5E6661;line-height:1.6;font-size:14px;margin:0}</style></head>
    <body><div class="box"><h1>${title}</h1><p>${msg}</p></div></body></html>`
}

ipcMain.handle('google-oauth', async (event, creds) => doGoogleOAuth(creds || {}))
ipcMain.handle('google-refresh', async (event, args) => {
  try { return { ok: true, ...(await refreshGoogleToken(args || {})) } }
  catch (e) { return { ok: false, error: e.message, code: e.code || null } }
})

app.whenReady().then(() => { migrateOldSecure(); createWindow() })
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
