import type { ProtocolWithReturn } from 'webext-bridge'
import type { Command } from '~/constants/command'

declare module 'webext-bridge' {
  // user custom type
  export interface ExtContext {}

  export interface ProtocolMap {
    triggerCommand: ProtocolWithReturn<{ command: Command }, void>
  }
}
