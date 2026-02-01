import mitt from 'mitt'
import type { Message } from './drivers/BaseDriver'

const emitter = mitt<Record<string, Message>>()

export default emitter
