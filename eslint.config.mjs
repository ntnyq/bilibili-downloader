// @ts-check

import { defineESLintConfig } from '@ntnyq/eslint-config'

export default defineESLintConfig({
  ignores: ['components/ui'],
  oxfmt: true,
  prettier: false,
  svgo: true,
  vue: {
    vuePerfectionist: {},
  },
})
