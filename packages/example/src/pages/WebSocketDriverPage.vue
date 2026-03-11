<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import MessageNexus from 'message-nexus'
import { WebSocketDriver } from 'message-nexus'
import { useAutoScroll } from '../composables/useAutoScroll'

interface LogEntry {
  time: string
  method: string
  direction: 'sent' | 'received'
  params?: unknown
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
const requestPayload = ref('{\n  "message": "Hello from client!"\n}')
const responseData = ref<unknown>(null)
const connectionStatus = ref('disconnected')
const reconnectEnabled = ref(true)
const logListRef = ref<HTMLElement | null>(null)

useAutoScroll(logListRef, logs)

function addLog(method: string, direction: 'sent' | 'received', params?: unknown) {
  logs.value.push({
    time: new Date().toLocaleTimeString(),
    method,
    direction,
    params,
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
  addLog('System', 'sent', { message: `Connecting to ${wsUrl.value}...` })

  try {
    const driver = new WebSocketDriver({
      url: wsUrl.value,
      reconnect: reconnectEnabled.value,
    })

    driverRef.value = driver
    const nexus = new MessageNexus(driver)
    nexusRef.value = nexus

    nexus.handle('PING', (params, context) => {
      console.log('🚀 ~ data:', params, context)
      addLog('PING', 'received', params)
      return { message: 'data received' }
    })

    nexus.handle('EXECUTE_ERROR', () => {
      throw new Error('This is an expected execution error')
    })

    nexus.onNotification('NOTIFICATION', (params, context) => {
      addLog('NOTIFICATION', 'received', params)
    })

    nexus.onError((error) => {
      addLog('Error', 'received', { error: error.message })
      updateMetrics()
    })

    nexus.onMetrics(() => {
      updateMetrics()
    })

    setTimeout(() => {
      isConnected.value = true
      connectionStatus.value = 'connected'
      addLog('System', 'received', { message: 'Connected to WebSocket server' })
    }, 500)
  } catch (error) {
    connectionStatus.value = 'error'
    addLog('Error', 'received', { error: (error as Error).message })
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
  addLog('System', 'sent', { message: 'Disconnected from WebSocket server' })
}

function sendRequest() {
  if (!nexusRef.value) {
    console.warn('Not connected')
    return
  }

  try {
    const payload = JSON.parse(requestPayload.value)
    addLog('Request', 'sent', payload)

    nexusRef.value
      .invoke({
        method: 'PING',
        params: payload,
      })
      .then((res) => {
        addLog('Response', 'received', res)
        responseData.value = res
        updateMetrics()
      })
      .catch((err) => {
        addLog('Error', 'received', { error: err.message })
        updateMetrics()
      })
  } catch (e) {
    addLog('Error', 'sent', { error: 'Invalid JSON payload' })
  }
}

function sendUnknownMethod() {
  if (!nexusRef.value) return

  addLog('Request', 'sent', { method: 'UNKNOWN_METHOD' })

  nexusRef.value
    .invoke({ method: 'UNKNOWN_METHOD' })
    .then((res) => {
      addLog('Response', 'received', res)
      responseData.value = res
      updateMetrics()
    })
    .catch((err) => {
      addLog('Error', 'received', { error: err.message })
    })
}

function sendExecutionError() {
  if (!nexusRef.value) return

  addLog('Request', 'sent', { method: 'EXECUTE_ERROR' })

  nexusRef.value
    .invoke({ method: 'EXECUTE_ERROR' })
    .then((res) => {
      addLog('Response', 'received', res)
      responseData.value = res
      updateMetrics()
    })
    .catch((err) => {
      addLog('Error', 'received', { error: err.message })
    })
}

function sendNotify() {
  if (!nexusRef.value) return

  const payload = { message: 'System notification', timestamp: Date.now() }
  addLog('Command', 'sent', { method: 'NOTIFICATION', params: payload })

  try {
    nexusRef.value.notify({
      method: 'NOTIFICATION',
      params: payload,
    })
    updateMetrics()
  } catch (err) {
    addLog('Error', 'received', { error: (err as Error).message })
  }
}

function clearLogs() {
  logs.value = []
  responseData.value = null
}

onMounted(() => {
  connect()
})

onUnmounted(() => {
  disconnect()
})
</script>

<template>
  <div class="websocket-page">
    <div class="page-header">
      <h1>WebSocketDriver</h1>
      <p class="description">
        Demonstrates WebSocket communication using WebSocketDriver. Real-time, bidirectional
        connection with the network.
      </p>
    </div>

    <div class="metrics-grid">
      <div class="metric">
        <span class="metric-value">{{ metrics.messagesSent }}</span>
        <span class="metric-label">TX</span>
      </div>
      <div class="metric">
        <span class="metric-value">{{ metrics.messagesReceived }}</span>
        <span class="metric-label">RX</span>
      </div>
      <div class="metric">
        <span class="metric-value" :class="{ 'error-text': metrics.messagesFailed > 0 }">{{
          metrics.messagesFailed
        }}</span>
        <span class="metric-label">FAIL</span>
      </div>
      <div class="metric">
        <span class="metric-value">{{ metrics.averageLatency.toFixed(0) }}ms</span>
        <span class="metric-label">LATENCY</span>
      </div>
    </div>

    <div class="grid-layout">
      <!-- Left Column: Controls -->
      <div class="column">
        <div class="component-card">
          <div class="card-header">
            <h2>Uplink Configuration</h2>
            <span class="status-indicator" :class="connectionStatus">
              {{ connectionStatus }}
            </span>
          </div>

          <div class="card-body">
            <div class="control-group">
              <label>Socket URL:</label>
              <input
                v-model="wsUrl"
                type="text"
                class="payload-input"
                :disabled="isConnected"
                placeholder="ws://localhost:8080"
              />
            </div>

            <div class="control-group checkbox-group">
              <label class="checkbox-container" :class="{ disabled: isConnected }">
                <input v-model="reconnectEnabled" type="checkbox" :disabled="isConnected" />
                <div class="toggle-switch">
                  <div class="toggle-knob"></div>
                </div>
                <span class="toggle-label">ENABLE AUTO-RECONNECT</span>
              </label>
            </div>

            <div class="button-group">
              <button v-if="!isConnected" class="action-btn primary" @click="connect">
                Establish Link
              </button>
              <button v-else class="action-btn danger" @click="disconnect">Disconnect</button>
            </div>
          </div>
        </div>

        <div class="component-card">
          <div class="card-header">
            <h2>Command Interface</h2>
          </div>
          <div class="card-body">
            <div class="button-grid">
              <button class="action-btn outline" @click="sendRequest" :disabled="!isConnected">
                Tx Ping
              </button>
              <button
                class="action-btn outline"
                @click="sendUnknownMethod"
                :disabled="!isConnected"
              >
                Unknown Method
              </button>
              <button
                class="action-btn outline"
                @click="sendExecutionError"
                :disabled="!isConnected"
              >
                Execution Error
              </button>
              <button class="action-btn outline" @click="sendNotify" :disabled="!isConnected">
                Send Notify
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Right Column: Logs -->
      <div class="column">
        <div class="component-card terminal-card">
          <div class="card-header terminal-header">
            <h2>System Log</h2>
            <button class="action-btn small" @click="clearLogs">Clear</button>
          </div>

          <div ref="logListRef" class="terminal-body">
            <div v-if="logs.length === 0" class="empty-state">
              > UPLINK TERMINAL<br />
              > WAITING FOR DATA STREAM...<br />
              <span class="cursor">_</span>
            </div>

            <div v-for="(log, index) in logs" :key="index" class="log-item" :class="log.direction">
              <div class="log-meta">
                <span class="log-time">[{{ log.time }}]</span>
                <span class="log-direction">{{ log.direction === 'sent' ? 'TX' : 'RX' }}</span>
                <span class="log-method" :class="log.method.toLowerCase()">{{ log.method }}</span>
              </div>
              <pre class="log-payload">{{ JSON.stringify(log.params, null, 2) }}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.websocket-page {
  width: 100%;
}

.page-header {
  margin-bottom: 30px;
  border-left: 4px solid var(--accent);
  padding-left: 20px;
}

.page-header h1 {
  font-size: 2.5rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 8px;

  letter-spacing: 2px;
}

.description {
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: 0.95rem;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 24px;
}

.metric {
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  padding: 16px;
  text-align: center;
  position: relative;
}

.metric::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  border: 1px solid var(--border-color);
  pointer-events: none;
}

.metric-value {
  display: block;
  font-family: var(--font-mono);
  font-size: 1.8rem;
  font-weight: 700;
  color: var(--text-primary);
}

.metric-value.error-text {
  color: var(--danger);
}

.metric-label {
  display: block;
  font-family: var(--font-ui);
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--text-secondary);
  margin-top: 4px;
  letter-spacing: 2px;
}

.grid-layout {
  display: grid;
  grid-template-columns: 1fr 1.5fr;
  gap: 24px;
}

.column {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.component-card {
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  position: relative;
  display: flex;
  flex-direction: column;
}

.component-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 10px;
  height: 10px;
  border-top: 2px solid var(--accent);
  border-left: 2px solid var(--accent);
}

.component-card::after {
  content: '';
  position: absolute;
  bottom: 0;
  right: 0;
  width: 10px;
  height: 10px;
  border-bottom: 2px solid var(--accent);
  border-right: 2px solid var(--accent);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
  background: rgba(0, 0, 0, 0.2);
}

.card-header h2 {
  font-size: 1.2rem;
  font-weight: 600;
  color: var(--text-primary);

  letter-spacing: 1px;
}

.status-indicator {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  padding: 2px 8px;
  border: 1px solid currentColor;
}

.status-indicator.connected {
  color: var(--success);
  background: rgba(16, 185, 129, 0.1);
}

.status-indicator.connecting {
  color: var(--accent);
  background: rgba(249, 115, 22, 0.1);
}

.status-indicator.disconnected {
  color: var(--text-secondary);
  background: rgba(136, 136, 136, 0.1);
}

.status-indicator.error {
  color: var(--danger);
  background: rgba(239, 68, 68, 0.1);
}

.card-body {
  padding: 24px;
}

.control-group {
  margin-bottom: 20px;
}

.control-group label {
  display: block;
  font-family: var(--font-mono);
  font-size: 0.85rem;
  color: var(--text-secondary);
  margin-bottom: 8px;
  letter-spacing: 1px;
}

.payload-input {
  width: 100%;
  padding: 12px;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 0.9rem;
  transition: all 0.2s;
}

.payload-input:focus {
  outline: none;
  border-color: var(--border-focus);
  box-shadow: 0 0 10px rgba(249, 115, 22, 0.2);
}

.payload-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.checkbox-container {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  user-select: none;
  transition: opacity 0.3s ease;
}

.checkbox-container.disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.checkbox-container input {
  position: absolute;
  opacity: 0;
  cursor: pointer;
  height: 0;
  width: 0;
}

.toggle-switch {
  position: relative;
  width: 40px;
  height: 20px;
  background-color: var(--bg-color);
  border: 1px solid var(--border-color);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  align-items: center;
  padding: 2px;
}

.toggle-knob {
  width: 14px;
  height: 14px;
  background-color: var(--text-secondary);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  transform: translateX(0);
}

.checkbox-container:hover input:not(:disabled) ~ .toggle-switch {
  border-color: var(--accent);
  box-shadow: 0 0 8px rgba(249, 115, 22, 0.2);
}

.checkbox-container:hover input:not(:disabled) ~ .toggle-switch .toggle-knob {
  background-color: var(--accent);
  box-shadow: 0 0 4px var(--accent);
}

.checkbox-container input:checked ~ .toggle-switch {
  border-color: var(--accent);
  background-color: rgba(249, 115, 22, 0.1);
}

.checkbox-container input:checked ~ .toggle-switch .toggle-knob {
  transform: translateX(20px);
  background-color: var(--accent);
  box-shadow: 0 0 8px var(--accent);
}

.checkbox-container input:disabled ~ .toggle-switch {
  border-color: var(--border-color);
  background-color: rgba(0, 0, 0, 0.2);
}

.checkbox-container input:disabled ~ .toggle-switch .toggle-knob {
  background-color: var(--border-color);
  box-shadow: none;
}

.checkbox-container input:focus-visible ~ .toggle-switch {
  outline: 2px solid var(--accent);
  outline-offset: 4px;
}

.toggle-label {
  font-family: var(--font-mono);
  font-size: 0.85rem;
  color: var(--text-primary);
  letter-spacing: 1px;
  transition: color 0.3s ease;
}

.checkbox-container.disabled .toggle-label {
  color: var(--text-secondary);
}

.checkbox-container:hover input:not(:disabled) ~ .toggle-label {
  color: var(--accent);
}

.button-group,
.button-grid {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.button-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
}

.action-btn {
  cursor: pointer;
  padding: 10px 16px;
  font-family: var(--font-ui);
  font-weight: 700;
  letter-spacing: 1px;
  color: var(--text-primary);
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  font-size: 0.85rem;
  transition: all 0.2s;

  flex: 1;
}

.action-btn:hover:not(:disabled) {
  background: var(--bg-panel-hover);
  border-color: var(--border-focus);
}

.action-btn.primary {
  color: var(--accent-text);
  background: var(--accent);
  border-color: var(--accent);
}

.action-btn.primary:hover:not(:disabled) {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
  box-shadow: 0 0 10px rgba(249, 115, 22, 0.4);
}

.action-btn.danger {
  color: #fff;
  background: var(--danger);
  border-color: var(--danger);
}

.action-btn.danger:hover:not(:disabled) {
  background: #b91c1c;
  border-color: #b91c1c;
}

.action-btn.outline {
  background: transparent;
  color: var(--text-secondary);
}

.action-btn.outline:hover:not(:disabled) {
  color: var(--text-primary);
  border-color: var(--border-color);
  background: rgba(255, 255, 255, 0.05);
}

.action-btn.small {
  padding: 4px 10px;
  font-size: 0.75rem;
  flex: 0;
}

.action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  filter: grayscale(1);
}

.terminal-card {
  flex: 1;
  min-height: 500px;
}

.terminal-body {
  background: var(--log-bg);
  padding: 16px;
  flex: 1;
  overflow-y: auto;
  font-family: var(--font-mono);
  border-top: 1px solid var(--border-color);
  max-height: 600px;
}

.empty-state {
  color: var(--text-secondary);
  font-size: 0.9rem;
  line-height: 1.8;
}

.cursor {
  animation: blink 1s step-end infinite;
}

@keyframes blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0;
  }
}

.log-item {
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px dashed var(--log-border);
}

.log-item:last-child {
  border-bottom: none;
  margin-bottom: 0;
  padding-bottom: 0;
}

.log-meta {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 6px;
  font-size: 0.85rem;
}

.log-time {
  color: #569cd6;
}

.log-direction {
  color: var(--text-secondary);
  font-weight: 700;
}

.log-item.sent .log-direction {
  color: var(--accent);
}

.log-item.received .log-direction {
  color: var(--success);
}

.log-method {
  padding: 2px 6px;
  font-size: 0.75rem;
  font-weight: 700;
  background: #333;
  color: #fff;
}

.log-method.request {
  background: #005f87;
}
.log-method.response {
  background: #00875f;
}
.log-method.command {
  background: #875f00;
}
.log-method.error {
  background: #870000;
}
.log-method.system {
  background: #5f0087;
}
.log-method.ping {
  background: #4ec9b0;
  color: #000;
}
.log-method.unknown_method {
  background: #d4a90d;
  color: #000;
}
.log-method.execute_error {
  background: #a200ff;
  color: #fff;
}
.log-method.notification {
  background: #ff5500;
  color: #000;
}

.log-payload {
  margin: 0;
  color: #d4d4d4;
  font-size: 0.85rem;
  white-space: pre-wrap;
  word-break: break-all;
  padding-left: 12px;
  border-left: 2px solid #333;
}

@media (max-width: 1024px) {
  .grid-layout {
    grid-template-columns: 1fr;
  }
}
</style>
