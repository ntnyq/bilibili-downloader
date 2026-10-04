export const COMMANDS = Object.freeze({
  toggleExtension: 'toggleExtension',

  triggerCommand: 'triggerCommand',
})

export type Command = keyof typeof COMMANDS
