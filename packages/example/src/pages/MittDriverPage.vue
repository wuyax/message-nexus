<script setup lang="ts">
import { ref, onUnmounted } from 'vue'
import Sender from '../components/Sender.vue'
import { MittDriver } from 'message-nexus'
import MessageNexus from 'message-nexus'
import { emitter } from '../assets/utils'

const driver = new MittDriver(emitter)
const nexus = new MessageNexus(driver, { instanceId: 'myBridgeId' })
let messageId = ref<string[]>([])
nexus.onCommand((data) => {
  console.log(data)
  messageId.value.push(data.id)
})

function send(id: string) {
  try {
    nexus.reply(id, { result: 'success' })
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
      <h1>MittDriver Example</h1>
      <p class="description">
        Demonstrates in-process communication using MittDriver and the event emitter pattern.
      </p>
    </div>

    <section class="demo-section">
      <h2>Message Sender</h2>
      <Sender />
    </section>

    <section class="demo-section">
      <h2>Received Messages</h2>
      <div v-if="messageId.length === 0" class="empty-state">
        No messages received yet. Use the Sender above to send a message.
      </div>
      <div v-else class="message-list">
        <p v-for="id in messageId" :key="id" class="message-item">
          <span class="message-id">Message ID: {{ id }}</span>
          <button class="reply-btn" @click="send(id)">Reply</button>
        </p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.mitt-driver-page {
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

.demo-section {
  margin-bottom: 32px;
  background: white;
  border-radius: 8px;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.demo-section h2 {
  font-size: 1.25rem;
  font-weight: 600;
  color: #333;
  margin-bottom: 16px;
}

.message-item {
  margin-bottom: 10px;
}

.message-id {
  margin-right: 10px;
  font-family: monospace;
}

.reply-btn {
  margin-left: 10px;
  cursor: pointer;
  padding: 5px 10px;
  border-radius: 5px;
  border: 1px solid #ccc;
  background: white;
  transition: all 0.2s;
}

.reply-btn:hover {
  background-color: #f5f5f5;
}

.reply-btn:active {
  background-color: #ccc;
}

.empty-state {
  color: #6a9955;
  text-align: center;
  padding: 20px;
  background: #f8f8f8;
  border-radius: 6px;
}

.message-list {
  background: #f8f8f8;
  border-radius: 6px;
  padding: 16px;
}
</style>
