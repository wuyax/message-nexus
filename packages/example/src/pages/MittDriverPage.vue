<script setup lang="ts">
import { ref, onUnmounted } from 'vue'
import Sender from '../components/Sender.vue'
import { MittDriver } from 'message-nexus'
import MessageNexus from 'message-nexus'
import { emitter } from '../assets/utils'

interface MyInvokeMap {
  'scence.create': {
    params: { name: string }
    result: { result: string }
  }
}

const driver = new MittDriver(emitter)
const nexus = new MessageNexus<MyInvokeMap>(driver, {
  instanceId: 'myBridgeId',
  loggerEnabled: true,
})
let messageId = ref<string[]>([])

// Store resolvers to manually control when the Promise resolves
const pendingResolvers = new Map<string, (value: any) => void>()

nexus.handle('scence.create', (params, context) => {
  console.log('🚀 ~ data:', params, context)

  return new Promise((resolve) => {
    const id = context.messageId || Math.random().toString(36).substring(7)
    messageId.value.push(id)

    // Store the resolve function so we can call it later when user clicks
    pendingResolvers.set(id, resolve)
  })
})

function send(id: string) {
  try {
    const resolve = pendingResolvers.get(id)
    if (resolve) {
      // Calling resolve() will unblock the handle() promise and trigger auto-reply
      resolve({ result: 'success' })
      pendingResolvers.delete(id)
    }

    // Remove from UI list
    messageId.value = messageId.value.filter((item) => item !== id)
  } catch (error) {
    console.log(error)
  }
}

onUnmounted(() => {
  nexus.destroy()
})
</script>

<template>
  <div class="mitt-driver-page">
    <div class="page-header">
      <h1>MittDriver Module</h1>
      <p class="description">
        Demonstrates in-process communication using MittDriver and the event emitter pattern. Local
        system bound.
      </p>
    </div>

    <div class="grid-layout">
      <section class="demo-section component-card">
        <div class="card-header">
          <h2>Message Sender</h2>
          <span class="status-indicator">Active</span>
        </div>
        <div class="card-body">
          <Sender />
        </div>
      </section>

      <section class="demo-section component-card">
        <div class="card-header">
          <h2>Incoming Queue</h2>
          <span class="status-indicator wait">Listening</span>
        </div>
        <div class="card-body">
          <div v-if="messageId.length === 0" class="empty-state">
            <span class="pulse"></span>
            Awaiting transmission...
          </div>
          <div v-else class="message-list">
            <div v-for="id in messageId" :key="id" class="message-item">
              <span class="message-id">MSG_ID: {{ id }}</span>
              <button class="action-btn" @click="send(id)">Acknowledge</button>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.mitt-driver-page {
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

.component-card {
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  position: relative;
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

.message-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding: 12px;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-left: 3px solid var(--success);
  transition: all 0.2s;
}

.message-item:hover {
  background: var(--bg-panel-hover);
  border-color: var(--border-focus);
}

.message-id {
  font-family: var(--font-mono);
  color: var(--text-primary);
  font-size: 0.9rem;
}

.action-btn {
  cursor: pointer;
  padding: 6px 16px;
  font-family: var(--font-ui);
  font-weight: 700;
  letter-spacing: 1px;
  color: var(--accent-text);
  background: var(--accent);
  border: none;
  font-size: 0.85rem;
  transition: all 0.2s;
}

.action-btn:hover {
  background: var(--accent-hover);
  box-shadow: 0 0 10px rgba(249, 115, 22, 0.4);
}

.action-btn:active {
  transform: translateY(1px);
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  font-family: var(--font-mono);
  color: var(--text-secondary);
  padding: 40px 20px;
  background: var(--bg-color);
  border: 1px dashed var(--border-color);

  font-size: 0.9rem;
  letter-spacing: 1px;
}

.pulse {
  display: inline-block;
  width: 8px;
  height: 8px;
  background-color: var(--accent);
  border-radius: 50%;
  animation: pulse-anim 2s infinite;
}

@keyframes pulse-anim {
  0% {
    box-shadow: 0 0 0 0 rgba(249, 115, 22, 0.7);
  }
  70% {
    box-shadow: 0 0 0 10px rgba(249, 115, 22, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(249, 115, 22, 0);
  }
}

.message-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

@media (max-width: 900px) {
  .grid-layout {
    grid-template-columns: 1fr;
  }
}
</style>
