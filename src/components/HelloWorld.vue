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
    <button @click="send">send</button>
    <!-- <p v-for="id in messageId">{{ id }}</p> -->
    <hr />
  </div>
</template>

<style scoped>
h1 {
  font-weight: 500;
  font-size: 2.6rem;
  position: relative;
  top: -10px;
}

h3 {
  font-size: 1.2rem;
}

.greetings h1,
.greetings h3 {
  text-align: center;
}

@media (min-width: 1024px) {
  .greetings h1,
  .greetings h3 {
    text-align: left;
  }
}
</style>
