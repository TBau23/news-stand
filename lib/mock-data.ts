import type { Tables } from "./database.types";

// ── Mock Profiles ──────────────────────────────────────────────────

type Profile = Tables<"profiles">;
type Share = Tables<"shares">;

export type ShareWithProfile = Share & { profiles: Profile };

const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

export const mockProfiles: Profile[] = [
  {
    id: "user-1",
    username: "elena",
    display_name: "Elena Ruiz",
    avatar_url: null,
    bio: "Design engineer. Collecting references.",
    timezone: "America/New_York",
    created_at: "2026-01-10T12:00:00Z",
    updated_at: "2026-01-10T12:00:00Z",
  },
  {
    id: "user-2",
    username: "james_k",
    display_name: "James Kim",
    avatar_url: null,
    bio: "Reading too much, writing too little.",
    timezone: "America/Los_Angeles",
    created_at: "2026-01-11T12:00:00Z",
    updated_at: "2026-01-11T12:00:00Z",
  },
  {
    id: "user-3",
    username: "priya",
    display_name: "Priya Anand",
    avatar_url: null,
    bio: "Software, systems, sometimes poetry.",
    timezone: "America/Chicago",
    created_at: "2026-01-12T12:00:00Z",
    updated_at: "2026-01-12T12:00:00Z",
  },
  {
    id: "user-4",
    username: "tom_b",
    display_name: "Tom Bauer",
    avatar_url: null,
    bio: null,
    timezone: "America/New_York",
    created_at: "2026-01-13T12:00:00Z",
    updated_at: "2026-01-13T12:00:00Z",
  },
  {
    id: "user-5",
    username: "mina",
    display_name: "Mina Owens",
    avatar_url: null,
    bio: "Librarian turned technologist.",
    timezone: "Europe/London",
    created_at: "2026-01-14T12:00:00Z",
    updated_at: "2026-01-14T12:00:00Z",
  },
  {
    id: "user-6",
    username: "davec",
    display_name: "Dave Chen",
    avatar_url: null,
    bio: "Infrastructure and coffee.",
    timezone: "America/New_York",
    created_at: "2026-01-15T12:00:00Z",
    updated_at: "2026-01-15T12:00:00Z",
  },
];

// ── Mock Shares (today) ────────────────────────────────────────────

export const mockShares: ShareWithProfile[] = [
  {
    id: "share-1",
    user_id: "user-1",
    content_url: "https://www.robinsloan.com/lab/new-avenues/",
    title: "New Avenues",
    description:
      "Robin Sloan on finding new ways to distribute writing on the internet, beyond the algorithmic feed.",
    og_image_url:
      "https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?w=600&h=400&fit=crop",
    og_site_name: "Robin Sloan",
    note: "This is exactly what I've been trying to articulate about how publishing feels broken right now.",
    shared_date: today,
    created_at: "2026-02-07T08:12:00Z",
    updated_at: "2026-02-07T08:12:00Z",
    profiles: {
      id: "user-1",
      username: "elena",
      display_name: "Elena Ruiz",
      avatar_url: null,
      bio: "Design engineer. Collecting references.",
      timezone: "America/New_York",
      created_at: "2026-01-10T12:00:00Z",
      updated_at: "2026-01-10T12:00:00Z",
    },
  },
  {
    id: "share-2",
    user_id: "user-2",
    content_url:
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    title: "How to Build a Mass Timber Skyscraper",
    description:
      "A deep dive into the engineering behind tall wood buildings — the material science, fire safety, and why architects are obsessed.",
    og_image_url:
      "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=600&h=400&fit=crop",
    og_site_name: "YouTube",
    note: "Skip to 14:00 for the fire testing section. Wild stuff.",
    shared_date: today,
    created_at: "2026-02-07T11:30:00Z",
    updated_at: "2026-02-07T11:30:00Z",
    profiles: {
      id: "user-2",
      username: "james_k",
      display_name: "James Kim",
      avatar_url: null,
      bio: "Reading too much, writing too little.",
      timezone: "America/Los_Angeles",
      created_at: "2026-01-11T12:00:00Z",
      updated_at: "2026-01-11T12:00:00Z",
    },
  },
  {
    id: "share-3",
    user_id: "user-3",
    content_url: "https://danluu.com/cocktail-ideas/",
    title: "Cocktail Ideas",
    description:
      "Dan Luu on how the best ideas come from mixing expertise across unrelated fields, and why specialization is overrated.",
    og_image_url: null,
    og_site_name: "danluu.com",
    note: null,
    shared_date: today,
    created_at: "2026-02-07T13:45:00Z",
    updated_at: "2026-02-07T13:45:00Z",
    profiles: {
      id: "user-3",
      username: "priya",
      display_name: "Priya Anand",
      avatar_url: null,
      bio: "Software, systems, sometimes poetry.",
      timezone: "America/Chicago",
      created_at: "2026-01-12T12:00:00Z",
      updated_at: "2026-01-12T12:00:00Z",
    },
  },
  {
    id: "share-4",
    user_id: "user-5",
    content_url:
      "https://www.themarginalian.org/2024/02/12/kafka-letters/",
    title: "Kafka's Letters on the Meaning of Life",
    description:
      "Maria Popova revisits the personal letters of Franz Kafka, revealing a tender, uncertain mind grappling with purpose and art.",
    og_image_url:
      "https://images.unsplash.com/photo-1457369804613-52c61a468e7d?w=600&h=400&fit=crop",
    og_site_name: "The Marginalian",
    note: "\"A book must be the axe for the frozen sea within us.\" Still the best sentence ever written about reading.",
    shared_date: today,
    created_at: "2026-02-07T07:00:00Z",
    updated_at: "2026-02-07T07:00:00Z",
    profiles: {
      id: "user-5",
      username: "mina",
      display_name: "Mina Owens",
      avatar_url: null,
      bio: "Librarian turned technologist.",
      timezone: "Europe/London",
      created_at: "2026-01-14T12:00:00Z",
      updated_at: "2026-01-14T12:00:00Z",
    },
  },
  {
    id: "share-5",
    user_id: "user-6",
    content_url:
      "https://brooker.co.za/blog/2024/01/11/bottleneck.html",
    title: "Finding the Bottleneck",
    description:
      "Marc Brooker on systematic approaches to identifying performance bottlenecks in distributed systems.",
    og_image_url: null,
    og_site_name: "brooker.co.za",
    note: "Required reading for anyone debugging latency issues. The mental model here is extremely useful.",
    shared_date: today,
    created_at: "2026-02-07T09:20:00Z",
    updated_at: "2026-02-07T09:20:00Z",
    profiles: {
      id: "user-6",
      username: "davec",
      display_name: "Dave Chen",
      avatar_url: null,
      bio: "Infrastructure and coffee.",
      timezone: "America/New_York",
      created_at: "2026-01-15T12:00:00Z",
      updated_at: "2026-01-15T12:00:00Z",
    },
  },
];

// user-4 (tom_b) has NOT shared today — useful for empty-state testing

// ── Helpers ────────────────────────────────────────────────────────

/** Shares that haven't expired (sharer's local date is still today) */
export function getActiveShares(): ShareWithProfile[] {
  return mockShares; // in mock mode, all shares are "active"
}

/** Find a profile by username */
export function getProfileByUsername(
  username: string
): Profile | undefined {
  return mockProfiles.find((p) => p.username === username);
}

/** Get today's share for a given user, or undefined if they haven't shared */
export function getUserTodayShare(
  userId: string
): ShareWithProfile | undefined {
  return mockShares.find((s) => s.user_id === userId);
}
