<script lang="ts" setup>
import { browser } from '#imports'

const logoUrl = browser.runtime.getURL('/icons/128.png')
</script>

<template>
  <img
    :src="logoUrl"
    alt=""
    width="32"
    height="32"
    class="block shrink-0 object-contain"
    aria-hidden="true"
  />
</template>
