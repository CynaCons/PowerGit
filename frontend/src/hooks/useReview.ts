import { useCallback, useEffect, useRef } from "react"
import { describeThrown, isAbort, type EngineClient } from "../engine"
import { deleteReview, getReview, putReview } from "../engine/reviews"
import { serializeDoc } from "../review/reviewFile"
import { headOfKey } from "../review/reviewKey"
import { parseDoc, type ReviewDoc } from "../review/reviewModel"
import { getReviewDoc, setReviewDoc, setReviewPersist, useReviewDoc } from "../review/reviewState"

const SAVE_DELAY = 400

function withHead(doc: ReviewDoc, key: string): ReviewDoc {
  const head = headOfKey(key)
  return doc.head === undefined && head ? { ...doc, head } : doc
}

export function useReview({ engine, key }: { engine: EngineClient; key: string | null }) {
  const doc = useReviewDoc(key)
  const baseline = useRef<ReviewDoc | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<{ engine: EngineClient; key: string; doc: ReviewDoc } | null>(null)

  const save = useCallback((saveEngine: EngineClient, saveKey: string, value: ReviewDoc) => {
    baseline.current = value
    setReviewPersist(saveKey, { saving: true, error: null })
    void putReview(saveEngine, saveKey, serializeDoc(withHead(value, saveKey)))
      .then(() => setReviewPersist(saveKey, { saving: false, savedAt: Date.now(), error: null }))
      .catch((e: unknown) => setReviewPersist(saveKey, { saving: false, error: describeThrown(e) }))
  }, [])

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const value = pending.current
    pending.current = null
    if (value) save(value.engine, value.key, value.doc)
  }, [save])

  useEffect(() => {
    flush()
    baseline.current = key ? getReviewDoc(key) : null
    if (!key) return
    const ctrl = new AbortController()
    const atStart = getReviewDoc(key)
    void getReview(engine, key, ctrl.signal)
      .then((text) => {
        if (ctrl.signal.aborted) return
        const loaded = text === null ? null : parseDoc(text)
        const current = getReviewDoc(key)
        if (current !== atStart) {
          baseline.current = null
          return
        }
        setReviewDoc(key, loaded)
        baseline.current = loaded
        setReviewPersist(key, { error: null, savedAt: text === null ? null : Date.now(), saving: false })
      })
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted && !isAbort(e)) setReviewPersist(key, { error: describeThrown(e), saving: false })
      })
    return () => {
      ctrl.abort()
      flush()
    }
  }, [engine, flush, key])

  useEffect(() => {
    if (!key || !doc || doc === baseline.current) return
    const head = headOfKey(key)
    if (doc.head === undefined && head) {
      setReviewDoc(key, { ...doc, head })
      return
    }
    if (timer.current) clearTimeout(timer.current)
    pending.current = { engine, key, doc }
    timer.current = setTimeout(() => {
      flush()
    }, SAVE_DELAY)
  }, [doc, engine, flush, key])

  const startOver = useCallback(async () => {
    if (!key) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    pending.current = null
    await deleteReview(engine, key)
    baseline.current = null
    setReviewDoc(key, null)
    setReviewPersist(key, { savedAt: null, saving: false, error: null })
  }, [engine, key])

  return { startOver }
}
