import { nextTick, watch, type Ref } from 'vue'

export function useAutoScroll(scrollRef: Ref<HTMLElement | null>, watchSource: Ref<any>) {
  const scrollToBottom = () => {
    nextTick(() => {
      if (scrollRef.value) {
        scrollRef.value.scrollTo({
          top: scrollRef.value.scrollHeight,
          behavior: 'smooth',
        })
      }
    })
  }

  watch(
    watchSource,
    () => {
      scrollToBottom()
    },
    { deep: true },
  )

  return {
    scrollToBottom,
  }
}
