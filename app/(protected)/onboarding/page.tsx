"use client";

import { useState } from "react";
import { completeOnboarding } from "./actions";

const COMMON_TIMEZONES = [
  { value: "America/New_York", label: "Eastern Time" },
  { value: "America/Chicago", label: "Central Time" },
  { value: "America/Denver", label: "Mountain Time" },
  { value: "America/Los_Angeles", label: "Pacific Time" },
  { value: "America/Anchorage", label: "Alaska Time" },
  { value: "Pacific/Honolulu", label: "Hawaii Time" },
  { value: "Europe/London", label: "London" },
  { value: "Europe/Paris", label: "Central European" },
  { value: "Europe/Helsinki", label: "Eastern European" },
  { value: "Asia/Tokyo", label: "Japan" },
  { value: "Asia/Shanghai", label: "China" },
  { value: "Australia/Sydney", label: "Sydney" },
];

function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "America/New_York";
  }
}

export default function OnboardingPage(): React.JSX.Element {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [detectedTz] = useState(detectTimezone);

  async function handleSubmit(formData: FormData) {
    setError("");
    setLoading(true);
    const result = await completeOnboarding(formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
      <div className="w-full max-w-sm p-8">
        <h1 className="mb-2 text-2xl font-semibold text-center text-zinc-900 dark:text-zinc-50">
          Set up your profile
        </h1>
        <p className="mb-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
          Pick a username and we&apos;ll get you started.
        </p>

        <form action={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="username"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1"
            >
              Username
            </label>
            <input
              id="username"
              name="username"
              type="text"
              required
              minLength={3}
              maxLength={30}
              pattern="[a-z0-9_]+"
              placeholder="yourname"
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-50"
            />
            <p className="mt-1 text-xs text-zinc-400">
              Lowercase letters, numbers, and underscores only.
            </p>
          </div>

          <div>
            <label
              htmlFor="display_name"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1"
            >
              Display name
            </label>
            <input
              id="display_name"
              name="display_name"
              type="text"
              required
              maxLength={50}
              placeholder="Your Name"
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-50"
            />
          </div>

          <div>
            <label
              htmlFor="timezone"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1"
            >
              Timezone
            </label>
            <select
              id="timezone"
              name="timezone"
              defaultValue={detectedTz}
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-50"
            >
              {COMMON_TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
              {!COMMON_TIMEZONES.some((t) => t.value === detectedTz) && (
                <option value={detectedTz}>{detectedTz}</option>
              )}
            </select>
          </div>

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-lg bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors disabled:opacity-50"
          >
            {loading ? "Saving..." : "Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
