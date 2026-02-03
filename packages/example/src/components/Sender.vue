<script setup lang="ts">
import { onUnmounted } from 'vue'
import MessageNexus from 'message-nexus'
import { MittDriver } from 'message-nexus'
import { emitter } from '../assets/utils'

const driver = new MittDriver(emitter)
const nexus = new MessageNexus(driver)

function send() {
  nexus
    .request({
      type: 'anov.create',
      payload: { name: 'test' + Math.random() },
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
  <div class="greetings">
    <div class="title">Message Sender Test Page</div>
    <button class="send-btn" @click="send">Send</button>
    <hr class="divider" />
  </div>
</template>

<style scoped>
.title {
  font-size: 1.2rem;
  font-weight: 500;
  text-align: center;
  margin-bottom: 20px;
}
.send-btn {
  cursor: pointer;
  padding: 5px 10px;
  border-radius: 5px;
  border: 1px solid #ccc;
}
.send-btn:hover {
  background-color: #f5f5f5;
}
.send-btn:active {
  background-color: #ccc;
}
.send-btn:disabled {
  background-color: #ccc;
  cursor: not-allowed;
}
.divider {
  margin: 10px 0;
}
</style>
