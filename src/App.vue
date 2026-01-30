<script setup lang="ts">
import { ref } from 'vue'
import HelloWorld from './components/HelloWorld.vue'
import TheWelcome from './components/TheWelcome.vue'
import MittDriver from './assets/message-bridge/drivers/MittDriver'
import MessageBridge from './assets/message-bridge'
import emitter from './assets/message-bridge/mitter'

const driver = new MittDriver(emitter)
const bridge = new MessageBridge(driver)

bridge.onCommand((data) => {
  console.log(data)
  bridge.reply(data.id, { result: 'success' })
})

let messageId = ref('')
const driver2 = new MittDriver(emitter)
const bridge2 = new MessageBridge(driver2, { instanceId: 'myBridgeId' })
bridge2.onCommand((data) => {
  console.log(data)
  messageId.value = data.id
})

function send() {
  bridge2.reply(messageId.value, { result: 'success' })
}
</script>

<template>
  <header>
    <img alt="Vue logo" class="logo" src="./assets/logo.svg" width="125" height="125" />

    <div class="wrapper">
      <HelloWorld msg="You did it!" />
    </div>
  </header>

  <main>
    <TheWelcome />
    <button @click="send">reply</button>
    <p>{{ messageId }}</p>
  </main>
</template>

<style scoped>
header {
  line-height: 1.5;
}

.logo {
  display: block;
  margin: 0 auto 2rem;
}

@media (min-width: 1024px) {
  header {
    display: flex;
    place-items: center;
    padding-right: calc(var(--section-gap) / 2);
  }

  .logo {
    margin: 0 2rem 0 0;
  }

  header .wrapper {
    display: flex;
    place-items: flex-start;
    flex-wrap: wrap;
  }
}
</style>
