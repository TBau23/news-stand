"use client";

import { useState } from "react";
import { updateShareNote } from "./actions";
import { NOTE_MAX_LENGTH, extractDomain } from "@/lib/shares";
import type { Database } from "@/lib/database.types";

type Share = Database["public"]["Tables"]["shares"]["Row"];

export default function TodaysShareView({
  share,
}: {
  share: Share;
}): React.JSX.Element {
  const [isEditing, setIsEditing] = useState(false);
  const [note, setNote] = useState(share.note ?? "");
  const [currentNote, setCurrentNote] = useState(share.note);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const domain = extractDomain(share.content_url);
  const siteName = share.og_site_name || domain;

  function handleEditStart() {
    setNote(currentNote ?? "");
    setError("");
    setIsEditing(true);
  }

  function handleCancel() {
    setIsEditing(false);
    setError("");
  }

  async function handleSave() {
    setSaving(true);
    setError("");

    const formData = new FormData();
    formData.set("share_id", share.id);
    formData.set("note", note);

    const result = await updateShareNote(formData);

    if ("error" in result) {
      setError(result.error);
      setSaving(false);
      return;
    }

    setCurrentNote(note.trim() || null);
    setIsEditing(false);
    setSaving(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
      <div className="w-full max-w-md p-8">
        <h1 className="mb-2 text-2xl font-semibold text-center text-zinc-900 dark:text-zinc-50">
          Your share for today
        </h1>
        <p className="mb-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
          Come back tomorrow to share something new.
        </p>

        {/* Share Card */}
        <ShareCard
          title={share.title}
          description={share.description}
          imageUrl={share.og_image_url}
          siteName={siteName}
          contentUrl={share.content_url}
        />

        {/* Note Section */}
        <div className="mt-4">
          {isEditing ? (
            <div className="space-y-3">
              <textarea
                value={note}
                onChange={(e) => {
                  if (e.target.value.length <= NOTE_MAX_LENGTH) {
                    setNote(e.target.value);
                  }
                }}
                placeholder="Add a note..."
                maxLength={NOTE_MAX_LENGTH}
                rows={3}
                disabled={saving}
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-50 resize-none disabled:opacity-50"
              />
              <div className="flex items-center justify-between">
                <p
                  className={`text-xs ${
                    note.length >= NOTE_MAX_LENGTH
                      ? "text-red-500"
                      : "text-zinc-400"
                  }`}
                >
                  {note.length} / {NOTE_MAX_LENGTH}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleCancel}
                    disabled={saving}
                    className="px-3 py-1.5 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="px-3 py-1.5 text-sm rounded-lg bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
              {error && (
                <p className="text-sm text-red-600 dark:text-red-400">
                  {error}
                </p>
              )}
            </div>
          ) : (
            <div className="flex items-start justify-between gap-2">
              {currentNote ? (
                <p className="text-sm text-zinc-700 dark:text-zinc-300">
                  {currentNote}
                </p>
              ) : (
                <p className="text-sm text-zinc-400 dark:text-zinc-500 italic">
                  No note added
                </p>
              )}
              <button
                type="button"
                onClick={handleEditStart}
                className="shrink-0 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors"
              >
                {currentNote ? "Edit note" : "Add a note"}
              </button>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="mt-8 text-center">
          <a
            href="/dashboard"
            className="text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors"
          >
            &larr; Back to dashboard
          </a>
        </div>
      </div>
    </div>
  );
}

function ShareCard({
  title,
  description,
  imageUrl,
  siteName,
  contentUrl,
}: {
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  siteName: string;
  contentUrl: string;
}): React.JSX.Element {
  const hasMetadata = title || description || imageUrl;

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
      {imageUrl && (
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
          <p className="font-medium text-zinc-900 dark:text-zinc-50 line-clamp-2">
            {title}
          </p>
        )}
        {description && (
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400 line-clamp-2">
            {description}
          </p>
        )}
        {!hasMetadata && (
          <p className="text-sm text-zinc-400 dark:text-zinc-500 italic">
            No preview available
          </p>
        )}
        <a
          href={contentUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors underline underline-offset-2"
        >
          {contentUrl.length > 60
            ? contentUrl.slice(0, 60) + "..."
            : contentUrl}
        </a>
      </div>
    </div>
  );
}
