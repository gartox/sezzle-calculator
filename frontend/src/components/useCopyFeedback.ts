import { useEffect, useState } from 'react'

export type CopyFeedback = 'copied' | 'failed' | null

const FEEDBACK_TEXT: Record<Exclude<CopyFeedback, null>, string> = {
  copied: 'Copied',
  failed: 'Copy failed',
}

/** Writes text with the browser clipboard, or rejects when there is none. */
export function writeToClipboard(text: string): Promise<void> {
  if (!navigator.clipboard) {
    return Promise.reject(new Error('Clipboard unavailable'))
  }
  return navigator.clipboard.writeText(text)
}

/**
 * Copies text and reports the outcome for a short while: `message` is
 * "Copied", "Copy failed" or "" once the feedback time has passed.
 */
export function useCopyFeedback(
  writeClipboard: (text: string) => Promise<void> = writeToClipboard,
  feedbackMs = 1600,
) {
  const [feedback, setFeedback] = useState<CopyFeedback>(null)

  useEffect(() => {
    if (!feedback) {
      return
    }
    const timer = setTimeout(() => setFeedback(null), feedbackMs)
    return () => clearTimeout(timer)
  }, [feedback, feedbackMs])

  async function copy(text: string) {
    try {
      await writeClipboard(text)
      setFeedback('copied')
    } catch {
      setFeedback('failed')
    }
  }

  return { feedback, message: feedback ? FEEDBACK_TEXT[feedback] : '', copy }
}
