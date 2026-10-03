export function toDigits(value: string): string {
  return value.replace(/\D/g, '')
}

export function normalizePhone(value: string): number | null {
  const digits = toDigits(value)

  if (digits.length === 10 && digits.startsWith('9')) {
    return Number(`7${digits}`)
  }

  if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) {
    return Number(digits)
  }

  if (digits.length === 12 && digits.startsWith('375')) {
    return Number(digits)
  }

  return null
}

export function formatPhone(value: string): string {
  const digits = toDigits(value)

  if (digits.length === 11) {
    const national = digits.startsWith('8') ? digits.slice(1) : digits
    const area = national.slice(1, 4)
    const part1 = national.slice(4, 7)
    const part2 = national.slice(7, 9)
    const part3 = national.slice(9, 11)
    return `+7 (${area}) ${part1}-${part2}-${part3}`
  }

  if (digits.length === 12) {
    const area = digits.slice(3, 5)
    const part1 = digits.slice(5, 8)
    const part2 = digits.slice(8, 10)
    const part3 = digits.slice(10, 12)
    return `+375 (${area}) ${part1}-${part2}-${part3}`
  }

  return value
}
