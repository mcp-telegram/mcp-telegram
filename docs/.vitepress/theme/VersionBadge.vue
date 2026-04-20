<script setup>
defineProps({
  version: { type: String, required: true },
});
</script>

<template>
  <a
    :href="`https://github.com/mcp-telegram/mcp-telegram/releases/tag/v${version}`"
    target="_blank"
    rel="noopener noreferrer"
    class="version-badge"
  >
    v{{ version }}
  </a>
</template>

<style scoped>
.version-badge {
  display: inline-block;
  padding: 2px 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
  border-radius: 6px;
  text-decoration: none;
  margin-left: 8px;
  vertical-align: middle;
}
.version-badge:hover {
  color: var(--vp-c-brand-2);
  background: var(--vp-c-brand-soft);
  text-decoration: none;
}
</style>
