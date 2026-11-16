'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AlertCircle, ArrowLeft, CheckCircle2, ImagePlus, LoaderCircle, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

type SubmissionResult = {
  id: string
  name: string
  status: 'pending'
  createdAt: string
}

const categories = ['Memes', 'Reactions', 'Animals', 'Gaming', 'Anime', 'Funny', 'Other']

type UploadState = 'idle' | 'preparing' | 'uploading' | 'processing' | 'success' | 'error'

export function UploadForm() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadInProgressRef = useRef(false)
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState(categories[0])
  const [tags, setTags] = useState('')
  const [progress, setProgress] = useState<number | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadState, setUploadState] = useState<UploadState>('idle')
  const [retryAllowed, setRetryAllowed] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [submission, setSubmission] = useState<SubmissionResult | null>(null)

  useEffect(() => {
    if (!file) {
      setPreviewUrl('')
      return
    }

    const objectUrl = URL.createObjectURL(file)
    setPreviewUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [file])

  function chooseFile(nextFile: File | undefined) {
    setErrorMessage('')
    setSubmission(null)
    setProgress(null)
    setUploadState('idle')
    setRetryAllowed(false)
    if (!nextFile) return

    const acceptedTypes = ['image/png', 'image/gif', 'image/webp']
    if (!acceptedTypes.includes(nextFile.type)) {
      setFile(null)
      setErrorMessage('Choose a PNG, GIF, or WebP image.')
      return
    }
    if (nextFile.size > 2 * 1024 * 1024) {
      setFile(null)
      setErrorMessage('The image must be 2 MB or smaller.')
      return
    }
    setFile(nextFile)
  }

  function submitSubmission(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (uploadInProgressRef.current) return
    setErrorMessage('')
    setSubmission(null)

    if (!file) {
      setErrorMessage('Choose an image before submitting.')
      return
    }

    const formData = new FormData()
    formData.set('file', file)
    formData.set('name', name)
    formData.set('description', description)
    formData.set('category', category)
    formData.set(
      'tags',
      JSON.stringify([...new Set(tags.split(',').map((tag) => tag.trim().toLowerCase()).filter(Boolean))]),
    )

    uploadInProgressRef.current = true
    setUploading(true)
    setUploadState('preparing')
    setRetryAllowed(false)
    setProgress(null)
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/submissions')
    xhr.upload.onloadstart = () => setUploadState('uploading')
    xhr.upload.onprogress = (progressEvent) => {
      if (progressEvent.lengthComputable && progressEvent.total > 0) {
        setUploadState('uploading')
        setProgress(Math.round((progressEvent.loaded / progressEvent.total) * 100))
      }
    }
    xhr.upload.onload = () => {
      setProgress(100)
      setUploadState('processing')
    }
    xhr.onerror = () => {
      setErrorMessage('Could not reach the submission service. Check your connection and try again.')
      setUploadState('error')
      setRetryAllowed(true)
      uploadInProgressRef.current = false
      setUploading(false)
    }
    xhr.onload = () => {
      if (xhr.status === 401) {
        window.location.assign('/login?next=%2Fupload')
        uploadInProgressRef.current = false
        setUploading(false)
        return
      }

      let response: unknown
      try {
        response = JSON.parse(xhr.responseText)
      } catch {
        response = null
      }

      if (xhr.status >= 200 && xhr.status < 300 && response && typeof response === 'object' && 'data' in response) {
        const data = response.data
        if (
          data &&
          typeof data === 'object' &&
          'id' in data &&
          'name' in data &&
          'status' in data &&
          'createdAt' in data &&
          typeof data.id === 'string' &&
          typeof data.name === 'string' &&
          data.status === 'pending' &&
          typeof data.createdAt === 'string'
        ) {
          setSubmission({
            id: data.id,
            name: data.name,
            status: 'pending',
            createdAt: data.createdAt,
          })
          setUploadState('success')
        } else {
          setErrorMessage('The server returned an unexpected response. Check your submissions before retrying.')
          setUploadState('error')
          setRetryAllowed(false)
        }
      } else {
        const responseError =
          response && typeof response === 'object' && 'error' in response ? response.error : null
        const message =
          responseError &&
          typeof responseError === 'object' &&
          'message' in responseError &&
          typeof responseError.message === 'string'
            ? responseError.message
            : 'Your submission could not be saved. Please try again.'
        setErrorMessage(message)
        setUploadState('error')
        setRetryAllowed(xhr.status >= 500)
      }
      uploadInProgressRef.current = false
      setUploading(false)
    }
    xhr.send(formData)
  }

  return (
    <main className="dark mx-auto min-h-screen max-w-3xl bg-[#101114] px-5 py-10 text-white lg:px-8">
      <Link href="/" className="mb-9 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> Back to Yapmoji
      </Link>

      <div className="mb-8">
        <p className="mb-2 text-sm font-semibold text-[#FC6A39]">Creator upload</p>
        <h1 className="text-3xl font-bold tracking-tight">Submit an emoji</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Submissions are reviewed before they appear in the public library.
        </p>
      </div>

      {submission ? (
        <section className="motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-300 rounded-2xl border border-emerald-500/30 bg-card p-6" aria-live="polite">
          <CheckCircle2 className="mb-4 size-8 text-emerald-500" aria-hidden="true" />
          <h2 className="text-xl font-semibold">Emoji uploaded successfully!</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{submission.name}</span> is now submitted and{' '}
            <span className="font-medium capitalize text-foreground">{submission.status}</span>.
          </p>
          <p className="mt-3 break-all font-mono text-xs text-muted-foreground">Submission ID: {submission.id}</p>
          <Button
            variant="primary"
            className="mt-6"
            onClick={() => {
              setSubmission(null)
              setUploadState('idle')
              setProgress(null)
            }}
          >
            Submit another emoji
          </Button>
        </section>
      ) : (
        <form onSubmit={submitSubmission} className="space-y-6" aria-busy={uploading}>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/gif,image/webp"
              className="sr-only"
              onChange={(event) => chooseFile(event.target.files?.[0])}
              disabled={uploading}
            />
            {file && previewUrl ? (
              <div className="relative flex min-h-64 flex-col items-center justify-center rounded-2xl border border-border bg-card p-6">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-3 top-3"
                  aria-label="Remove selected image"
                  disabled={uploading}
                  onClick={() => {
                    setFile(null)
                    if (fileInputRef.current) fileInputRef.current.value = ''
                  }}
                >
                  <X />
                </Button>
                <img src={previewUrl} alt="Selected emoji preview" className="max-h-40 max-w-40 object-contain" />
                <p className="mt-4 max-w-full truncate text-sm font-medium">{file.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</p>
              </div>
            ) : (
              <Button
                type="button"
                variant="secondary"
                className="h-auto min-h-64 w-full flex-col whitespace-normal rounded-2xl border-dashed border-border bg-card px-6 text-center text-foreground transition-colors hover:border-[#FC6A39]/60 hover:bg-card"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault()
                  chooseFile(event.dataTransfer.files[0])
                }}
              >
                <span className="mb-4 grid size-12 place-items-center rounded-xl bg-[#FC6A39]/10 text-[#FC6A39]">
                  <ImagePlus className="size-6" aria-hidden="true" />
                </span>
                <span className="font-semibold">Drop an image here or browse</span>
                <span className="mt-2 text-xs text-muted-foreground">PNG, GIF, or WebP · 2 MB maximum</span>
              </Button>
            )}
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <label className="space-y-2 text-sm font-medium">
              Emoji name
              <input
                required
                minLength={2}
                maxLength={32}
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="h-11 w-full rounded-lg border border-border bg-card px-3 outline-none focus-visible:ring-2 focus-visible:ring-[#FC6A39]/50"
                placeholder="e.g. Happy Frog"
              />
            </label>
            <label className="space-y-2 text-sm font-medium">
              Category
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className="h-11 w-full rounded-lg border border-border bg-card px-3 outline-none focus-visible:ring-2 focus-visible:ring-[#FC6A39]/50"
              >
                {categories.map((option) => <option key={option}>{option}</option>)}
              </select>
            </label>
          </div>

          <label className="block space-y-2 text-sm font-medium">
            Description <span className="font-normal text-muted-foreground">Optional</span>
            <textarea
              maxLength={300}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="min-h-24 w-full resize-y rounded-lg border border-border bg-card px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-[#FC6A39]/50"
              placeholder="What is this emoji for?"
            />
          </label>

          <label className="block space-y-2 text-sm font-medium">
            Tags <span className="font-normal text-muted-foreground">Comma-separated, up to 12</span>
            <input
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              className="h-11 w-full rounded-lg border border-border bg-card px-3 outline-none focus-visible:ring-2 focus-visible:ring-[#FC6A39]/50"
              placeholder="cute, reaction, frog"
            />
          </label>

          {uploadState !== 'idle' && (
            <section
              className={`rounded-2xl border p-5 shadow-lg shadow-black/10 ${
                uploadState === 'error'
                  ? 'border-red-500/25 bg-gradient-to-br from-red-500/[0.08] to-card'
                  : 'border-white/10 bg-gradient-to-br from-white/[0.06] to-card'
              }`}
              role={uploadState === 'error' ? 'alert' : 'status'}
              aria-live={uploadState === 'error' ? 'assertive' : 'polite'}
            >
              <div className="flex items-start gap-4">
                <span
                  className={`grid size-11 shrink-0 place-items-center rounded-xl ${
                    uploadState === 'error'
                      ? 'bg-red-500/10 text-red-400'
                      : 'bg-[#FC6A39]/10 text-[#FC6A39]'
                  }`}
                >
                  {uploadState === 'error' ? (
                    <AlertCircle className="size-5" aria-hidden="true" />
                  ) : uploadState === 'processing' ? (
                    <LoaderCircle className="size-5 motion-safe:animate-spin" aria-hidden="true" />
                  ) : (
                    <Upload
                      className={`size-5 ${uploadState === 'preparing' || uploadState === 'uploading' ? 'motion-safe:animate-pulse' : ''}`}
                      aria-hidden="true"
                    />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <h2 className={`font-semibold ${uploadState === 'error' ? 'text-red-300' : 'text-white'}`}>
                      {uploadState === 'preparing' && 'Preparing your emoji...'}
                      {uploadState === 'uploading' && 'Uploading your emoji...'}
                      {uploadState === 'processing' && 'Processing your emoji...'}
                      {uploadState === 'error' && 'Upload couldn’t be completed'}
                    </h2>
                    {(uploadState === 'uploading' || uploadState === 'processing') && (
                      <span className="text-sm font-semibold tabular-nums text-[#FC6A39]">
                        {progress === null ? 'Uploading' : `${progress}%`}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm leading-5 text-muted-foreground">
                    {uploadState === 'preparing' && 'Getting your file ready to upload.'}
                    {uploadState === 'uploading' && 'Please wait while we upload your emoji.'}
                    {uploadState === 'processing' && 'Upload complete. Your emoji is being prepared for review.'}
                    {uploadState === 'error' && errorMessage}
                  </p>
                  {(uploadState === 'uploading' || uploadState === 'processing') && (
                    <div
                      className="mt-4 h-2 overflow-hidden rounded-full bg-white/10"
                      role="progressbar"
                      aria-label="Emoji upload progress"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={progress ?? undefined}
                      aria-valuetext={progress === null ? 'Waiting for upload progress' : `${progress}% uploaded`}
                    >
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#FC6A39] to-[#ff946b] shadow-[0_0_14px_rgba(252,106,57,0.35)] transition-[width] duration-300 ease-out motion-reduce:transition-none"
                        style={{ width: `${progress ?? 0}%` }}
                      />
                    </div>
                  )}
                  {uploadState === 'error' && retryAllowed && (
                    <Button type="submit" variant="primary" className="mt-4" disabled={uploading}>
                      Retry upload
                    </Button>
                  )}
                </div>
              </div>
            </section>
          )}

          {errorMessage && uploadState !== 'error' && <p className="text-sm text-red-400" role="alert">{errorMessage}</p>}

          {uploadState !== 'error' && (
            <Button type="submit" variant="primary" disabled={uploading} className="min-h-11 px-6">
              <Upload data-icon="inline-start" /> {uploading ? 'Uploading...' : 'Submit for review'}
            </Button>
          )}
        </form>
      )}
    </main>
  )
}