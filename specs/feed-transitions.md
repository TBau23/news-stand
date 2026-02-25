# Feed Transitions and Micro-Interactions

## Phase
7 — Polish and Realtime

## What It Does
Adds animations and micro-interactions to the daily view that make the shelf feel alive as it fills up throughout the day. Cards appear with entry animations, expire with exit animations, and respond to interaction with subtle feedback.

## User-Facing Behavior
The daily view isn't a static snapshot — it breathes. When you open the app, the existing share cards settle into place with a staggered entrance. As the day goes on, new shares from followed users slide or fade in. When a share expires at midnight in the sharer's timezone, it gently fades out and the grid reflows. Hovering over a card lifts it slightly. The whole surface feels curated and intentional, not algorithmic.

## Animation Inventory

### 1. Initial Page Load: Staggered Entrance
When the daily view loads with existing shares, cards animate in with a staggered delay rather than appearing all at once.

**Effect:** Fade in + slight upward slide.
- `opacity`: 0 → 1
- `translateY`: 12px → 0
- `duration`: 300ms per card
- `stagger`: 50ms delay between each card
- `easing`: `ease-out`

**Implementation:** CSS animations triggered by a class applied on mount, with `animation-delay` computed from the card's index.

```css
@keyframes card-enter {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.share-card-enter {
  animation: card-enter 300ms ease-out both;
}
```

The stagger delay is applied as an inline `animation-delay` style:
```tsx
style={{ animationDelay: `${index * 50}ms` }}
```

**Max stagger:** Cap at 500ms total (10 cards × 50ms). Beyond 10 cards, all remaining cards use the same 500ms delay to avoid the animation dragging on.

### 2. Realtime Entry: New Share Appears
When a new share arrives via Supabase Realtime (see `specs/realtime-feed.md`), it enters the grid with a slightly more noticeable animation than the initial load — the user should register that something new appeared.

**Effect:** Fade in + scale from 95% + subtle highlight pulse.
- `opacity`: 0 → 1
- `scale`: 0.95 → 1
- `duration`: 400ms
- `easing`: `ease-out`
- After entry, a brief background highlight pulse (soft glow or border flash) lasting 600ms to draw the eye.

```css
@keyframes card-realtime-enter {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes card-highlight {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(var(--accent-rgb), 0);
  }
  50% {
    box-shadow: 0 0 0 3px rgba(var(--accent-rgb), 0.15);
  }
}
```

**Grid reflow:** When a new card is prepended to the grid, existing cards shift position. Use CSS Grid with `auto` placement — the browser handles reflow. The new card's entry animation naturally draws attention away from the position shift.

### 3. Expiration Exit: Share Fades Out
When a share expires (midnight in the sharer's timezone), it exits the grid.

**Effect:** Fade out + slight downward slide + scale down.
- `opacity`: 1 → 0
- `translateY`: 0 → 8px
- `scale`: 1 → 0.98
- `duration`: 400ms
- `easing`: `ease-in`

After the animation completes, the element is removed from the DOM and the grid reflows.

```css
@keyframes card-exit {
  from {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  to {
    opacity: 0;
    transform: translateY(8px) scale(0.98);
  }
}
```

**Implementation:** Apply the exit animation class, then remove the share from state after the animation duration via `setTimeout` or `animationend` event.

### 4. Card Hover/Press States
Subtle feedback when the user interacts with a share card.

**Hover (desktop):**
- Slight upward lift: `translateY(-2px)`
- Subtle shadow increase
- `transition`: 150ms ease

**Press/Active:**
- Slight downward press: `translateY(0px)` (returns to resting position)
- Shadow decreases slightly
- `transition`: 100ms ease

```css
.share-card {
  transition: transform 150ms ease, box-shadow 150ms ease;
}

.share-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.share-card:active {
  transform: translateY(0);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}
```

### 5. Empty State Transitions
When the feed transitions between states (empty → has shares, or has shares → empty after all expire), the transitions should be smooth rather than jarring.

**Empty state entrance:** Fade in over 300ms when no shares are present.
**Empty state exit:** Fade out over 200ms before share cards begin their staggered entrance.

### 6. Share Status Banner
The banner ("You haven't shared yet today" / "You shared today") should have a subtle transition when its state changes (e.g., user shares while the daily view is open and returns to it).

**State change transition:** Cross-fade between the two banner variants over 300ms.

## Reduced Motion

All animations must respect the user's `prefers-reduced-motion` system preference.

```css
@media (prefers-reduced-motion: reduce) {
  .share-card-enter,
  .share-card-realtime-enter,
  .share-card-exit {
    animation: none;
  }

  .share-card {
    transition: none;
  }
}
```

When reduced motion is preferred:
- Initial load: Cards appear immediately, no stagger.
- Realtime entry: Cards appear immediately. The highlight pulse still plays (it's non-motion, just a color change) but with no scale/opacity animation.
- Expiration exit: Cards are removed immediately.
- Hover/press: No transform, but color changes still apply.

## Performance Considerations

### CSS-Only Where Possible
All animations defined above use CSS animations and transitions. No JavaScript animation libraries needed. CSS animations are GPU-accelerated (`transform`, `opacity`) and don't cause layout thrashing.

### Avoid Layout Shift
- Use `transform` for movement (not `top`/`left`/`margin`).
- Use `opacity` for visibility (not `display`/`visibility` toggling during animation).
- Cards should have fixed or intrinsic dimensions so adding/removing cards doesn't cause unexpected reflows beyond the grid's natural adjustment.

### Animation Throttling
If multiple realtime shares arrive within a short window (e.g., 3 shares in 2 seconds):
- Each gets its own entry animation.
- Stagger them: the second share's animation starts 150ms after the first, the third 150ms after the second.
- This prevents visual chaos from simultaneous animations.

Implement via a simple queue:
```ts
const animationQueue = useRef<string[]>([])

function enqueueShareAnimation(shareId: string) {
  animationQueue.current.push(shareId)
  const delay = (animationQueue.current.length - 1) * 150
  setTimeout(() => {
    // Trigger the animation for this share
    setAnimatingShares(prev => new Set([...prev, shareId]))
  }, delay)
}
```

## Implementation Approach

### No External Libraries
All animations are achievable with CSS `@keyframes` and `transition`. No need for Framer Motion, React Spring, or similar. This keeps the bundle size small and aligns with the minimal-dependency philosophy of the project.

> **Open Decision: CSS-only vs. animation library.**
> Options:
> 1. CSS-only (keyframes + transitions) — zero bundle cost, simpler, sufficient for these effects.
> 2. Framer Motion — richer animation primitives (layout animations, exit animations via AnimatePresence), ~30KB gzipped.
>
> Recommendation: CSS-only. The animations described here are simple enough. If layout animations (smooth grid reflow when cards are added/removed) prove difficult with CSS alone, consider Framer Motion's `layoutId` as a targeted addition.

### Animation State Tracking
The client component (from `specs/realtime-feed.md`) tracks which shares are in which animation state:

```ts
type AnimationState = 'entering' | 'visible' | 'exiting'
const [shareStates, setShareStates] = useState<Map<string, AnimationState>>(new Map())
```

- New shares (initial load): `entering` → `visible` after animation completes.
- Realtime shares: `entering` → `visible` after animation completes.
- Expiring shares: `visible` → `exiting` → removed from state after animation completes.

## Edge Cases and Error States

| Scenario | Behavior |
|---|---|
| User has `prefers-reduced-motion: reduce` | All motion animations are suppressed. Cards appear/disappear instantly. Color-only effects (highlight pulse) still play. |
| 50+ shares on initial load | Stagger cap at 500ms prevents the animation from taking too long. Cards 11+ all appear at the 500ms mark simultaneously. |
| Share expires while its entry animation is still playing | Cancel the entry animation and immediately start the exit animation. In practice this is extremely unlikely (shares last ~24 hours). |
| Grid has one card and it expires | Card fades out, then the "Nothing here yet today" empty state fades in. |
| Browser performance is poor (low-end device) | CSS animations with `transform` and `opacity` are GPU-composited and performant even on low-end devices. No JS-driven animation loop. |
| Animation conflicts with card click | Animations should not interfere with click targets. Cards are clickable throughout all animation states (entering, visible, exiting). |

## Data Model Changes
None. This is a purely presentational concern.

## Dependencies
- **Daily View Page** (`specs/daily-view-page.md`): The page these animations enhance.
- **Share Card** (`specs/share-card.md`): The component being animated.
- **Realtime Feed** (`specs/realtime-feed.md`): Provides the events that trigger realtime entry and expiration exit animations.

## Acceptance Criteria
- [ ] Share cards on initial page load animate in with a staggered fade+slide effect.
- [ ] New shares arriving via Realtime animate in with a fade+scale effect and a brief highlight pulse.
- [ ] Expiring shares animate out with a fade+slide+scale exit effect before being removed from the DOM.
- [ ] Share cards have a subtle hover lift effect on desktop.
- [ ] Share cards have a press/active feedback effect.
- [ ] Empty state transitions (appearing/disappearing) are smooth fades.
- [ ] All motion animations are suppressed when `prefers-reduced-motion: reduce` is active.
- [ ] Multiple rapid realtime entries are staggered (150ms apart) to avoid visual chaos.
- [ ] Total initial stagger is capped at 500ms regardless of share count.
- [ ] All animations use CSS `transform` and `opacity` only (GPU-composited, no layout thrashing).
- [ ] No external animation libraries are added (CSS-only implementation).
