<script setup lang="ts">
import { ref, onMounted } from 'vue'
import MessageNexus from 'message-nexus'
import { PostMessageDriver } from 'message-nexus'
import { useAutoScroll } from './composables/useAutoScroll'

const TARGET_ORIGIN = window.location.origin

// Create driver for communicating with parent window
const driver = new PostMessageDriver(window.parent, TARGET_ORIGIN)
const nexus = new MessageNexus(driver, { instanceId: 'iframe-demo' })

interface LogEntry {
  time: string
  type: string
  payload: unknown
}

const logs = ref<LogEntry[]>([])
const logListRef = ref<HTMLElement | null>(null)

useAutoScroll(logListRef, logs)

function addLog(type: string, payload: unknown) {
  logs.value.push({
    time: new Date().toLocaleTimeString(),
    type,
    payload,
  })
}

// Listen for commands from parent
nexus.onNotification('Notify', (params, context) => {
  addLog('NOTIFY', { params, context })
})

nexus.handle('get_data_from_iframe', (params, context) => {
  addLog('COMMAND', { params, context })
  return { current_time: new Date().toISOString() }
})

// Listen for errors
nexus.onError((error: { message: string }) => {
  addLog('ERROR', { error: error.message })
})

// Notify parent that iframe is ready
onMounted(() => {
  window.parent.postMessage({ type: 'IFRAME_READY' }, TARGET_ORIGIN)
  addLog('SYSTEM', { message: 'Iframe receiver initialized' })
})
</script>

<template>
  <div class="iframe-receiver">
    <div class="component-card">
      <div class="card-header">
        <div class="title">IFRAME RECEIVER MODULE</div>
        <span class="status-indicator">ACTIVE</span>
      </div>

      <div class="card-body">
        <p class="description">
          TARGET: window.parent<br />
          PROTOCOL: PostMessageDriver
        </p>

        <div class="terminal-card">
          <div class="terminal-header">
            <h2>Incoming Data Stream</h2>
          </div>
          <div ref="logListRef" class="terminal-body">
            <div v-if="logs.length === 0" class="empty-state">
              > AWAITING TRANSMISSION...<br />
              <span class="cursor">_</span>
            </div>
            <div v-for="(log, index) in logs" :key="index" class="log-item">
              <div class="log-meta">
                <span class="log-time">[{{ log.time }}]</span>
                <span class="log-type">{{ log.type }}</span>
              </div>
              <pre class="log-payload">{{ JSON.stringify(log.payload, null, 2) }}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.iframe-receiver {
  padding: 16px;
  background-image:
    linear-gradient(rgba(249, 115, 22, 0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(249, 115, 22, 0.03) 1px, transparent 1px);
  background-size: 40px 40px;
  min-height: 100vh;
  box-sizing: border-box;
}

.component-card {
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  position: relative;
  display: flex;
  flex-direction: column;
  height: calc(100vh - 32px);
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
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  background: rgba(0, 0, 0, 0.2);
}

.title {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-primary);

  letter-spacing: 1px;
}

.status-indicator {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--success);
  padding: 2px 8px;
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.card-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 16px;
}

.description {
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: 0.85rem;
  line-height: 1.6;
  margin: 0;
  border-left: 2px solid var(--border-color);
  padding-left: 12px;
}

.terminal-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-color);
}

.terminal-header {
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.3);
  border-bottom: 1px solid var(--border-color);
}

.terminal-header h2 {
  font-size: 0.9rem;
  color: var(--text-secondary);
  font-family: var(--font-mono);
  margin: 0;
}

.terminal-body {
  background: var(--log-bg);
  padding: 12px;
  flex: 1;
  overflow-y: auto;
  font-family: var(--font-mono);
}

.empty-state {
  color: var(--text-secondary);
  font-size: 0.85rem;
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
  font-size: 0.8rem;
}

.log-time {
  color: #569cd6;
}

.log-type {
  padding: 2px 6px;
  font-size: 0.7rem;
  font-weight: 700;
  background: var(--accent);
  color: var(--accent-text);
}

.log-payload {
  margin: 0;
  color: #d4d4d4;
  font-size: 0.8rem;
  white-space: pre-wrap;
  word-break: break-all;
  padding-left: 12px;
  border-left: 2px solid #333;
}
</style>
