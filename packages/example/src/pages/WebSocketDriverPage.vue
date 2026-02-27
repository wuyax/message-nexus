<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import MessageNexus from 'message-nexus'
import { WebSocketDriver } from 'message-nexus'
import { useAutoScroll } from '../composables/useAutoScroll'

interface LogEntry {
  time: string
  type: string
  direction: 'sent' | 'received'
  payload: unknown
}

interface Metrics {
  messagesSent: number
  messagesReceived: number
  messagesFailed: number
  pendingMessages: number
  queuedMessages: number
  averageLatency: number
}

const nexusRef = ref<MessageNexus | null>(null)
const driverRef = ref<WebSocketDriver | null>(null)
const logs = ref<LogEntry[]>([])
const metrics = ref<Metrics>({
  messagesSent: 0,
  messagesReceived: 0,
  messagesFailed: 0,
  pendingMessages: 0,
  queuedMessages: 0,
  averageLatency: 0,
})

const wsUrl = ref('ws://localhost:8080')
const isConnected = ref(false)
const requestPayload = ref('{"message": "Hello from client!"}')
const responseData = ref<unknown>(null)
const connectionStatus = ref('disconnected')
const reconnectEnabled = ref(true)
const logListRef = ref<HTMLElement | null>(null)

useAutoScroll(logListRef, logs)

function addLog(type: string, direction: 'sent' | 'received', payload: unknown) {
  logs.value.push({
    time: new Date().toLocaleTimeString(),
    type,
    direction,
    payload,
  })
}

function updateMetrics() {
  if (nexusRef.value) {
    const m = nexusRef.value.getMetrics()
    metrics.value = {
      messagesSent: m.messagesSent,
      messagesReceived: m.messagesReceived,
      messagesFailed: m.messagesFailed,
      pendingMessages: m.pendingMessages,
      queuedMessages: m.queuedMessages,
      averageLatency: m.averageLatency,
    }
  }
}

function connect() {
  disconnect()

  connectionStatus.value = 'connecting'
  addLog('SYSTEM', 'sent', { message: `Connecting to ${wsUrl.value}...` })

  try {
    const driver = new WebSocketDriver({
      url: wsUrl.value,
      reconnect: reconnectEnabled.value,
    })

    driverRef.value = driver
    const nexus = new MessageNexus(driver)
    nexusRef.value = nexus

    nexus.onCommand((data) => {
      addLog(data.type, 'received', data)
      updateMetrics()
      nexus.reply(data.id, { message: `${data.type} processed` })
    })

    nexus.onError((error) => {
      addLog('ERROR', 'received', { error: error.message })
      updateMetrics()
    })

    nexus.onMetrics(() => {
      updateMetrics()
    })

    // Wait for connection to establish
    setTimeout(() => {
      isConnected.value = true
      connectionStatus.value = 'connected'
      addLog('SYSTEM', 'received', { message: 'Connected to WebSocket server' })
    }, 500)
  } catch (error) {
    connectionStatus.value = 'error'
    addLog('ERROR', 'received', { error: (error as Error).message })
  }
}

function disconnect() {
  if (nexusRef.value) {
    nexusRef.value.destroy()
    nexusRef.value = null
  }
  driverRef.value = null
  isConnected.value = false
  connectionStatus.value = 'disconnected'
  addLog('SYSTEM', 'sent', { message: 'Disconnected from WebSocket server' })
}

function sendRequest() {
  if (!nexusRef.value) {
    console.warn('Not connected')
    return
  }

  try {
    const payload = JSON.parse(requestPayload.value)
    addLog('REQUEST', 'sent', payload)

    nexusRef.value
      .request({
        type: 'PING',
        payload,
      })
      .then((res) => {
        addLog('RESPONSE', 'received', res)
        responseData.value = res
        updateMetrics()
      })
      .catch((err) => {
        addLog('ERROR', 'received', { error: err.message })
        updateMetrics()
      })
  } catch (e) {
    addLog('ERROR', 'sent', { error: 'Invalid JSON payload' })
  }
}

function sendGetTime() {
  if (!nexusRef.value) return

  addLog('REQUEST', 'sent', { type: 'GET_TIME' })

  nexusRef.value
    .request({ type: 'GET_TIME' })
    .then((res) => {
      addLog('RESPONSE', 'received', res)
      responseData.value = res
      updateMetrics()
    })
    .catch((err) => {
      addLog('ERROR', 'received', { error: err.message })
    })
}

function sendEcho() {
  if (!nexusRef.value) return

  const payload = { message: 'Hello Echo!', timestamp: Date.now() }
  addLog('REQUEST', 'sent', { type: 'ECHO', payload })

  nexusRef.value
    .request({
      type: 'ECHO',
      payload,
    })
    .then((res) => {
      addLog('RESPONSE', 'received', res)
      responseData.value = res
      updateMetrics()
    })
    .catch((err) => {
      addLog('ERROR', 'received', { error: err.message })
    })
}

function sendGetData() {
  if (!nexusRef.value) return

  addLog('REQUEST', 'sent', { type: 'GET_DATA' })

  nexusRef.value
    .request({ type: 'GET_DATA' })
    .then((res) => {
      addLog('RESPONSE', 'received', res)
      responseData.value = res
      updateMetrics()
    })
    .catch((err) => {
      addLog('ERROR', 'received', { error: err.message })
    })
}

function clearLogs() {
  logs.value = []
  responseData.value = null
}

onMounted(() => {
  // Auto-connect on mount
  connect()
})

onUnmounted(() => {
  disconnect()
})
</script>

<template>
  <div class="websocket-page">
    <div class="page-header">
      <h1>WebSocketDriver Example</h1>
      <p class="description">
        Demonstrates WebSocket communication using WebSocketDriver. Connect to a WebSocket server
        and test request-response patterns with automatic reconnection support.
      </p>
    </div>

    <div class="card">
      <div class="connection-section">
        <h3>Connection Settings</h3>
        <div class="connection-controls">
          <div class="input-group">
            <label>WebSocket URL:</label>
            <input
              v-model="wsUrl"
              type="text"
              class="url-input"
              :disabled="isConnected"
              placeholder="ws://localhost:8080"
            />
          </div>
          <div class="input-group checkbox-group">
            <label>
              <input v-model="reconnectEnabled" type="checkbox" :disabled="isConnected" />
              Enable Auto-Reconnect
            </label>
          </div>
          <div class="button-group">
            <button v-if="!isConnected" class="btn primary" @click="connect">Connect</button>
            <button v-else class="btn danger" @click="disconnect">Disconnect</button>
          </div>
        </div>
        <div class="status-bar">
          <span class="status-label">Status:</span>
          <span class="status-badge" :class="connectionStatus">{{ connectionStatus }}</span>
        </div>
      </div>

      <div class="controls">
        <h3>Quick Actions</h3>
        <div class="button-group">
          <button class="btn" @click="sendRequest" :disabled="!isConnected">Send PING</button>
          <button class="btn" @click="sendGetTime" :disabled="!isConnected">Get Time</button>
          <button class="btn" @click="sendEcho" :disabled="!isConnected">Echo Test</button>
          <button class="btn" @click="sendGetData" :disabled="!isConnected">Get Data</button>
        </div>
      </div>

      <div class="metrics-section">
        <h3>Metrics</h3>
        <div class="metrics-grid">
          <div class="metric">
            <span class="metric-value">{{ metrics.messagesSent }}</span>
            <span class="metric-label">Sent</span>
          </div>
          <div class="metric">
            <span class="metric-value">{{ metrics.messagesReceived }}</span>
            <span class="metric-label">Received</span>
          </div>
          <div class="metric">
            <span class="metric-value">{{ metrics.messagesFailed }}</span>
            <span class="metric-label">Failed</span>
          </div>
          <div class="metric">
            <span class="metric-value">{{ metrics.averageLatency.toFixed(0) }}ms</span>
            <span class="metric-label">Avg Latency</span>
          </div>
        </div>
      </div>

      <div v-if="responseData" class="response-section">
        <div class="response-header">Last Response:</div>
        <pre class="response-data">{{ JSON.stringify(responseData, null, 2) }}</pre>
      </div>

      <div class="log-section">
        <div class="log-header">
          <span>Communication Log</span>
          <button class="btn small secondary" @click="clearLogs">Clear</button>
        </div>
        <div ref="logListRef" class="log-list">
          <div v-if="logs.length === 0" class="empty-state">
            No messages yet. Try sending a request.
          </div>
          <div v-for="(log, index) in logs" :key="index" class="log-item" :class="log.direction">
            <span class="log-time">{{ log.time }}</span>
            <span class="log-type" :class="log.type.toLowerCase()">{{ log.type }}</span>
            <span class="log-direction">[{{ log.direction === 'sent' ? '→' : '←' }}]</span>
            <pre class="log-payload">{{ JSON.stringify(log.payload, null, 2) }}</pre>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.websocket-page {
  max-width: 800px;
  margin: 0 auto;
}

.page-header {
  margin-bottom: 32px;
}

.page-header h1 {
  font-size: 1.75rem;
  font-weight: 600;
  color: #333;
  margin-bottom: 8px;
}

.description {
  color: #666;
  line-height: 1.6;
}

.card {
  background: white;
  border-radius: 8px;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.connection-section {
  margin-bottom: 24px;
  padding-bottom: 24px;
  border-bottom: 1px solid #eee;
}

.connection-section h3,
.controls h3,
.metrics-section h3 {
  font-size: 1rem;
  font-weight: 600;
  color: #333;
  margin-bottom: 16px;
}

.connection-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: flex-end;
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.input-group label {
  font-size: 0.85rem;
  font-weight: 500;
  color: #666;
}

.url-input {
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.9rem;
  width: 280px;
  font-family: 'SF Mono', Monaco, 'Courier New', monospace;
}

.url-input:focus {
  outline: none;
  border-color: #4a90d9;
  box-shadow: 0 0 0 3px rgba(74, 144, 217, 0.1);
}

.url-input:disabled {
  background: #f5f5f5;
  cursor: not-allowed;
}

.checkbox-group {
  flex-direction: row;
  align-items: center;
}

.checkbox-group label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.checkbox-group input[type='checkbox'] {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.button-group {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.btn {
  padding: 10px 20px;
  border: 1px solid #ddd;
  border-radius: 6px;
  background: white;
  color: #333;
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.2s;
}

.btn:hover:not(:disabled) {
  background: #f5f5f5;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn.primary {
  background: #4a90d9;
  color: white;
  border-color: #4a90d9;
}

.btn.primary:hover:not(:disabled) {
  background: #3a7fc8;
}

.btn.danger {
  background: #d32f2f;
  color: white;
  border-color: #d32f2f;
}

.btn.danger:hover:not(:disabled) {
  background: #b71c1c;
}

.btn.secondary {
  background: #f0f0f0;
}

.btn.small {
  padding: 6px 12px;
  font-size: 0.8rem;
}

.status-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
}

.status-label {
  font-size: 0.85rem;
  color: #666;
}

.status-badge {
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 0.8rem;
  font-weight: 500;
  text-transform: capitalize;
}

.status-badge.connected {
  background: #e8f5e9;
  color: #2e7d32;
}

.status-badge.connecting {
  background: #fff3e0;
  color: #e65100;
}

.status-badge.disconnected {
  background: #f5f5f5;
  color: #666;
}

.status-badge.error {
  background: #ffebee;
  color: #c62828;
}

.controls {
  margin-bottom: 24px;
  padding-bottom: 24px;
  border-bottom: 1px solid #eee;
}

.metrics-section {
  margin-bottom: 24px;
  padding-bottom: 24px;
  border-bottom: 1px solid #eee;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.metric {
  text-align: center;
  padding: 16px;
  background: #f8f8f8;
  border-radius: 8px;
}

.metric-value {
  display: block;
  font-size: 1.5rem;
  font-weight: 600;
  color: #333;
  font-family: 'SF Mono', Monaco, 'Courier New', monospace;
}

.metric-label {
  display: block;
  font-size: 0.8rem;
  color: #666;
  margin-top: 4px;
}

.response-section {
  margin: 20px 0;
  padding: 16px;
  background: #f0f9f0;
  border-radius: 6px;
  border: 1px solid #c8e6c9;
}

.response-header {
  font-weight: 600;
  color: #2e7d32;
  margin-bottom: 8px;
}

.response-data {
  margin: 0;
  padding: 12px;
  background: white;
  border-radius: 4px;
  font-family: 'SF Mono', Monaco, 'Courier New', monospace;
  font-size: 0.85rem;
  overflow-x: auto;
}

.log-section {
  margin-top: 20px;
}

.log-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  font-weight: 600;
  color: #333;
}

.log-list {
  background: #1e1e1e;
  border-radius: 6px;
  padding: 12px;
  max-height: 400px;
  overflow-y: auto;
}

.log-item {
  padding: 8px;
  margin-bottom: 8px;
  border-radius: 4px;
  background: #2d2d2d;
}

.log-item:last-child {
  margin-bottom: 0;
}

.log-item.sent {
  border-left: 3px solid #4a90d9;
}

.log-item.received {
  border-left: 3px solid #4ec9b0;
}

.log-time {
  color: #569cd6;
  font-family: 'SF Mono', Monaco, 'Courier New', monospace;
  font-size: 0.8rem;
  margin-right: 8px;
}

.log-type {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
  margin-right: 8px;
}

.log-type.request {
  background: #4a90d9;
  color: white;
}

.log-type.response {
  background: #4ec9b0;
  color: #1e1e1e;
}

.log-type.command {
  background: #d4a90d;
  color: #1e1e1e;
}

.log-type.error {
  background: #d32f2f;
  color: white;
}

.log-type.system {
  background: #7c4dff;
  color: white;
}

.log-type.ping {
  background: #0fbf3b;
  color: white;
}

.log-type.echo {
  background: #19368d;
  color: white;
}

.log-type.get_data {
  background: #4ec9b0;
  color: #1e1e1e;
}

.log-type.get_time {
  background: #eb3838;
  color: #1e1e1e;
}

.log-direction {
  color: #888;
  margin-right: 8px;
}

.log-payload {
  margin: 8px 0 0 0;
  padding: 8px;
  background: #1a1a1a;
  border-radius: 4px;
  font-family: 'SF Mono', Monaco, 'Courier New', monospace;
  font-size: 0.8rem;
  color: #d4d4d4;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

.empty-state {
  color: #6a9955;
  text-align: center;
  padding: 20px;
}
</style>
