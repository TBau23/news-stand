"use client";

import { useState, useRef } from "react";
import { createShare } from "./actions";
import { NOTE_MAX_LENGTH, extractDomain } from "@/lib/shares";

interface UnfurlData {
  title: string | null;
  description: string | null;
  image_url: string | null;
  site_name: string | null;
  url: string;
}

type Step = "entry" | "preview" | "confirm";

export default function ShareForm(): React.JSX.Element {
  const [step, setStep] = useState<Step>("entry");
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState("");
  const [unfurlLoading, setUnfurlLoading] = useState(false);
  const [unfurlData, setUnfurlData] = useState<UnfurlData | null>(null);
  const [unfurlFailed, setUnfurlFailed] = useState(false);
  const [note, setNote] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  async function handlePreview() {
    const trimmed = url.trim();
    if (!trimmed) {
      setUrlError("Please enter a URL.");
      return;
    }

    try {
      new URL(trimmed);
    } catch {
      setUrlError("Please enter a valid URL.");
      return;
    }

    setUrlError("");
    setUnfurlLoading(true);
    setUnfurlFailed(false);
    setUnfurlData(null);

    try {
      const res = await fetch("/api/unfurl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });

      if (res.ok) {
        const data: UnfurlData = await res.json();
        setUnfurlData(data);
      } else {
        setUnfurlFailed(true);
      }
    } catch {
      setUnfurlFailed(true);
    }

    setUnfurlLoading(false);
    setStep("preview");
  }

  function handleClear() {
    setUrl("");
    setUrlError("");
    setUnfurlData(null);
    setUnfurlFailed(false);
    setNote("");
    setSubmitError("");
    setStep("entry");
  }

  function handleShare() {
    setSubmitError("");
    setStep("confirm");
  }

  function handleGoBack() {
    setStep("preview");
  }

  async function handleConfirm() {
    if (!formRef.current) return;
    setSubmitting(true);
    setSubmitError("");

    const formData = new FormData(formRef.current);
    const result = await createShare(formData);
    if (result?.error) {
      setSubmitError(result.error);
      setSubmitting(false);
      setStep("preview");
    }
    // On success, createShare calls redirect — this component unmounts
  }

  const domain = url.trim() ? extractDomain(url.trim()) : "";
  const title = unfurlData?.title;
  const description = unfurlData?.description;
  const imageUrl = unfurlData?.image_url;
  const siteName = unfurlData?.site_name || domain;

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
      <div className="w-full max-w-md p-8">
        <h1 className="mb-2 text-2xl font-semibold text-center text-zinc-900 dark:text-zinc-50">
          Share something
        </h1>
        <p className="mb-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
          One link per day. Make it count.
        </p>

        {/* Hidden form that carries all data for the server action */}
        <form ref={formRef} className="hidden">
          <input type="hidden" name="content_url" value={url.trim()} />
          <input type="hidden" name="title" value={unfurlData?.title ?? ""} />
          <input
            type="hidden"
            name="description"
            value={unfurlData?.description ?? ""}
          />
          <input
            type="hidden"
            name="og_image_url"
            value={unfurlData?.image_url ?? ""}
          />
          <input
            type="hidden"
            name="og_site_name"
            value={unfurlData?.site_name ?? ""}
          />
          <input type="hidden" name="note" value={note} />
        </form>

        {/* Step 1: URL Entry */}
        <div className="space-y-4">
          <div>
            <label
              htmlFor="url-input"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1"
            >
              URL
            </label>
            <div className="flex gap-2">
              <input
                id="url-input"
                type="url"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setUrlError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && step === "entry") {
                    e.preventDefault();
                    handlePreview();
                  }
                }}
                placeholder="Paste a URL..."
                disabled={step === "confirm"}
                className="flex-1 px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-50 disabled:opacity-50"
              />
              {step === "entry" && (
                <button
                  type="button"
                  onClick={handlePreview}
                  disabled={unfurlLoading || !url.trim()}
                  className="px-4 py-2 rounded-lg bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors disabled:opacity-50"
                >
                  {unfurlLoading ? "Loading..." : "Preview"}
                </button>
              )}
              {step !== "entry" && step !== "confirm" && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
            {urlError && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                {urlError}
              </p>
            )}
          </div>

          {/* Step 2: Preview & Note */}
          {step !== "entry" && (
            <>
              <PreviewCard
                title={title ?? null}
                description={description ?? null}
                imageUrl={imageUrl ?? null}
                siteName={siteName}
                failed={unfurlFailed}
                compact={step === "confirm"}
              />

              <div>
                <label
                  htmlFor="note-input"
                  className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1"
                >
                  Note{" "}
                  <span className="font-normal text-zinc-400">(optional)</span>
                </label>
                <textarea
                  id="note-input"
                  value={note}
                  onChange={(e) => {
                    if (e.target.value.length <= NOTE_MAX_LENGTH) {
                      setNote(e.target.value);
                    }
                  }}
                  placeholder="Why did you pick this?"
                  maxLength={NOTE_MAX_LENGTH}
                  rows={3}
                  disabled={step === "confirm"}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-50 resize-none disabled:opacity-50"
                />
                <p
                  className={`mt-1 text-xs text-right ${
                    note.length >= NOTE_MAX_LENGTH
                      ? "text-red-500"
                      : "text-zinc-400"
                  }`}
                >
                  {note.length} / {NOTE_MAX_LENGTH}
                </p>
              </div>

              {submitError && (
                <p className="text-sm text-red-600 dark:text-red-400">
                  {submitError}
                </p>
              )}

              {/* Step 2 actions */}
              {step === "preview" && (
                <button
                  type="button"
                  onClick={handleShare}
                  className="w-full py-3 px-4 rounded-lg bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
                >
                  Share
                </button>
              )}

              {/* Step 3: Confirmation */}
              {step === "confirm" && (
                <div className="space-y-4">
                  <p className="text-sm text-center text-amber-600 dark:text-amber-400 font-medium">
                    This is your share for today. You won&apos;t be able to
                    change it.
                  </p>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={handleGoBack}
                      disabled={submitting}
                      className="flex-1 py-3 px-4 rounded-lg border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
                    >
                      Go Back
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirm}
                      disabled={submitting}
                      className="flex-1 py-3 px-4 rounded-lg bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors disabled:opacity-50"
                    >
                      {submitting ? "Sharing..." : "Confirm"}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PreviewCard({
  title,
  description,
  imageUrl,
  siteName,
  failed,
  compact,
}: {
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  siteName: string;
  failed: boolean;
  compact: boolean;
}): React.JSX.Element {
  if (failed) {
    return (
      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{siteName}</p>
        <p className="text-sm text-zinc-400 dark:text-zinc-500 italic">
          No preview available
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
      {imageUrl && !compact && (
        <img
          src={imageUrl}
          alt=""
          className="w-full h-40 object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      )}
      <div className="p-4">
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">
          {siteName}
        </p>
        {title && (
          <p
            className={`font-medium text-zinc-900 dark:text-zinc-50 ${compact ? "text-sm" : ""} ${compact ? "line-clamp-1" : "line-clamp-2"}`}
          >
            {title}
          </p>
        )}
        {description && !compact && (
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400 line-clamp-2">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}
