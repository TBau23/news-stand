"use client";

import { useState } from "react";
import { extractDomain } from "@/lib/shares";
import { getTimeOfDayLabel, getAvatarColor, getInitial } from "@/lib/share-card";

export interface ShareCardProps {
  share: {
    id: string;
    content_url: string;
    title: string | null;
    description: string | null;
    og_image_url: string | null;
    og_site_name: string | null;
    note: string | null;
    created_at: string;
  };
  sharer?: {
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  };
}

export default function ShareCard({
  share,
  sharer,
}: ShareCardProps): React.JSX.Element {
  const [imageError, setImageError] = useState(false);
  const [avatarError, setAvatarError] = useState(false);

  const domain = extractDomain(share.content_url);
  const siteName = share.og_site_name || domain;
  const showImage = !!share.og_image_url && !imageError;
  const hasTitle = !!share.title;
  const hasDescription = !!share.description;
  const hasAnyMetadata = hasTitle || hasDescription || !!share.og_image_url;
  const displayTitle = share.title || domain;
  const timeLabel = getTimeOfDayLabel(new Date(share.created_at).getHours());

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
      {/* Sharer Header (not clickable) */}
      {sharer && (
        <div className="flex items-center gap-3 p-3 pb-0">
          {sharer.avatar_url && !avatarError ? (
            <img
              src={sharer.avatar_url}
              alt=""
              className="w-8 h-8 rounded-full object-cover"
              onError={() => setAvatarError(true)}
            />
          ) : (
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium ${getAvatarColor(sharer.username)}`}
            >
              {getInitial(sharer.display_name, sharer.username)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50 truncate">
              {sharer.display_name || sharer.username}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
              @{sharer.username}
            </p>
          </div>
          <span className="text-xs text-zinc-400 dark:text-zinc-500 shrink-0">
            {timeLabel}
          </span>
        </div>
      )}

      {/* Content Preview (clickable — opens URL in new tab) */}
      <a
        href={share.content_url}
        target="_blank"
        rel="noopener noreferrer"
        className="block hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
      >
        {showImage && (
          <img
            src={share.og_image_url!}
            alt=""
            className="w-full h-48 object-cover"
            onError={() => setImageError(true)}
          />
        )}

        <div className="p-4">
          {hasAnyMetadata ? (
            <>
              <p className="font-medium text-zinc-900 dark:text-zinc-50 line-clamp-2">
                {displayTitle}
              </p>
              {hasDescription && (
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400 line-clamp-3">
                  {share.description}
                </p>
              )}
              <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
                {siteName}
              </p>
            </>
          ) : (
            <>
              <p className="font-medium text-zinc-900 dark:text-zinc-50">
                {domain}
              </p>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400 truncate">
                {share.content_url}
              </p>
              <p className="mt-1 text-sm text-zinc-400 dark:text-zinc-500 italic">
                No preview available.
              </p>
            </>
          )}
        </div>
      </a>

      {/* Note (not clickable — users may want to select/copy text) */}
      {share.note && (
        <div className="px-4 pb-4 border-t border-zinc-100 dark:border-zinc-800 pt-3">
          <p className="text-sm text-zinc-700 dark:text-zinc-300 italic">
            &ldquo;{share.note}&rdquo;
          </p>
        </div>
      )}
    </div>
  );
}
