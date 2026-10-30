/**
 * Formats the positional substitutions and plural forms emitted by WXT.
 * Substitution values are inserted once so media diagnostics containing dollars
 * retain their literal contents.
 */
export function formatI18nMessage(message: string, args: unknown[]): string {
  const count = args.find(value => typeof value === 'number')
  const substitutions =
    args.find(Array.isArray) ?? (count === undefined ? [] : [count])
  if (typeof count === 'number') {
    const forms = message.split(' | ')
    const index =
      forms.length === 3
        ? count === 0
          ? 0
          : count === 1
            ? 1
            : 2
        : count === 1
          ? 0
          : forms.length - 1
    message = forms[index] ?? message
  }
  return message.replace(/\$\$|\$(\d)/g, (placeholder, index) =>
    placeholder === '$$'
      ? '$'
      : String(substitutions[Number(index) - 1] ?? placeholder),
  )
}
