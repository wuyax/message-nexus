<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import MessageNexus from 'message-nexus'
import { PostMessageDriver } from 'message-nexus'
import { useAutoScroll } from '../composables/useAutoScroll'

interface LogEntry {
  time: string
  method: string
  direction: 'sent' | 'received'
  params?: unknown
}

const iframeRef = ref<HTMLIFrameElement | null>(null)
const nexusRef = ref<MessageNexus | null>(null)
const logs = ref<LogEntry[]>([])
const isIframeReady = ref(false)
const requestPayload = ref('{\n  "dataType": "current_time"\n}')
const responseData = ref<unknown>(null)
const logListRef = ref<HTMLElement | null>(null)

useAutoScroll(logListRef, logs)

const TARGET_ORIGIN = window.location.origin

function addLog(method: string, direction: 'sent' | 'received', params?: unknown) {
  logs.value.push({
    time: new Date().toLocaleTimeString(),
    method,
    direction,
    params,
  })
}

function sendRequest() {
  if (!nexusRef.value || !isIframeReady.value) {
    console.warn('Iframe not ready')
    return
  }

  try {
    const payload = JSON.parse(requestPayload.value)
    addLog('Request', 'sent', payload)

    nexusRef.value
      .invoke({
        method: 'get_data_from_iframe',
        params: payload,

        to: 'iframe-demo',
      })
      .then((res) => {
        console.log('🚀 ~ sendRequest ~ res:', res)
        addLog('Response', 'received', res)
        responseData.value = res
      })
      .catch((err) => {
        addLog('Error', 'received', { error: err.message })
      })
  } catch (e) {
    addLog('Error', 'sent', { error: 'Invalid JSON payload' })
  }
}

function sendCommand() {
  if (!nexusRef.value || !isIframeReady.value) {
    console.warn('Iframe not ready')
    return
  }

  try {
    const payload = JSON.parse(requestPayload.value)
    addLog('Notify', 'sent', payload)
    nexusRef.value.notify({
      method: 'Notify',
      params: payload,

      to: 'iframe-demo',
    })
  } catch (e) {
    addLog('Error', 'sent', { error: 'Invalid JSON payload' })
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
  const nexus = new MessageNexus(driver)
  nexusRef.value = nexus

  nexus.handle('PING', (params, context) => {
    console.log('🚀 ~ data:', params, context)
    addLog('PING', 'received', params)
    return { message: 'data received' }
  })

  nexus.onError((error) => {
    addLog('Error', 'received', { error: error.message })
  })

  window.addEventListener('message', (event) => {
    if (event.data?.type === 'IFRAME_Ready' && event.origin === TARGET_ORIGIN) {
      isIframeReady.value = true
      addLog('System', 'received', { message: 'Iframe is ready' })
    }
  })
})

onUnmounted(() => {
  nexusRef.value?.destroy()
})
</script>

<template>
  <div class="postmessage-page">
    <div class="page-header">
      <h1>PostMessageDriver</h1>
      <p class="description">
        Demonstrates cross-window communication using PostMessageDriver. The child window runs on
        the same origin and communicates with this parent boundary.
      </p>
    </div>

    <div class="grid-layout">
      <!-- Left Column: Controls & Iframe -->
      <div class="column">
        <div class="component-card">
          <div class="card-header">
            <h2>Transmission Payload</h2>
            <span v-if="!isIframeReady" class="status-indicator wait">AWAITING IFRAME</span>
            <span v-else class="status-indicator">Ready</span>
          </div>

          <div class="card-body">
            <div class="control-group">
              <label>Payload (JSON):</label>
              <textarea v-model="requestPayload" rows="4" class="payload-input"></textarea>
            </div>

            <div class="button-group">
              <button class="action-btn primary" @click="sendRequest" :disabled="!isIframeReady">
                Send Request
              </button>
              <button class="action-btn" @click="sendCommand" :disabled="!isIframeReady">
                Send Notify
              </button>
            </div>
          </div>
        </div>

        <div class="component-card iframe-card">
          <div class="card-header">
            <h2>Target Iframe</h2>
          </div>
          <div class="iframe-container">
            <iframe
              ref="iframeRef"
              src="/iframe.html"
              class="demo-iframe"
              title="PostMessage Demo Iframe"
            ></iframe>
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
              > System Ready<br />
              > Waiting for input...<br />
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

        <div v-if="responseData" class="component-card response-card">
          <div class="card-header">
            <h2>Last Response</h2>
          </div>
          <div class="card-body">
            <pre class="response-data">{{ JSON.stringify(responseData, null, 2) }}</pre>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.postmessage-page {
  width: 100%;
}

.page-header {
  margin-bottom: 40px;
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

.grid-layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
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
  color: var(--success);
  padding: 2px 8px;
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.status-indicator.wait {
  color: var(--accent);
  background: rgba(249, 115, 22, 0.1);
  border: 1px solid rgba(249, 115, 22, 0.3);
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
  resize: vertical;
  transition: all 0.2s;
}

.payload-input:focus {
  outline: none;
  border-color: var(--border-focus);
  box-shadow: 0 0 10px rgba(249, 115, 22, 0.2);
}

.button-group {
  display: flex;
  gap: 12px;
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

.iframe-container {
  padding: 12px;
  background: var(--bg-color);
  height: 400px;
}

.demo-iframe {
  width: 100%;
  height: 100%;
  border: 1px solid var(--border-color);
  background: #ffffff; /* keep iframe white to contrast */
}

.terminal-card {
  flex: 1;
  min-height: 400px;
}

.terminal-body {
  background: var(--log-bg);
  padding: 16px;
  flex: 1;
  overflow-y: auto;
  font-family: var(--font-mono);
  border-top: 1px solid var(--border-color);
  max-height: 500px;
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

.log-payload {
  margin: 0;
  color: #d4d4d4;
  font-size: 0.85rem;
  white-space: pre-wrap;
  word-break: break-all;
  padding-left: 12px;
  border-left: 2px solid #333;
}

.response-card {
  background: rgba(16, 185, 129, 0.05);
  border-color: rgba(16, 185, 129, 0.3);
}

.response-card .card-header h2 {
  color: var(--success);
}

.response-data {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 0.85rem;
  color: var(--success);
  white-space: pre-wrap;
  word-break: break-all;
}

@media (max-width: 900px) {
  .grid-layout {
    grid-template-columns: 1fr;
  }
}
</style>
