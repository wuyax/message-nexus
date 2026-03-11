<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
</script>

<template>
  <div class="app-layout">
    <header class="app-header">
      <div class="header-content">
        <div class="logo">
          <h1>MessageNexus</h1>
          <span class="subtitle">Examples</span>
        </div>
        <nav class="nav-menu">
          <RouterLink to="/" class="nav-link" active-class="active">MittDriver</RouterLink>
          <RouterLink to="/postmessage" class="nav-link" active-class="active"
            >PostMessageDriver</RouterLink
          >
          <RouterLink to="/broadcast" class="nav-link" active-class="active"
            >BroadcastDriver</RouterLink
          >
          <RouterLink to="/websocket" class="nav-link" active-class="active"
            >WebSocketDriver</RouterLink
          >
        </nav>
      </div>
    </header>

    <main class="app-main">
      <div class="content-wrapper">
        <RouterView />
      </div>
    </main>

    <footer class="app-footer">
      <div class="footer-line"></div>
      <p>
        Status: Online //
        <a href="https://github.com/wuyax/message-nexus" target="_blank" rel="noopener"
          >Source Repository</a
        >
      </p>
    </footer>
  </div>
</template>

<style scoped>
.app-layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background-image:
    linear-gradient(rgba(249, 115, 22, 0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(249, 115, 22, 0.03) 1px, transparent 1px);
  background-size: 40px 40px;
}

.app-header {
  background: var(--bg-color);
  border-bottom: 2px solid var(--border-color);
  position: sticky;
  top: 0;
  z-index: 100;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
}

.header-content {
  max-width: 1200px;
  margin: 0 auto;
  padding: 16px 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.logo {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.logo h1 {
  font-size: 1.8rem;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
  letter-spacing: 1px;

  position: relative;
}

.logo h1::before {
  content: '';
  display: inline-block;
  width: 12px;
  height: 12px;
  background: var(--accent);
  margin-right: 8px;
  transform: translateY(-2px);
}

.subtitle {
  font-size: 0.9rem;
  color: var(--accent);
  font-family: var(--font-mono);
  font-weight: 700;
  letter-spacing: 2px;
}

.nav-menu {
  display: flex;
  gap: 2px;
  background: var(--border-color);
  padding: 2px;
  border-radius: 4px;
}

.nav-link {
  padding: 8px 16px;
  text-decoration: none;
  color: var(--text-secondary);
  font-weight: 600;
  font-size: 1rem;

  letter-spacing: 1px;
  transition: all 0.2s;
  background: var(--bg-color);
  border-radius: 2px;
}

.nav-link:hover {
  color: var(--text-primary);
  background: var(--bg-panel-hover);
}

.nav-link.active {
  color: var(--accent-text);
  background: var(--accent);
  box-shadow: 0 0 10px rgba(249, 115, 22, 0.2);
}

.app-main {
  flex: 1;
  padding: 40px 24px;
}

.content-wrapper {
  max-width: 1200px;
  margin: 0 auto;
}

.app-footer {
  background: var(--bg-color);
  padding: 24px;
  text-align: center;
  position: relative;
}

.footer-line {
  position: absolute;
  top: 0;
  left: 24px;
  right: 24px;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--border-color), transparent);
}

.app-footer p {
  margin: 0;
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: 0.85rem;
  letter-spacing: 1px;
}

.app-footer a {
  color: var(--accent);
  text-decoration: none;
  transition: color 0.2s;
}

.app-footer a:hover {
  color: var(--accent-hover);
  text-decoration: underline;
  text-decoration-style: dashed;
}

@media (max-width: 768px) {
  .header-content {
    flex-direction: column;
    gap: 20px;
  }

  .nav-menu {
    width: 100%;
    flex-wrap: wrap;
    justify-content: center;
  }
}
</style>
