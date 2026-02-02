<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
</script>

<template>
  <div class="app-layout">
    <header class="app-header">
      <div class="header-content">
        <div class="logo">
          <h1>MessageBridge</h1>
          <span class="subtitle">Examples</span>
        </div>
        <nav class="nav-menu">
          <RouterLink to="/" class="nav-link" active-class="active"> MittDriver </RouterLink>
          <RouterLink to="/postmessage" class="nav-link" active-class="active">
            PostMessageDriver
          </RouterLink>
        </nav>
      </div>
    </header>

    <main class="app-main">
      <RouterView />
    </main>

    <footer class="app-footer">
      <p>
        Built with
        <a href="https://github.com/code-yeongyu/message-bridge" target="_blank" rel="noopener">
          MessageBridge
        </a>
      </p>
    </footer>
  </div>
</template>

<style scoped>
.app-layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.app-header {
  background: white;
  border-bottom: 1px solid #e5e5e5;
  position: sticky;
  top: 0;
  z-index: 100;
}

.header-content {
  max-width: 1200px;
  margin: 0 auto;
  padding: 16px 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.logo {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.logo h1 {
  font-size: 1.5rem;
  font-weight: 700;
  color: #333;
  margin: 0;
}

.subtitle {
  font-size: 0.875rem;
  color: #888;
}

.nav-menu {
  display: flex;
  gap: 8px;
}

.nav-link {
  padding: 8px 16px;
  border-radius: 6px;
  text-decoration: none;
  color: #555;
  font-weight: 500;
  font-size: 0.9rem;
  transition: all 0.2s;
}

.nav-link:hover {
  background: #f5f5f5;
  color: #333;
}

.nav-link.active {
  background: #4a90d9;
  color: white;
}

.app-main {
  flex: 1;
  padding: 32px 24px;
  background: #f5f5f5;
}

.app-footer {
  background: white;
  border-top: 1px solid #e5e5e5;
  padding: 20px 24px;
  text-align: center;
}

.app-footer p {
  margin: 0;
  color: #888;
  font-size: 0.875rem;
}

.app-footer a {
  color: #4a90d9;
  text-decoration: none;
}

.app-footer a:hover {
  text-decoration: underline;
}
</style>
