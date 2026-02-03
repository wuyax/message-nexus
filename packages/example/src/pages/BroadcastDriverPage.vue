<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import MessageNexus from 'message-nexus'
import { BroadcastDriver } from 'message-nexus'

interface LogEntry {
  time: string
  type: string
  direction: 'sent' | 'received'
  payload: unknown
}

const nexusRef = ref<MessageNexus | null>(null)
const logs = ref<LogEntry[]>([])
const requestPayload = ref('{"message": "Hello from BroadcastChannel!"}')
const responseData = ref<unknown>(null)
const channelName = ref('message-nexus-demo')
const isConnected = ref(false)
const autoConnect = ref(false)

function addLog(type: string, direction: 'sent' | 'received', payload: unknown) {
  logs.value.push({
    time: new Date().toLocaleTimeString(),
    type,
    direction,
    payload,
  })
}

function sendRequest() {
  if (!nexusRef.value) return

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
      })
      .catch((err) => {
        addLog('ERROR', 'received', { error: err.message })
      })
  } catch (e) {
    addLog('ERROR', 'sent', { error: 'Invalid JSON payload' })
  }
}

function sendCommand() {
  if (!nexusRef.value) return

  try {
    const payload = JSON.parse(requestPayload.value)
    addLog('COMMAND', 'sent', payload)
    nexusRef.value.request({
      type: 'COMMAND',
      payload,
    })
  } catch (e) {
    addLog('ERROR', 'sent', { error: 'Invalid JSON payload' })
  }
}

function clearLogs() {
  logs.value = []
  responseData.value = null
}

function reconnect(should_open_new_tab: boolean = true) {
  if (nexusRef.value) {
    nexusRef.value.destroy()
  }
  if (should_open_new_tab) {
    window.open(`${window.location.href}?autoConnect=true&channelName=${channelName.value}`)
  }

  const driver = new BroadcastDriver({ channel: channelName.value })
  const nexus = new MessageNexus(driver)
  nexusRef.value = nexus

  nexus.onCommand((data) => {
    console.log('🚀 ~ reconnect ~ data:', data)
    addLog(data.type.toUpperCase(), 'received', data)
    nexus.reply(data.id, { message: 'data received' })
  })

  nexus.onError((error) => {
    addLog('ERROR', 'received', { error: error.message })
  })

  isConnected.value = true
  addLog('SYSTEM', 'received', { message: `Connected to channel: ${channelName.value}` })
}

onMounted(() => {
  const urlParams = new URLSearchParams(window.location.search)
  const auto_connect = urlParams.get('autoConnect')
  const channel_name = urlParams.get('channelName')
  if (auto_connect) {
    autoConnect.value = true
    channelName.value = channel_name ?? channelName.value
    reconnect(false)
  }
})

onUnmounted(() => {
  nexusRef.value?.destroy()
})
</script>

<template>
  <div class="broadcast-page">
    <div class="page-header">
      <h1>BroadcastDriver Example</h1>
      <p class="description">
        Demonstrates cross-tab communication using BroadcastChannel API. Open this page in multiple
        tabs to see the broadcasting in action.
      </p>
    </div>

    <div class="card">
      <div class="section">
        <h2>Channel Configuration</h2>
        <div class="config-row">
          <label>Channel Name:</label>
          <input v-model="channelName" type="text" class="input" placeholder="Enter channel name" />
          <button class="btn primary" :disabled="autoConnect" @click="() => reconnect()">
            Connect
          </button>
        </div>
        <div class="status-row">
          <span class="status-badge" :class="{ ready: isConnected }">
            {{ isConnected ? 'Connected' : 'Disconnected' }}
          </span>
        </div>
      </div>

      <div class="section">
        <h2>Send Message</h2>
        <div class="control-group">
          <label>Payload (JSON):</label>
          <textarea v-model="requestPayload" rows="3" class="payload-input"></textarea>
        </div>

        <div class="button-group">
          <button class="btn primary" @click="sendRequest" :disabled="!isConnected">
            Send Request
          </button>
          <button class="btn" @click="sendCommand" :disabled="!isConnected">Send Command</button>
          <button class="btn secondary" @click="clearLogs">Clear Logs</button>
        </div>
      </div>

      <div v-if="responseData" class="response-section">
        <div class="response-header">Last Response:</div>
        <pre class="response-data">{{ JSON.stringify(responseData, null, 2) }}</pre>
      </div>

      <div class="log-section">
        <div class="log-header">
          <span>Communication Log</span>
        </div>
        <div class="log-list">
          <div v-if="logs.length === 0" class="empty-state">
            No messages yet. Open this page in multiple tabs and try sending messages.
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
.broadcast-page {
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

.section {
  margin-bottom: 24px;
}

.section h2 {
  font-size: 1.1rem;
  font-weight: 600;
  color: #333;
  margin-bottom: 16px;
}

.config-row {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}

.config-row label {
  font-weight: 500;
  color: #444;
}

.input {
  flex: 1;
  min-width: 200px;
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.9rem;
}

.input:focus {
  outline: none;
  border-color: #4a90d9;
  box-shadow: 0 0 0 3px rgba(74, 144, 217, 0.1);
}

.status-row {
  margin-top: 12px;
}

.status-badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 0.8rem;
  font-weight: 500;
  background: #ffebee;
  color: #c62828;
}

.status-badge.ready {
  background: #e8f5e9;
  color: #2e7d32;
}

.control-group {
  margin-bottom: 16px;
}

.control-group label {
  display: block;
  font-weight: 500;
  margin-bottom: 8px;
  color: #444;
}

.payload-input {
  width: 100%;
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-family: 'SF Mono', Monaco, 'Courier New', monospace;
  font-size: 0.9rem;
  resize: vertical;
  background: #f8f8f8;
}

.payload-input:focus {
  outline: none;
  border-color: #4a90d9;
  box-shadow: 0 0 0 3px rgba(74, 144, 217, 0.1);
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

.btn.secondary {
  background: #f0f0f0;
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
  font-weight: 600;
  color: #333;
  margin-bottom: 12px;
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
  background: #4a90d9;
  color: white;
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
