<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import MessageBridge from 'message-bridge'
import { PostMessageDriver } from 'message-bridge'

interface LogEntry {
  time: string
  type: string
  direction: 'sent' | 'received'
  payload: unknown
}

const iframeRef = ref<HTMLIFrameElement | null>(null)
const bridgeRef = ref<MessageBridge | null>(null)
const logs = ref<LogEntry[]>([])
const isIframeReady = ref(false)
const requestPayload = ref('{"message": "Hello from parent!"}')
const responseData = ref<unknown>(null)

const TARGET_ORIGIN = window.location.origin

function addLog(type: string, direction: 'sent' | 'received', payload: unknown) {
  logs.value.push({
    time: new Date().toLocaleTimeString(),
    type,
    direction,
    payload,
  })
}

function sendRequest() {
  if (!bridgeRef.value || !isIframeReady.value) {
    console.warn('Iframe not ready')
    return
  }

  try {
    const payload = JSON.parse(requestPayload.value)
    addLog('REQUEST', 'sent', payload)

    bridgeRef.value
      .request({
        type: 'PING',
        payload,
        to: 'iframe-demo',
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
  if (!bridgeRef.value || !isIframeReady.value) {
    console.warn('Iframe not ready')
    return
  }

  try {
    const payload = JSON.parse(requestPayload.value)
    addLog('COMMAND', 'sent', payload)
    bridgeRef.value.request({
      type: 'COMMAND',
      payload,
      to: 'iframe-demo',
    })
  } catch (e) {
    addLog('ERROR', 'sent', { error: 'Invalid JSON payload' })
  }
}

function clearLogs() {
  logs.value = []
  responseData.value = null
}

onMounted(() => {
  if (iframeRef.value) {
    iframeRef.value.onload = () => {
      isIframeReady.value = true
    }
  }

  const driver = new PostMessageDriver(iframeRef.value?.contentWindow || window, TARGET_ORIGIN)
  const bridge = new MessageBridge(driver)
  bridgeRef.value = bridge

  bridge.onCommand((data) => {
    addLog('COMMAND', 'received', data)
  })

  bridge.onError((error) => {
    addLog('ERROR', 'received', { error: error.message })
  })

  window.addEventListener('message', (event) => {
    if (event.data?.type === 'IFRAME_READY' && event.origin === TARGET_ORIGIN) {
      isIframeReady.value = true
      addLog('SYSTEM', 'received', { message: 'Iframe is ready' })
    }
  })
})

onUnmounted(() => {
  bridgeRef.value?.destroy()
})
</script>

<template>
  <div class="postmessage-page">
    <div class="page-header">
      <h1>PostMessageDriver Example</h1>
      <p class="description">
        Demonstrates cross-window communication using PostMessageDriver. The iframe below runs on
        the same origin and communicates with this parent window.
      </p>
    </div>

    <div class="card">
      <div class="controls">
        <div class="control-group">
          <label>Payload (JSON):</label>
          <textarea v-model="requestPayload" rows="3" class="payload-input"></textarea>
        </div>

        <div class="button-group">
          <button class="btn primary" @click="sendRequest" :disabled="!isIframeReady">
            Send Request
          </button>
          <button class="btn" @click="sendCommand" :disabled="!isIframeReady">Send Command</button>
          <button class="btn secondary" @click="clearLogs">Clear Logs</button>
        </div>
      </div>

      <div class="iframe-container">
        <iframe
          ref="iframeRef"
          src="/iframe.html"
          class="demo-iframe"
          title="PostMessage Demo Iframe"
        ></iframe>
      </div>

      <div v-if="responseData" class="response-section">
        <div class="response-header">Last Response:</div>
        <pre class="response-data">{{ JSON.stringify(responseData, null, 2) }}</pre>
      </div>

      <div class="log-section">
        <div class="log-header">
          <span>Communication Log</span>
          <span v-if="!isIframeReady" class="status-badge warning">Waiting for iframe...</span>
          <span v-else class="status-badge ready">Connected</span>
        </div>
        <div class="log-list">
          <div v-if="logs.length === 0" class="empty-state">
            No messages yet. Try sending a request or command.
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
.postmessage-page {
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

.controls {
  margin-bottom: 20px;
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

.iframe-container {
  margin: 20px 0;
  border: 1px solid #ddd;
  border-radius: 6px;
  overflow: hidden;
}

.demo-iframe {
  width: 100%;
  height: 200px;
  border: none;
  background: white;
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

.status-badge {
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 0.8rem;
  font-weight: 500;
}

.status-badge.ready {
  background: #e8f5e9;
  color: #2e7d32;
}

.status-badge.warning {
  background: #fff3e0;
  color: #e65100;
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
