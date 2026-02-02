<script setup lang="ts">
import { ref } from 'vue'
import Sender from './components/Sender.vue'
import PostMessageDemo from './components/PostMessageDemo.vue'
import { MittDriver, emitter } from 'message-bridge'
import MessageBridge from 'message-bridge'

// MittDriver Example
const driver = new MittDriver(emitter)
const bridge = new MessageBridge(driver)

bridge.onCommand((data) => {
  console.log(data)
  bridge.reply(data.id, { result: 'success' })
})

let messageId = ref<string[]>([])
const driver2 = new MittDriver(emitter)
const bridge2 = new MessageBridge(driver2, { instanceId: 'myBridgeId' })
bridge2.onCommand((data) => {
  console.log(data)
  messageId.value.push(data.id)
})

function send(id: string) {
  try {
    bridge2.reply(id, { result: 'success' })
    messageId.value = messageId.value.filter((item) => item !== id)
  } catch (error) {
    console.log(error)
  }
}
</script>

<template>
  <div>
    <div class="wrapper">
      <Sender />
    </div>
  </div>

  <main>
    <!-- MittDriver Example -->
    <section class="demo-section">
      <h2>MittDriver Example (In-Process)</h2>
      <p v-for="id in messageId" :key="id" class="message-item">
        <span class="message-id">Message ID: {{ id }}</span>
        <button class="reply-btn" @click="send(id)">Reply</button>
      </p>
    </section>

    <!-- PostMessageDriver Example -->
    <section class="demo-section">
      <h2>PostMessageDriver Example (Cross-Window)</h2>
      <PostMessageDemo />
    </section>
  </main>
</template>

<style scoped>
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
}
.reply-btn:hover {
  background-color: #f5f5f5;
}
.reply-btn:active {
  background-color: #ccc;
}
.reply-btn:disabled {
  background-color: #ccc;
  cursor: not-allowed;
}
.demo-section {
  margin-bottom: 40px;
}
.demo-section h2 {
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: 16px;
  color: #333;
}
</style>
