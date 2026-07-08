'use client'

/**
 * PDF viewer — SPEC §5: virtualised pages (lazy render on scroll), thumbnail
 * rail, fit-width default, ⟵/⟶ keys, zoom, download, print, version
 * switcher in the titleblock strip. Non-PDF types get image preview or a
 * download card. Signed URLs are short-lived (120 s) and re-fetched on demand.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'

interface VersionInfo {
  version_number: number
  mime_type: string
  uploaded_at: string
  current: boolean
}

export function DocumentViewer({
  documentId,
  documentName,
  versions,
}: {
  documentId: string
  documentName: string
  versions: VersionInfo[]
}) {
  const [version, setVersion] = useState(
    versions.find((v) => v.current)?.version_number ?? versions[0].version_number,
  )
  const meta = versions.find((v) => v.version_number === version)!
  const [error, setError] = useState('')
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [imageUrl, setImageUrl] = useState('')
  const [otherUrl, setOtherUrl] = useState('')
  const [pageCount, setPageCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [scale, setScale] = useState(0) // 0 = fit width
  const mainRef = useRef<HTMLDivElement>(null)
  const pageRefs = useRef<(HTMLCanvasElement | null)[]>([])
  const rendered = useRef<Set<number>>(new Set())

  const fetchUrl = useCallback(async () => {
    const res = await fetch(`/api/documents/${documentId}/download-url?version=${version}`)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.message ?? 'Could not open the document')
    }
    return (await res.json()) as { url: string; mime_type: string }
  }, [documentId, version])

  // Load the document whenever the selected version changes.
  useEffect(() => {
    let cancelled = false
    setError('')
    setPdf(null)
    setImageUrl('')
    setOtherUrl('')
    rendered.current = new Set()
    ;(async () => {
      try {
        const { url, mime_type } = await fetchUrl()
        if (cancelled) return
        if (mime_type === 'application/pdf') {
          const pdfjs = await import('pdfjs-dist')
          // Worker is copied to public/ by scripts/copy-pdf-worker.mjs
          pdfjs.GlobalWorkerOptions.workerSrc = '/pdf-worker.min.mjs'
          const loaded = await pdfjs.getDocument({ url }).promise
          if (cancelled) return
          setPdf(loaded)
          setPageCount(loaded.numPages)
          setCurrentPage(1)
        } else if (mime_type.startsWith('image/')) {
          setImageUrl(url)
        } else {
          setOtherUrl(url)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not open the document')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [fetchUrl])

  const renderPage = useCallback(
    async (pageNumber: number) => {
      if (!pdf || rendered.current.has(pageNumber)) return
      const canvas = pageRefs.current[pageNumber - 1]
      if (!canvas) return
      rendered.current.add(pageNumber)
      const page = await pdf.getPage(pageNumber)
      const container = mainRef.current
      const baseViewport = page.getViewport({ scale: 1 })
      const fitScale = container
        ? Math.max(0.4, ((container.clientWidth - 48) / baseViewport.width) * 0.98)
        : 1
      const effective = scale === 0 ? fitScale : scale
      const viewport = page.getViewport({ scale: effective })
      const dpr = window.devicePixelRatio || 1
      canvas.width = viewport.width * dpr
      canvas.height = viewport.height * dpr
      canvas.style.width = `${viewport.width}px`
      canvas.style.height = `${viewport.height}px`
      const ctx = canvas.getContext('2d')!
      ctx.scale(dpr, dpr)
      await page.render({ canvasContext: ctx, viewport }).promise
    },
    [pdf, scale],
  )

  // Virtualisation: render pages as they scroll into view; first page eagerly
  // (the SPEC §11 first-page budget is why we never render everything up front).
  useEffect(() => {
    if (!pdf) return
    rendered.current = new Set()
    renderPage(1)
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const pageNumber = Number((entry.target as HTMLElement).dataset.page)
            renderPage(pageNumber)
            if (entry.intersectionRatio > 0.4) setCurrentPage(pageNumber)
          }
        }
      },
      { root: mainRef.current, threshold: [0.05, 0.5] },
    )
    pageRefs.current.forEach((c) => c && observer.observe(c))
    return () => observer.disconnect()
  }, [pdf, renderPage])

  const goToPage = useCallback(
    (pageNumber: number) => {
      const clamped = Math.max(1, Math.min(pageCount, pageNumber))
      pageRefs.current[clamped - 1]?.scrollIntoView({ block: 'start' })
      setCurrentPage(clamped)
    },
    [pageCount],
  )

  // Keyboard ⟵/⟶ (SPEC §5)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') goToPage(currentPage + 1)
      if (e.key === 'ArrowLeft') goToPage(currentPage - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [currentPage, goToPage])

  async function download() {
    try {
      const { url } = await fetchUrl()
      window.location.href = url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed')
    }
  }

  async function printPdf() {
    try {
      const { url } = await fetchUrl()
      const w = window.open(url, '_blank')
      w?.addEventListener('load', () => w.print())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Print failed')
    }
  }

  return (
    <>
      <div className="viewer-toolbar">
        <label>
          Version{' '}
          <select value={version} onChange={(e) => setVersion(Number(e.target.value))}>
            {versions.map((v) => (
              <option key={v.version_number} value={v.version_number}>
                v{v.version_number}
                {v.current ? ' (current)' : ''} · {new Date(v.uploaded_at).toLocaleDateString('en-GB')}
              </option>
            ))}
          </select>
        </label>
        {pdf && (
          <>
            <span>
              Page {currentPage} of {pageCount}
            </span>
            <button onClick={() => goToPage(currentPage - 1)}>⟵</button>
            <button onClick={() => goToPage(currentPage + 1)}>⟶</button>
            <button onClick={() => setScale(0)}>Fit width</button>
            <button onClick={() => setScale((s) => (s === 0 ? 1.2 : Math.min(4, s * 1.2)))}>Zoom +</button>
            <button onClick={() => setScale((s) => (s === 0 ? 0.8 : Math.max(0.3, s / 1.2)))}>Zoom −</button>
            <button onClick={printPdf}>Print</button>
          </>
        )}
        <button onClick={download}>Download</button>
        <span style={{ marginLeft: 'auto', color: 'var(--steel)' }}>{documentName}</span>
      </div>

      {error && (
        <main className="container">
          <div className="notice error">{error}</div>
        </main>
      )}

      {pdf && (
        <div className="viewer-shell">
          <div className="viewer-rail">
            {Array.from({ length: pageCount }, (_, i) => (
              <ThumbnailCanvas
                key={`${version}-${i}`}
                pdf={pdf}
                pageNumber={i + 1}
                active={currentPage === i + 1}
                onClick={() => goToPage(i + 1)}
              />
            ))}
          </div>
          <div className="viewer-main" ref={mainRef}>
            {Array.from({ length: pageCount }, (_, i) => (
              <canvas
                key={`${version}-page-${i}`}
                data-page={i + 1}
                ref={(el) => {
                  pageRefs.current[i] = el
                }}
                style={{ minHeight: 200 }}
              />
            ))}
          </div>
        </div>
      )}

      {imageUrl && (
        <main className="container" style={{ textAlign: 'center' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt={documentName} style={{ maxWidth: '100%', boxShadow: 'var(--shadow)' }} />
        </main>
      )}

      {otherUrl && (
        <main className="container narrow">
          <div className="card empty">
            <h3>No preview for this file type</h3>
            <p>{meta.mime_type}</p>
            <button className="btn" onClick={download}>
              Download instead
            </button>
          </div>
        </main>
      )}
    </>
  )
}

function ThumbnailCanvas({
  pdf,
  pageNumber,
  active,
  onClick,
}: {
  pdf: PDFDocumentProxy
  pageNumber: number
  active: boolean
  onClick: () => void
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const done = useRef(false)

  useEffect(() => {
    if (done.current || !ref.current) return
    done.current = true
    ;(async () => {
      const page = await pdf.getPage(pageNumber)
      const viewport = page.getViewport({ scale: 0.2 })
      const canvas = ref.current!
      canvas.width = viewport.width
      canvas.height = viewport.height
      await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise
    })()
  }, [pdf, pageNumber])

  return (
    <div className={active ? 'active' : ''} onClick={onClick} title={`Page ${pageNumber}`}>
      <canvas ref={ref} />
    </div>
  )
}
