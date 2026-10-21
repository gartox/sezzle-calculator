# Design rationale

The first version of the UI was a form: two number inputs, a select and a submit button. It worked, but it did not feel like a calculator, and people do not want to learn a new tool to add two numbers. This document records what the replacement is based on and why each decision was made. The API contract does not change: every result still comes from `POST /api/v1/calculate`.

## What we learned from existing calculators

**iOS Calculator.** Four columns, equals in the bottom right corner, the operator you just pressed stays highlighted until you type the next number, and long values shrink instead of wrapping. Hundreds of millions of people have this layout in their thumbs, so we keep it rather than invent a new one.

**Google Calculator.** The expression stays visible above the result, so you can check what you typed before trusting the answer. Backspace sits next to equals, where your thumb already is after a typo. History is one tap away.

**Windows Calculator.** Everything on screen also works from the keyboard, and on a wide screen the history panel sits beside the keypad instead of covering it.

**Fintech products.** Calm neutral surfaces, one accent color, numbers set in tabular figures so digits line up, explicit states for loading and errors, and no decorative gradients. A tool that handles money should look steady, not exciting.

## Principles and where they show up

| Principle | How the calculator applies it |
|---|---|
| Recognition over recall | The expression line always shows what has been entered, with real symbols: `2 + 3 ×`, `15 % of 200`. Nobody has to remember the pending operator. |
| Visibility of system status | A pill in the header reads Ready or Offline from `GET /api/v1/health`. While a calculation is in flight the equals key shows a busy state, but only after 300 ms, so fast answers never flicker. A request is never left hanging: after 8 seconds it stops with a message, and a health check not answered within 3 seconds reads Offline. |
| Error prevention | The keypad ignores a second decimal point and digits beyond fifteen. Equals looks inactive when there is nothing to calculate, so pressing it is not a surprise. |
| Error recovery | An error replaces the result with a plain sentence and a small "Ref" carrying the request ID. The expression stays visible so the user sees what failed. When the request failed rather than the arithmetic (network, timeout, rate limit), equals sends it again, so a blip never means retyping; any other key starts over. AC cancels a request in flight. |
| Fitts's law | Keys are at least 56 px on phones. Equals is the most prominent target. |
| Platform conventions | The standard layout, the operator column in the accent color, and the active operator marked with `aria-pressed` plus a visible outline, never by color alone. |
| Accessibility | WCAG AA contrast in both themes, a visible focus ring, an accessible name on every key, results announced through `aria-live="polite"` with their expression in words ("15 percent of 200 equals 30"), even when the same result comes twice, and animation reduced when the system asks for it. The status pill announces only a change to Offline, not Ready on every load. |
| Keyboard parity | `0`–`9` and `.` enter digits; `+ - * / ^ %` choose operators (`-` right after `×`, `÷`, `^` or `%` starts a negative number); Enter or `=` calculates; Backspace deletes; Escape clears all; `r` takes the square root; `n` toggles the sign. The keyboard works from the moment the page loads. Enter calculates even when a key still has focus from a mouse click; only a key reached with Tab takes Enter itself. Keys typed while an answer is on its way are kept and applied in order, as on a hardware calculator. If that answer is an arithmetic error (`1 ÷ 0`), the calculation is over and the kept keys start the next one, so `1 ÷ 0 = 5` typed fast ends with `5`. If the request failed instead (network, timeout, rate limit), the expression is kept for equals to retry, and the kept keys, which were meant for it, are dropped. A key typed on the keyboard briefly shows its pressed state on screen, so keyboard users get the same feedback as touch users. |

## Layout

The layout is designed for a phone first and widened for larger screens.

**Header.** The product name, "Calculator", and the status pill.

**Display.** A small, muted expression line above the value. The value is large, right aligned and set in tabular figures. Thousands separators are added for display only; the number sent to the API never contains them. Long values shrink step by step, and a number too long to fit even at the smallest size switches to exponent notation. Tapping or clicking the value copies it, and a short "Copied" confirmation is announced politely.

**Function row.** Secondary chips for `√x` and `xʸ`, and a History toggle. These operations are used less often than the four basic ones, so they sit above the keypad instead of taking a full key each.

**Keypad.** Four equal columns, five rows:

```
AC   ±   %   ÷
 7   8   9   ×
 4   5   6   −
 1   2   3   +
 0   .   ⌫   =
```

The brief offered two bottom rows: a double-width zero, or `0 . ⌫ =` with zero at single width. We chose the second. It is the only one that keeps four equal columns while putting equals in the bottom right corner and backspace right next to it, which are the two positions the references agree on. The cost is a smaller zero key. On a phone it is still at least 56 px, so it remains an easy target, and backspace gets the slot that a wide zero would have taken.

**History.** The last ten results, kept on the client only, in `sessionStorage` wrapped in `try`/`catch` so the calculator still works when storage is blocked. Each entry shows the whole chain and its result (`2 + 3 × 4 = 20`, `200 + 10 % = 220`), so it reads as a record; choosing one puts its result back as the current value. On screens 900 px and wider the panel sits beside the calculator. On phones it opens from the History toggle as a modal sheet: a dialog that takes focus and keeps Tab inside, over a calculator that is inert and ignores the keyboard until the sheet closes, and every way of closing it returns focus to the toggle.

**Evaluation order.** Left to right, like a basic handheld calculator: `2 + 3 × 4 =` gives `20`, and pressing `×` already shows the intermediate `5`. Each step is its own API call, so chaining is several requests in order.

**Percent.** Two readings, both the common calculator convention. On its own, `15 % 200 =` is "15 % of 200", which is the API's `percent(a, b)`, and gives `30`. Inside a chain, `%` changes the number just typed: after `+` or `−` it becomes that percent of the running total, so `200 + 10 %` shows `200 + 20` and `=` gives `220` (a tip or a discount); after `×`, `÷` or `^` it becomes a hundredth, so `200 × 10 % =` gives `20`. Both go through the API's `percent` operation, so the UI still does no arithmetic.

## Visual identity

Our own, calm and suited to finance. It does not borrow Sezzle's brand or any other product's colors or wording.

- **Surfaces.** Ivory in the light theme and graphite in the dark theme, with a slightly deeper tone for the display.
- **Accent.** One calm indigo for operators and equals, and nowhere else, so the eye goes straight to the actions: `#4338CA` on ivory, a lighter `#8B93FF` on graphite. An equals key with nothing to calculate drops the accent entirely and shows a muted glyph on a quiet surface, so it reads as unavailable in both themes.
- **Type.** The system font stack, with tabular numbers for the display and the history.
- **Shape and motion.** A soft radius, subtle press feedback (a small scale and shade change), and no motion at all when `prefers-reduced-motion` is set.
- **Themes.** Light and dark follow `prefers-color-scheme`. The Foundations page in Storybook computes the contrast ratio of every text and background pair live, from the tokens themselves, so a token change that breaks AA is visible immediately.

## How it is built

The UI follows atomic design so every piece can be reviewed and tested on its own:

- **Tokens** (`src/design/tokens.css`): color for both themes, spacing, radius, typography, shadow and motion, as CSS custom properties.
- **Atoms**: Key, StatusDot, Icon, Spinner, VisuallyHidden.
- **Molecules**: StatusPill, ExpressionLine, DisplayValue, ErrorNotice, HistoryItem.
- **Organisms**: CalculatorHeader, Display, Keypad, HistoryPanel.
- **Template**: CalculatorTemplate, the responsive layout.
- **Page**: CalculatorPage, which connects the keypad state to the API. It takes the API client and the health check as props, with the real ones as defaults, so stories and tests can pass fakes without a network mocking library.
- **State**: a pure reducer in `src/calculator/keypad.ts`, with no React and no network, so every keypad rule is a table-driven test.

Every component has Storybook stories for each variant and state, rendered in both themes. The accessibility addon runs axe on every story and fails on any violation, and the Vitest addon runs every story as a test in a real Chromium.
