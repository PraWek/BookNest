export const formatDuration = (minutes: number) => {
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))} мин`
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return m ? `${h} ч ${m} мин` : `${h} ч`
}

export const estimateMinutes = (chars: number) => chars / 1000

export const progressPercent = (chapterIndex: number, chapterCount: number, scrollPercent: number) => {
  if (!chapterCount) return 0
  return Math.max(0, Math.min(100, ((chapterIndex + scrollPercent / 100) / chapterCount) * 100))
}

export const splitParagraphs = (text: string) =>
  text.split(/\n\s*\n+/).map((p) => p.trim()).filter(Boolean)
