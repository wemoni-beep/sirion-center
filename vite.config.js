import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Local file backup plugin — saves JSON to data/ folder for bulletproof persistence
function localBackupPlugin() {
  const dataDir = path.resolve(__dirname, 'data')

  return {
    name: 'local-backup',
    configureServer(server) {
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })

      server.middlewares.use('/__api/backup', (req, res, next) => {
        const parts = req.url.split('/').filter(Boolean)
        const collection = parts[0]
        const docId = parts[1]

        if (!collection) { res.writeHead(400); res.end('{"error":"missing collection"}'); return }

        const collDir = path.join(dataDir, collection)

        if (req.method === 'POST' && docId) {
          // Write a document
          let body = ''
          req.on('data', chunk => { body += chunk })
          req.on('end', () => {
            try {
              if (!fs.existsSync(collDir)) fs.mkdirSync(collDir, { recursive: true })
              fs.writeFileSync(path.join(collDir, `${docId}.json`), body, 'utf8')
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end('{"ok":true}')
            } catch (e) {
              res.writeHead(500, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: e.message }))
            }
          })
        } else if (req.method === 'GET' && !docId) {
          // List all documents in a collection
          if (!fs.existsSync(collDir)) {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end('[]')
            return
          }
          try {
            const files = fs.readdirSync(collDir).filter(f => f.endsWith('.json'))
            const docs = files.map(f => {
              try {
                const data = JSON.parse(fs.readFileSync(path.join(collDir, f), 'utf8'))
                data._id = f.replace('.json', '')
                return data
              } catch { return null }
            }).filter(Boolean)
            docs.sort((a, b) => (b.updated_at || b.created_at || b._cachedAt || '').toString().localeCompare((a.updated_at || a.created_at || a._cachedAt || '').toString()))
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(docs))
          } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: e.message }))
          }
        } else if (req.method === 'DELETE' && docId) {
          // Delete a document
          try {
            const filePath = path.join(collDir, `${docId}.json`)
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end('{"ok":true}')
          } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: e.message }))
          }
        } else {
          next()
        }
      })
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), localBackupPlugin()],
  base: process.env.GITHUB_PAGES ? '/sirion-center/' : '/',
})
