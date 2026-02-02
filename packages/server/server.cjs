#!/usr/bin/env node

/**
 * Simple WebSocket server for testing WebSocketDriver
 * Run with: pnpm dev:ws
 */

const http = require('http')
const { WebSocketServer } = require('ws')

const PORT = process.env.WS_PORT || 8080

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('WebSocket Server Running. Connect with WebSocket client.\n')
})

const wss = new WebSocketServer({ server })

console.log(`[${new Date().toISOString()}] WebSocket server starting on port ${PORT}...`)

wss.on('listening', () => {
  console.log(`[${new Date().toISOString()}] WebSocket server running`)
  console.log(`[${new Date().toISOString()}] Connect with: ws://localhost:${PORT}`)
})

wss.on('connection', (ws, req) => {
  const clientId = req.socket.remoteAddress || socket.id
  console.log(`[${new Date().toISOString()}] Client connected: ${clientId}`)

  ws.on('message', (message) => {
    console.log(`[${new Date().toISOString()}] Received from ${clientId}: ${message.toString()}`)

    // Broadcast to all other clients
    wss.clients.forEach((client) => {
      if (client !== ws && client.readyState === 1) {
        console.log(`[${new Date().toISOString()}] Broadcasting to other client`)
        client.send(message.toString())
      }
    })
  })

  ws.on('close', (code, reason) => {
    console.log(`[${new Date().toISOString()}] Client disconnected: ${clientId}, code: ${code}`)
  })

  ws.on('error', (error) => {
    console.error(`[${new Date().toISOString()}] Client error: ${error.message}`)
  })

  // Send welcome message
  ws.send(JSON.stringify({ type: 'CONNECTED', message: 'Welcome to WebSocket server' }))
})

wss.on('error', (error) => {
  console.error(`[${new Date().toISOString()}] Server error: ${error.message}`)
})

// Graceful shutdown
process.on('SIGINT', () => {
  console.log(`\n[${new Date().toISOString()}] Shutting down server...`)

  wss.clients.forEach((ws) => {
    ws.close(1000, 'Server shutting down')
  })

  wss.close(() => {
    server.close(() => {
      console.log(`[${new Date().toISOString()}] Server closed`)
      process.exit(0)
    })
  })
})

server.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] Server listening on port ${PORT}`)
})
