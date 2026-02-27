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
nexus.onCommand((data) => {
  addLog('COMMAND', data)

  // Reply with success
  nexus.reply(data.id, { received: true, echo: data.payload ?? data })
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
    <div class="card">
      <div class="title">PostMessageDriver - Iframe Receiver</div>
      <p class="description">
        This page acts as the iframe receiver. It communicates with the parent window using
        PostMessageDriver.
      </p>

      <div class="log-section">
        <div class="log-header">Received Messages</div>
        <div ref="logListRef" class="log-list">
          <div v-if="logs.length === 0" class="empty-state">
            Waiting for messages from parent...
          </div>
          <div v-for="(log, index) in logs" :key="index" class="log-item">
            <span class="log-time">[{{ log.time }}]</span>
            <span class="log-type">{{ log.type }}</span>
            <pre class="log-payload">{{ JSON.stringify(log.payload, null, 2) }}</pre>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.iframe-receiver {
  padding: 20px;
  background: #f5f5f5;
  min-height: 100vh;
}

.card {
  background: white;
  border-radius: 8px;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  max-width: 600px;
  margin: 0 auto;
}

.title {
  font-size: 1.2rem;
  font-weight: 600;
  color: #333;
  margin-bottom: 12px;
}

.description {
  color: #666;
  margin-bottom: 20px;
  line-height: 1.6;
  font-size: 0.9rem;
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
  background: #4a90d9;
  color: white;
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
