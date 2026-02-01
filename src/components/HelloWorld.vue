<script setup lang="ts">
import MessageBridge from '../assets/message-bridge'
import MittDriver from '../assets/message-bridge/drivers/MittDriver'
import emitter from '../assets/message-bridge/mitter'

const driver = new MittDriver(emitter)
const bridge = new MessageBridge(driver)

function send() {
  bridge
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

defineProps<{
  msg: string
}>()
</script>

<template>
  <div class="greetings">
    <button class="send-btn" @click="send">Send</button>
    <hr class="divider" />
  </div>
</template>

<style scoped>
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
