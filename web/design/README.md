# Deal Radar design

Edit `index.html` to change the live app visual theme. The `<style>` block is injected into the Next.js app by `web/app/layout.tsx`. It controls colors, typography, spacing, cards, buttons, responsive rules and animations.

Keep existing CSS class names (for example `.deal-card`, `.bottom-nav`, `.hero`) so the React-rendered UI keeps its behavior and styling.

API routes, Telegram authentication, scanner, market research, calculations and state remain outside this folder. The live content structure and React event handlers remain in `web/app/page.tsx`; structural HTML changes still require updating the corresponding React markup.
