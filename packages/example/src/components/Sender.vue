<script setup lang="ts">
import { onUnmounted } from 'vue'
import MessageNexus from 'message-nexus'
import { MittDriver } from 'message-nexus'
import { emitter } from '../assets/utils'

const driver = new MittDriver(emitter)
const nexus = new MessageNexus(driver)

function send() {
  nexus
    .invoke({
      method: 'scence.create',
      params: { name: 'test' + Math.random() },
      to: 'myBridgeId',
      retryCount: 3,
      retryDelay: 1000,
    })
    .then((res) => {
      console.log(res)
    })
    .catch((err) => {
      console.log(err)
    })
}

onUnmounted(() => {
  nexus.destroy()
})
</script>

<template>
  <div class="sender-module">
    <div class="title">TRANSMISSION CONTROL</div>
    <div class="control-panel">
      <div class="data-readout">
        <span class="label">METHOD:</span> <span class="value">scence.create</span><br />
        <span class="label">TARGET:</span> <span class="value">myBridgeId</span>
      </div>
      <button class="send-btn" @click="send"><span class="btn-icon">⚡</span> Initiate Send</button>
    </div>
  </div>
</template>

<style scoped>
.sender-module {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.title {
  font-family: var(--font-mono);
  font-size: 0.85rem;
  color: var(--text-secondary);

  letter-spacing: 2px;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 8px;
}

.control-panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.data-readout {
  background: var(--bg-color);
  padding: 12px;
  border: 1px solid var(--border-color);
  font-family: var(--font-mono);
  font-size: 0.85rem;
  line-height: 1.8;
}

.label {
  color: var(--text-secondary);
}

.value {
  color: var(--accent);
}

.send-btn {
  cursor: pointer;
  padding: 12px 20px;
  font-family: var(--font-ui);
  font-size: 1rem;
  font-weight: 700;

  letter-spacing: 2px;
  color: var(--bg-color);
  background: var(--text-primary);
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  transition: all 0.2s;
  box-shadow: 4px 4px 0 var(--border-color);
}

.send-btn:hover {
  background: var(--accent);
  box-shadow: 4px 4px 0 rgba(249, 115, 22, 0.3);
  transform: translate(-2px, -2px);
}

.send-btn:active {
  transform: translate(2px, 2px);
  box-shadow: 0 0 0 transparent;
}

.btn-icon {
  font-size: 1.2rem;
}
</style>
