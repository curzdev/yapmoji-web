const yapmojiIdPattern = /^[0-9]{6}-[a-z0-9]+(?:-[a-z0-9]+)*$/

export function isYapmojiId(value: string): boolean {
  return yapmojiIdPattern.test(value)
}
